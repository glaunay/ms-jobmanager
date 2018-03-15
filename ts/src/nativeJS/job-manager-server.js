let events = require('events');
let socketIO = require('socket.io');
let HTTP = require('http');
let jobLib = require('../job.js');
let ss = require('socket.io-stream');
//import ss = require('./node_modules/socket.io-stream/socket.io-stream.js');

//import comType = require('./job-manager-comTypes.js');


let io;

export function listen(port) {
    let evt = new events.EventEmitter;

    let server = HTTP.createServer();
    io = socketIO(server);
    io.on('connection', function(socket){
         socket.on('newJob', (data) => {

        let streamMap = {
            script : ss.createStream(),
            inputs : {}
        };
        for(let inputSymbol in data.inputs) {
            let filePath = data.inputs[inputSymbol];
            streamMap.inputs[inputSymbol] = ss.createStream();

            ss(socket).emit(inputSymbol,streamMap.inputs[inputSymbol]);
            //streamMap.inputs[inputSymbol].pipe(process.stdout)
        }
        ss(socket).emit('script', streamMap.script);
        //streamMap.script.pipe(process.stdout)
    // Emitting the corresponding event/Symbols for socket streaming

        evt.emit('newJob', streamMap);

    });

        socket.on('disconnect', function(){});
    });

    server.listen(port);
    return evt;
}

