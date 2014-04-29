'use strict';

var bunyan = require('bunyan'),
    log = bunyan.log = bunyan.createLogger({name: 'mxcloud', level: 'trace'}),
    MxModel = require('./mxmodel');

var mxmodel = new MxModel({host: '192.168.27.133'});

mxmodel.set('name', 'test');
mxmodel.set('role', 'view');
mxmodel.set('resources', [
    '/'
]);

mxmodel.listen();
