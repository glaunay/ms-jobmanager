import {EventEmitter} from 'events';
import jobLib=require('./job.js');
import io from 'socket.io-client';
import cType = require('./commonTypes.js');
import fs = require('fs');
import ss = require('socket.io-stream');
//const socket = io('http://localhost');

interface msCoordinates {
    port : number;
    TCPip : string;
}

interface newJobPackage {
    uuid : string;
    script : string; // path to the script file
    inputs : cType.stringMap; // path to the input files
}
/*
    establish socket io connection with job-manager MS (via job-manager-server implementation)
    raise the "ready";
*/
export function start(opt:msCoordinates):EventEmitter{
    let evt = new EventEmitter();
    //socket.connect('http://localhost:8080');
    // KINDA USELESS FOR NOW
    let socket = io('http://' + opt.TCPip + ':' + opt.port).on("connect",()=>{evt.emit("ready");});
    return evt
}

// test data refers to a list of file
// We build a litteral with the same keys but with values that are streams instead of path to file
// Then we bind stream to the socket using the litteral keys to define the socket event names
export function push(data:newJobPackage) {
    // Building streams
    let streamMap = {
        script : fs.createReadStream(data.script),
        inputs : {}
    };
    for(let inputSymbol in data.inputs) {
        let filePath = data.inputs[inputSymbol];
        streamMap.inputs[inputSymbol] = fs.createReadStream(filePath);
    }
    // Emitting the corresponding event/Symbols for socket streaming
    let socket = io('http://localhost').on('connect',()=>{
        ss(socket).on('script', (stream)=>{ streamMap.script.pipe(stream); });
        for (let inputEvent in streamMap.inputs)
            ss(socket).on(inputEvent, (stream)=>{ streamMap.inputs[inputEvent].pipe(stream);});

        socket.emit('newJob', data);
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