#!/usr/bin/env node
var express = require('express');
var app = express();
var port = normalizePort(process.env.PORT || '3000');
var fs = require("fs");

app.get('/listUsers', function (req, res) {
	res.end("hi man, how are you????");
})

 

/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

var server = app.listen(port, function () {

  var host = server.address().address
  var port = server.address().port

  console.log("Example app listening at http://%s:%s", host, port)

})