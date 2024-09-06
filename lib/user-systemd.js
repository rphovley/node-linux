var mu = require('mu2'),
    os = require('os'),
    p = require('path'),
    fs = require('fs'),
    exec = require('child_process').exec;

var init = function(config){

    config = config || {};

    Object.defineProperties(this,{

        templateRoot: {
            enumerable: true,
            writable: false,
            configurable: false,
            value: p.join(__dirname,'templates','systemd')
        },

        _label: {
            enumerable: false,
            writable: true,
            configurable: false,
            value: null
        },

        _configFilePath: {
            enumerable: false,
            writable: true,
            configurable: false,
            value: function() { 
                return p.join(os.homedir(), '.config', 'systemd', 'user', this.label + '.service');
            }
        },

        label: {
            enumerable: true,
            get: function(){
                return this._label;
            }
        },

        exists: {
            enumerable: false,
            get: function(){
                return fs.existsSync(this._configFilePath());
            }
        },

        generate: {
            enumerable: true,
            writable: false,
            configurable: false,
            value: function(callback){
                callback = callback || function(){};

                var me = this;
                var opt = {
                    label: me.label,
                    servicesummary: config.name,
                    servicedescription: config.description || config.name,
                    author: config.author || 'Unknown',
                    script: p.join(__dirname,'wrapper.js'),
                    nodescript: config.script || '',
                    wrappercode: (config.wrappercode || ''),
                    description: config.description,
                    pidroot: config.pidroot || p.join(os.homedir(), '.local', 'run'),
                    logroot: config.logroot || p.join(os.homedir(), '.local', 'log'),
                    env: '',
                    path: config.path || process.cwd(),
                    created: new Date(),
                    execpath: process.execPath,
                };

                var _env = [];
                if (config.env) {
                    for (var i=0;i<config.env.length;i++){
                        for (var el in config.env[i]){
                            _env.push(el+'='+config.env[i][el]);
                        }
                    }
                    opt.env = _env.join(' ');
                }

                var _template = 'service';
                var _path = config.template == undefined ? p.join(me.templateRoot, _template) : p.resolve(config.template);
                mu.compile(_path, function(err, tpl){
                    var stream = mu.render(tpl, opt),
                        chunk = "";
                    stream.on('data', function(data){
                        chunk += data;
                    });
                    stream.on('end', function(){
                        callback(chunk);
                    });
                });
            }
        },

        createProcess: {
            enumerable: true,
            writable: false,
            configurable: false,
            value: function(callback){
                var filepath = this._configFilePath(), me = this;
                console.log("Installing user service on", filepath);
                fs.mkdir(p.dirname(filepath), { recursive: true }, function(err) {
                    if (err) return me.emit('error', err);
                    fs.exists(filepath, function(exists){
                        if(!exists){
                            me.generate(function(script){
                                fs.writeFile(filepath, script, function(err){
                                    if (err) return me.emit('error', err);
                                    fs.chmod(filepath, '644', function(_err){
                                        if (_err) return me.emit('error', _err);

                                        var cmd = 'systemctl --user daemon-reload';
                                        console.log('Running %s...', cmd);
                                        exec(cmd, function(err){
                                            if (err) return me.emit('error', err);
                                            me.emit('install');
                                        });
                                    })
                                });
                            });
                        } else {
                            me.emit('alreadyinstalled');
                        }
                    });
                });
            }
        },

        removeProcess: {
            enumerable: true,
            writable: false,
            configurable: false,
            value: function(callback){
                if (!fs.existsSync(this._configFilePath())){
                    this.emit('doesnotexist');
                    return;
                }
                var me = this;

                fs.unlink(this._configFilePath(), function(){
                    var lr = p.join(me.logroot || p.join(os.homedir(), '.local', 'log'), me.label+'.log'),
                        er = p.join(me.logroot || p.join(os.homedir(), '.local', 'log'), me.label+'-error.log'),
                        pr = p.join(me.pidroot || p.join(os.homedir(), '.local', 'run'), me.label+'.pid');
                    console.log('exists?', fs)
                    fs.exists(pr, function(exists){
                        exists && fs.unlink(pr);
                    });

                    fs.exists(lr, function(exists){
                        if (exists){
                            fs.unlinkSync(lr);
                        }
                        fs.exists(er, function(exists){
                            if (exists){
                                fs.unlinkSync(er);
                            }
                            me.emit('uninstall');
                            callback && callback();
                        });
                    });
                });
            }
        },

        start: {
            enumerable: true,
            writable: true,
            configurable: false,
            value: function(callback){
                if (!this.exists){
                    this.emit('doesnotexist');
                    callback && callback();
                    return;
                }
                var me = this;
                var cmd = 'systemctl --user start '+this.label;
                console.log('Running %s...', cmd);
                exec(cmd, function(err){
                    if (err) return me.emit('error', err);
                    me.emit('start');
                    callback && callback();
                });
            }
        },

        stop: {
            enumerable: true,
            writable: true,
            configurable: false,
            value: function(callback){
                if (!this.exists){
                    this.emit('doesnotexist');
                    callback && callback();
                    return;
                }
                var me = this;
                var cmd = 'systemctl --user stop '+this.label;
                exec(cmd, function(err){
                    if (!err) {
                        me.emit('stop');
                        callback && callback();
                    } else {
                        me.emit('error', err);
                    }
                });
            }
        },

        enable: {
            enumerable: true,
            writable: true,
            configurable: false,
            value: function(callback){
                if (!this.exists){
                    this.emit('doesnotexist');
                    callback && callback();
                    return;
                }
                var me = this;
                var cmd = 'systemctl --user enable '+this.label;
                exec(cmd, function(err){
                    if (!err) {
                        me.emit('enable');
                        callback && callback();
                    } else {
                        me.emit('error', err);
                    }
                });
            }
        },

        disable: {
            enumerable: true,
            writable: true,
            configurable: false,
            value: function(callback){
                if (!this.exists){
                    this.emit('doesnotexist');
                    callback && callback();
                    return;
                }
                var me = this;
                var cmd = 'systemctl --user disable '+this.label;
                exec(cmd, function(err){
                    if (!err) {
                        me.emit('disable');
                        callback && callback();
                    } else {
                        me.emit('error', err);
                    }
                });
            }
        }
    });

    this._label = (config.name||'').replace(/[^a-zA-Z0-9\-]/,'').toLowerCase();
};

var util = require('util'),
    EventEmitter = require('events').EventEmitter;

util.inherits(init, EventEmitter);

module.exports = init;