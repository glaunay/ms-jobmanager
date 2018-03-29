import jobManagerMS = require('../nativeJS/job-manager-client.js');
import logger = require('../logger.js');
import util = require('util');
/*
    Prototype of a Consumer Micro Service subscribing
     to a Public JobManager Micro Service.
*/




import program = require('commander');
 
program
  .version('0.1.0')
  .option('-p, --port', 'MS Job Manager port')
  .option('-a, --adress', 'MS Job Manager adress')
  .option('-n, --worker', 'Number of dummy jobs to push-in', parseInt)
  .parse(process.argv);
 
logger.logger.debug(`${util.format(program)}`);
logger.logger.debug(`${program.worker}`);
let port:number = program.port ? parseInt(program.port) : 8080;
let adress:string = program.adress ? program.adress : 'localhost';
let n:number = program.worker ? parseInt(program.worker) : 1;

jobManagerMS.start({'port':port, 'TCPip':adress})
    .on('ready', ()=>{

        let i:number = 1;
        logger.logger.info(`${i} \\ ${n}`);

        while(i <= 2/*n*/) {
            logger.logger.warn(`Worker n${i} submission loop`);
            let jobOpt:any = createJobOpt(i); 
            let job = jobManagerMS.push(jobOpt);
            job.on('scriptError', (msg:string)=>{
                logger.logger.error(msg);
            })
            .on('inputError', (msg:string)=>{
                logger.logger.error(msg);
            })
            .on('completed', (stdout, stderr, jobRef)=>{
                logger.logger.info("YESSS");
                logger.logger.info(`(*-*)>>>`);
                let stdoutStr = '';
                stdout.on("data", (buffer:any) => {
                    logger.logger.info('some data');
                    let part = buffer.toString(); 
                    stdoutStr += part;
                });
                stdout.on("end", () => {logger.logger.info('This is stdout :\n', stdoutStr);});
    
                let sterrStr = '';
                stderr.on("data", (buffer:any) => {
                    logger.logger.info('some data');
                    let part = buffer.toString(); 
                    sterrStr += part;
                });
                stderr.on("end", () => {logger.logger.info('This is stderr :\n', sterrStr);});
            });
            i += 1;
        }//worker--loop
    });



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