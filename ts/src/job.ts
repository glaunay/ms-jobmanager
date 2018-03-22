import events = require('events');
import uuidv4 = require('uuid/v4');
import fs = require('fs');
import mkdirp = require('mkdirp');
import util = require('util');
import isStream = require('is-stream');
import path = require("path");
import stream = require('stream')
import dir = require('node-dir');
import md5 = require('md5');
import streamLib = require('stream');
//import spawn = require('spawn');
import logger = require('winston');
import async = require('async');

import { spawn } from 'child_process';

//var Readable = require('stream').Readable;
//var spawn = require('child_process').spawn;


import engineLib = require('./lib/engine/index.js');
import cType = require('./commonTypes.js');
import { dummyEngine } from './lib/engine/index.js';


import crypto = require('crypto');


/*
    job serialization includes
    workDir relateive to jobMnager file system
    fileName : hash value
*/

export type jobStatus = "CREATED" | "SUBMITTED" | "COMPLETED"| "START"|"FINISHED";
export function isJobStatus(type: string): type is jobStatus {
    return type == "CREATED" || type ==  "SUBMITTED" || type ==  "COMPLETED" || type == "START"|| type == "FINISHED";
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
    socket?:any//SocketIO.socket WE DONT TYPEGUARD IT YET !!
}


/*
    type guard for data container send from the consumer microservice to the JM.
    aka "newJobSocket" event
*/
export function isJobOptProxy(data: any): data is jobOptProxyInterface {
    if (!data.hasOwnProperty('script') && !data.hasOwnProperty('inputs')) return false;

    if (!isStream(data.script)){
        logger.error("jobOptProxy script value is not a readable stream");
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
   // queueBin : string,
    //submitBin : string,
    //script? : string|streamLib.Readable,

    //jobProfile?: string;

    port : number, // JobManager MicroService Coordinates
    adress : string, // ""
    workDir : string,

// Opt, set by object setter
    //cmd? : string,
    //exportVar? : cType.stringMap,
    //inputs? : string [],

    //tagTask? : string,
    emulated? : boolean,
    //namespace? :string,
    cwd? : string,
    cwdClone? : boolean,
    ttl? : number,
    //modules? : string []
}



export interface jobSerialInterface {
    cmd? :string,
    script? :string,
    exportVar? :cType.stringMap,
    modules? :string [],
    tagTask? :string,
    scriptHash :string,
    inputHash? :cType.stringMap
}

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
        logger.debug(`nTotal ${nTotal} supplied job inputs`);

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
                    //s._read = function noop() {}; // redundant? see update below
                    this.streams[key].push(<string>buffer[key]);
                    this.streams[key].push(null);
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
        logger.info("Writing");
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
               

                let path = `${location}/${tuple[0]}.inp`;
                let target = fs.createWriteStream(path);

                //logger.error(`Stream input symbol ${tuple[0]}  = Dumped to => ${path}`);

                tuple[1].pipe(target)
                .on('data',(d:any)=>{console.log(d);})
                .on('finish', () => {                    
                    // the file you want to get the hash    
                    let fd = fs.createReadStream(path);
                    let hash = crypto.createHash('sha1');
                    hash.setEncoding('hex');
                   // fd.on('error',()=>{logger.error('KIN')});
                    fd.on('end', function() {
                        hash.end();
                        let sum = hash.read().toString();
                        self.hashes[tuple[0]] = sum; // the desired sha1sum                        
                        resolve([tuple[0], path, sum]);//.
                    });
// read all file and pipe it (write it) to the hash object
                    fd.pipe(hash);
                });
            });
        });
        logger.info('Launching promises');
        Promise.all(promises).then(values => {           
            self.hashable = true;
            //logger.error(`${values}`);
            self.emit('OK', values)
          }, reason => {
            console.log(reason)
          });

        return this;
    }

    
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
        if ('socket' in jobOpt) {
            logger.error('YYYYYYYY');
            this.socket = jobOpt.socket;
        }
        this.inputs = new jobInputs(jobOpt.inputs);
    }
    // 2ways Forwarding event to consumer or publicMS 
    // WARNING wont work with streams
    jEmit(eName:string|symbol, ...args: any[]):boolean {
        logger.warn(`jEmit(this) ${eName}`);
        // We call the original emitter anyhow
        logger.debug(`${eName} --> ${util.format(args)}`);
        //this.emit.apply(this, eName, args);
        //this.emit.apply(this, [eName, ...args])
        this.emit(eName, ...args);
        //return true;
        // if a socket is registred we serialize objects if needed, then
        // pass it to socket
        //If it exists, JSON.stringify calls the object's toJSON method and then serializes the object that function returns. If toJSON does not exist, stringify simply serializes the object. –
        if (this.socket) {
            logger.warn(`jEmitToScket ${eName}`);
            let _args = args.map((e)=>{
                return JSON.stringify(e); // Primitive OR 
            });
            
        
        //this.socket.emit(eName,)
            logger.warn(`socket emiting event ${eName}`)
            this.socket.emit(eName, ..._args);
        }
        return true;
    }
}

export class jobObject extends jobProxy implements jobOptInterface  {
   
    inputSymbols : any = {};
    ERR_jokers :number = 3; //  Number of time a job is allowed to be resubmitted if its stderr is non null
    MIA_jokers :number = 3; //  Number of time
    inputDir : string;
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

        

        this.engine =  jobOpt.engine;
      //  this.queueBin =  jobOpt.queueBin;

        this.port = jobOpt.port;
        this.adress = jobOpt.adress;
        this.workDir = jobOpt.workDir;
        this.inputDir  = this.workDir + "/input";

      
        if ('emulated' in jobOpt)
            this.emulated = jobOpt.emulated;
     
        if ('cwd' in jobOpt)
            this.cwd = jobOpt.cwd;
        if ('cwdClone' in jobOpt)
            this.cwdClone = jobOpt.cwdClone;
        if ('ttl' in jobOpt)
            this.ttl = jobOpt.ttl;
     

    }
    /*

    */
   toJSON():jobSerialInterface{
       
    return this.getSerialIdentity ();
   }
    start () :void {

        let self = this;
        mkdirp(this.inputDir, function(err) {
            if (err) {
                var msg = 'failed to create job ' + self.id + ' directory, ' + err;
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

                self.on('inputSet', function() { // Binding callback for setInput termination
                    self.setUp();
                });
                self.setInput(); //ASYNC or SYNC, Hence the call after the callback binding
            });
        });
    }
    // Rewrite This w/ jobInputObject calls
    // DANGER script HASH not possible on string > 250MB
    getSerialIdentity () : jobSerialInterface {
        let serial : jobSerialInterface = {
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
            content = fs.readFileSync(<string>this.scriptFilePath).toString(); // TO CHECK
        } else if(this.cmd) {
            content = this.cmd;
        } else {
            logger.error("serializing no cmd/script job object");
        }
        serial.scriptHash = md5(content);
        //serial.inputHash = dir.files(this.workDir + '/input', {sync:true}).forEach((e)=>{
        //let self = this;



        /*
        if (this.inputDir){

            walkSync(this.inputDir).forEach((file:string) => {
                    let content = fs.readFileSync(file).toString();
                    if (content) {
                        let k = path.basename(file);
                        if (serial.inputHash)
                            serial.inputHash[k] = md5(content);
                    }
                });
        }*/


         return serial;
    }
    
    setInput() : void {
        if (!this.inputs) {
            this.jEmit("inputSet");
            return;
        }
        let self = this;
        this.inputs.write(this.inputDir)
        .on('OK', ()=> {logger.warn("Coucou");
        self.jEmit('inputSet');
        });
        
    }

    _setInput() : void {
        // Following two conditions are not async
        if (!this.inputs) {
            this.jEmit("inputSet");
            return;
        }

        let totalSet = Object.keys(this.inputs).length;
        if (totalSet == 0) {
            this.jEmit("inputSet");
            return;
        }
        // console.log("Setting up");
        // console.dir(this.inputs);
        // console.log("-----------------------------------------------------------------");
        let stream = null;
        let self = this;
        logger.error('############################');
        inputsMapper(this.inputs, this.fromConsumerMS).on('mapped', function(inputsAsStringLitt) {


            // We NEED TO ASYNC PARRALLEL THIS FILES DUMP

            let nTotal = Object.keys(inputsAsStringLitt).length;
                for (let symbol in inputsAsStringLitt) {
                    let srcContent = inputsAsStringLitt[symbol];
                    let dumpFile = self.inputDir + '/' + symbol + '.inp';
               // try {
                    let target = fs.createWriteStream(dumpFile);
                    logger.error("inputsMapper");
                    logger.error(`${util.format(srcContent)}`);

                    srcContent.pipe(target);
                    /*if(self.fromConsumerMS) {
                    }
                    srcContent.pipe    
                    fs.writeFileSync(dumpFile, srcContent);*/
                //} catch (err) {
                //    console.error(err);
               // }
                self.inputSymbols[symbol] = dumpFile;
            }
        // console.log("ISS");
            self.emit("inputSet");
        });
        return;
    }
    // Process argument to create the string which will be dumped to an sbatch file
    setUp() : void {
        let self = this;
        let customCmd = false;
        batchDumper(this).on('ready', function(string) {
            let fname = self.workDir + '/' + self.id + '.batch';
        //if (self.emulated) fname = self.workDir + '/' + self.id + '.sh';
            fs.writeFile(fname, string, function(err) {
                if (err) {
                    return console.log(err);
                }
                jobIdentityFileWriter(self);

                self.submit(fname);
            /*if (self.emulated)
                self.fork(fname);
            else
                self.submit(fname);*/
            });
        });
    }
    // We try to submint always by spawn
    submit(fname:string):void {
        let self = this;
       let submitArgArray = [fname];

        logger.debug(`submitting w/, ${this.engine.submitBin} ${submitArgArray}`);
        logger.debug(`workdir : > ${this.workDir} <`);

        let process = spawn(this.engine.submitBin, submitArgArray, {
            'cwd': this.workDir
        })
        .on('exit', function() {
           // self.emit('submitted', self);
        }).on('error', (err) => {
          logger.error('Failed to start subprocess.');
        }).on('close', (code) => {
            logger.debug(`exited with code ${code}`);
        });


        if (this.emulated) {
            this._stdout = process.stdout;
            this._stderr = process.stderr;
        }


       // logger.error(`${util.format(process)}`);
    }

    resubmit():void  {
        let fname = this.workDir + '/' + this.id + '.batch';
    /*if (this.emulated)
        this.fork(fname);
    else*/
        this.submit(fname);
    }

    /* we delegate to jobmanager the async.parrallel  treatment of _stdout, _stderr*/

    stdout():streamLib.Readable|null{
        let fNameStdout:string = this.fileOut ? this.fileOut : this.id + ".out";
        let fPath:string = this.workDir + '/' + fNameStdout;
        if (this._stdout){
             return this._stdout;
            /*
            logger.info("Found _stdout");
            let ws = fs.createWriteStream(fPath);
            this._stdout.pipe(ws);
            this._stdout = undefined;*/
        }
        //if (this.emulated) return this.stdio;


        if (!fs.existsSync(fPath)) {
            logger.debug(`cant find file ${fPath}, forcing synchronicity...`);
        }
        fs.readdirSync(this.workDir).forEach(function(fn) {
                logger.debug(`ddirSync : ${fn}`);
        });

        if ( !fs.existsSync(fPath) ) {
            logger.error("Output file error, Still cant open output file, returning empy stream");
            let dummyStream:streamLib.Readable = new streamLib.Readable();
            dummyStream.push(null);
            return dummyStream;
        }

    let stream:streamLib.Readable = fs.createReadStream(fPath, {
            'encoding': 'utf8'
        })
        .on('error', function(m) {
            let d = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
            logger.error(`[${d}] An error occured while creating read stream:  fPath\n
m`);
        });
    //stream.on("open", function(){ console.log("stdout stream opened");});
    //stream.on("end", function(){console.log('this is stdout END');});
    return stream;
    }

    stderr():streamLib.Readable|null{
        let fNameStderr = this.fileErr ? this.fileErr : this.id + ".err";

        if (this._stderr){
            return this._stderr;
    /*      let ws = fs.createWriteStream(fNameStderr);
            this._stderr.pipe(ws);
            this._stderr = undefined;*/
        }


        let statErr:fs.Stats|undefined;
        let bErr:boolean = true;
        try { 
            statErr = fs.statSync(this.workDir + '/' + fNameStderr);
        } catch (err) {
            bErr = false;
        }
        if (!bErr) return null;
        statErr = <fs.Stats>statErr;
        if (statErr.size === 0) {
            return null;
        }

        let stream:streamLib.Readable = fs.createReadStream(this.workDir + '/' + fNameStderr);
        return stream;
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

    if (job.inputSymbols) {
        for (var key in job.inputSymbols) {
            batchContentString += key + '="' + job.inputSymbols[key] + '"\n';
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
    if(isStream(job.script))
        src = <streamLib.Readable>job.script;
    else
        src = fs.createReadStream(<string>job.script);
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


function walkSync(dir:string, fileList:string[] = []) : string[]{
    //let fileList = [];
    fs.readdirSync(dir).forEach((file) => {
    fileList = fs.statSync(path.join(dir, file)).isDirectory()
        ? walkSync(path.join(dir, file), fileList)
        : fileList.concat(path.join(dir, file));
    });
    return fileList;
}







/*
    We change this function so that newLitt is 
    a map of streams
    instead of th previous map of strings
    piping file content in hash
    https://stackoverflow.com/questions/18658612/obtaining-the-hash-of-a-file-using-the-stream-capabilities-of-crypto-module-ie
    */

   export function inputsMapper(inputLitt:any, skip?:boolean) : events.EventEmitter {
    let newLitt : cType.streamMap = {};
    let emitter = new events.EventEmitter();
    if (skip) {
        setTimeout(()=>{emitter.emit('mapped', inputLitt)}, 5);
        logger.debug("skipping input Mapper")
        return emitter;
    }

    let nTotal = Object.keys(inputLitt).length;
  //  if (debugMode) {
        logger.debug(`nTotal ${nTotal} inputLitt`);
        //console.log("nTotal = " + nTotal + ", inputLitt : ");
        logger.debug(`${inputLitt}`);
        //console.dir(inputLitt);
   // }

    function spit(inputValue : string|streamLib.Readable, symbol : string) {
        //if (debugMode)
        logger.debug(`Current Symbol ${symbol}`);
        let type : string|null = null;
        let stream : streamLib.Readable;// = new streamLib.Readable();
        let t:boolean = true;
        if (util.isString(inputValue)) { // Input is a string
            if (fs.existsSync(inputValue)) { // Input is a path to file, create a stream from its content
                stream = fs.createReadStream(inputValue); // if var using stream == null
            } else { // A simple string to wrap in a stream
                stream = new streamLib.Readable();
                stream.push(inputValue);
                stream.push(null);
            }
        } else { // Input value is already a stream
            if (!isStream(inputValue)) {
                logger.error('unrecognized value while expecting stream')
            }
            type = 'stream';
            //stream = new streamLib.Readable();
            stream = <streamLib.Readable>inputValue;
        }
        stream.on('data',function(d){
            //newLitt[symbol] += d.toString();
        })
        .on('end', function(){
            nTotal--;
            if (type === 'stream') {
                // create a new stream to recycle inputValue, so it can be readded as much as necessary
                let recycleStream = new streamLib.Readable();
                recycleStream.push(newLitt[symbol]);
                recycleStream.push(null);
                inputLitt[symbol] = recycleStream;
            }
            if (nTotal == 0) emitter.emit('mapped', newLitt);
        });

    };

    for (let symbol in inputLitt) {
        //newLitt[symbol] = '';
        let inputValue = inputLitt[symbol];
        spit(inputValue, symbol);
    }
    return emitter;
}