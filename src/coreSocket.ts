import net = require('net');
import {EventEmitter} from 'events';
import {logger} from './logger.js';
import liveMemory = require('./lib/pool.js');

const eventEmitterSocket = new EventEmitter();

export function open(port:number) : EventEmitter {
    const server = net.createServer(function(socket) {
        socket.write('#####jobManager scheduler socket####\r\n');
        socket.pipe(socket);
        socket.on('data', function(buf) {
                //eventEmitterSocket.emit('data', buf.toString());
                parseMessage(buf.toString());
            })
            .on('error', function() {
                // callback must be specified to trigger close event
            });
    });
    server.listen(port); //, "127.0.0.1"

    server.on('error', function(e) {
        console.log('error' + e);
        eventEmitterSocket.emit('coreSocketError', e);        
    });
    server.on('listening', function() {
        logger.debug('Listening on ' + port + '...');      
        eventEmitterSocket.emit('coreSocketListen');        
    });
    server.on('connection', function(s) {
        s.on('close', function() {
        });
    });

    return eventEmitterSocket;
}

function parseMessage(msg:string) {
    let re = /^JOB_STATUS[\s]+([\S]+)[\s]+([\S]+)/
    let matches = msg.match(re);
    if (!matches) return;

    let jid:string = matches[1];
    let uStatus = matches[2];

    let jobSel = { 'jid' : jid };
    if (!liveMemory.getJob(jobSel)) {
        logger.warn(`unregistred job id ${jid}`);
        //topLevelEmitter.emit('unregistredJob', jid);
        eventEmitterSocket.emit('coreSocketUnregistredJob', jid);
        return;
    }

    logger.debug(`Status Updating job ${jid} : from
\'${liveMemory.getJobStatus(jobSel)} \' to \'${uStatus}\'`);

    liveMemory.jobSet(uStatus, jobSel);
    let job = liveMemory.getJob(jobSel);
    if (job) {
        if (uStatus === 'START') {
            job.jEmit('jobStart', job);
            logger.debug("parsing Message ==> emit jobStart");
        } else if (uStatus === "FINISHED") {
            logger.debug("parsing Message ==> FINISHED && pullin");
            eventEmitterSocket.emit("letsPull", job);
        }   
     //logger.error(`TO DO`);
    }
}

