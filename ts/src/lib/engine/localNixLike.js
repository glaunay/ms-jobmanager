"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
}
Object.defineProperty(exports, "__esModule", { value: true });
const events = require("events");
const path = require("path");
const logger = require("winston");
const localNixLike_js_1 = __importDefault(require("./profiles/localNixLike.js"));
const ps_js_1 = require("./ps.js");
let localProfiles = localNixLike_js_1.default;
class nixLikeEngine {
    constructor() {
        this.submitBin = '/bin/bash';
    }
    generateHeader(jobID, jobProfileKey, workDir) {
        return '# This is local default header' + getPreprocessorString(jobID, jobProfileKey);
    }
    /*list(): events.EventEmitter {
        let evt = new events.EventEmitter();
        let t:NodeJS.Timer =  setTimeout(function() {
            evt.emit("data", <engineLib.engineListData>{  'id': ['dummyID'], 'partition': ['dummyPartition'],
                                'nameUUID': ['localNameUUID'], 'status': ['dummyStatus'] });
      //your code to be executed after 1 second
        }, 500);
        return evt;
    }*/
    list() {
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
        ps_js_1.lookup().on('data', function (dataRecord) {
            let results = { 'id': [], 'partition': [], 'nameUUID': [], 'status': [] };
            for (let processData of dataRecord) {
                let key;
                let bHit = false;
                for (key in processData) {
                    if (bHit)
                        break;
                    let possibleValue = processData[key];
                    if (possibleValue) {
                        for (let value of possibleValue) {
                            if (regex.test(value)) {
                                logger.silly(`${value} matches batch regexp at psAux field ${key}`);
                                let uuid = path.basename(value).replace(".batch", "");
                                //let id:string[]|undefined =  results.id;
                                if (results.id)
                                    results.id.push(processData.PID[0]); // dependant from indices so may be bad
                                if (results.partition)
                                    results.partition.push(null);
                                if (results.nameUUID)
                                    results.nameUUID.push(uuid);
                                if (results.status)
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
    kill(jobList) {
        return new events.EventEmitter();
    }
    testCommand() {
        return 'sleep 10; echo "this is a dummy command"';
    }
}
exports.nixLikeEngine = nixLikeEngine;
function getPreprocessorString(id, profileKey) {
    if (!profileKey) {
        logger.warn(`profile key undefined, using "default"`);
        profileKey = "default";
    }
    else if (!localProfiles.definitions.hasOwnProperty(profileKey)) {
        logger.error(`profile key ${profileKey} unknown, using "default"`);
        profileKey = "default";
    }
    let string = _preprocessorDump(id, localProfiles.definitions[profileKey]);
    return string;
}
function _preprocessorDump(id, obj) {
    let str = '';
    for (let k in obj)
        str += `export ${k}=${obj[k]}\n`;
    return str;
}
