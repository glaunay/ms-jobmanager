import jobManagerCore = require('../index.js');
import {logger, setLogLevel} from '../logger.js';
import program = require('commander');
import {selfTest} from './testTools';

/*
    Prototype of a MicroService jobManager 
    Testing engine 
*/
program
  .version('0.1.0')
  .option('-e, --engine [engine name]', 'MS Job Manager engine')
  .option('-p, --port <n>', 'MS Job Manager internal/main port', parseInt, 8080)
  .option('-s, --socket <n>', 'MS Job Manager subscriber port', parseInt, 2020)
  .option('-a, --adress [IP adress]', 'MS Job Manager adress', '127.0.0.1')
  .option('-v, --verbosity [logLevel]', 'Set log level', setLogLevel, 'info')
  .option('-d, --delay <n>', 'delay between test', parseInt, 2500)
  .option('-c, --cache [cacheDir]', 'cache directory', './')
  .option('-s, --self <n>', 'Microservice Self testing, by launching n consecutive jobs', parseInt)
  /*.option('-n, --worker [number]', 'Number of dummy jobs to push-in', 1)
  .option('-r, --replicate', 'Ask for identical jobs')*/
.parse(process.argv);

logger.info("\t\tStarting public JobManager MicroService");

let testParameters = {
    cacheDir : program.cache,
    engineSpec : program.engine, //as jobManagerCore.engineSpecs,
    tcp : program.adress,
    port : program.port,
    microServicePort:program.socket
};

let jobProxyOpt:any = {
    'script' : '../scripts/local_test.sh',
    'inputs' : {
        'file' : '../data/file.txt',
        'file2' : '../data/file2.txt'
    },
    'exportVar' : {
        'waitingTime' : '25'
    }
}
if(program.self) {
    logger.info(`Performing ${program.self} self test, MS capabilities are disabled`);
    testParameters.microServicePort = undefined;
}

jobManagerCore.start(testParameters).on('ready', () => {
    if(program.self)
        selfTest(jobManagerCore, program.self);

});

