import jobManagerCore = require('../index.js');
import {logger} from '../logger.js';
import program = require('commander');
import {createJobOpt, performDummyPush} from './testTools';


/*
    Prototype of a MicroService jobManager 
    Testing engine 
*/
program
  .version('0.1.0')
  .option('-e, --engine [engine name]', 'MS Job Manager engine')
  .option('-p, --port <n>', 'MS Job Manager main port', parseInt, 8080)
  .option('-s, --socket <n>', 'MS Job Manager subscriber port', parseInt, 2020)
  .option('-a, --adress [IP adress]', 'MS Job Manager adress', '127.0.0.1')
  //.option('-l, --list', 'Ask for a list testing', 'localhost')
  .option('-d, --delay <n>', 'delay between test', parseInt, 2500)
  .option('-c, --cache [cacheDir]', 'cache directory', './')
  .option('s, --self <n>', 'Microservice Self testing, by launching n consecutive jobs', parseInt)
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
    logger.info('engine started');
    if(program.self)
        selfTest(jobManagerCore, program.self);

});


function selfTest(jm:any, n:number):void {
    selfSubmissionTest(jobManagerCore, program.self)
    .then((jobObjArray)=>{
        logger.info('\t\t>>Submission test successfull<<');
        selfKillTest(jobManagerCore, program.self).then((jobObjArray)=>{
            logger.info('\t\t>>Killing test successfull<<');
        }).catch((e)=>{
            logger.error('!!!Killing test not completed!!!');
            process.exit();
        });
    }).catch((e)=>{
        logger.error('!!!Submission test not completed!!!');
        process.exit();
    });
}

/* Sequential testing w/ synchronous pushes */
function selfSubmissionTest(jm:any, n:number, ttl?:number):Promise<{}> {
    let i:number = 1;
    let jArray:any[] = [];
    let ttlBool:boolean = typeof ttl !== 'undefined';
    
    let jobPromises:Promise<{}>[] = [];
    while(i <= n) {
        //logger.warn(`Worker n${i} submission loop`);
        let jobOpt:any = createJobOpt(i);
        if(ttlBool)jobOpt.ttl = ttl;
        jobPromises.push(performDummyPush(jm, jobOpt, ttlBool));
        i++;
    }
    return Promise.all(jobPromises);
}

function selfKillTest(jm:any, n:number):Promise<{}> {
    logger.info('\t\t>>Starting kill test<<');
    let ttl = 2;
    return selfSubmissionTest(jm, n, ttl);
}
