"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jobManagerCore = require("../index.js");
const logger_js_1 = require("../logger.js");
const program = require("commander");
const testTools_1 = require("./testTools");
const fs = require("fs");
/*
    Prototype of a MicroService jobManager
    Testing engine
*/
program
    .version('0.1.0')
    .option('-e, --engine [engine name]', 'MS Job Manager engine')
    .option('-b, --bean [configurationFilePath]', 'MS Job Manager configuration File')
    .option('-p, --port <n>', 'MS Job Manager internal/main port', parseInt)
    .option('-k, --socket <n>', 'MS Job Manager subscriber port', parseInt)
    .option('-a, --adress [IP adress]', 'MS Job Manager host machine adress', '127.0.0.1')
    .option('-v, --verbosity [logLevel]', 'Set log level', logger_js_1.setLogLevel, 'info')
    .option('-d, --delay <n>', 'delay between test', parseInt)
    .option('-c, --cache [cacheDir]', 'cache directory', './')
    .option('-s, --self <n>', 'Microservice Self testing, by launching n consecutive jobs', parseInt)
    .option('-w, --warehouse [address]', 'Warehouse address', '127.0.0.1')
    .option('-x, --whport <n>', 'Warehouse port', parseInt)
    .option('-t, --whtest', 'Warehouse connection test')
    .option('-n, --nworker <n>', 'Maximum number of workers')
    .option('-o, --logFile [filePath]', 'Set log file location', logger_js_1.setLogFile)
    /*.option('-n, --worker [number]', 'Number of dummy jobs to push-in', 1)
    .option('-r, --replicate', 'Ask for identical jobs')*/
    .parse(process.argv);
if (!program.logFile)
    logger_js_1.setLogFile('./jobManager.log');
//let confLitt = program.bean ? JSON.parse( fs.readFileSync(program.bean, 'utf8') ) : undefined;
logger_js_1.logger.info("\t\tStarting public JobManager MicroService");
let testParameters = {
    cacheDir: program.cache,
    engineSpec: program.engine,
    tcp: program.adress,
    port: program.port ? program.port : 8080,
    microServicePort: program.socket ? program.socket : 2020,
    warehouseAddress: program.warehouse,
    warehousePort: program.whport ? program.whport : 7688,
    warehouseTest: program.whtest ? true : false,
    nWorker: program.nworker ? program.nworker : 10,
    engineBinaries: program.bean ? JSON.parse(fs.readFileSync(program.bean, 'utf8')).engineBinaries : undefined
};
if (program.self) {
    logger_js_1.logger.info(`Performing ${program.self} self test, MS capabilities are disabled`);
    testParameters.microServicePort = undefined;
}
if (program.bean && !testParameters.engineBinaries) {
    logger_js_1.logger.warn("no engineBinaries specified in configuration file. Default will be use.");
}
jobManagerCore.start(testParameters).on('ready', () => {
    /*if(confLitt){
        if (confLitt.hasOwnProperty("engineBinaries")) {
            jobManagerCore.engineOverride(confLitt.engineBinaries);
            logger.info("overriding engine binaries");
        }
    }*/
    if (program.self)
        testTools_1.selfTest(jobManagerCore, program.self);
}).on('error', (msg) => {
    logger_js_1.logger.fatal(msg);
});
