## Installation

    $ npm install git+ssh://git@bitbucket.org:moxa-tw/mxmqtt.git#v0.0.2 --save
    
## Usage

```
var bunyan = require('bunyan'),
    log = bunyan.log = bunyan.createLogger({name: 'mxcloud', level: 'trace'}),
    mxmodel = require('./mxmodel')({'host': '192.168.27.133'});

mxmodel.set('resources', ['/network/cellular']);
mxmodel.set('role', 'view');

mxmodel.listen();

mxmodel.on('registered', function() {
  mxmodel.request({
    method: 'get',
    resource: '/network/cellular/1'
  })
  .then(function(message) {
    log.warn(message);
  });
});

// support get, post, put, delete methods
mxmodel.get('/network/cellular/1', function(message) {
  // do something here
});
```
