"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const events = require("events");
const uuidv4 = require("uuid/v4");
const fs = require("fs");
const mkdirp = require("mkdirp");
const util = require("util");
const isStream = require("is-stream");
const path = require("path");
const md5 = require("md5");
const streamLib = require("stream");
//import spawn = require('spawn');
const logger = require("winston");
const cType = require("./commonTypes.js");
const job_manager_server_1 = require("./nativeJS/job-manager-server");
const crypto = require("crypto");
const childProc = require("child_process");
/*
    type guard for data container send from the consumer microservice to the JM.
    aka "newJobSocket" event
*/
function isJobOptProxy(data) {
    if (!data.hasOwnProperty('script') && !data.hasOwnProperty('inputs'))
        return false;
    if (!isStream(data.script)) {
        logger.error("jobOptProxy script value is not a readable stream");
        logger.error(`${data.script}`);
        return false;
    }
    for (let k in data.inputs) {
        if (!isStream(data.inputs[k])) {
            logger.error(`jobOptProxy input value \"${k}\" is not a readable stream`);
            return false;
        }
    }
    return true;
}
exports.isJobOptProxy = isJobOptProxy;
/*
    Constuctor performs synchronous operations
    It should be modifed to async
    -> Emit event to confirm safe construction
*/
class jobInputs extends events.EventEmitter {
    /* Constructor can receive a map w/ two types of value
        Should be SYNC-like
    */
    constructor(data /*, skip?:boolean*/) {
        super();
        this.streams = {};
        this.paths = {};
        this.hashes = {};
        this.hashable = false;
        let safeNameInput = true;
        if (!data)
            return;
        let buffer = {};
        // Coherce array in litteral, autogenerate keys
        if (data.constructor === Array) {
            safeNameInput = false;
            let a = data;
            for (let e of a.entries())
                buffer[`file${e[0]}`] = e[1];
        }
        else {
            buffer = data;
        }
        if (!cType.isStreamOrStringMap(buffer))
            throw (`Wrong format for ${util.format(buffer)}`);
        let nTotal = Object.keys(buffer).length;
        logger.debug(`jobInput constructed w/ ${nTotal} items:\n${util.format(buffer)}`);
        let self = this;
        for (let key in data) {
            if (isStream(buffer[key]))
                this.streams[key] = buffer[key];
            else {
                try {
                    //if (!safeNameInput) throw('file naming is unsafe');
                    let datum = buffer[key];
                    fs.lstatSync(datum).isFile();
                    let k = path.basename(datum).replace(/\.[^/.]+$/, "");
                    k = key; // GL Aug2018, HOTFIX from taskobject, maybe will break JM -- MS side let'see
                    this.streams[k] = fs.createReadStream(datum);
                    logger.debug(`${buffer[key]} is a file, stream assigned to ${k}`);
                }
                catch (e) {
                    logger.warn(`Provided input named ${key} is not a file, assuming a string`);
                    // Handle error
                    if (e.code == 'ENOENT') {
                        //no such file or directory
                        //do something
                    }
                    else {
                        //do something else
                    }
                    this.streams[key] = new streamLib.Readable();
                    this.streams[key].push(buffer[key]);
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
    getStreamsMap() {
        if (this.hashable) {
            logger.warn('All streams were consumed');
            return undefined;
        }
        return this.streams;
    }
    hash() {
        if (!this.hashable) {
            logger.warn('Trying to get hash of inputs before write it to files');
            return undefined;
        }
        return this.hashes;
    }
    write(location) {
        /*let iteratee = function(string:symbol,stream:streamLib.Readable){
            let target = fs.createWriteStream(`${location}/${symbol}.inp`);
            stream.pipe(target);//.on('finish', function () { ... });
        }*/
        let self = this;
        let inputs = [];
        Object.keys(this.streams).forEach((k) => {
            let tuple = [k, self.streams[k]];
            inputs.push(tuple);
        });
        let promises = inputs.map(function (tuple) {
            return new Promise(function (resolve, reject) {
                let path = `${location}/${tuple[0]}.inp`;
                let target = fs.createWriteStream(path);
                //logger.error(`Stream input symbol ${tuple[0]}  = Dumped to => ${path}`);
                tuple[1].pipe(target)
                    .on('data', (d) => { console.log(d); })
                    .on('finish', () => {
                    // the file you want to get the hash    
                    let fd = fs.createReadStream(path);
                    let hash = crypto.createHash('sha1');
                    hash.setEncoding('hex');
                    // fd.on('error',()=>{logger.error('KIN')});
                    fd.on('end', function () {
                        hash.end();
                        let sum = hash.read().toString();
                        self.hashes[tuple[0]] = sum; // the desired sha1sum                        
                        self.paths[tuple[0]] = path; // the path to file   
                        resolve([tuple[0], path, sum]); //.
                    });
                    // read all file and pipe it (write it) to the hash object
                    fd.pipe(hash);
                });
            });
        });
        // logger.info('Launching promises');
        Promise.all(promises).then(values => {
            self.hashable = true;
            //logger.error(`${values}`);
            self.emit('OK', values);
        }, reason => {
            console.log(reason);
        });
        return this;
    }
}
exports.jobInputs = jobInputs;
/*
    This object is meant to live in the job-manager-client space !!!!!!
    We write it here to use TS.
    It is basically an empty shell that forwards event and streams
    W/in jmCore it is used as a virtual class for jobObject
    Following event occur on the job-manager-client side
    job.emit('inputError')
    job.emit('scriptError')
*/
class jobProxy extends events.EventEmitter {
    constructor(jobOpt, uuid) {
        super();
        this.exportVar = {};
        this.modules = [];
        this.hasShimmerings = [];
        this.id = uuid ? uuid : uuidv4();
        if ('modules' in jobOpt)
            this.modules = jobOpt.modules;
        if ('jobProfile' in jobOpt)
            this.jobProfile = jobOpt.jobProfile;
        if ('script' in jobOpt)
            this.script = jobOpt.script;
        if ('tagTask' in jobOpt)
            this.tagTask = jobOpt.tagTask;
        if ('namespace' in jobOpt)
            this.namespace = jobOpt.namespace;
        if ('socket' in jobOpt)
            this.socket = jobOpt.socket;
        if ('exportVar' in jobOpt)
            this.exportVar = jobOpt.exportVar;
        this.inputs = new jobInputs(jobOpt.inputs);
    }
    // 2ways Forwarding event to consumer or publicMS 
    // WARNING wont work with streams
    jEmit(eName, ...args) {
        logger.silly(`jEmit(this) ${eName}`);
        this.hasShimmerings.forEach((shimJob) => {
            shimJob.jEmit(eName, ...args);
        });
        // We call the original emitter anyhow
        //logger.debug(`${eName} --> ${util.format(args)}`);
        //this.emit.apply(this, eName, args);
        //this.emit.apply(this, [eName, ...args])
        if (eName !== 'completed') {
            this.emit(eName, ...args);
            // Boiler-plate to emit conform completed event
            // if the consumer is in the same MS as the JM.
        }
        else if (this instanceof jobObject) {
            let stdout, stderr;
            if (this.isShimmeringOf) {
                stderr = this.isShimmeringOf.stderr();
                stdout = this.isShimmeringOf.stdout();
            }
            else {
                stderr = this.stderr();
                stdout = this.stdout();
            }
            Promise.all([stdout, stderr]).then((results) => {
                logger.silly("Emitting completed event");
                this.emit('completed', ...results);
            });
        }
        //return true;
        // if a socket is registred we serialize objects if needed, then
        // pass it to socket
        //If it exists, 
        // arguments are tricky (ie: streams), we socketPull
        // otherwise, we JSON.stringify arguments and emit them on socket
        if (this.socket) {
            // logger.warn(`jEmitToSocket ${eName}`);
            if (eName === 'completed') {
                //logger.debug(`SSP::\n${util.format(args)}`);
                //socketPull(...args);//eventName, jobObject
                let sArgs = [this, undefined, undefined];
                if (this.isShimmeringOf)
                    sArgs = [this, this.isShimmeringOf.stdout(), this.isShimmeringOf.stderr()];
                job_manager_server_1.socketPull(...sArgs);
                return true;
            }
            // Easy to serialize content
            let _args = args.map((e) => {
                return JSON.stringify(e); // Primitive OR 
            });
            logger.silly(`socket emiting event ${eName}`);
            this.socket.emit(eName, ..._args);
        }
        return true;
    }
}
exports.jobProxy = jobProxy;
class jobObject extends jobProxy {
    constructor(jobOpt, uuid) {
        super(jobOpt, uuid);
        this.inputSymbols = {};
        this.ERR_jokers = 3; //  Number of time a job is allowed to be resubmitted if its stderr is non null
        this.MIA_jokers = 3; //  Number of time
        this.fromConsumerMS = false;
        // Opt, set by object setter
        this.emulated = false;
        this.cwdClone = false;
        console.log("CC JOB :: " + this.jobProfile);
        this.engine = jobOpt.engine;
        //  this.queueBin =  jobOpt.queueBin;
        this.port = jobOpt.port;
        this.adress = jobOpt.adress;
        this.workDir = jobOpt.workDir;
        this.inputDir = this.workDir + "/input";
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
    toJSON() {
        return this.getSerialIdentity();
    }
    start() {
        let self = this;
        mkdirp(this.inputDir, function (err) {
            if (err) {
                var msg = 'failed to create job ' + self.id + ' directory, ' + err;
                self.emit('folderCreationError', msg, err, self);
                return;
            }
            fs.chmod(self.workDir, '777', function (err) {
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
    getSerialIdentity() {
        let serial = {
            workDir: this.workDir,
            id: this.id,
            cmd: this.cmd,
            script: this.scriptFilePath,
            exportVar: this.exportVar,
            modules: this.modules,
            tagTask: this.tagTask,
            scriptHash: '',
            inputHash: this.inputs.hash()
        };
        let content = '';
        if (this.script) {
            //logger.debug(`Accessing${<string>this.scriptFilePath}`);
            content = fs.readFileSync(this.scriptFilePath).toString(); // TO CHECK
        }
        else if (this.cmd) {
            content = this.cmd;
        }
        else {
            logger.error("serializing no cmd/script job object");
        }
        serial.scriptHash = md5(content);
        return serial;
    }
    setInput() {
        if (!this.inputs) {
            this.jEmit("inputSet");
            return;
        }
        let self = this;
        this.inputs.write(this.inputDir)
            .on('OK', () => {
            let self = this;
            let fname = this.workDir + '/' + this.id + '.batch';
            batchDumper(this).on('ready', function (string) {
                fs.writeFile(fname, string, function (err) {
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
    launch() {
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
    submit(fname) {
        let self = this;
        let submitArgArray = [fname];
        logger.debug(`submitting w/, ${this.engine.submitBin} ${submitArgArray}`);
        logger.debug(`workdir : > ${this.workDir} <`);
        let child = childProc.spawn(this.engine.submitBin, [fname], {
            cwd: this.workDir,
            detached: true,
            //shell : true,
            stdio: ['ignore', 'pipe', 'pipe'] // ignore stdin, stdout / stderr set to pipe 
        });
        // and unref() somehow disentangles the child's event loop from the parent's: 
        child.unref();
        if (this.emulated) {
            let fNameStdout = this.fileOut ? this.fileOut : this.id + ".out";
            let streamOut = fs.createWriteStream(this.workDir + '/' + fNameStdout);
            let fNameStderr = this.fileErr ? this.fileErr : this.id + ".err";
            let streamErr = fs.createWriteStream(this.workDir + '/' + fNameStderr);
            child.stdout.pipe(streamOut);
            child.stderr.pipe(streamErr);
        }
    }
    resubmit() {
        let fname = this.workDir + '/' + this.id + '.batch';
        this.submit(fname);
    }
    stdout() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug(`async stdout call at ${this.id} `);
            let fNameStdout = this.fileOut ? this.fileOut : this.id + ".out";
            let fPath = this.workDir + '/' + fNameStdout;
            let stdoutStream = yield dumpAndWrap(fPath, this._stdout);
            return stdoutStream;
        });
    }
    stderr() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug(`async stderr call at ${this.id} `);
            let fNameStderr = this.fileErr ? this.fileErr : this.id + ".err";
            let fPath = this.workDir + '/' + fNameStderr;
            let stderrStream = yield dumpAndWrap(fPath, this._stderr);
            return stderrStream;
        });
    }
    respawn(fStdoutName, fStderrName, workPath) {
        this.fileOut = fStdoutName;
        this.fileErr = fStderrName;
        this.workDir = workPath;
    }
}
exports.jobObject = jobObject;
function jobIdentityFileWriter(job) {
    let serial = job.getSerialIdentity();
    let json = JSON.stringify(serial);
    fs.writeFileSync(job.workDir + '/jobID.json', json, 'utf8');
}
function batchDumper(job) {
    let emitter = new events.EventEmitter();
    let batchContentString = "#!/bin/bash\n";
    let adress = job.emulated ? 'localhost' : job.adress;
    var trailer = 'echo "JOB_STATUS ' + job.id + ' FINISHED"  | nc -w 2 ' + adress + ' ' + job.port + " > /dev/null\n";
    let engineHeader = job.engine.generateHeader(job.id, job.jobProfile, job.workDir);
    batchContentString += engineHeader; /// ENGINE SPECIFIC PREPROCESSOR LINES
    batchContentString += 'echo "JOB_STATUS ' + job.id + ' START"  | nc -w 2 ' + adress + ' ' + job.port + " > /dev/null\n";
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
        job.modules.forEach(function (e) {
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
    }
    else if (job.cmd) {
        batchContentString += job.cmd ? job.cmd : job.engine.testCommand;
        batchContentString += "\n" + trailer;
        setTimeout(function () {
            emitter.emit('ready', batchContentString);
        }, 5);
    }
    else {
        throw ("You ask for a job but provided not command and script file");
    }
    emitter.on('scriptReady', function () {
        emitter.emit('ready', batchContentString);
    });
    return emitter;
}
function _copyScript(job, fname, emitter) {
    //if (!job.script)
    //    return;
    let src;
    if (isStream(job.script))
        src = job.script;
    else
        src = fs.createReadStream(job.script);
    src.on("error", function (err) {
        job.jEmit('scriptReadError', err, job);
    });
    var wr = fs.createWriteStream(fname);
    wr.on("error", function (err) {
        job.jEmit('scriptWriteError', err, job);
    });
    wr.on("close", function () {
        fs.chmod(fname, '777', function (err) {
            if (err) {
                job.jEmit('scriptSetPermissionError', err, job);
            }
            else {
                emitter.emit('scriptReady' /*, string*/);
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
function dumpAndWrap(fName /*, localDir:string*/, sourceToDump) {
    let p = new Promise(function (resolve) {
        fs.stat(fName, (err, stat) => {
            if (!err) {
                if (stat.isFile()) {
                    logger.debug(`Found a file to wrap at ${fName}`);
                    let stream = fs.createReadStream(fName, {
                        'encoding': 'utf8'
                    });
                    resolve(stream);
                    return;
                }
                logger.error(`Should not be here:\n ${util.format(stat)}`);
            }
            else {
                logger.debug(`cant find file ${fName}`);
                if (sourceToDump) {
                    logger.debug(`Found alternative source dumping it from \n ${util.format(sourceToDump)}`);
                    let target = fs.createWriteStream(fName, { 'flags': 'a' });
                    sourceToDump.pipe(target).on('close', () => {
                        let stream = fs.createReadStream(fName, {
                            'encoding': 'utf8'
                        });
                        logger.debug(`should resolve with ${util.format(stream)}`);
                        resolve(stream);
                        return;
                    });
                }
                else {
                    logger.error("Output file error, Still cant open output file, returning empy stream");
                    let dummyStream = new streamLib.Readable();
                    dummyStream.push(null);
                    resolve(dummyStream);
                    return;
                }
            }
        });
    });
    return p;
}
