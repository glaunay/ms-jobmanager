import fs = require('fs'); // file system
import events = require('events');
import net = require('net');
import path = require('path');
import util = require('util');
import uuidv4 = require('uuid/v4');
import streamLib = require('stream');
//import date = require('date-and-time');
import async = require('async');
import logger = require('winston');

import jobLib = require('./job');

import engineLib = require('./lib/engine/index.js');
export {engineSpecs} from './lib/engine/index.js';
import cType = require('./commonTypes.js');

import jmServer = require('./nativeJS/job-manager-server.js');

//let search:warehouse.warehousSearchInterface;

let engine :engineLib.engineInterface; // to type with Engine contract function signature


let microEngine:engineLib.engineInterface = new engineLib.dummyEngine(); // dummy engine used by jobProxy instance

// Address of the jobManager MicroService
let TCPip : string = '127.0.0.1';
// Port for communication w/ node workers
let TCPport :number = 2222;
// Port for consumer microServices
let proxyPort: number = 8080;

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

let microServiceSocket:events.EventEmitter|undefined = undefined;

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
    'status': jobLib.jobStatus,
    'nCycle': number
};


let schedulerID = uuidv4();

interface jobManagerSpecs {
    cacheDir : string,
    tcp : string,
    port : number,
   // jobProfiles : any, // Need to work on that type
    cycleLength? : string,
    forceCache? : string,
    engineSpec : engineLib.engineSpecs,
    microServicePort?:number;
    //asMicroService?:boolean;
}

function isSpecs(opt: any): opt is jobManagerSpecs {
    //logger.debug('???');
    //logger.debug(`${opt.cacheDir}`);
    //let b:any = opt.cacheDir instanceof(String)

    if(!path.isAbsolute(opt.cacheDir)) {
        logger.error('cacheDir parameter must be an absolute path');
        return false;
    }
    if ('cacheDir' in opt && 'tcp' in opt && 'port' in opt && 'engineSpec' in opt)
        return typeof(opt.cacheDir) == 'string' && typeof(opt.tcp) == 'string' &&
               typeof(opt.port) == 'number' && engineLib.isEngineSpec(opt.engineSpec);
        //logger.debug('niet');
    return false;
}

function _openSocket(port:number) : events.EventEmitter {
    let eventEmitterSocket = new events.EventEmitter();
    //var data = '';

    let server = net.createServer(function(socket) {
        socket.write('#####jobManager scheduler socket####\r\n');
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

export function start(opt:jobManagerSpecs):events.EventEmitter {
    logger.debug(`${util.format(opt)}`);

    if (isStarted) {
        let t:number = setTimeout(()=>{ eventEmitter.emit("ready"); });
        return eventEmitter;
    }

    if (!isSpecs(opt)) {
        let msg:string = `Options required to start manager : \"cacheDir\", \"tcp\", \"port\"\n
${util.format(opt)}`;
        let t:number = setTimeout(()=>{ eventEmitter.emit("startupError", msg); });
        return eventEmitter;
    }

    engine = engineLib.getEngine(opt.engineSpec);
    emulator = opt.engineSpec == 'emulate' ? true : false;

    cacheDir = opt.cacheDir + '/' + scheduler_id;
    if(opt.tcp)
        TCPip = opt.tcp;
    if(opt.port)
        TCPport = opt.port;
    // if a port is provided for microservice we open connection
    if(opt.microServicePort) {
        microServiceSocket =  jmServer.listen(opt.microServicePort);
        logger.debug(`Listening for consumer microservices at : ${opt.microServicePort}`);
        microServiceSocket.on('newJobSocket', pushMS);
        
        microServiceSocket.on('connection',()=>{
            logger.debug('Connection on microservice consumer socket');
        });
    }
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
        logger.error("Cache found already found at " + cacheDir);
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

        logger.info(" -==JobManager " + scheduler_id + " ready to process jobs ==-\n\n");
        eventEmitter.emit("ready");
        })
        .on('data', _parseMessage);

        return eventEmitter;
}

function jobWarden():void {
    engine.list().on('data', function(d:engineLib.engineListData) {
        logger.silly(`${util.format(d)}`);
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
                        tmpJob.obj.jEmit('lostJob', 'The job "' + key + '" is not in the queue !', tmpJob.obj);
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


/*
    TypeGuard for job parameters passed to the push function
*/
function _checkJobBean(obj:any):boolean{
    if (!cType.isStringMapOpt(obj)) {
        logger.error("unproper job parameter (not a string map)");
        return false;
    }

    if(!obj.hasOwnProperty('cmd') && !obj.hasOwnProperty('script')) {
        logger.error("unproper job parameters (no script nor cmd)");
        return false;
    }

    if(obj.hasOwnProperty('cmd')){
        if(!obj.cmd) {
            logger.error("unproper job parameters (undefined cmd)");
            return false;
        }
    } else {
        if(!obj.script) {
            logger.error("unproper job parameters (undefined script)");
            return false;
        }
    }
    return true;
}

// New job packet arrived on MS socket, 1st arg is streamMap, 2nd the socket
function pushMS(data:any) {
    logger.info(`newJob Packet arrived w/ ${util.format(data)}`);
    if(jobLib.isJobOptProxy(data)) {
        logger.info(`jobOpt successfully received`);
    }
    let jobProfile = data.jobProfile;
    data.fromConsumerMS = true;
    let job = push(jobProfile, data);


    /*let jobOpt:jobLib.jobOptProxyInterface = {
        engine : microEngine,


    }*/


}

/* weak typing of the jobOpt  parameter */
export function push(jobProfileString : string, jobOpt:any /*jobOptInterface*/, namespace?: string) : jobLib.jobObject {

        logger.debug(`Following litteral was pushed \n ${util.format(jobOpt)}`);
        let jobID =  uuidv4();
        if(jobOpt.hasOwnProperty('id'))
            if(jobOpt.id)
                jobID = jobOpt.id;
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

    /* Building a jobOptInterface litteral out of the jobOpt function parameter */
        let jobTemplate : jobLib.jobOptInterface = {
           // "engineHeader": engine.generateHeader(jobID, jobProfileString, workDir),
            "engine" : engine,
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
        if ('socket' in jobOpt)
            jobTemplate.socket = jobOpt.socket;

        



        logger.debug(`Following jobTemplate was successfully buildt \n ${util.format(jobTemplate)}`);
        let newJob = new jobLib.jobObject(jobTemplate, jobID);
       


        // This is a hack to skip inputsMapper call, in case data come from consumer, 
        // all inputs are already well formated containers w/ readable streams
        if('fromConsumerMS' in jobOpt)
            newJob.fromConsumerMS = jobOpt.fromConsumerMS;

        logger.debug(`Following jobObject was successfully buildt \n ${util.format(newJob)}`);
        
        let constraints = {}; //extractConstraints(jobTemplate);
        lookup(jobTemplate, constraints)
            .on('known', function(validWorkFolder:string) {
                //logger.info("I CAN RESURRECT YOU : " + validWorkFolder + ' -> ' + jobTemplate.tagTask);
                //_resurrect(newJob, validWorkFolder);
            })
            .on('unknown', function() {
                logger.debug("########## No previous equal job found ##########");
                newJob.start();

                jobsArray[jobID] = {
                    'obj': newJob,
                    'status': 'CREATED',
                    'nCycle': 0
                };

                newJob.on('submitted', function(j) {
        //console.log(j);
                    jobsArray[j.id].status = 'SUBMITTED';
                //logger.debug(self.jobsView());
                }).on('jobStart', function(job) {
                    // next lines for tests on squeueReport() :
                    engine.list()

            // shall we call dropJob function here ?
                }).on('scriptReadError', function (err, job) {
                    logger.error(`ERROR while reading the script : \n ${err}`);
                }).on('scriptWriteError', function (err, job) {
                    logger.error(`ERROR while writing the coreScript : \n ${err}`);
                }).on('scriptSetPermissionError', function (err, job) {
                logger.error(`ERROR while trying to set permissions of the coreScript : \n ${err}`);
            });
        });
        exhaustBool = true;
        //console.log(jobsArray);

        return newJob;
    }


/*
    always lookin warehouse first, if negative look in jobsArray

    case1) warehouse/-, jobsArray/-              => submit
    case2) warehouse/+, dont look at jobsArray   => resurrect
    case3) warehouse/-, jobsArray/+              => copy jobReference and return it

*/
function lookup(jobTemplate:any, constraints:any){
    let emitter = new events.EventEmitter();
    let t:number = setTimeout(()=>{ emitter.emit("unknown"); });

    return emitter;
}

function _parseMessage(msg:string) {
    //console.log("trying to parse " + string);
    let re = /^JOB_STATUS[\s]+([\S]+)[\s]+([\S]+)/
    let matches = msg.match(re);
    if (!matches) return;

    let jid:string = matches[1];
    let uStatus = matches[2];
    if (!jobsArray.hasOwnProperty(jid)) {
        logger.warn(`unregistred job id ${jid}`);
        eventEmitter.emit('unregistredJob', jid);
        return;
        //throw 'unregistred job id ' + jid;
    }

    logger.debug(`Status Updating job ${jid} : from \'${jobsArray[jid].status} \' to \'${uStatus}\'`);
    if(jobLib.isJobStatus(uStatus))
        jobsArray[jid].status = uStatus;
    else
        logger.error(`unrecognized status at ${uStatus}`);
    if (uStatus === 'START')
        jobsArray[jid].obj.jEmit('jobStart', jobsArray[jid].obj);
    else if (uStatus === "FINISHED")
        _pull(jid); //TO DO
     //logger.error(`TO DO`);
}


/*
    handling job termination.
    Eventualluy resubmit job if error found

*/

function _pull(jid:string) {

    console.log("Pulling " + jid);
    let jRef:jobWrapper = jobsArray[jid];
    //console.dir(jobsArray[jid]);

    if(jRef.obj.stderr()) {
        let streamError = <streamLib.Readable>jRef.obj.stderr();
        let stderrString:string|null = null;
        streamError.on('data', function (datum) {
            stderrString = stderrString ? stderrString + datum.toString() : datum.toString();
        })
        .on('end', function () {
            if(!stderrString) { _storeAndEmit(jid); return; }

            logger.warn(`Job ${jid} delivered a non empty stderr stream\n${stderrString}`);
            jRef.obj.ERR_jokers--;
            if (jRef.obj.ERR_jokers > 0){
                console.log("Resubmitting this job " + jRef.obj.ERR_jokers + " try left");
                jRef.obj.resubmit();
                jRef.nCycle = 0;
            } else {
                console.log("This job will be set in error state");
                _storeAndEmit(jid, 'error');
            }
        });
    } else {
    // At this point we store and unreference the job and emit as completed
        _storeAndEmit(jid);
    }
};


/*
 We treat error state emission / document it for calling scope
*/
function _storeAndEmit(jid:string, status?:string) {
    let jRef:jobWrapper = jobsArray[jid];

    let jobObj:jobLib.jobObject = jRef.obj;
    delete jobsArray[jid];
    let stdout = jobObj.stdout();
    let stderr = jobObj.stderr();


    /*force emulated to dump stdout/err*/
    if (jobObj.emulated) {
        async.parallel([function(callback) {
                        let fOut = jobObj.workDir + '/' + jobObj.id + '.err';
                        let errStream = fs.createWriteStream(fOut);
                        if (stderr)
                            stderr.pipe(errStream).on('close', function() {
                                callback(undefined, fOut);
                        });
                    }, function(callback) {
                        let fOut = jobObj.workDir + '/' + jobObj.id + '.out';
                        let outStream = fs.createWriteStream(fOut);
                        if(stdout)
                            stdout.pipe(outStream).on('close', function() {
                            callback(undefined, fOut);
                        });
                    }], // Once all stream have been consumed, get filesnames
                    function(err:any,results:any) {
                        logger.info(`OUHOUH ${results}`);
                        let _stdout = fs.createReadStream(results[1]);
                        let _stderr = fs.createReadStream(results[0]);
                        jobObj.jEmit("completed", _stdout, _stderr, jobObj);
                    });
    } else {
        if(!status) {
            //warehouse.store(jobObj);
            jobObj.jEmit("completed",
                stdout, stderr, jobObj
            );
        } else {
            jobObj.jEmit("jobError",
                stdout, stderr, jobObj
            );
        }
    }



}



