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
            let socketNamespace = data.id;
            logger.debug(`========\n=============\nnewJobSocket received container:\n${util.format(data)}`);
            let newData = {
                script : ss.createStream(),
                inputs : {}
            };            
            for(let inputSymbol in data.inputs) {
                let filePath = data.inputs[inputSymbol];
                newData.inputs[inputSymbol] = ss.createStream();
                logger.debug(`ssStream emission for input symbol '${inputSymbol}'`);
                ss(socket).emit(socketNamespace + "/" + inputSymbol,newData.inputs[inputSymbol]);
                //logger.warn('IeDump from' +  socketNamespace + "/" + inputSymbol);
                //newData.inputs[inputSymbol].pipe(process.stdout)
            }
            
            ss(socket).emit(socketNamespace + "/script", newData.script);
            //logger.error(`TOTOT2\n${util.format(newData)}`);
        
            for (let k in data) {
                if (k !== 'inputs' && k !== 'script')
                    newData[k] = data[k];
            }
            newData.socket = socket;
            //logger.error(`TOTOT3\n${util.format(newData)}`);
        //streamMap.script.pipe(process.stdout)
        // Emitting the corresponding event/Symbols for socket streaming
            logger.debug(`========\n=============\nnewJobSocket emmitting container:\n${util.format(newData)}`);
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
export function socketPull(jobObject, stdoutStreamOverride, stderrStreamOverride){
    
    if(stdoutStreamOverride)
        logger.debug("Shimmering Socket job pulling");
    else
        logger.debug("Genuine socket job pulling");
        
  //  logger.debug(`${util.format(stdout)}`);

    let stdoutStream = stdoutStreamOverride ? stdoutStreamOverride : jobObject.stdout();
    let stderrStream = stderrStreamOverride ? stderrStreamOverride : jobObject.stderr();
    

    ss(jobObject.socket).on(`${jobObject.id}:stdout`, function(stream) {
        stdoutStream.then((_stdout) => {
            logger.debug(`Pumping stdout [${jobObject.id}:stdout]`);
            //logger.warn(`stdoutStream expected ${util.format(_stdout)}`);
            _stdout.pipe(stream);
        });
    });
    
    ss(jobObject.socket).on(`${jobObject.id}:stderr`, function(stream) {       
        stderrStream.then((_stderr) => { 
            logger.debug(`Pumping stderr [${jobObject.id}:stderr]`);
            //logger.warn(`stderrStream expected ${util.format(_stderr)}`);
            _stderr.pipe(stream);
        });
    });
    jobObject.socket.emit('completed', JSON.stringify(jobObject));
}