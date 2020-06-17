import jobManagerCore = require('../index.js');
import {logger, setLogLevel, setLogFile} from '../logger.js';
import program = require('commander');
import {selfTest} from '../tests/testTools';
import fs = require('fs');

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
  .option('-v, --verbosity [logLevel]', 'Set log level', setLogLevel, 'info')
  .option('-d, --delay <n>', 'delay between test', parseInt)
  .option('-c, --cache [cacheDir]', 'cache directory', './')
  .option('-f, --force', 'Enforce cacheDir usage, preventing root cache folder creation', false)
  .option('-s, --self <n>', 'Microservice Self testing, by launching n consecutive jobs', parseInt)
  .option('-w, --warehouse [address]', 'Warehouse address', '127.0.0.1')
  .option('-x, --whport <n>', 'Warehouse port', parseInt)
  .option('-t, --whtest', 'Warehouse connection test')
  .option('-n, --nworker <n>', 'Maximum number of workers')
  .option('-o, --logFile [filePath]', 'Set log file location', setLogFile)
.parse(process.argv);

if (!program.logFile)
    setLogFile('./jobManager.log');

logger.info("\t\tStarting public JobManager MicroService");

let testParameters = {
    cacheDir : program.cache,
    engineSpec : program.engine, //as jobManagerCore.engineSpecs,
    tcp : program.adress,
    port : program.port ? program.port : 8080,
    microServicePort:program.socket ? program.socket : 2020,
    warehouseAddress: program.warehouse,
    warehousePort: program.whport ? program.whport : 7688,
    warehouseTest: program.whtest ? true : false,
    nWorker : program.nworker ? program.nworker : 10,
    engineBinaries : program.bean ? JSON.parse(fs.readFileSync(program.bean, 'utf8')).engineBinaries : undefined,
    forceCache : program.force
};

if(program.self) {
    logger.info(`Performing ${program.self} self test, MS capabilities are disabled`);
    testParameters.microServicePort = undefined;
}

if (program.bean && !testParameters.engineBinaries){
    logger.warn("no engineBinaries specified in configuration file. Default will be use.")
}

jobManagerCore.start(testParameters).on('ready', () => {
    if(program.self)
        selfTest(jobManagerCore, program.self);

}).on('error', (msg) => {
    logger.fatal(msg)
});

