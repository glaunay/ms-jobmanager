import jobManagerMS = require('../nativeJS/job-manager-client.js');
import util = require('util');
import {createJobOpt} from './testTools';

import {logger, setLogLevel} from '../logger.js';
let fs = require('fs');
/*
    Prototype of a Consumer Micro Service subscribing
     to a Public JobManager Micro Service.
*/




import program = require('commander');
 
program
  .version('0.1.0')
  .option('-p, --port [port number]', 'MS Job Manager port', 2020)
  .option('-a, --adress [IP adress]', 'MS Job Manager adress', 'localhost')
  .option('-j, --jobOpt [path to JSON file], A job Option specs')
  .option('-s, --shellScript [path to bash script], A bash script to execute')
  .option('-n, --worker [number]', 'Number of dummy jobs to push-in', 1)
  .option('-r, --replicate', 'Ask for identical jobs')
  .option('-v, --verbosity [logLevel]', 'Set log level', setLogLevel, 'info')
  .parse(process.argv);
 
let replicate:boolean = <boolean>program.replicate;

let port:number = program.port ? parseInt(program.port) : 2020;
let adress:string = program.adress ? program.adress : 'localhost';
let n:number = program.worker ? parseInt(program.worker) : 1;

let jobOpt:any;

if (program.jobOpt) {
    let data:any = fs.readFileSync(program.jobOpt, 'utf8');
    jobOpt = JSON.parse(data);
}
if(program.shellScript)
    fs.statSync(program.shellScript)

let j:number = 0;

jobManagerMS.start({'port':port, 'TCPip':adress})
    .on('ready', ()=>{

        let i:number = 1;
        logger.info(`${i} \\ ${n}`);

        while(i <= n) {
            logger.warn(`Worker n${i} submission loop`);
            let optJobID = replicate ? 1 : i;
            if(!program.jobOpt)
                jobOpt = createJobOpt(optJobID); 
            if(program.shellScript)
                jobOpt.script = program.shellScript;

            let job = jobManagerMS.push(jobOpt);
            job.on('scriptError', (msg:string)=>{
                logger.error(msg);
            })
            .on('inputError', (msg:string)=>{
                logger.error(msg);
            })
            .on('completed', (stdout:any, stderr:any, jobRef:any)=>{
                j++;
                logger.info("**Job Completion callback **");
                logger.info(`${j}`);
                logger.info(`<<<(*-*)>>>`);
                let stdoutStr = '';
                stdout.on("data", (buffer:any) => {
                    logger.info('some data');
                    let part = buffer.toString(); 
                    stdoutStr += part;
                });
                stdout.on("end", () => {
                    logger.info('This is stdout :\n', stdoutStr);
                    stderr.on("end", () => {
                        logger.info('This is stderr :\n', sterrStr);
                        if(j == n) process.exit(0);
                    });
                });
    
                let sterrStr = '';
                stderr.on("data", (buffer:any) => {
                    logger.info('some data');
                    let part = buffer.toString(); 
                    sterrStr += part;
                });
                
             
             
            });
            i += 1;
        }//worker--loop
    });

/*

function createJobOpt(id?:number):{} {
    let jobProxyOpt:any = {
        'script' : '../scripts/local_test.sh',
        'inputs' : {
            'file' : '../data/file.txt',
            'file2' : '../data/file2.txt'
        },
        'exportVar' : {
            'waitingTime' : '4'
        }
    }

    if (id) 
        jobProxyOpt.exportVar['jobID'] = id;

        return jobProxyOpt;
}
*/