"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jobManagerCore = require("../index.js");
const logger = require("../logger.js");
/*
    Prototype of a MicroService jobManager
    Handling job submission performed by the subscribing MicroServices
*/
logger.logger.info("Starting public JobManager MicroService");
let dummyParameters = {
    cacheDir: '/Users/guillaumelaunay/work/DVL/ms-jobmanager/testCache',
    engineSpec: "emulate",
    tcp: '127.0.0.1',
    port: 2222,
    microServicePort: 8080
};
jobManagerCore.start(dummyParameters).on('ready', () => {
});
