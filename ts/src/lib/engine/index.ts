import logger = require('winston');
import jobLib = require('../../job');
import events = require('events');

export {jobObject} from '../../job';

import cType = require('../../commonTypes.js');

import nixLike = require('./localNixLike.js');
import slurm = require('./slurm.js');

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
    specs:engineSpecs;
}

export type engineSpecs = "slurm" | "sge" | "emulate" | "dummy";
export function isEngineSpec(type: string): type is engineSpecs {
    
    return type == "slurm" || type ==  "sge" ||type ==  "emulate";
}


export interface preprocessorMapFn {
    (v:string) : string;
}
export type preprocessorMapperType = { [s:string] : preprocessorMapFn }

export function getEngine(engineName?:engineSpecs): engineInterface{
    logger.debug(`Asked engine symbol ${engineName}`);
    if (!engineName) {
        logger.info('Binding manager with dummy engine');
        return new dummyEngine();
    }

    if(engineName == 'emulate')
        return new nixLike.nixLikeEngine();

    if(engineName == 'slurm')
        return new slurm.slurmEngine();

        
    logger.error(`Unknown engine name ${engineName}`);
    return new dummyEngine();
}


export class dummyEngine implements engineInterface {
    constructor() {

    }
    specs:engineSpecs='dummy';
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

