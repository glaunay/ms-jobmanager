let EventEmitter=require('events').EventEmitter;
let jobLib = require('../job.js');
let io = require('socket.io-client');
//import cType = require('./commonTypes.js');
let fs = require('fs');
let ss = require('socket.io-stream');
let logger = require('./logger.js');
let util = require('util');
//import libStream = require("stream");

//import comType = require('./job-manager-comTypes.js');
//const socket = io('http://localhost');

let socket;

/*
    establish socket io connection with job-manager MS (via job-manager-server implementation)
    raise the "ready";
*/
export function start(opt){
    let evt = new EventEmitter();
    //socket.connect('http://localhost:8080');
    // KINDA USELESS FOR NOW
    socket = io('http://' + opt.TCPip + ':' + opt.port).on("connect",()=>{evt.emit("ready");});
    return evt
}


// test data refers to a list of file
// We build a litteral with the same keys but with values that are streams instead of path to file
// Then we bind stream to the socket using the litteral keys to define the socket event names

// We handle provided key/value pairs differently
//  script -> a readable stream
// inputs -> a string map of readablestream
// module -> a list of string
// exportVars -> a string map

// if a cmd is passed we make it a stream and assign it to script

export function push(data) {

    // Creating a proxyJob object
    //et jobOpt:jobLib.jobProxyInterface =


    //
    let jobOpt = {
        script : undefined,
        cmd : undefined,
        modules : [],
        tagTask : undefined,
        namespace:undefined,
        exportVar : undefined,
        jobProfile : undefined,
        inputs : {}
    }
    for (let k in data) {
        if(!jobOpt.hasOwnProperty(k)){
            logger.error(`Unknown jobOpt property ${k}`);
            continue;
        }
        jobOpt[k] = data[k];
    }

    logger.debug(`Passing following jobOpt to jobProxy constructor\n${util.format(jobpt)}`);
    let job = jobLib.jobProxy(jobOpt);


    // Building streams
    jobOpt = buildStreams(jobOpt);
    // Emitting the corresponding event/Symbols for socket streaming;
    socket.on('connect',()=>{});
    ss(socket, {}).on('script', (stream)=>{ sMap.script.pipe(stream); });
    for (let inputEvent in sMap.inputs)
        ss(socket, {}).on(inputEvent, (stream)=>{ sMap.inputs[inputEvent].pipe(stream);});

    socket.emit('newJobSocket', data);

    return job;
}


// Async stream build  async.parrallel
function buildStreams(data) {

    let scriptSrcStream;

    let sMap = {
        script : fs.createReadStream(data.script),
        inputs : {}
    };
    for(let inputSymbol in data.inputs) {
        let filePath = data.inputs[inputSymbol];   
        sMap.inputs[inputSymbol] = fs.createReadStream(filePath);
    }
    data.script = sMap.scrit;
    data.inputs = sMap.inputs;
    
    return data;
}

//asynchronous file/String wrap into stream
function streamWrap(source) {
    // if source is a string// a path to a file we make it a stream
    fs.stat(source, function(err, stat) {
        if(err == null) {
            fs.createReadStream(filePath);
            console.log('File exists');
        } else if(err.code == 'ENOENT') {
            // file does not exist
            fs.writeFile('log.txt', 'Some log\n');
        } else {
            console.log('Some other error: ', err.code);
        }
    });

}

/* weak typing of the jobOpt  parameter , maybe develop a signature that core and client method should comply to ?*/
//export function push(jobProfileString : string, jobOpt:any /*jobOptInterface*/, namespace?: string) : jobLib.jobProxy {


    /*Valentin & Melanie patter*/
    //Create new sokcet connection
    //see dogfaccotry client l31

//}



//let job:jobLib.jobSerialInterface = {
    //cmd : 1222,
    //'script'? :string,
   // 'exportVar'? :cType.stringMap,
   // 'modules'? :string [],
  //  'tagTask'? :string,
//    'scriptHash' : null
 //   'inputHash' :cType.stringMap[]
//}