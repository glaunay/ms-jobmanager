"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jobManagerCore = require("../index.js");
const logger_js_1 = require("../logger.js");
const program = require("commander");
const testTools_1 = require("./testTools");
/*
    Prototype of a MicroService jobManager
    Testing engine
*/
program
    .version('0.1.0')
    .option('-e, --engine [engine name]', 'MS Job Manager engine')
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
    .parse(process.argv);
logger_js_1.logger.info("\t\tStarting public JobManager MicroService");
let testParameters = {
    cacheDir: program.cache,
    engineSpec: program.engine,
    tcp: program.adress,
    port: program.port ? program.port : 8080,
    microServicePort: program.socket ? program.socket : 2020,
    warehouseAddress: program.warehouse,
    warehousePort: program.whport ? program.whport : 7688,
    warehouseTest: program.whtest ? true : false
};
let jobProxyOpt = {
    'script': '../scripts/local_test.sh',
    'inputs': {
        'file': '../data/file.txt',
        'file2': '../data/file2.txt'
    },
    'exportVar': {
        'waitingTime': '25'
    }
};
if (program.self) {
    logger_js_1.logger.info(`Performing ${program.self} self test, MS capabilities are disabled`);
    testParameters.microServicePort = undefined;
}
jobManagerCore.start(testParameters).on('ready', () => {
    if (program.self)
        testTools_1.selfTest(jobManagerCore, program.self);
});
