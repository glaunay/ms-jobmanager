let events = require('events');
let socketIO = require('socket.io');
let HTTP = require('http');
let jobLib = require('../job.js');
let ss = require('socket.io-stream');
let logger = require('winston');
let util = require('util');
//import ss = require('./node_modules/socket.io-stream/socket.io-stream.js');

//import comType = require('./job-manager-comTypes.js');


let io;

export function listen(port) {
    let evt = new events.EventEmitter;

    let server = HTTP.createServer();
    io = socketIO(server);
    io.on('connection', function(socket){
        evt.emit('connection');
        socket.on('newJobSocket', (data) => {

        let newData = {
            script : ss.createStream(),
            inputs : {}
        };
        
        for(let inputSymbol in data.inputs) {
            let filePath = data.inputs[inputSymbol];
            newData.inputs[inputSymbol] = ss.createStream();

            ss(socket).emit(inputSymbol,newData.inputs[inputSymbol]);
            //streamMap.inputs[inputSymbol].pipe(process.stdout)
        }
        ss(socket).emit('script', newData.script);
        
        for (let k in data) {
            if (k !== 'inputs' || k !== 'script')
            newData[k] = data[k];
        }
        newData.socket = socket;
        //streamMap.script.pipe(process.stdout)
        // Emitting the corresponding event/Symbols for socket streaming

        evt.emit('newJobSocket', newData);

    });

        socket.on('disconnect', function(){});
    });

    server.listen(port);
    return evt;
}

/*  NO NEED
    Sending data back to the client // propagating event to the client
    //{
        type : event
        data : { symbol : ('type', 'reference'), ... }        
    }
    data element type can be scalar or stream, or do we ducktype ?

*/
export function socketPull(stdout, stderr, jobObject){
    logger.debug("socket job pulling");
    logger.debug(`${util.format(stdout)}`);
    ss(jobObject.socket).on(`${jobObject.id}:stdout`, function(stream) {
        //jobObject.stdout().pipe(stream);
        looger.debug("slurp");
        stdout.pipe(stream);
    });
    ss(jobObject.socket).on(`${jobObject.id}:stderr`, function(stream) {
        //jobObject.stderr().pipe(stream);
        stderr.pipe(stream);
    });
    jobObject.socket.emit('completed', JSON.stringify(jobObject));
}