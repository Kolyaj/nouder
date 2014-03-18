module.exports = require('iclass').create(require('iclass').Component, {
    method: null,

    path: null,

    _initComponent: function() {
        module.exports.superclass._initComponent.apply(this, arguments);

        if (this.method) {
            if (!Array.isArray(this.method)) {
                this._method = [this.method];
            } else {
                this._method = this.method.slice(0);
            }
        } else {
            this._method = [];
        }

        this._keyMaps = [];
        if (this.path) {
            if (!Array.isArray(this.path)) {
                this._path = [this.path];
            } else {
                this._path = this.path.slice(0);
            }
        } else {
            this._path = [];
        }
        this._path = this._path.map(function(pattern, i) {
            this._keyMaps[i] = [];
            return require('path-to-regexp')(pattern, this._keyMaps[i]);
        }, this);

        this._handleRequestBind = this._handleRequest.bind(this);
        this._server = null;
        this._middlewares = [];
    },

    listen: function(port) {
        this._server = require('http').createServer(this._handleRequestBind);
        this._server.listen(port);
    },

    createMiddleware: function() {
        return this._handleRequestBind;
    },

    addMiddleware: function(middleware) {
        if (typeof middleware.createMiddleware == 'function') {
            middleware = middleware.createMiddleware();
        }
        this._middlewares.push(middleware);
    },


    _handle: function() {
        this._missing();
    },

    _handleRequest: function(req, res, next) {
        var that = this;
        var context = {
            req: req,
            res: res,
            location: require('url').parse(req.url, true),
            next: next
        };
        var domain = require('domain').create();
        domain.nouderContext = context;
        domain.on('error', function(err) {
            that._handleError(err);
        });
        domain.run(function() {
            if (that._isValidRequest()) {
                var i = 0;
                (function(err) {
                    if (err) {
                        that._handleError(err);
                    } else if (i < that._middlewares.length) {
                        that._middlewares[i++](req, res, arguments.callee);
                    } else {
                        that._handle();
                    }
                })();
            } else {
                that._missing();
            }
        });
    },

    _isValidRequest: function() {
        if (this.method.length && this.method.indexOf(this._getMethod()) == -1) {
            return false;
        }
        if (this.path.length && !this.path.some(this._isValidPath, this)) {
            return false;
        }
        return true;
    },

    _isValidPath: function(pattern, index) {
        var matches = this._getLocation().pathname.match(pattern);
        if (!matches) {
            return false;
        }
        var keys = this._keyMaps[index];
        var params = {};
        var n = 0;
        for (var i = 1; i < matches.length; i++) {
            var value = typeof matches[i] == 'string' ? decodeURIComponent(matches[i]) : matches[i];
            var key = keys[i - 1];
            if (key) {
                params[key.name] = value;
            } else {
                params[n++] = value;
            }
        }
        this._getContext().params = params;
        return true;
    },

    _missing: function() {
        var context = this._getContext();
        if (typeof context.next == 'function') {
            context.next();
        } else {
            this._handleNotFoundError();
        }
    },

    _getContext: function() {
        return process.domain ? process.domain.nouderContext : null;
    },

    _getRequest: function() {
        return this._getContext().req;
    },

    _getMethod: function() {
        return this._getRequest().method;
    },

    _getLocation: function() {
        return this._getContext().location;
    },

    _getParam: function(name, defaultValue) {
        var context = this._getContext();
        if (context.location.query && name in context.location.query) {
            return context.location.query[name];
        }
        if (context.params && name in context.params) {
            return context.params[name];
        }
        return defaultValue;
    },

    _getResponse: function() {
        return this._getContext().res;
    },

    _handleError: function(err) {
        console.error(err.stack);
        var res = this._getResponse();
        res.writeHead(500);
        res.end();
    },

    _handleNotFoundError: function() {
        var res = this._getResponse();
        res.writeHead(404);
        res.end();
    }
});