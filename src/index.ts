import util = require('util');
import uuidv4 = require('uuid/v4');
import events = require('events');
import {logger} from './logger.js';
import { jobObject, isJobOptProxy, jobSerialInterface, melting }  from './job';
import * as engineLib from './lib/engine' ;
import jmServer = require('./nativeJS/job-manager-server.js');
import liveMemory = require('./lib/pool.js');
import {open as openSocket} from "./coreSocket";
import {isSpecs, jobManagerSpecs} from "./coreTypes";
export {engineSpecs} from './lib/engine/index.js';
import {wardenKick, jobWarden, setWarden } from './warden';
import {coherceIntoJobTemplate} from './job/template';
import { MS_lookup, test as whTest, setParameters as whSetConnect, storeJob } from './warehouseWrapper';
import {create as createCache} from "./cache";


let engine :engineLib.engineInterface; // to type with Engine contract function signature



let scheduler_id :string = uuidv4();

// Intervall for periodic operations
let corePulse :number = 500;
let core :NodeJS.Timer;
// Intervall for periodic monitoring
let wardenPulse :number = 5000;
let warden : NodeJS.Timer;
let cacheDir :string|null = null;

let nWorker:number = 10; // running job max poolsize


let topLevelEmitter : events.EventEmitter = new events.EventEmitter();

let exhaustBool :boolean = false; // set to true at any push, set to false at exhausted event raise

let emulator :boolean = false; // Trying to keep api/events intact while running job as fork on local

let isStarted :boolean = false;

let microServiceSocket:events.EventEmitter|undefined = undefined;

let TCPip = '127.0.0.1';
let TCPport = 2222;

function _pulse() {
    let c:number = liveMemory.size();
    if (c === 0) {
        if (exhaustBool) {
            topLevelEmitter.emit("exhausted");
            exhaustBool = false;
        }
    }
}

//CH 02/12/19
// Maybe use promess instead of emit("ready"), emit("error")
export function start(opt:jobManagerSpecs):events.EventEmitter {
    logger.debug(`${util.format(opt)}`);

    if (isStarted) {
        let t:NodeJS.Timer = setTimeout(()=>{ topLevelEmitter.emit("ready"); }, 50);
        return topLevelEmitter;
    }

    if (!isSpecs(opt)) {
        let msg:string = `Missing or wrong type arguments : engine, cacheDir, opt, tcp, binariesSpec (in conf file)`;
        //eventEmitter.emit("error", msg)
        let t:NodeJS.Timer = setTimeout(()=>{ topLevelEmitter.emit("error", msg); },50);
        return topLevelEmitter;
    }

    engine = engineLib.getEngine(opt.engineSpec, opt.engineBinaries);
   
    emulator = opt.engineSpec == 'emulate' ? true : false;

    // Address, port  of the jobManager MicroService node worker communications
    TCPip  =   opt.tcp  || TCPip;
    TCPport  = opt.port || TCPport;
    
    // if a port is provided for microservice we open connection
    if(opt.microServicePort) {
        microServiceSocket =  jmServer.listen(opt.microServicePort);
        logger.debug(`Listening for consumer microservices at : ${opt.microServicePort}`);
        microServiceSocket
        .on('newJobSocket', pushMS)
        .on('connection',() => logger.debug('Connection on microservice consumer socket'));
    }

    nWorker = opt.nWorker || nWorker;

    if(opt.cycleLength)
        wardenPulse = parseInt(opt.cycleLength);
    
    // Warehouse business 
    const addressWH = opt.warehouseAddress ? opt.warehouseAddress : '127.0.0.1';
    const portWH    = opt.warehousePort    ? opt.warehousePort    : 7688;
    whSetConnect({ warehouseAddress: addressWH, portSocket : portWH});
    if(opt?.warehouseTest)
        whTest(addressWH, portWH);

    cacheDir = createCache(opt.forceCache, opt.cacheDir, scheduler_id);
    
    // worker socket listener
    logger.debug('[' + TCPip + '] opening socket at port ' + TCPport);
    const s = openSocket(TCPport);
    s.on('coreSocketError', (e:any)  => topLevelEmitter.emit('error', e))
    .on('coreSocketListen', () => {
        isStarted = true;
        core      = setInterval(() => _pulse(), corePulse);
        warden    = setInterval(() => jobWarden(), wardenPulse);

        topLevelEmitter.emit("ready");

        logger.info(`${pprint(opt)}`);    
    })
    .on("coreSocketUnregistredJob", (jid)=> topLevelEmitter.emit("unregistredJob", jid))
    .on("letsPull", (job) => _pull(job)); //TO DO)

    return topLevelEmitter;
}

// New job packet arrived on MS socket, 1st arg is streamMap, 2nd the socket
function pushMS(data:any, MS_socket:any) {
    logger.debug(`newJob Packet arrived w/ ${util.format(data)}`);
    logger.silly(` Memory size vs nWorker :: ${liveMemory.size()} <<>> ${nWorker}`);
    if (liveMemory.size("notBound") >= nWorker) {
        logger.debug("must refuse packet, max pool size reached");
        jmServer.bouncer(data, MS_socket);
        return;
        // No early exit yet
    }
    
    jmServer.granted(data, MS_socket).then((_data)=> {        

        let jobProfile = _data.jobProfile;
        _data.fromConsumerMS = true;

        if(isJobOptProxy(_data)) {
            logger.debug(`jobOpt successfully decoded`);
        }
        const _ = push(jobProfile, _data);
    });    
}

/* weak typing of the jobOpt  parameter */
export function push(jobProfileString : string, jobOpt:any /*jobOptInterface*/, namespace?: string) : jobObject {
    logger.debug(`Following litteral was pushed \n ${util.format(jobOpt)}`);

    const jobID = jobOpt.id || uuidv4();
    const workDir:string = cacheDir + '/' + jobID;

    const jobTemplate = coherceIntoJobTemplate(jobProfileString, jobOpt, workDir, { engine, emulator, TCPip, TCPport });
  
    logger.debug(`Following jobTemplate was successfully buildt \n ${util.format(jobTemplate)}`);
    let newJob = new jobObject(jobTemplate, jobID);

    // All engine parameters are set at this stage, working on folder creations should be safe
    // Check for intermediary folders in workdirpath
    // rootCache /job.iCache??""/ namespace ??"" / jobID
    if (namespace || newJob.engine.iCache) {       
        newJob.workDir = cacheDir ? `${cacheDir}/` : "";
        newJob.workDir += newJob.engine.iCache ? `${newJob.engine.iCache}/` : ""; 
        newJob.workDir += namespace ? `${namespace}/` : ""; 
        newJob.workDir += jobID;
        logger.debug(`Redefined job workDir ${newJob.workDir}`);
    }

    if('fromConsumerMS' in jobOpt)
        newJob.fromConsumerMS = jobOpt.fromConsumerMS;
       
                  // 3 outcomes
          // newJob.launch // genuine start
          // newJob.resurrect // load from wareHouse a complete job
          // newJob.melt // replace newJob by an already running job
          //                just copying client socket if fromConsumerMS 

    logger.debug(`Following jobObject was successfully buildt \n ${util.format(newJob)}`);
        

    newJob.start();
    liveMemory.addJob(newJob);

    const fatal_error = ["folderCreationError", "folderSetPermissionError"]

    fatal_error.forEach((symbol:string) => {
        newJob.on(symbol, wardenKick);
    });

    newJob.on('submitted', function(j) {
        liveMemory.jobSet('SUBMITTED', { jobObject : newJob });
    })
    newJob.on('inputSet', function() { 
        // All input streams were dumped to file(s), we can safely serialize
        let jobSerial = newJob.getSerialIdentity();
        /*
        always lookin warehouse first, if negative look in jobsArray

        case1) warehouse/-, jobsArray/-              => submit
        case2) warehouse/+, dont look at jobsArray   => resurrect
        case3) warehouse/-, jobsArray/+              => copy jobReference and return it
*/

        MS_lookup(jobSerial)
            .on('known', function(fStdoutName: string, fStderrName: string, workPath: string) {
                newJob.respawn(fStdoutName, fStderrName, workPath);
                newJob.jEmit("completed", newJob);
            })
            .on('unknown', function() {
                logger.debug("####No suitable job found in warehouse");
                
                let previousJobs:jobObject[]|undefined;
                previousJobs = liveMemory.lookup(newJob);
                
                if(previousJobs) {
                    logger.debug(`${previousJobs.length} suitable living job(s) found, shimmering`);
                    melting(previousJobs[0], newJob);
                    return;
                }
                logger.debug('No Suitable living jobs found, launching');
                liveMemory.jobSet('source', { jobObject : newJob });
                newJob.launch();

                newJob.on('jobStart', function(job) {
                    engine.list()
            // shall we call dropJob function here ?
            // CH/GL 02/12/19
            //We should check for liveMemory management and client socket event propagation. 
                }).on('scriptReadError', function (err, job) {
                    logger.error(`ERROR while reading the script : \n ${err}`);
                }).on('scriptWriteError', function (err, job) {
                    logger.error(`ERROR while writing the coreScript : \n ${err}`);
                }).on('scriptSetPermissionError', function (err, job) {
                    logger.error(`ERROR while trying to set permissions of the coreScript : \n ${err}`);
                });
            });
    });
    exhaustBool = true;

    return newJob;
}

/*
    handling job termination.
    Eventualluy resubmit job if error found

*/

function _pull(job:jobObject):void { 
    logger.silly(`Pulling ${job.id}`);
    job.stderr().then((streamError) => {     
        let stderrString:string|null = null;
        streamError.on('data', function (datum) {
            stderrString = stderrString ? stderrString + datum.toString() : datum.toString();
        })
        .on('end', function () {          
            if(!stderrString) { _storeAndEmit(job.id); return; }
            logger.warn(`Job ${job.id} delivered the following non empty stderr stream\n${stderrString}`);
            job.ERR_jokers--;
            if (job.ERR_jokers > 0){
                logger.warn(`Resubmitting the job ${job.id} : ${job.ERR_jokers} try left`);
                job.resubmit();
                liveMemory.setCycle({jobObject:job}, 0);                
            } else {
                logger.warn(`The job ${job.id} will be set in error state`);
                _storeAndEmit(job.id, 'error');
            }
        });
    });
};

/*
 We treat error state emission / document it for calling scope
 // MAybe use jobObject as 1st parameter?
*/
function _storeAndEmit(jid:string, status?:string) {

    //let jobSel = {'jid' : jid};
    logger.debug("Store&Emit");
    let jobObj:jobObject|undefined = liveMemory.getJob({ jid });
    if (jobObj) {
        liveMemory.removeJob({ jid });
        if(liveMemory.size("notBound") < nWorker)
            jmServer.openBar();
        jobObj.jEmit("completed", jobObj);

        let serialJob : jobSerialInterface = jobObj.getSerialIdentity(); 
        // add type 
        // Make some tests on the jobFootPrint literal?
        
        storeJob(serialJob).on('addSuccess', (message: any) => {
           logger.log('success', `Job footprint stored in Warehouse`)
        });
       

        //warehouse.store(jobObj); // Only if genuine
    } else {
        logger.error('Error storing job is missing from pool');
    }
}

function pprint(opt:jobManagerSpecs) {
    return `-==JobManager successfully started==-
    scheduler_id : ${scheduler_id}
    engine type : ${engine.specs}
    internal ip/port : ${TCPip}/${TCPport}
    consumer port : ${opt.microServicePort}
    worker pool size : ${nWorker}
    cache directory : ${cacheDir}
    [DEFAULT BINARIES]
    submit binary : ${engine.submitBin}
    queue binary : ${engine.queueBin ? engine.queueBin : "No one"}
    cancel binary : ${engine.cancelBin ? engine.cancelBin : "No one"}
    `
}