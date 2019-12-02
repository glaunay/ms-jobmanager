"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
let events = require('events');
let socketIO = require('socket.io');
let HTTP = require('http');
let jobLib = require('../job.js');
let ss = require('socket.io-stream');
let my_logger = require('../logger.js');
let logger = my_logger.logger;
let util = require('util');
let uuidv4 = require('uuid/v4');
let main = require("../index");
//import ss = require('./node_modules/socket.io-stream/socket.io-stream.js');
//import comType = require('./job-manager-comTypes.js');
// Submit we w8 for status b4 sending another one
let io;
let socketRegistry = {};
function registerSocket(uuid, socket) {
    socketRegistry[uuid] = socket;
}
function removeSocket(uuid) {
    delete socketRegistry[uuid];
}
function broadcast(status) {
    for (let k in socketRegistry) {
        socketRegistry[k].emit('centralStatus', status);
    }
}
function listen(port) {
    let evt = new events.EventEmitter;
    let server = HTTP.createServer();
    io = socketIO(server);
    io.on('connection', function (socket) {
        let socketID = uuidv4();
        registerSocket(socketID, socket);
        evt.emit('connection');
        /*socket.on('drained', (d) => {
            logger.info(`job ${d.jobID} has drained its socket`);
        });*/
        socket.on('newJobSocket', (data) => {
            logger.debug(`========\n=============\nnewJobSocket received container:\n${util.format(data)}`);
            // Emitting the corresponding event/Symbols for socket streaming
            //logger.debug(`========\n=============\nnewJobSocket emmitting container:\n${util.format(newData)}`);
            evt.emit('newJobSocket', data, socket);
        });
        socket.on('disconnect', function () {
            removeSocket(socketID);
        });
    });
    server.listen(port);
    return evt;
}
exports.listen = listen;
/*  NO NEED
    Sending data back to the client // propagating event to the client
    //{
        type : event
        data : { symbol : ('type', 'reference'), ... }
    }
    data element type can be scalar or stream, or do we ducktype ?

*/
function socketPull(jobObject, stdoutStreamOverride, stderrStreamOverride) {
    if (stdoutStreamOverride)
        logger.debug("Shimmering Socket job pulling");
    else
        logger.debug("Genuine socket job pulling");
    //  logger.debug(`${util.format(stdout)}`);
    let stdoutStream = stdoutStreamOverride ? stdoutStreamOverride : jobObject.stdout();
    let stderrStream = stderrStreamOverride ? stderrStreamOverride : jobObject.stderr();
    ss(jobObject.socket).on(`${jobObject.id}:stdout`, function (stream) {
        stdoutStream.then((_stdout) => {
            logger.debug(`Pumping stdout [${jobObject.id}:stdout]`);
            //logger.warn(`stdoutStream expected ${util.format(_stdout)}`);
            _stdout.pipe(stream);
        });
    });
    ss(jobObject.socket).on(`${jobObject.id}:stderr`, function (stream) {
        stderrStream.then((_stderr) => {
            logger.debug(`Pumping stderr [${jobObject.id}:stderr]`);
            //logger.warn(`stderrStream expected ${util.format(_stderr)}`);
            _stderr.pipe(stream);
        });
    });
    jobObject.socket.emit('completed', JSON.stringify(jobObject));
}
exports.socketPull = socketPull;
/*
 For now we dont do much just boreadcasting were overloaded
*/
function bouncer(data, socket) {
    logger.debug(`Bouncing ${data.id}`);
    broadcast('busy');
    socket.emit('bounced', { jobID: data.id });
}
exports.bouncer = bouncer;
// We build streams only at granted
function granted(data, socket) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            logger.debug(`i grant access to ${util.format(data.id)}`);
            broadcast('available');
            let socketNamespace = data.id;
            let newData = {
                script: ss.createStream(),
                inputs: {}
            };
            for (let inputSymbol in data.inputs) {
                //let filePath = data.inputs[inputSymbol];
                //logger.debug(`-->${filePath}`);
                newData.inputs[inputSymbol] = ss.createStream();
                logger.debug(`ssStream emission for input symbol '${inputSymbol}'`);
                ss(socket).emit(socketNamespace + "/" + inputSymbol, newData.inputs[inputSymbol]);
                //logger.warn('IeDump from' +  socketNamespace + "/" + inputSymbol);
                //newData.inputs[inputSymbol].pipe(process.stdout)
            }
            ss(socket).emit(socketNamespace + "/script", newData.script);
            //logger.error(`TOTOT2\n${util.format(newData)}`);
            for (let k in data) {
                if (k !== 'inputs' && k !== 'script')
                    newData[k] = data[k];
            }
            newData.socket = socket;
            socket.emit('granted', { jobID: data.id });
            resolve(newData);
        }, 250);
    });
}
exports.granted = granted;
function openBar() {
}
exports.openBar = openBar;
