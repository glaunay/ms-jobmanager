import events = require('events');
import uuidv4 = require('uuid/v4');
import fs = require('fs');
import mkdirp = require('mkdirp');
import util = require('util');
import isStream = require('is-stream');
import path = require("path");
import stream = require('stream')
import md5 = require('md5');
import streamLib = require('stream');
import {logger} from './logger.js';

import engineLib = require('./lib/engine/index.js');
import cType = require('./commonTypes.js');
import { dummyEngine } from './lib/engine/index.js';

import {socketPull} from './nativeJS/job-manager-server';
import crypto = require('crypto');

import childProc = require('child_process');

/*
    job serialization includes
    workDir relateive to jobMnager file system
    fileName : hash value
*/

export interface inputDataSocket { [s: string] : streamLib.Readable|string; }
export interface jobOptProxyInterface {
    //engine? : engineLib.engineInterface; 
    script? : string|streamLib.Readable,
    jobProfile?: string;
    cmd? : string,
    exportVar? : cType.stringMap,
    inputs? : inputDataSocket|string[]|jobInputs,
    tagTask? : string,
    namespace? :string,
    modules? : string [],
    socket?:any,//SocketIO.socket WE DONT TYPEGUARD IT YET !!
}




/* The jobObject behaves like an emitter
 * Emitter exposes following event:
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

// We type socketPullArgs, which is a vanilla nodeJS function
type socketPullArgs = [jobObject|jobProxy, Promise<streamLib.Readable>, Promise<streamLib.Readable>] | [jobObject|jobProxy, undefined, undefined];




/*
    type guard for data container send from the consumer microservice to the JM.
    aka "newJobSocket" event
*/
export function isJobOptProxy(data: any): data is jobOptProxyInterface {
    if (!data.hasOwnProperty('script') && !data.hasOwnProperty('inputs')) return false;

    if (!isStream(data.script)){
        logger.error("jobOptProxy script value is not a readable stream");
        logger.error(`${data.script}`);
        return false;
    }
    for (let k in data.inputs){
        if ( !isStream(data.inputs[k]) ){
            logger.error(`jobOptProxy input value \"${k}\" is not a readable stream`);
            return false;
        }
    }

    return true;
}

 export interface jobOptInterface extends jobOptProxyInterface{
    engine : engineLib.engineInterface, // it is added by the jm.push method
    
    // To allow mutliple slurm user 
    sysSettingsKey?:string,
   
    port : number, // JobManager MicroService Coordinates
    adress : string, // ""
    workDir : string,
    emulated? : boolean,
    cwd? : string,
    cwdClone? : boolean,
    ttl? : number
}



export interface jobSerialInterface {
    workDir?: string,
    id : string,
    cmd? :string,
    script? :string,
    exportVar? :cType.stringMap,
    modules? :string [],
    tagTask? :string,
    scriptHash :string,
    inputHash? :cType.stringMap
}


/*
    Constuctor performs synchronous operations
    It should be modifed to async
    -> Emit event to confirm safe construction
*/

export class jobInputs extends events.EventEmitter {
    streams:cType.streamMap = {};
    paths:cType.stringMap = {};
    hashes:cType.stringMap = {}

    hashable:boolean=false;


    /* Constructor can receive a map w/ two types of value
        Should be SYNC-like
    */
    constructor(data?:{}|any[]/*, skip?:boolean*/){
        super();
        
        let safeNameInput:boolean = true;
        
        if(!data)
            return;
        
        
        let buffer:any = {};
        // Coherce array in litteral, autogenerate keys
        if (data.constructor === Array) {
            safeNameInput = false;
            let a = <Array<any>>data;
            for (let e of a.entries())
                buffer[`file${e[0]}`] = e[1];
        } else {
            buffer = data;
        }
        if (!cType.isStreamOrStringMap(buffer))
            throw(`Wrong format for ${util.format(buffer)}`);
        let nTotal = Object.keys(buffer).length;
        logger.debug(`jobInput constructed w/ ${nTotal} items:\n${util.format(buffer)}`);

        let self = this;
        for (let key in data) {
            if( isStream(buffer[key]) )
                this.streams[key] = <streamLib.Readable>buffer[key];
            else {
                try{
                    //if (!safeNameInput) throw('file naming is unsafe');
                    let datum:string = <string>buffer[key];
                    fs.lstatSync(datum).isFile();
                    let k = path.basename(datum).replace(/\.[^/.]+$/, ""); 
                    k = key; // GL Aug2018, HOTFIX from taskobject, maybe will break JM -- MS side let'see
                    this.streams[k] = fs.createReadStream(datum);
                    logger.debug(`${buffer[key]} is a file, stream assigned to ${k}`);

                } catch(e) {
                    logger.warn(`Provided input named ${key} is not a file, assuming a string`);                    
                  // Handle error
                    if(e.code == 'ENOENT'){
                    //no such file or directory
                    //do something
                    } else {
                    //do something else
                    }
                    this.streams[key] = new streamLib.Readable();
                  
                    this.streams[key].push(<string>buffer[key]);
                    this.streams[key].push(null);
                    
                   // this.streams[key].on('data',(e)=>{ logger.error(`${e.toString()}`); });
                    
                    // Following block works as intended
                  /*  let toto:any = new streamLib.Readable();
                    toto.push(<string>buffer[key]);
                    toto.push(null);
                    toto.on('data',(e)=>{ logger.error(`${e.toString()}`); });*/
                    //
               }
            }
            this.streams[key].on('error', (e) => {
                self.emit('streamReadError', e);
            });
        }      
    }
    // Access from client side to wrap in socketIO
    getStreamsMap():cType.streamMap|undefined {
        if (this.hashable) {
            logger.warn('All streams were consumed');
            return undefined;
        }  
        return this.streams;
    }
    hash():cType.stringMap|undefined {
        if (!this.hashable) {
            logger.warn('Trying to get hash of inputs before write it to files');
            return undefined;
        }
        return this.hashes;
    }
    write(location:string):jobInputs{
        /*let iteratee = function(string:symbol,stream:streamLib.Readable){
            let target = fs.createWriteStream(`${location}/${symbol}.inp`);
            stream.pipe(target);//.on('finish', function () { ... });
        }*/
        let self = this;
        let inputs:any[] = [];
        Object.keys(this.streams).forEach((k) => {
            let tuple: [string, streamLib.Readable] = [k, self.streams[k]];
            inputs.push(tuple);
        });

        let promises = inputs.map(function(tuple) {
            return new Promise(function(resolve,reject){
               
                fs.stat(location,(err, stats)=>{
                    if(err) {
                        logger.error("Wrong filr path :: " + err);
                        reject('path error');
                        return;
                    }
                    let path = `${location}/${tuple[0]}.inp`;
                    let target = fs.createWriteStream(path);
                    target.on('error', (msg) => {
                        logger.error('Failed to open write stream');
                        reject('createWriteStreamError');
                    })
                    //logger.info(`opening ${path} success`);

              
                    tuple[1].pipe(target);
                    target
                    .on('data',(d:any)=>{console.log(d);})
                    .on('close', () => {                    
                        // the file you want to get the hash    
                        let fd = fs.createReadStream(path);
                        fd.on('error', ()=>{
                            logger.error(`Can't open for reading ${path}`);
                        })
                        let hash = crypto.createHash('sha1');
                        hash.setEncoding('hex');
                   // fd.on('error',()=>{logger.error('KIN')});
                        fd.on('end', function() {
                            hash.end();
                            let sum = hash.read().toString();
                            self.hashes[tuple[0]] = sum; // the desired sha1sum                        
                            self.paths[tuple[0]] = path; // the path to file   
                            resolve([tuple[0], path, sum]);//.
                        });
// read all file and pipe it (write it) to the hash object
                        fd.pipe(hash);
                    });
                })
            });
        });
       // WE SHOULD HANDLE STREAM WRITE ERROR REJECTION AND PROPAGATE IT FOR 
       // owner JOB to be set in error status
       // BUT FIFO mess seems fixed so we'll see later, sorry
        Promise.all(promises).then(values => {           
            self.hashable = true;
            //logger.error(`${values}`);
            self.emit('OK', values)
          }, reason => {
            console.log(reason)
          });

        return this;
    }
    /* Returns a dictionary of inpuSymbols:pathToFile to be dumped by batchDumper */
    
}







/*
    This object is meant to live in the job-manager-client space !!!!!!
    We write it here to use TS.
    It is basically an empty shell that forwards event and streams
    W/in jmCore it is used as a virtual class for jobObject
    Following event occur on the job-manager-client side 
    job.emit('inputError')
    job.emit('scriptError')
*/

export class jobProxy extends events.EventEmitter implements jobOptProxyInterface{
    id : string;

    script? :string|streamLib.Readable;
    cmd? :string;
    exportVar? : cType.stringMap = {};
    inputs :jobInputs;
    jobProfile? : string;
    tagTask? :string;
    namespace? :string;
    modules? :string [] = [];
    socket?:any;

    isShimmeringOf?:jobObject;
    hasShimmerings:jobObject[] = [];


    constructor(jobOpt:any, uuid?:string){ // Quick and dirty typing
        super();
        this.id = uuid ? uuid : uuidv4();
      
        if ('modules' in jobOpt)
            this.modules = jobOpt.modules;
        if ('jobProfile' in jobOpt)       
            this.jobProfile =  jobOpt.jobProfile;
        if('script' in jobOpt)
            this.script =  jobOpt.script;
        if ('tagTask' in jobOpt)
            this.tagTask = jobOpt.tagTask;
        if ('namespace' in jobOpt)
            this.namespace = jobOpt.namespace;
        if ('socket' in jobOpt) 
            this.socket = jobOpt.socket;
        if('exportVar' in jobOpt)
            this.exportVar = jobOpt.exportVar;
       
        this.inputs = new jobInputs(jobOpt.inputs);

    }
    // 2ways Forwarding event to consumer or publicMS 
    // WARNING wont work with streams
    jEmit(eName:string|symbol, ...args: any[]):boolean {
        logger.silly(`jEmit(this) ${String(eName)}`);

        this.hasShimmerings.forEach((shimJob:jobObject) => {
            shimJob.jEmit(eName, ...args);
        }); 

        // We call the original emitter anyhow
        //logger.debug(`${eName} --> ${util.format(args)}`);
        //this.emit.apply(this, eName, args);
        //this.emit.apply(this, [eName, ...args])
        if(eName !== 'completed') {
            this.emit(eName, ...args);
        // Boiler-plate to emit conform completed event
        // if the consumer is in the same MS as the JM.
        } else if( this instanceof jobObject ){
            let stdout, stderr:Promise<streamLib.Readable>;
            if (this.isShimmeringOf) {
                stderr =  this.isShimmeringOf.stderr();
                stdout = this.isShimmeringOf.stdout();
            } else {
                stderr = this.stderr();
                stdout = this.stdout();
            }
            Promise.all([stdout, stderr]).then((results)=>{
                logger.silly("Emitting completed event");
                this.emit('completed', ...results)
            });
        }
            
        //return true;
        // if a socket is registred we serialize objects if needed, then
        // pass it to socket
        //If it exists, 
        // arguments are tricky (ie: streams), we socketPull
        // otherwise, we JSON.stringify arguments and emit them on socket
        if (this.socket) {
           // logger.warn(`jEmitToSocket ${eName}`);
            if(eName === 'completed') {

                //logger.debug(`SSP::\n${util.format(args)}`);
                //socketPull(...args);//eventName, jobObject
                let sArgs:socketPullArgs = [this, undefined, undefined];
                if (this.isShimmeringOf)
                    sArgs = [this, this.isShimmeringOf.stdout(),  this.isShimmeringOf.stderr()];
                socketPull(...sArgs);
                return true;
            }
       // Easy to serialize content
            let _args = args.map((e)=>{
                return JSON.stringify(e); // Primitive OR 
            });
            logger.debug(`socket emiting event ${String(eName)}`);    
            logger.debug(_args);         
            this.socket.emit(eName, ..._args);
        }
        return true;
    }
   
}

export class jobObject extends jobProxy implements jobOptInterface  {
   
    inputSymbols : any = {};
    ERR_jokers :number = 3; //  Number of time a job is allowed to be resubmitted if its stderr is non null
    MIA_jokers :number = 3; //  Number of time
    //inputDir : string;
    
    engine : engineLib.engineInterface;

    fromConsumerMS : boolean = false;
    /*
    jobProfile? : string;   
    script? :string;
    cmd? :string;
    exportVar? : cType.stringMap = {};
    inputs? :string [];
    tagTask? :string;
       modules? :string [] = [];
     namespace? :string;
    */
    port :number; // JobManager MicroService Coordinates
    adress :string; // ""
    workDir :string;
    execUser?: string; 

// Opt, set by object setter
    
    emulated? :boolean = false;
   
    cwd? :string;
    cwdClone? :boolean = false;
    ttl? :number;
 
    scriptFilePath?:string;
    fileOut? :string;
    fileErr? : string;
    _stdout? :streamLib.Readable;
    _stderr? :streamLib.Readable;

    constructor( jobOpt :jobOptInterface, uuid? :string ){
        super(jobOpt, uuid);
        
        this.port = jobOpt.port;
        this.adress = jobOpt.adress;
        this.workDir = jobOpt.workDir;
        //logger.info() 

        //const completeProfile = jobOpt.jobProfile === "default" ? undefined : getSlurmProfile(jobOpt.jobProfile)
        //this.execUser = completeProfile ? completeProfile.execUser : undefined
      
        if ('emulated' in jobOpt)
            this.emulated = jobOpt.emulated;
     
        if ('cwd' in jobOpt)
            this.cwd = jobOpt.cwd;
        if ('cwdClone' in jobOpt)
            this.cwdClone = jobOpt.cwdClone;
        if ('ttl' in jobOpt)
            this.ttl = jobOpt.ttl;

        
        //Default JM-level engine
        this.engine =  jobOpt.engine;
        if (! ("sysSettingsKey" in jobOpt) )
            return;
        logger.debug(`sysSettingsKey in jobOpt ${jobOpt.sysSettingsKey}`);
        // Job specific engine
        const sysSettingsKey = jobOpt['sysSettingsKey'];
        if(!sysSettingsKey) {
            logger.error("Undefined value for sysSettings of job engine, using default engine");
            return;
        }
        this.engine = engineLib.getEngine(this.engine.specs);
        logger.info(`Overidding default engine for ${this.engine.specs} w/ settings ${sysSettingsKey}`);
        this.engine.setSysProfile(sysSettingsKey);
       
        /*
        if (!templateJobEngine.hasOwnProperty("engineSpecs") ) {
            logger.error("Specified job engine lacks \"engineSpecs\" key using default engine");
            return;
        }
        if(!engineLib.isEngineSpec(templateJobEngine.engineSpecs)) {
            logger.error(`Specified job engine is unregistred \"${templateJobEngine.engineSpecs}\"`);
            return;   
        }
        
        if (templateJobEngine.hasOwnProperty("binariesSpec") ) {
            if(!templateJobEngine.binariesSpec) {
                logger.error("Specified job engine features an undefined \"binariesSpec\" object using defaule engine");
                return;
            }
            if(!engineLib.isBinariesSpec(templateJobEngine.binariesSpec)) {
                logger.error(`Specified job engine is unregistred \"${templateJobEngine.binariesSpec}\"`);
                return;   
            }
        }
        logger.info(`Overidding default engine with ${templateJobEngine.engineSpecs} ${templateJobEngine.binariesSpec??""}`);
        
          this.engine = engineLib.getEngine(templateJobEngine.engineSpecs, templateJobEngine.binariesSpec);
          */
    }
    /*

    */
   toJSON():jobSerialInterface{
       
    return this.getSerialIdentity();
   }
    start () :void {

        let self = this;
        mkdirp(`${this.workDir}/input`, function(err) {
            if (err) {                
                var msg = 'failed to create job w/ ID ' + self.id + ' directory, ' + err;
                logger.error(msg);
                self.emit('folderCreationError', msg, err, self);
                return;
            }
            fs.chmod(self.workDir, '777', function(err) {
                if (err) {
                    var msg = 'failed to change perm job ' + self.id + ' directory, ' + err;
                    self.emit('folderSetPermissionError', msg, err, self);
                    return;
                }
                self.emit('workspaceCreated');
                self.setInput(); //ASYNC or SYNC, Hence the call after the callback binding
            });
        });
    }
    // Rewrite This w/ jobInputObject calls
    // DANGER script HASH not possible on string > 250MB
    getSerialIdentity () : jobSerialInterface {
        let serial : jobSerialInterface = {
            workDir : this.workDir,
            id : this.id,
            cmd : this.cmd,
            script : this.scriptFilePath,
            exportVar : this.exportVar,
            modules : this.modules,
            tagTask : this.tagTask,
            scriptHash : '',
            inputHash : this.inputs.hash()
        }
        let content:string = '';
        if(this.script) {
            //logger.debug(`Accessing${<string>this.scriptFilePath}`);
            content = fs.readFileSync(<string>this.scriptFilePath).toString(); // TO CHECK
        } else if(this.cmd) {
            content = this.cmd;
        } else {
            logger.error("serializing no cmd/script job object");
        }
        serial.scriptHash = md5(content);
     
        return serial;
    }
    
    setInput() : void {
        if (!this.inputs) {
            this.jEmit("inputSet");
            return;
        }
        let self = this;
        this.inputs.write(`${this.workDir}/input`)
        .on('OK', ()=> {
            let self = this;
            let fname = this.workDir + '/' + this.id + '.batch';
            batchDumper(this).on('ready', function(string) {
                fs.writeFile(fname, string, function(err) {
                    if (err) {
                        return console.log(err);
                    }
                    jobIdentityFileWriter(self);
                self.jEmit('inputSet');
            });
        });
    });
    }

    // Process argument to create the string which will be dumped to an sbatch file
    launch() : void {
        //logger.debug("launching")
        let fname = this.workDir + '/' + this.id + '.batch';
        /*batchDumper(this).on('ready', function(string) {
            fs.writeFile(fname, string, function(err) {
                if (err) {
                    return console.log(err);
                }
                jobIdentityFileWriter(self);
*/
                this.submit(fname);
  //          });
   //     });
    }

    submit(fname:string):void {        
        let submitArgArray = [fname];
        //logger.info(util.format(this))
        logger.debug(`job submitting w/, ${this.engine.submitBin} ${submitArgArray}`);
        ///logger.debug(`workdir : > ${this.workDir} <`);
        logger.info(`execUser : ${this.engine.execUser}`); 
        const cmd = this.engine.execUser ? 'sudo' : this.engine.submitBin
        const args = this.engine.execUser ? ['-u', this.engine.execUser, this.engine.submitBin, fname] : [fname]
        logger.info(`execute : > ${cmd} ${args}`)
        let child = childProc.spawn(cmd, args
        , {
            cwd: this.workDir,           
            detached: false, //false, 
            //shell : true,
            //uid: 1322, 
            stdio: [ 'ignore', 'pipe', 'pipe' ] // ignore stdin, stdout / stderr set to pipe 
        });
        // and unref() somehow disentangles the child's event loop from the parent's: 
        //child.unref(); 
        child.on("exit", ()=>{ logger.debug('Child process exited'); });
        child.on("error", (err)=>{ logger.debug('Child process error state'); logger.error(err) });
        child.on("close", ()=>{ logger.debug('Child process close'); });
        child.on("end", ()=>{ logger.debug('Child process ended'); });
        child.stdout.pipe(process.stdout);
        child.stderr.pipe(process.stderr);

        /*
        let stdoutData = '';
        child.stdout.on('data', function(data:any) {
            stdoutData += data;            
        });
        child.stdout.on('end', function() {
            logger.debug(`submission stdout::${stdoutData}`);
        });

        let stderrData = '';
        child.stderr.on('data', function(data:any) {
            stderrData += data;            
        });
        child.stderr.on('end', function() {
            logger.debug(`submission stderr::${stderrData}`);
        });
        */
        



      
        
        if(this.emulated) {
            let fNameStdout:string = this.fileOut ? this.fileOut : this.id + ".out"; 
            let streamOut = fs.createWriteStream(this.workDir + '/' + fNameStdout);
            let fNameStderr:string = this.fileErr ? this.fileErr : this.id + ".err"; 
            let streamErr = fs.createWriteStream(this.workDir + '/' + fNameStderr);

            child.stdout.pipe(streamOut);
            child.stderr.pipe(streamErr);
        }
        this.jEmit("submitted", this)
    }

    resubmit():void  {
        let fname = this.workDir + '/' + this.id + '.batch';

        this.submit(fname);
    }

    async stdout():Promise<streamLib.Readable>{
        logger.debug(`async stdout call at ${this.id} `);
        let fNameStdout:string = this.fileOut ? this.fileOut : this.id + ".out";
        let fPath:string = this.workDir + '/' + fNameStdout;
        let stdoutStream:streamLib.Readable = await dumpAndWrap(fPath, this._stdout);

        return stdoutStream;
    }

    async stderr():Promise<streamLib.Readable>{
        logger.debug(`async stderr call at ${this.id} `)
        let fNameStderr:string = this.fileErr ? this.fileErr : this.id + ".err";
        let fPath:string = this.workDir + '/' + fNameStderr;
        let stderrStream:streamLib.Readable = await dumpAndWrap(fPath, this._stderr);

        return stderrStream;
    }


    respawn(fStdoutName: string, fStderrName: string, workPath: string): void {
        this.fileOut = fStdoutName;
        this.fileErr = fStderrName;
        this.workDir = workPath;
    }
}



function jobIdentityFileWriter(job : jobObject) :void {
    let serial = job.getSerialIdentity();
    let json = JSON.stringify(serial);
    fs.writeFileSync(job.workDir + '/jobID.json', json, 'utf8');
}

function batchDumper(job: jobObject) {
    let emitter : events.EventEmitter = new events.EventEmitter();
    let batchContentString  : string = "#!/bin/bash\n";
    let adress : string = job.emulated ? 'localhost' : job.adress;
    var trailer = 'echo "JOB_STATUS ' + job.id + ' FINISHED"  | nc -w 2 ' + adress + ' ' + job.port + " > /dev/null\n";

    let engineHeader = job.engine.generateHeader(job.id, job.jobProfile, job.workDir);
    batchContentString += engineHeader; /// ENGINE SPECIFIC PREPROCESSOR LINES

    batchContentString += 'echo "JOB_STATUS ' + job.id + ' START"  | nc -w 2 ' + adress + ' ' + job.port + " > /dev/null\n"

    if (job.exportVar) {
        for (var key in job.exportVar) {
            //string += 'export ' + key + '=' + job.exportVar[key] + '\n';
            batchContentString += key + '="' + job.exportVar[key] + '"\n';
        }
    }

    if (job.inputs) {
        for (var key in job.inputs.paths) {
            batchContentString += key + '="' + job.inputs.paths[key] + '"\n';
        }
    }

    if (job.modules) {
        job.modules.forEach(function(e) {
            batchContentString += "module load " + e + '\n';
        });
    }

    if (job.script) {
        job.scriptFilePath = job.workDir + '/' + job.id + '_coreScript.sh';
        batchContentString += '. ' + job.scriptFilePath + '\n' + trailer;
        _copyScript(job, job.scriptFilePath, /*string,*/ emitter);
        /* This should not be needed, as _copyScript emits the ready event in async block
             setTimeout(function(){
             emitter.emit('ready', string);
         }, 5);
         */
    } else if (job.cmd) {
        batchContentString += job.cmd ? job.cmd : job.engine.testCommand;
        batchContentString += "\n" + trailer;
        setTimeout(function() {
            emitter.emit('ready', batchContentString);
        }, 5);
    } else {
        throw ("You ask for a job but provided not command and script file");
    }

    emitter.on('scriptReady', function() {
        emitter.emit('ready', batchContentString);
    })
    return emitter;
}

function _copyScript(job : jobObject, fname : string, emitter : events.EventEmitter) {
    //if (!job.script)
    //    return;
    let src : streamLib.Readable;
    if(isStream(job.script)) {
        src = <streamLib.Readable>job.script;        
    } else {
        src = fs.createReadStream(<string>job.script);
    }
    src.on("error", function(err) {
        job.jEmit('scriptReadError', err, job);
    });
    var wr = fs.createWriteStream(fname);
    wr.on("error", function(err) {
        job.jEmit('scriptWriteError', err, job);
    });
    wr.on("close", function() {
        fs.chmod(fname, '777', function(err) {
            if (err) {
                job.jEmit('scriptSetPermissionError', err, job);
            } else {
                emitter.emit('scriptReady' /*, string*/ );
            }
        });
    });
    src.pipe(wr);
}

/*
    Path{String} => ReadableStream
    Given a path we try to open file
    if ok return stream
    if not 
        we try to pump from _stdio
    return empty stream
*/
function dumpAndWrap(fName:string/*, localDir:string*/, sourceToDump?:streamLib.Readable):Promise<streamLib.Readable>{

    let p = new Promise<streamLib.Readable>(function(resolve) {

        fs.stat(fName,(err, stat)=>{
            if(!err) {
                if(stat.isFile()) {     
                    logger.debug(`Found a file to wrap at ${fName}`);
                    let stream:streamLib.Readable = fs.createReadStream(fName, {
                        'encoding': 'utf8'
                    });
                    resolve(stream);
                    return;
                }
                logger.error(`Should not be here:\n ${util.format(stat)}`);
            } else {
                logger.warn(`cant find file ${fName}`);
                if(sourceToDump){

                    logger.debug(`Found alternative source dumping it from \n ${util.format(sourceToDump)}`);
                    let target = fs.createWriteStream(fName, {'flags': 'a'});
                    sourceToDump.pipe(target);
                    target.on('close', () =>{
                    let stream:streamLib.Readable = fs.createReadStream(fName, {
                        'encoding': 'utf8'
                        });
                        logger.debug(`should resolve with ${util.format(stream)}`);
                        resolve(stream);
                        return;
                    });
                } else {
                    logger.error("Output file error, Still cant open output file, returning empy stream");
                    let dummyStream:streamLib.Readable = new streamLib.Readable();
                    dummyStream.push(null);
                    resolve(dummyStream);
                    return;
                }
            }

        });
    });
    return p;
} 
