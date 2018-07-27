"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jobManagerMS = require("../nativeJS/job-manager-client.js");
const testTools_1 = require("./testTools");
const logger_js_1 = require("../logger.js");
let fs = require('fs');
/*
    Prototype of a Consumer Micro Service subscribing
     to a Public JobManager Micro Service.
*/
const program = require("commander");
program
    .version('0.1.0')
    .option('-p, --port [port number]', 'MS Job Manager port', 2020)
    .option('-a, --adress [IP adress]', 'MS Job Manager adress', 'localhost')
    .option('-j, --jobOpt [path to JSON file], A job Option specs')
    .option('-s, --shellScript [path to bash script], A bash script to execute')
    .option('-n, --worker [number]', 'Number of dummy jobs to push-in', 1)
    .option('-r, --replicate', 'Ask for identical jobs')
    .option('-v, --verbosity [logLevel]', 'Set log level', logger_js_1.setLogLevel, 'info')
    .parse(process.argv);
let replicate = program.replicate;
let port = program.port ? parseInt(program.port) : 2020;
let adress = program.adress ? program.adress : 'localhost';
let n = program.worker ? parseInt(program.worker) : 1;
let jobOpt;
if (program.jobOpt) {
    let data = fs.readFileSync(program.jobOpt, 'utf8');
    jobOpt = JSON.parse(data);
}
if (program.shellScript)
    fs.statSync(program.shellScript);
let j = 0;
jobManagerMS.start({ 'port': port, 'TCPip': adress })
    .on('ready', () => {
    let i = 1;
    logger_js_1.logger.info(`${i} \\ ${n}`);
    while (i <= n) {
        logger_js_1.logger.warn(`Worker n${i} submission loop`);
        let optJobID = replicate ? 1 : i;
        if (!program.jobOpt)
            jobOpt = testTools_1.createJobOpt(optJobID);
        if (program.shellScript)
            jobOpt.script = program.shellScript;
        let job = jobManagerMS.push(jobOpt);
        job.on('scriptError', (msg) => {
            logger_js_1.logger.error(msg);
        })
            .on('inputError', (msg) => {
            logger_js_1.logger.error(msg);
        })
            .on('completed', (stdout, stderr, jobRef) => {
            j++;
            logger_js_1.logger.info("**Job Completion callback **");
            logger_js_1.logger.info(`${j}`);
            logger_js_1.logger.info(`<<<(*-*)>>>`);
            let stdoutStr = '';
            stdout.on("data", (buffer) => {
                logger_js_1.logger.info('some data');
                let part = buffer.toString();
                stdoutStr += part;
            });
            stdout.on("end", () => {
                logger_js_1.logger.info('This is stdout :\n', stdoutStr);
                stderr.on("end", () => {
                    logger_js_1.logger.info('This is stderr :\n', sterrStr);
                    if (j == n)
                        process.exit(0);
                });
            });
            let sterrStr = '';
            stderr.on("data", (buffer) => {
                logger_js_1.logger.info('some data');
                let part = buffer.toString();
                sterrStr += part;
            });
        });
        i += 1;
    } //worker--loop
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
