## Installation

    $ npm install git+ssh://git@github.com:Sanji-IO/sanji-node.git --save
   
## Usage

```
var bunyan = require('bunyan'),
    log = bunyan.log = bunyan.createLogger({name: 'mxcloud', level: 'trace'}),
    MxModel = require('mxmqtt');

var mxmodel = new MxModel({'host': '192.168.27.133'});

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
mxmodel.get('/network/cellular/1', function(req, res) {
  // do something here
});

/*
{
  "id": 83045209,
  "method": "post",
  "resource": "/device/123?tag_names=apple,orange,banana",
  "data": {
    "message": "test"
  }
}
*/
mxmodel.post('/device/:device_id', function(req, res) {
  console.log(req.params.device_id); // 123
  console.log(req.query.tag_names);  // apple,orange,banana
  console.log(req.body);

  // reply
  res.status(404)
    .send({message: 'Not found.'});
});
```
