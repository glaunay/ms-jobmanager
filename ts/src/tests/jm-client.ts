import jobManagerMS = require('../nativeJS/job-manager-client.js');
import logger = require('../logger.js');
/*
    Prototype of a Consumer Micro Service subscribing
     to a Public JobManager Micro Service.
*/


let jobProxyOpt = {
    'script' : '../scripts/local_test.sh',
    'inputs' : {
        'file' : '../data/file.txt',
        'file2' : '../data/file2.txt'
    },
    'exportVar' : {
        'waitingTime' : '4'
    }
}

jobManagerMS.start({port:8080, TCPip:'localhost'})
    .on('ready', ()=>{
        let job = jobManagerMS.push(jobProxyOpt);
        job.on('scriptError', (msg:string)=>{
            logger.logger.error(msg);
        })
        .on('inputError', (msg:string)=>{
            logger.logger.error(msg);
        });
        job.on('completed', (stdout, stderr, jobRef)=>{
            logger.logger.info("YESSS");
            logger.logger.info(`(*-*)>>>`);
            let stdoutStr = '';
            stdout.on("data", (buffer:any) => {  let part = buffer.toString(); stdoutStr += part; });
            stdout.on("end", () => {logger.logger.info(stdoutStr);});
    
        });
    });



