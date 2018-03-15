"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger = require("winston");
const events = require("events");
var job_1 = require("../../job");
exports.jobObject = job_1.jobObject;
const nixLike = require("./localNixLike.js");
function isEngineSpec(type) {
    let a = type == "slurm" || type == "sge" || type == "emulate";
    logger.info(`${a}`);
    return type == "slurm" || type == "sge" || type == "emulate";
}
exports.isEngineSpec = isEngineSpec;
function getEngine(engineName) {
    logger.debug(`Asked engine symbol ${engineName}`);
    if (!engineName) {
        logger.info('Binding manager with dummy engine');
        return new dummyEngine();
    }
    if (engineName == 'emulate')
        return new nixLike.nixLikeEngine();
    logger.error(`Unknown engine name ${engineName}`);
    return new dummyEngine();
}
exports.getEngine = getEngine;
class dummyEngine {
    constructor() {
        this.submitBin = 'dummyExec';
    }
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
