"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_js_1 = require("../../logger.js");
const events = require("events");
var job_1 = require("../../job");
exports.jobObject = job_1.jobObject;
const nixLike = require("./localNixLike.js");
const slurm = require("./slurm.js");
function isEngineSpec(type) {
    return type == "slurm" || type == "sge" || type == "emulate";
}
exports.isEngineSpec = isEngineSpec;
const isSetEqual = (a, b) => a.size === b.size && [...a].every(value => b.has(value));
const binariesKeys = new Set(["submitBin", "queueBin", "cancelBin"]);
function isBinariesSpec(binaries) {
    let x = new Set(Object.keys(binaries));
    return isSetEqual(x, binariesKeys);
}
exports.isBinariesSpec = isBinariesSpec;
function getEngine(engineName, engineBinaries) {
    //logger.info("Get engine " + Object.keys(engineBinaries))
    logger_js_1.logger.debug(`Asked engine symbol ${engineName}`);
    if (engineBinaries)
        logger_js_1.logger.debug(`Personnalized engineBinaries provided : ${JSON.stringify(engineBinaries)}`);
    if (!engineName) {
        logger_js_1.logger.info('Binding manager with dummy engine');
        return new dummyEngine();
    }
    if (engineName == 'emulate')
        return new nixLike.nixLikeEngine();
    if (engineName == 'slurm')
        return new slurm.slurmEngine(engineBinaries);
    logger_js_1.logger.error(`Unknown engine name ${engineName}`);
    return new dummyEngine();
}
exports.getEngine = getEngine;
class dummyEngine {
    constructor() {
        this.specs = 'dummy';
        this.submitBin = 'dummyExec';
    }
    //logger.info(engineBinaries)
    generateHeader(a, b, c) {
        return 'dummy Engine header';
    }
    list() {
        let evt = new events.EventEmitter();
        let t = setTimeout(function () {
            evt.emit("data", { 'id': ['dummyID'], 'partition': ['dummyPartition'],
                'nameUUID': ['dummyNameUUID'], 'status': ['dummyStatus'] });
            //your code to be executed after 1 second
        }, 500);
        return evt;
    }
    kill(jobList) {
        return new events.EventEmitter();
    }
    testCommand() {
        return 'sleep 10; echo "this is a dummy command"';
    }
}
exports.dummyEngine = dummyEngine;
