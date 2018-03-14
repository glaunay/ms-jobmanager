import events = require('events');
import socketIO = require('socket.io');
import HTTP = require('http');
import jobLib = require('./job.js');
import ss = require('socket.io-stream');
let io:any = null;

interface newJobPacketInterface {

}
export function listen(port:number=8080):events.EventEmitter{
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
        }
        ss(socket).emit('script', streamMap.script);
        streamMap.script.pipe(process.stdout)
    // Emitting the corresponding event/Symbols for socket streaming

    });

        socket.on('disconnect', function(){});
    });

    server.listen(port);
    return evt;
}
