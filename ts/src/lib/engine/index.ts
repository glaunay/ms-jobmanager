import logger = require('winston');
import jobLib = require('../../job');
import events = require('events');

export {jobObject} from '../../job';

import cType = require('../../commonTypes.js');

import nixLike = require('./localNixLike.js');


export interface engineListData {
        'id'?:        string[];
        'partition'?: (string|null)[];
        'nameUUID':   string[]; // Only mandatory one
        'status'?:    string[];
}




export interface engineHeaderFunc {
    (jobID:string, jobProfileKey:string|undefined, workDir:string) :string;
}
export interface engineList {
    () :events.EventEmitter;
}
export interface engineTest {
    () :string;
}
export interface engineKill {
    (jobList:jobLib.jobObject[]) :events.EventEmitter;
}
export interface engineInterface {
    generateHeader : engineHeaderFunc;
    submitBin : string;
    list : engineList;
    kill : engineKill;
    testCommand : engineTest;
}

export type engineSpecs = "slurm" | "sge" | "emulate";
export function isEngineSpec(type: string): type is engineSpecs {
    let a = type == "slurm" || type ==  "sge" ||type ==  "emulate";
    logger.info(`${a}`);
    return type == "slurm" || type ==  "sge" ||type ==  "emulate";
}


export function getEngine(engineName?:engineSpecs): engineInterface{
    logger.debug(`Asked engine symbol ${engineName}`);
    if (!engineName) {
        logger.info('Binding manager with dummy engine');
        return new dummyEngine();
    }

    if(engineName == 'emulate')
        return new nixLike.nixLikeEngine();
    logger.error(`Unknown engine name ${engineName}`);
    return new dummyEngine();
}


class dummyEngine implements engineInterface {
    constructor() {

    }
    submitBin:string = 'dummyExec';

    generateHeader (a : string, b : string|undefined, c : string):string {
        return 'dummy Engine header';
    }
    list() {
        let evt = new events.EventEmitter();
        let t:NodeJS.Timer =  setTimeout(function() {
            evt.emit("data", <engineListData>{  'id': ['dummyID'], 'partition': ['dummyPartition'],
                                'nameUUID': ['dummyNameUUID'], 'status': ['dummyStatus'] });
      //your code to be executed after 1 second
        }, 500);
        return evt;
    }
    kill(jobList : jobLib.jobObject[]) {
        return new events.EventEmitter();
    }
    testCommand() {
        return 'sleep 10; echo "this is a dummy command"';
    }
}

