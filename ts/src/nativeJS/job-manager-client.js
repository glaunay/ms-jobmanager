let EventEmitter=require('events').EventEmitter;
let jobLib = require('../job.js');
let io = require('socket.io-client');
//import cType = require('./commonTypes.js');
let fs = require('fs');
let ss = require('socket.io-stream');
let logger = require('winston');
let util = require('util');

let socket;
let jobsPool = {};
/*
    establish socket io connection with job-manager MS (via job-manager-server implementation)
    raise the "ready";
*/


/* The socket forward the following event to the local jobProxyObject 
 *          'lostJob', {Object}jobObject : any job not found in the process pool
 *          'listError, {String}error) : the engine failed to list process along with error message
 *          'folderSetPermissionError', {String}msg, {String}err, {Object}job
 *          'scriptSetPermissionError', {String}err, {Object}job;
 *          'scriptWriteError', {String}err, {Object}job
 *          'scriptReadError', {String}err, {Object}job
 *          'inputError', {String}err, {Object}job
 *          'ready'
 *          'submitted', {Object}job;
 *          'completed', {Stream}stdio, {Stream}stderr, {Object}job // this event raising is delegated to jobManager
 */



export function start(opt){
    let evt = new EventEmitter();
    //socket.connect('http://localhost:8080');
    // KINDA USELESS FOR NOW
    let url = 'http://' + opt.TCPip + ':' + opt.port;
    logger.debug(`jobmanager core microservice coordinates defined as \"${url}\"`);
    socket = io(url).on("connect",()=>{
        logger.debug(`manage to connect to jobmanager core microservice at ${url}`);
        evt.emit("ready");        
    });



    bindForwardEvent(socket);

    return evt
}

/*
 Returns reference to a live jobProxy object
*/
function getJobObject(uuid) {
    logger.debug(`Looking in pool for id ${uuid}`);
    if (jobsPool.hasOwnProperty(uuid))
        return jobsPool[uuid];
    logger.error(`job id ${uuid} is not found in local jobsPool`);
    logger.error(`${util.format(Object.keys(jobsPool))}`);
    return undefined;
}

function deleteJob(uuid) {
    if (jobsPool.hasOwnProperty(uuid)) {
        delete(jobsPool[uuid]);
        return true;
    }
    logger.error(`Can't remove job, its id ${uuid} is not found in local jobsPool`);
    return false;
}

function bindForwardEvent(socket) {
    socket.on('lostJob', (jobSerial) => {
        let jRef = getJobObject(jobSerial.id);
        if (!jRef)
            return;

        logger.error(`Following job not found in the process pool ${JSON.stringify(jRef.toJSON())}`);
        jRef.emit('lostJob', jRef);
        deleteJob(jobSerial.id);
    });
  //  *          'listError, {String}error) : the engine failed to list process along with error message
    
    socket.on('folderSetPermissionError', (msg, err, jobSerial) => {
        let jRef = getJobObject(jobSerial.id);
        if (!jRef)
            return;
        jRef.emit('folderSetPermissionError', msg, err, jRef);
        deleteJob(jobSerial.id);
    });
    
    ['scriptSetPermissionError', 'scriptWriteError', 'scriptReadError', 'inputError'].forEach((eName)=>{ 
        socket.on(eName, ( err, jobSerial) => {
            let jRef = getJobObject(jobSerial.id);
            if (!jRef)
                return;
            jRef.emit(eName, err, jRef);
            deleteJob(jobSerial.id);
        });
    });

    ['submitted', 'ready'].forEach((eName)=>{
        socket.on(eName, (jobSerial) => {
            let jRef = getJobObject(jobSerial.id);
            if (!jRef)
                return;
            jRef.emit('ready');
        });
    });
   
    socket.on('completed',pull);

}

function pull(_jobSerial) {  
    let jobSerial = JSON.parse(_jobSerial);
    logger.debug(`pulling Object : ${util.format(jobSerial)}`);
   
    let jobObject = getJobObject(jobSerial.id);
    if (!jobObject)
        return;
    logger.debug('completed event on socket');
    logger.debug(`${util.format(jobObject)}`);
    jobObject.stdout = ss.createStream();
    jobObject.stderr = ss.createStream();
    logger.debug(`Pulling for ${jobObject.id}:stdout`);
    logger.debug(`Pulling for ${jobObject.id}:stderr`)
    ss(socket).emit(`${jobObject.id}:stdout`, jobObject.stdout);
    ss(socket).emit(`${jobObject.id}:stderr`, jobObject.stderr);

    jobObject.emit('completed', jobObject.stdout, jobObject.stderr, jobObject);

        /* raise following event
         'completed', {Stream}stdio, {Stream}stderr, {Object}job // this event raising is delegated to jobManager
         */
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
        id:undefined,
        script : undefined,
        cmd : undefined,
        modules : [],
        tagTask : undefined,
        namespace:undefined,
        exportVar : undefined,
        jobProfile : "default",
        ttl : undefined,
        inputs : {}
    }
    for (let k in data) {
        if(!jobOpt.hasOwnProperty(k)){
            logger.error(`Unknown jobOpt property ${k}`);
            continue;
        }
        jobOpt[k] = data[k];
    }

    logger.debug(`Passing following jobOpt to jobProxy constructor\n${util.format(jobOpt)}`);
    let job = new jobLib.jobProxy(jobOpt);
    data.id = job.id;
    jobsPool[job.id] = job;

    // Building streams
    jobOpt = buildStreams(jobOpt, job);
    
    logger.debug(`jobOpt passed to socket:\n${util.format(jobOpt)}`);
    // Emitting the corresponding event/Symbols for socket streaming;
    //socket.on('connect',()=>{});
    ss(socket, {}).on('script', (stream)=>{ jobOpt.script.pipe(stream); });
    for (let inputEvent in jobOpt.inputs)
        ss(socket, {}).on(inputEvent, (stream)=>{ jobOpt.inputs[inputEvent].pipe(stream);});
    logger.debug(`Emiting newJobSocket w/ data\n${util.format(jobOpt)}`);
    
   
    socket.emit('newJobSocket', data);



    // Registering event

    socket.on('jobStart',(data)=>{
        console.log('received jobStart');
        console.log(`${util.format(data)}`);
    });

    return job;
}

function buildStreams(data, job){

    logger.debug(`${util.format(data)}`);
    let jobInput = new jobLib.jobInputs(data.inputs);
    // Register error here at stream creation fail
    let sMap = {
        script : fs.createReadStream(data.script),
        inputs : {}
    };
    sMap.script.on('error', function(){       
        let msg = `Failed to create read stream from ${data.script}`;
        job.emit('scriptError', msg);
    });

    jobInput.on('streamReadError',(e)=>{
        job.emit('inputError', e);
    })

    sMap.inputs = jobInput.getStreamsMap();

    data.script = sMap.script;
    data.inputs = sMap.inputs;
    logger.debug("steams buildt");
    logger.debug(typeof(sMap.script));
    logger.debug(`${util.format(sMap.script)}`);
    return data;
}

// following is deprecated we try to use the jobInput object
function _buildStreams(data, job) {

    let scriptSrcStream;

    let sMap = {
        script : fs.createReadStream(data.script),
        inputs : {}
    };
    sMap.script.on('error', function(){       
        let msg = `Failed to create read stream from ${data.script}`;
        job.emit('scriptError', msg);
    });




    for(let inputSymbol in data.inputs) {
        let filePath = data.inputs[inputSymbol];   
        sMap.inputs[inputSymbol] = fs.createReadStream(filePath);
        sMap.inputs[inputSymbol].on('error', function(){ 
            let msg = `Failed to create read stream from ${filePath}`;
            job.emit('inputError', msg);
        });
    }
    data.script = sMap.script;
    data.inputs = sMap.inputs;
    logger.debug("steams buildt");
    logger.debug(typeof(sMap.script));
    return data;
}

//asynchronous file/String wrap into stream
function streamWrap(source) {
    // if source is a string// a path to a file we make it a stream
    fs.stat(source, function(err, stat) {
        if(err == null) {
            // string is a file
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