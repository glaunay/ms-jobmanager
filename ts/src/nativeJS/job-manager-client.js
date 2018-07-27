let EventEmitter = require('events').EventEmitter;
let jobLib = require('../job.js');
let io = require('socket.io-client');
//import cType = require('./commonTypes.js');
let fs = require('fs');
let ss = require('socket.io-stream');
let logger = require('winston');
let util = require('util');
let socket;
let stream = require('stream');
let through2 = require('through2');

let events = require('events');

/*
    Defining object to take care of job sumbissions
*/



class jobAccumulator extends events.EventEmitter {
    jobsPool = {};
    JMsocket = undefined;
    JMstatus = 'busy';
    jobsQueue = [];
    jobsPromisesReject = {};
    jobsPromisesResolve = {};
    constructor() {
        super();

    
        // running managment loop;
        //setInterval(this.pulse(), 500);
    }
    _getJobQueueWrapper(jobID) {
        for (let jobWrap of this.jobsQueue)
            if (jobWrap.job.id == jobID)
                return jobWrap;
        return undefined;
    }
    _countSentJob() {
        let c = 0;
        for (let jobWrap of this.jobsQueue)
            if (jobWrap.status == 'sent')
                c++; 
        return c;
    }
    _getWaitingJob() {
        for (let jobWrap of this.jobsQueue)
            if (jobWrap.status == 'idle' || jobWrap.status == 'bounced')
                return jobWrap;
        
        return undefined;
    }
    popQueue() { //Take the 1st job idle or bounced;
        //Promise resolution is delegated to the socket listener in bind method
        let jobWrap = this._getWaitingJob();
        let self = this;
        let p = new Promise((resolve, reject) => { 
            self.jobsPromisesResolve[jobWrap.job.id] = resolve;
            self.jobsPromisesReject[jobWrap.job.id] = reject;
            if (!jobWrap) {
                logger.debug("Queue exhausted");
                reject({ type : 'exhausted'});
                return;
            }
            
            // if bounced status, stream are already setup
            if (jobWrap.status == 'idle') {
            // Building streams for newly submitted job
            // test data refers to a list of file
            // We build a litteral with the same keys but with values that are streams instead of path to file
            // Then we bind stream to the socket using the litteral keys to define the socket event names
            // We handle provided key/value pairs differently
            //  script -> a readable stream
            // inputs -> a string map of readablestream
            // module -> a list of string
            // exportVars -> a string map
            // if a cmd is passed we make it a stream and assign it to script

                let data = jobWrap.data;
                let jobOpt = jobWrap.jobOpt;
                let job = jobWrap.job;

                jobOpt = buildStreams(jobOpt, job);
                logger.debug(`jobOpt passed to socket w/ id ${data.id}:\n${util.format(jobOpt)}`);
        
                ss(socket, {}).on(data.id + '/script', (stream) => { jobOpt.script.pipe(stream); });
                for (let inputEvent in jobOpt.inputs)
                    ss(socket, {}).on(data.id + '/' + inputEvent, (stream) => {
                        jobOpt.inputs[inputEvent].pipe(stream);
                });
            }

            jobWrap.status = 'sent';    
            socket.emit('newJobSocket', jobWrap.data);
        });

        return p;
    }
    appendToQueue(data, jobOpt){
        let job = new jobLib.jobProxy(jobOpt);
        this.jobsPool[job.id] = job;
        data.id = job.id;
        

        this.jobsQueue.push( { 
            'job' : job,
            'data' : data,
            'jobOpt' : jobOpt,
            'status' : 'idle'
        });
    
        if (this.isIdle())
            this.pulse();    

        return job;
    }
    isIdle() { // Job Accumulator is IDLE if no queue element is in the sent status
        for (let jobWrap of this.jobsQueue)
            if (jobWrap.status == 'sent')
                return false;
        return true;
    }
    deleteJob(jobID) {
        if (this.jobsPool.hasOwnProperty(jobID)) {
            delete (this.jobsPool[jobID]);
            delete(this.jobsPromisesResolve[jobID]);
            delete(this.jobsPromisesReject[jobID]);
            return true;
        }
        logger.error(`Can't remove job, its id ${jobID} is not found in local jobsPool`);
        return false;
    }
    pulse(){ // Try to consume jobQueue
        if (this.jobsQueue.length == 0)
            return;

        if (this._countSentJob > 0) // Only one job awaiting granted access at a time
            return;
        let self = this;
        // Maybe done w/ async/await
        this.popQueue().then((jobID)=>{ 
            self._getJobQueueWrapper(jobID).status = 'granted';
            self.pulse(); // Trying to send next one asap
        }).catch((err) => {        
            if (err.type == 'bouncing') {
                self._getJobQueueWrapper(err.jobID).status = 'bounced';            
                setTimeout(()=>{self.pulse();}, 1500);   // W8 and resend
            }
        });
    }
    flush (jobID) {
        let job = this.getJobObject(jobID);
        if(!job)
            return undefined;
        this._getJobQueueWrapper(jobID).status = 'completed';
        this.deleteJob(jobID);
      
        return job;
    }
    getJobObject(uuid){
        if (this.jobsPool.hasOwnProperty(uuid))
            return this.jobsPool[uuid];
        logger.error(`job id ${uuid} is not found in local jobsPool`);
        logger.error(`${util.format(Object.keys(this.jobsPool))}`);
        return undefined;
    }
    bind(socket) {
        logger.debug("Binding accumulator to socket");
        this.socket = socket;

        socket.on('jobStart', (data) => {
            // Maybe do smtg
            // data = JSON.parse(data);
        });
        let self = this;
        socket.on('bounced', (d) => {            
            logger.debug(`Job ${util.format(d)} was bounced !`);
            self.jobsPromisesReject[d.jobID]({ 'type' : 'bouncing', jobID : d.jobID });
        });
        socket.on('granted', (d) => {            
            self.jobsPromisesResolve[d.jobID](d.jobID);
        });


        socket.on('lostJob', (jobSerial) => {
            let jRef = this.getJobObject(jobSerial.id);
            if (!jRef)
                return;
            logger.error(`Following job not found in the process pool ${JSON.stringify(jRef.toJSON())}`);
            jRef.emit('lostJob', jRef);
            self.deleteJob(jobSerial.id);
        });
        //  *          'listError, {String}error) : the engine failed to list process along with error message
        socket.on('folderSetPermissionError', (msg, err, jobSerial) => {
            let jRef = getJobObject(jobSerial.id);
            if (!jRef)
                return;
            jRef.emit('folderSetPermissionError', msg, err, jRef);
            self.deleteJob(jobSerial.id);
        });
        ['scriptSetPermissionError', 'scriptWriteError', 'scriptReadError', 'inputError'].forEach((eName) => {
            socket.on(eName, (err, jobSerial) => {
                let jRef = getJobObject(jobSerial.id);
                if (!jRef)
                    return;
                jRef.emit(eName, err, jRef);
                self.deleteJob(jobSerial.id);
            });
        });
        ['submitted', 'ready'].forEach((eName) => {
            socket.on(eName, (jobSerial) => {
                let jRef = getJobObject(jobSerial.id);
                if (!jRef)
                    return;
                jRef.emit('ready');
            });
        });

        socket.on('completed', pull);

        //socket.on('centralStatus', (d) => { this.JMstatus = d.status; });
    }

}





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
function start(opt) {
    let evt = new EventEmitter();
    jobAccumulator = new jobAccumulator();

    //socket.connect('http://localhost:8080');
    // KINDA USELESS FOR NOW
    let url = 'http://' + opt.TCPip + ':' + opt.port;
    logger.debug(`jobmanager core microservice coordinates defined as \"${url}\"`);
    socket = io(url).on("connect", (d) => {
        logger.debug(`manage to connect to jobmanager core microservice at ${url}`);
        evt.emit("ready");
        jobAccumulator.bind(socket);

    });
   
    return evt;
}


function pull(_jobSerial) {
    let jobSerial = JSON.parse(_jobSerial);
    logger.debug(`pulling Object : ${util.format(jobSerial)}`);
    let jobObject = jobAccumulator.flush(jobSerial.id);
    if (!jobObject)
        return;
    logger.debug('completed event on socket');
    logger.silly(`${util.format(jobObject)}`);

    let buffer_stdout = ss.createStream();
    let buffer_stderr = ss.createStream();
    logger.debug(`Pulling for ${jobObject.id}:stdout`);
    logger.debug(`Pulling for ${jobObject.id}:stderr`);
    ss(socket).emit(`${jobObject.id}:stdout`, buffer_stdout);
    ss(socket).emit(`${jobObject.id}:stderr`, buffer_stderr);


    // We try to limit file open descriptor on JM side, by draining the streams and closing socket

    /*jobObject.stdout = new stream.Transform();
    jobObject.stderr = new stream.Transform();*/

    jobObject.stdout = through2(function (chunk/*, enc, callback*/) {
        this.push(chunk);
     
        //callback()
    });
    jobObject.stderr = through2(function (chunk/*, enc, callback*/) {
        this.push(chunk);
     
        //callback()
    });

    buffer_stdout.pipe(jobObject.stdout);
    buffer_stdout.on('finish',()=> {

        logger.silly("socket stream out exhausted");
        buffer_stderr.pipe(jobObject.stderr);
        buffer_stderr.on('finish',()=> {
            logger.silly("socket stream err exhausted");
            socket.emit('drained', {jobID : jobSerial.id})
            /*
            logger.info('Closing socket');            
            socket.close();
            */
            jobObject.emit('completed', jobObject.stdout, jobObject.stderr, jobObject);
        })
    });
   

    /* raise following event
     'completed', {Stream}stdio, {Stream}stderr, {Object}job // this event raising is delegated to jobManager
     */
}

function push(data) {
       let jobOpt = {
        id: undefined,
        script: undefined,
        cmd: undefined,
        modules: [],
        tagTask: undefined,
        namespace: undefined,
        exportVar: undefined,
        jobProfile: "default",
        ttl: undefined,
        inputs: {}
    };
    for (let k in data) {
        if (!jobOpt.hasOwnProperty(k)) {
            logger.error(`Unknown jobOpt property ${k}`);
            continue;
        }
        jobOpt[k] = data[k];
    }
    // console.log(`Got that\n${util.format(data)}`);
    logger.debug(`Passing following jobOpt to jobProxy constructor\n${util.format(jobOpt)}`);

   
    let job  = jobAccumulator.appendToQueue(data, jobOpt);

    return job;
}

function buildStreams(data, job) {
    logger.debug(`-->${util.format(data)}`);
    //let jobInput = new jobLib.jobInputs(data.inputs);
    let jobInput = job.inputs;
    // Register error here at stream creation fail
    let sMap = {
        script: fs.createReadStream(data.script),
        inputs: {}
    };
    sMap.script.on('error', function () {
        let msg = `Failed to create read stream from ${data.script}`;
        job.emit('scriptError', msg);
        throw ("No one here");
    });
    jobInput.on('streamReadError', (e) => {
        job.emit('inputError', e);
    });
    sMap.inputs = jobInput.getStreamsMap();
    data.script = sMap.script;
    data.inputs = sMap.inputs;
   /* logger.debug("streams buildt");
    logger.debug(typeof (sMap.script));
    logger.debug(`${util.format(sMap.script)}`);*/
    return data;
}


exports.push = push;
exports.start = start;
