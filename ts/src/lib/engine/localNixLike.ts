import events = require('events');
import path = require('path');
import util = require('util');
import {logger} from '../../logger.js';

//import engineInterface} from 'index.js';
import engineLib = require('./index.js');
import cType = require('../../commonTypes.js');
import {profileInterface, isProfile} from './profiles/index.js';

import profiles from './profiles/localNixLike.js'


import {lookup,psData} from './ps.js';

import {engineListData} from './index.js';
import {defaultGetPreprocessorString as getPreprocessorString} from './profiles/index.js';


let localProfiles:profileInterface = profiles;


export class nixLikeEngine implements engineLib.engineInterface {
    submitBin:string = '/bin/bash';
    specs:engineLib.engineSpecs='emulate';
    constructor() {

    }
    /* GL 2020/15/06  dirty hack, not intended, for now, to be used in nixLike context only slurm */
    setSysProfile(a:string) {
        logger.info("nixLike Engine setSysProfile call");
     }
    generateHeader (jobID:string, jobProfileKey:string|undefined):string {

        return "# This is local default header\n" +  getPreprocessorString (jobProfileKey, localProfiles/*,jobID,*/);
    }

    list ():events.EventEmitter {
        let emitter = new events.EventEmitter();

        let regex = /\.batch$/;

    /*
    * This part is implemented to adjust to every type of OS.
    * In fact, GL obtained different results than MG with the following code :
        // dataRecord.forEach(function(d) {
        //     if (d.COMMAND[0] !== 'sh') return;
        //     if (d.COMMAND.length === 1) return;
        //     if (!regex.test(d.COMMAND[1])) return;
        //     var uuid = path.basename(d.COMMAND[1]).replace(".batch", "");
        //     results.id.push(d.PID[0]);
        //     results.partition.push(null);
        //     results.nameUUID.push(uuid);
        //     results.status.push(d.STAT[0]);
        // });
    * For example, key "COMMAND" for GL was "CMD" for MG.
    * The array "COMMAND" contained 2 values for GL, and 3 for MG.
    *
    * Here a dirty solution :
    *   (1) @dataRecord is an array of processus in JSON format (@processRecord).
    *       (2) @processRecord is a JSON, each key refers to an array (@processRecord[key]).
    *           (3) @processRecord[key] is an array of string (@ival), in which we search for the regex.
    */
        lookup().on('data', function(dataRecord:psData[]){
            let results:engineListData = {'id':[], 'partition':[], 'nameUUID':[], 'status':[]};

            for (let processData of dataRecord) {
                let key:keyof psData;
                let bHit:boolean = false;
                for (key in processData){
                    if (bHit) break;
                    let possibleValue:string[]|undefined = processData[key];
                    if (possibleValue){
                        for (let value of possibleValue) {
                            if (regex.test(value)) {
                                logger.silly(`${value} matches batch regexp at psAux field ${key}`);
                                let uuid = path.basename(value).replace(".batch", "");
                                    //let id:string[]|undefined =  results.id;
                                if(results.id)
                                    results.id.push(processData.PID[0]); // dependant from indices so may be bad
                                if(results.partition)
                                    results.partition.push(null);
                                if(results.nameUUID)
                                    results.nameUUID.push(uuid);
                                if(results.status)
                                   results.status.push(processData.STAT[0]); // dependant from indices so may be ba

                                bHit = true;
                                break;
                            }
                        }
                    }
                }
            }
//            for (let key in processRecord) { // (2)
//                logger.debug(`${key} :: ${util.format(processRecord[key]}`);

    /*
                for (let ival of processRecord[key]) { // (3)
                    if (regex.test(ival)) {
                        let uuid = path.basename(ival).replace(".batch", "");
                        results.id.push(processRecord.PID[0]); // dependant from indices so may be bad
                        results.partition.push(null);
                        results.nameUUID.push(uuid);
                        results.status.push(processRecord.STAT[0]); // dependant from indices so may be bad
                    }
                }
            }
                */
           // }

            emitter.emit('data', results);
        });
        return emitter;
    }


    kill(jobList:engineLib.jobObject[]) {
        return new events.EventEmitter();
    }
    testCommand(){
        return 'sleep 10; echo "this is a dummy command"';
    }

}
/*
function getPreprocessorString (id:string, profileKey:string|undefined):string {
    if (!profileKey){
        logger.warn(`profile key undefined, using "default"`);
        profileKey = "default";
    }
    else if (!localProfiles.definitions.hasOwnProperty(profileKey)) {
        logger.error(`profile key ${profileKey} unknown, using "default"`);
        profileKey = "default";
    }
    let string:string = _preprocessorDump(id, localProfiles.definitions[profileKey]);
    return string;
}

function _preprocessorDump (id:string, obj:cType.stringMap):string {
    let str = '';
    for (let k in obj)
        str += `export ${k}=${obj[k]}\n`;
    return str;
}
*/