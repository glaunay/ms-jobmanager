import jobManagerCore = require('../index.js');
import {logger, setLogLevel, setLogFile} from '../logger.js';
import program = require('commander');
import {selfTest} from '../tests/testTools';
import fs = require('fs');

/*
    Launching the job manager microservice
*/
program
    .version('0.1.0')
    .option('-e, --engine [engine name]', 'MS Job Manager engine')  
    .option('-p, --port <n>', 'MS Job Manager internal/main port', parseInt)
    .option('-k, --socket <n>', 'MS Job Manager subscriber port', parseInt)
    .option('-v, --verbosity [logLevel]', 'Set log level', setLogLevel, 'info')
    .option('-d, --delay <n>', 'delay between test', parseInt)
    .option('-c, --cache [cacheDir]', 'cache directory', './')
    .option('-s, --self <n>', 'Microservice Self testing, by launching n consecutive jobs', parseInt)
    .option('-w, --warehouse [address]', 'Warehouse address', '127.0.0.1')
    .option('-x, --whport <n>', 'Warehouse port', parseInt)
    .option('-n, --nworker <n>', 'Maximum number of workers')
    .option('-o, --logFile [filePath]', 'Set log file location', setLogFile)
    //.option('-b, --bean [configurationFilePath]', 'MS Job Manager configuration File') /* Does not seem to be used ? */
    .option('-f, --force', 'Enforce cacheDir usage, preventing root cache folder creation', false) /* Does not seem to be used */
    .option('-t, --whtest', 'Warehouse connection test') /* Does not seem to be used */
    .option('-a, --adress [IP adress]', 'MS Job Manager host machine adress', '127.0.0.1')  /*Does not seem to be used */
.parse(process.argv);

if (!program.logFile)
    setLogFile('./jobManager.log');

logger.info("\t\tStarting public JobManager MicroService");

let baseParameters = {
    cacheDir : program.cache,
    engineSpec : program.engine, //as jobManagerCore.engineSpecs,
    tcp : program.adress,
    port : program.port ? program.port : 8080,
    microServicePort:program.socket ? program.socket : 2020,
    warehouseAddress: program.warehouse,
    warehousePort: program.whport ? program.whport : 7688,
    warehouseTest: program.whtest ? true : false,
    nWorker : program.nworker ? program.nworker : 10,
    engineBinaries : program.bean ? program.bean : undefined, //JSON.parse(fs.readFileSync(program.bean, 'utf8')).engineBinaries
    forceCache : program.force
};

if(program.self) {
    logger.info(`Performing ${program.self} self test, MS capabilities are disabled`);
    baseParameters.microServicePort = undefined;
}

if (!baseParameters.engineBinaries){ //program.bean
    logger.warn("no engineBinaries specified in configuration file. Default will be use.")
}

jobManagerCore.start(baseParameters).on('ready', () => {
    if(program.self)
        selfTest(jobManagerCore, program.self);
}).on('error', (msg) => {
    logger.fatal(msg)
});

/*
    Base for configuration file needs additional work
*/
function beanParser(filename:string):Record<string, string> {
    const datum = JSON.parse(fs.readFileSync(filename, 'utf8'));
    return datum;
}