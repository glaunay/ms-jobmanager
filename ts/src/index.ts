import fs = require('fs'); // file system
import events = require('events');
import net = require('net');
import path = require('path');
import util = require('util');
import uuidv4 = require('uuid/v4');

//import date = require('date-and-time');

import logger = require('winston');

import jobLib = require('./job');


let engine :any = null; // to type with Engine contract function signature

let TCPport :number = 2222;
let TCPip : string = '127.0.0.1';
let scheduler_id :string = uuidv4();
let dataLength :number = 0;

// Intervall for periodic operations
let corePulse :number|null = null;
let core :NodeJS.Timer;
// Intervall for periodic monitoring
let wardenPulse :number = 5000;
let warden : NodeJS.Timer;
var cacheDir :string|null = null;

let jobsArray : {[s:string] : jobWrapper } = {};


let eventEmitter : events.EventEmitter = new events.EventEmitter();

let exhaustBool :boolean = false; // set to true at any push, set to false at exhausted event raise

let emulator :boolean = false; // Trying to keep api/events intact while running job as fork on local

let isStarted :boolean = false;


// Foolowing module variable seem deprecated
//var jobProfile = {};
//var probPreviousCacheDir = []; // list of the probable cacheDir used in previous nslurm instances


//TO DO implement push and compile
// Try to do a push and check jobID.json


/*
export function init() {
    console.log('titi');
    let now = new Date();
    console.log(date.format(now, 'YYYY/MM/DD HH:mm:ss'));
}


let value = 0;
export function stash(x:number, uuid?:string): number {
    console.log(value + "-prev-");
    value += x;
    console.log(value + "-prev-");
    return value;
}
*/

interface BinariesSpec {
   cancelBin : string;
   queueBin : string;
   submitBin : string;
}
interface jobWrapper {
    'obj': jobLib.jobObject,
    'status': jobStatus,
    'nCycle': number
};

export type engineSpecs = "slurm" | "sge" | "emulate";
function isEngineSpec(type: string): type is engineSpecs {
    let a = type == "slurm" || type ==  "sge" ||type ==  "emulate";
    logger.info(`${a}`);
    return type == "slurm" || type ==  "sge" ||type ==  "emulate";
}

type jobStatus = "CREATED" | "SUBMITTED" | "COMPLETED";
function isJobStatus(type: string): type is jobStatus {
    return type == "CREATED" || type ==  "SUBMITTED" ||type ==  "COMPLETED";
}

let schedulerID = uuidv4();
export let _start = function(TCPport:number=2222, engineType:engineSpecs, binaries:BinariesSpec) {
    //console.log("Job Manager [" + schedulerID + "]")
    let d = new Date().toLocaleString();
    logger.info(`${d} Job Manager ${schedulerID}`);
}


interface jobManagerSpecs {
    cacheDir : string,
    tcp : string,
    port : number,
   // jobProfiles : any, // Need to work on that type
    cycleLength? : string,
    forceCache? : string,
    engineSpec : engineSpecs
}
function isSpecs(opt: any): opt is jobManagerSpecs {
    logger.debug('???');
    logger.debug(`${opt.cacheDir}`);
    let b:any = opt.cacheDir instanceof(String)

    logger.debug(`${b}`);
    b = typeof(opt.cacheDir);
    logger.debug(`${b}`);
    logger.debug(`${opt.port}`);
    logger.debug(`${opt.tcp}`);
     logger.debug(`${opt.engineSpec}`);
    if ('cacheDir' in opt && 'tcp' in opt && 'port' in opt && 'engineSpec' in opt)
        return opt.cacheDir instanceof(String) && opt.tcp instanceof(String) && opt.port instanceof(Number) && isEngineSpec(opt.engineSpec);
        logger.debug('niet');
    return false;
}

function _openSocket(port:number) : events.EventEmitter {
    let eventEmitterSocket = new events.EventEmitter();
    //var data = '';

    let server = net.createServer(function(socket) {
        socket.write('#####nSlurm scheduler socket####\r\n');
        socket.pipe(socket);
        socket.on('data', function(buf) {
                //console.log("incoming data");
                //console.log(buf.toString());
                eventEmitterSocket.emit('data', buf.toString());
            })
            .on('error', function() {
                // callback must be specified to trigger close event
            });

    });
    server.listen(port); //, "127.0.0.1"

    server.on('error', function(e) {
        console.log('error' + e);
        eventEmitter.emit('error', e);
    });
    server.on('listening', function() {
        logger.debug('Listening on ' + port + '...');
        eventEmitterSocket.emit('listening');
    });
    server.on('connection', function(s) {

        //console.log('connection w/ ' + data);
        s.on('close', function() {
            //  console.log('Packet connexion closed');
        });
        //console.dir(s);
        //ntEmitter.emit('success', server);
    });

    return eventEmitterSocket;
}

function _pulse() {
    let c = 0;
    for (let k in jobsArray) c++;
    if (c === 0) {
        if (exhaustBool) {
            eventEmitter.emit("exhausted");
            exhaustBool = false;
        }
    }
}

export function start(opt:jobManagerSpecs) {

    if (isStarted) return;
    logger.warn("GOGO");
    if (!isSpecs(opt)) {
        logger.error("Options required to start manager : \"cacheDir\", \"tcp\", \"port\"");
        logger.error(`${util.format(opt)}`);
        return;
    }

    cacheDir = opt.cacheDir + '/' + scheduler_id;
    if(opt.tcp)
        TCPip = opt.tcp;
    if(opt.port)
        TCPport = opt.port;

    if(opt.cycleLength)
        wardenPulse = parseInt(opt.cycleLength);
    if (opt.forceCache)
        cacheDir = opt.forceCache;

        //jobProfiles = opt.jobProfiles;

    logger.debug("Attempting to create cache for process at " + cacheDir);
    try {
        fs.mkdirSync(cacheDir);
    } catch (e) {
        if (e.code != 'EEXIST') throw e;
        console.log("Cache found already found at " + cacheDir);
    }
    logger.debug('[' + TCPip + '] opening socket at port ' + TCPport);
    let s = _openSocket(TCPport);
    let data = '';
    s.on('listening', function(socket) {
        isStarted = true;
        logger.debug("Starting pulse monitoring");
        logger.debug("cache Directory is " + cacheDir);

        core = setInterval(function() {
            _pulse()
        }, 500);
        warden = setInterval(function() {
            jobWarden();
        }, wardenPulse);

        logger.info("       --->jobManager " + scheduler_id + " ready to process jobs<---\n\n");
        eventEmitter.emit("ready");
        })
        .on('data', _parseMessage);
}

function jobWarden():void {
    engine.list().on('data', function(d:any) {
        for (let key in jobsArray) {
            let curr_job = jobsArray[key];
            if (curr_job.status === "CREATED") {
                continue;
            }

            if (d.nameUUID.indexOf(key) === -1) { // if key is not found in listed jobs
                curr_job.obj.MIA_jokers -= 1;
                logger.warn('The job "' + key + '" missing from queue! Jokers left is ' + curr_job.obj.MIA_jokers);
                    if (curr_job.obj.MIA_jokers === 0) {
                        //var jobTmp = clone(curr_job); // deepcopy of the disappeared job
                        //jobTmp.obj.emitter = curr_job.obj.emitter; // keep same emitter reference
                        let tmpJob = jobsArray[key];
                        delete jobsArray[key];
                        tmpJob.obj.emit('lostJob', 'The job "' + key + '" is not in the queue !', tmpJob.obj);
                    }
                } else {
                    if (curr_job.obj.MIA_jokers < 3)
                        logger.info('Job "' + key + '" found BACK ! Jokers count restored');

                    curr_job.obj.MIA_jokers = 3;
                    curr_job.nCycle += 1;
                    ttlTest(curr_job);
                }
            }
            //emitter.emit('');
        }).on('listError', function(err:any) {
            eventEmitter.emit("wardenError", err)
        });
    //    return emitter;
    }

// WARNING : MG and GL 05.09.2017 : memory leak :
// the delete at the end of the function is ok but another reference to the job can still exists [***]
function ttlTest(curr_job:jobWrapper) {
    if (!curr_job.obj.ttl) return;
    let job:jobLib.jobObject = curr_job.obj;
    let jid = job.id;
    var elaspedTime = wardenPulse * curr_job.nCycle;
    logger.warn("Job is running for ~ " + elaspedTime + "ms [ttl is : " +  job.ttl  + "]");
    if(elaspedTime > curr_job.obj.ttl) {
        logger.error("TTL exceeded for Job " + jid + ", terminating it");
        engine.kill([job]).on('cleanExit', function(){
            if(jid in jobsArray)
                delete jobsArray[jid]; //  [***]
        }); // Emiter is passed here if needed
    }
}

function _getCurrentJobList () {
    let jobObjList:jobLib.jobObject[] = [];
    for (let key in jobsArray) {
        jobObjList.push(jobsArray[key].obj);
    }
    return jobObjList;
}

class dummyEngine {
    constructor() {

    }
    submitBin:string = 'dummyExec';

    generateHeader (/*a : string, b : string, c : string*/) {
        return 'dummy Engine header';
    }
    list() {
        return new events.EventEmitter();
    }
    kill(jobList : jobLib.jobObject[]) {
        return new events.EventEmitter();
    }
    testCommand() {
        return 'sleep 10; echo "this is a dummy command"';
    }

}

export function push(jobProfileString : string, jobOpt : jobLib.jobOptInterface, namespace : string|null) : jobLib.jobObject {
        /*console.log("jobProfile: " + jobProfileString + "\njobOpt:\n");
        console.log(jobOpt);*/
        let jobID =  uuidv4();
       // var self = this;
        /* Define the new job parameters */
        // We now expect an inputs parameter which has to be a list
        let workDir : string;
        if (namespace) {
            try { fs.mkdirSync(cacheDir + '/' + namespace); }
            catch (err) {
                if (err.code != 'EEXIST') {
                    logger.error("Namespace " + cacheDir + '/' + namespace + ' already exists.');
                    throw err;
                }
            }
            workDir = cacheDir + '/' + namespace + '/' + jobID;
        } else {
            workDir = cacheDir + '/' + jobID;
        }
        let jobTemplate : jobLib.jobOptInterface = {
           // "engineHeader": engine.generateHeader(jobID, jobProfileString, workDir),
            engine : new dummyEngine(),
            "workDir": workDir,
            "emulated": emulator ? true : false,
            "adress": TCPip,
            "port": TCPport,
           // "submitBin": engine.submitBin(),
        };

        if('exportVar' in jobOpt)
            jobTemplate.exportVar =  jobOpt.exportVar;
        if('modules' in jobOpt )
            jobTemplate.modules = jobOpt.modules;
        if ('script' in jobOpt)
            jobTemplate.script = jobOpt.script;
        if ('cmd' in jobOpt)
            jobTemplate.cmd = jobOpt.cmd;
        if ('inputs' in jobOpt)
            jobTemplate.inputs = jobOpt.inputs;
        if ('modules' in jobOpt)
            jobTemplate.modules = jobOpt.modules;
         if ('tagTask' in jobOpt)
            jobTemplate.tagTask = jobOpt.tagTask;
        if ('ttl' in jobOpt)
            jobTemplate.ttl = jobOpt.ttl;


        var newJob = new jobLib.jobObject(jobTemplate, jobID);

        newJob.start();

        jobsArray[jobID] = {
            'obj': newJob,
            'status': 'CREATED',
            'nCycle': 0
        };

        /*
        var constraints = extractConstraints(jobTemplate);

        lookup(jobTemplate, constraints)
            .on('known', function(validWorkFolder) {
                console.log("I CAN RESURRECT YOU : " + validWorkFolder + ' -> ' + jobTemplate.tagTask);
                _resurrect(newJob, validWorkFolder);
            })
            .on('unknown', function() {
                console.log("########## No previous equal job found ##########");
                newJob.start();

                jobsArray[jobID] = {
                    'obj': newJob,
                    'status': 'CREATED',
                    'nCycle': 0
                };
                if (debugMode)
                    self.jobsView();

                newJob.emitter.on('submitted', function(j) {
                    console.log(j);
                    jobsArray[j.id].status = 'SUBMITTED';
                    if (debugMode)
                        self.jobsView();
                }).on('jobStart', function(job) {
                    // next lines for tests on squeueReport() :
                    engine.list()
                }).on('scriptReadError', function (err, job) {
                    console.error('ERROR while reading the script : ');
                    console.error(err);
                }).on('scriptWriteError', function (err, job) {
                    console.error('ERROR while writing the coreScript : ');
                    console.error(err);
                }).on('scriptSetPermissionError', function (err, job) {
                    console.error('ERROR while trying to set permissions of the coreScript : ');
                    console.error(err);
                });

            })
    */
        exhaustBool = true;
        //console.log(jobsArray);

        return newJob;
    }


function _parseMessage(msg:string) {
    //console.log("trying to parse " + string);
    let re = /^JOB_STATUS[\s]+([\S]+)[\s]+([\S]+)/
    let matches = msg.match(re);
    if (!matches) return;

    let jid = matches[1];
    let uStatus = matches[2];
    if (!jobsArray.hasOwnProperty(jid)) {
        logger.warn(`unregistred job id ${jid}`);
        eventEmitter.emit('unregistredJob', jid);
        return;
        //throw 'unregistred job id ' + jid;
    }

    logger.debug(`Status Updating job ${jid} : from \'
${jobsArray[jid].status} \' to \'${uStatus}\'`);
    if(isJobStatus(uStatus))
        jobsArray[jid].status = uStatus;
    else
        logger.error(`unrecognized status at ${uStatus}`);
    if (uStatus === 'START')
        jobsArray[jid].obj.emit('jobStart', jobsArray[jid].obj);
    else if (uStatus === "FINISHED")
        //_pull(jid); //TO DO
     logger.error(`TO DO`);
}

