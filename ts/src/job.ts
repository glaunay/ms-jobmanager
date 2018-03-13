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

import { spawn } from 'child_process';

//var Readable = require('stream').Readable;
//var spawn = require('child_process').spawn;


import engineLib = require('./lib/engine/index.js');
import cType = require('./commonTypes.js');

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

//export class jobOpt {
// Mandatory provided to the constructor
export interface jobOptInterface {
    engine : engineLib.engineInterface, // it is added by the jm.push method
   // queueBin : string,
    //submitBin : string,
    script? : string,

    jobProfile?: string;

    port : number, // JobManager MicroService Coordinates
    adress : string, // ""
    workDir : string,

// Opt, set by object setter
    cmd? : string,
    exportVar? : cType.stringMap,
    inputs? : string [],

    tagTask? : string,
    emulated? : boolean,
    namespace? :string,
    cwd? : string,
    cwdClone? : boolean,
    ttl? : number,
    modules? : string []
}

interface jobSerialInterface {
    cmd? :string,
    script? :string,
    exportVar? :cType.stringMap,
    modules? :string [],
    tagTask? :string,
    scriptHash :string,
    inputHash :string[]
}
//    constructor(queueBin:string, submitBin:string, engineHeader:engineHeaderFunc, script:string,
/*    port:number, adress:number, workDir:string) {
       this.submitBin = submitBin;
       this.queueBin = queueBin;
       this.engineHeader = engineHeader;
       this.script = script;
       this.workDir = workDir
    }
}*/

/*abstract class _jobObject extends events.EventEmitter {

}*/


export function inputsMapper(inputLitt:any) : events.EventEmitter {
    let newLitt : cType.stringMap = {};
    let emitter = new events.EventEmitter();
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
            } // PARSER PROBLEM ';' below ? chech in JS
        } else { // Input value is already a stream
            if (!isStream(inputValue)) {
                logger.error('unrecognized value while expecting stream')
            }
            type = 'stream';
            //stream = new streamLib.Readable();
            stream = <streamLib.Readable>inputValue;
        }
        stream.on('data',function(d){
            newLitt[symbol] += d.toString();
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
        newLitt[symbol] = '';
        let inputValue = inputLitt[symbol];
        spit(inputValue, symbol);
    }
    return emitter;
}



export class jobObject extends events.EventEmitter implements jobOptInterface  {
    id : string;
    inputSymbols : any = {};
    ERR_jokers :number = 3; //  Number of time a job is allowed to be resubmitted if its stderr is non null
    MIA_jokers :number = 3; //  Number of time
    inputDir : string;
    engine : engineLib.engineInterface;
    jobProfile? : string;
    //queueBin : string;
    //submitBin : string;
    script? :string;
    cmd? :string;
    exportVar? : cType.stringMap = {};
    inputs? :string [];
    port :number; // JobManager MicroService Coordinates
    adress :string; // ""
    workDir :string;

// Opt, set by object setter
    tagTask? :string;
    emulated? :boolean = false;
    namespace? :string;
    cwd? :string;
    cwdClone? :boolean = false;
    ttl? :number;
    modules? :string [] = [];

    fileOut? :string;
    fileErr? : string;
    _stdout? :streamLib.Readable;
    _stderr? :streamLib.Readable;


    constructor( jobOpt :jobOptInterface, uuid? :string ){
        super();

        this.id = uuid ? uuid : uuidv4();

        this.engine =  jobOpt.engine;
      //  this.queueBin =  jobOpt.queueBin;

        this.port = jobOpt.port;
        this.adress = jobOpt.adress;
        this.workDir = jobOpt.workDir;
        this.inputDir  = this.workDir + "/input";

        if('script' in jobOpt)
            this.script =  jobOpt.script;
        // Opt
        if ('tagTask' in jobOpt)
            this.tagTask = jobOpt.tagTask;
        if ('emulated' in jobOpt)
            this.emulated = jobOpt.emulated;
        if ('namespace' in jobOpt)
            this.namespace = jobOpt.namespace;
        if ('cwd' in jobOpt)
            this.cwd = jobOpt.cwd;
        if ('cwdClone' in jobOpt)
            this.cwdClone = jobOpt.cwdClone;
        if ('ttl' in jobOpt)
            this.ttl = jobOpt.ttl;
        if ('modules' in jobOpt)
            this.modules = jobOpt.modules;
        if ('jobProfile' in jobOpt)
            // if (jobOpt.jobProfile)
            this.jobProfile =  jobOpt.jobProfile;

    }
    /*

    */
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

    getSerialIdentity () : jobSerialInterface {
        let serial : jobSerialInterface = {
            cmd : this.cmd,
            script : this.script,
            exportVar : this.exportVar,
            modules : this.modules,
            tagTask : this.tagTask,
            scriptHash : '',
            inputHash : []
        }
        let content:string = '';
        if(this.script) {
            content = fs.readFileSync(this.script).toString(); // TO CHECK
        } else if(this.cmd) {
            content = this.cmd;
        } else {
            logger.error("serializing no cmd/script job object");
        }
        serial.scriptHash = md5(content);
        //serial.inputHash = dir.files(this.workDir + '/input', {sync:true}).forEach((e)=>{
        let self = this;
        if (this.inputDir){

            walkSync(this.inputDir).forEach((file:string) => {
                    let content = fs.readFileSync(file).toString();
                    serial.inputHash.push(md5(content));
                });
        }
         return serial;
    }

    setInput() : void {
        // Following two conditions are not async
        if (!this.inputs) {
            this.emit("inputSet");
            return;
        }

        let totalSet = Object.keys(this.inputs).length;
        if (totalSet == 0) {
            this.emit("inputSet");
            return;
        }
        // console.log("Setting up");
        // console.dir(this.inputs);
        // console.log("-----------------------------------------------------------------");
        let stream = null;
        let self = this;
        inputsMapper(this.inputs).on('mapped', function(inputsAsStringLitt) {
        // console.log('inputsAsStringLitt :')
        // console.log(inputsAsStringLitt);
            let nTotal = Object.keys(inputsAsStringLitt).length;
                for (let symbol in inputsAsStringLitt) {
                    let fileContent = inputsAsStringLitt[symbol];
                    let dumpFile = self.inputDir + '/' + symbol + '.inp';
                try {
                    fs.writeFileSync(dumpFile, fileContent);
                } catch (err) {
                    console.error(err);
                }
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
        var fname = job.workDir + '/' + job.id + '_coreScript.sh';
        batchContentString += '. ' + fname + '\n' + trailer;
        _copyScript(job, fname, /*string,*/ emitter);
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
    let src : streamLib.Readable = fs.createReadStream(<string>job.script);
    src.on("error", function(err) {
        job.emit('scriptReadError', err, job);
    });
    var wr = fs.createWriteStream(fname);
    wr.on("error", function(err) {
        job.emit('scriptWriteError', err, job);
    });
    wr.on("close", function() {
        fs.chmod(fname, '777', function(err) {
            if (err) {
                job.emit('scriptSetPermissionError', err, job);
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

