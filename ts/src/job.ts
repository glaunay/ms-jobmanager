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

import logger = require('winston');
//var Readable = require('stream').Readable;
//var spawn = require('child_process').spawn;


/*
    job serialization includes
    workDir relateive to jobMnager file system
    fileName : hash value
*/


interface stringMap { [s: string] : string; }

export interface engineHeaderFunc {
    (/*source:string, subString:string, workDir:string*/) :string;
}
export interface engineList {
    () :events.EventEmitter;
}
export interface engineTest {
    () :string;
}
export interface engineKill {
    (jobList:jobObject[]) :events.EventEmitter;
}
export interface engineInterface {
    generateHeader : engineHeaderFunc;
    submitBin : string;
    list : engineList;
    kill : engineKill;
    testCommand : engineTest;
}




//export class jobOpt {
// Mandatory provided to the constructor
export interface jobOptInterface {
    engine : engineInterface,
   // queueBin : string,
    //submitBin : string,
    script? : string,


    port : number, // JobManager MicroService Coordinates
    adress : string, // ""
    workDir : string,

// Opt, set by object setter
    cmd? : string,
    exportVar? : stringMap,
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
    exportVar? :stringMap,
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
    let newLitt : stringMap = {};
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
        } else ( isStream(inputValue) ); { // Input value is already a stream
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
    engine : engineInterface;
    //queueBin : string;
    //submitBin : string;
    script? :string;
    cmd? :string;
    exportVar? : stringMap = {};
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
    var self = this;
    var customCmd = false;
    batchDumper(this).on('ready', function(string) {
        var fname = self.workDir + '/' + self.id + '.batch';
        //if (self.emulated) fname = self.workDir + '/' + self.id + '.sh';
        fs.writeFile(fname, string, function(err) {
            if (err) {
                return console.log(err);
            }
            jobIdentityFileWriter(self);
            logger.info("END OF THE ROAD");
            /*if (self.emulated)
                self.fork(fname);
            else
                self.submit(fname);*/
        });
    });
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

    let engineHeader = job.engine.generateHeader()
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

