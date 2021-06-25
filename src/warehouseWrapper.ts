import * as clientWH from 'ms-warehouse';
import {EventEmitter} from 'events';
import {jobSerialInterface} from './job';
import {logger} from './logger.js';

let warehouseAddress = "127.0.0.1";
let portSocket       = 2222;

interface whParams {
    warehouseAddress:string,
    portSocket : number
};

//import clientWH = require('ms-warehouse');
clientWH.setLogger(logger)

export { storeJob  } from 'ms-warehouse';

export function setParameters(params:whParams){
    warehouseAddress = params.warehouseAddress;
    portSocket       = params.portSocket;
}

export function MS_lookup(jobTemplate:jobSerialInterface){
    let emitter = new EventEmitter();
  
    let jobConstraints = {
        "exportVar": jobTemplate.exportVar,
        "scriptHash": jobTemplate.scriptHash,
        "inputHash": jobTemplate.inputHash
    }

    clientWH.pushConstraints(jobConstraints, {warehouseAddress, portSocket} ).on('foundDocs', (nameOut: string, nameErr: string, workPath: string) => {
        emitter.emit("known", nameOut, nameErr, workPath);
    })
    .on('notFoundDocs', () => {
        emitter.emit("unknown");
    })
    .on('cantConnect', () => {
        emitter.emit("unknown");
    })

    return emitter;
}

export function test(warehouseAddress:string, portSocket: number) {
    clientWH.handshake({ warehouseAddress, portSocket}).then(() => {
        logger.info("MS warehouse available, test success");
    })
    .catch(() => {
        logger.warn("Could not reach MS warehouse, test failed");
    });
}