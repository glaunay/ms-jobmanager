import jobManagerCore = require('../index.js');
import logger = require('../logger.js');

//let x = jm.jobManager;
logger.logger.info("TEST");

let binLitt = {
    cancelBin : "titi",
    queueBin : "toto",
    submitBin : "tata"
};
let dummyParameters = {
    cacheDir : '/Users/guillaumelaunay/work/DVL/ms-jobmanager/testCache',
    engineSpec : "emulate" as jobManagerCore.engineSpecs,
    tcp : '127.0.0.1',
    port : 2222
};

jobManagerCore.start(dummyParameters).on('ready', () => {


    let dummyJobOpt = {
        'script' : __dirname + '/../scripts/local_test.sh'
    };
    let job:any = jobManagerCore.push("default", dummyJobOpt);

    job.on("completed", (stdout:any, stderr:any, jObj:any) => {
        logger.logger.info(`(*-*)>>>`);
        let stdoutStr = '';
        stdout.on("data", (buffer:any) => {  let part = buffer.toString(); stdoutStr += part; });
        stdout.on("end", () => {logger.logger.info(stdoutStr);});
    });

    }).on('startupError', (msg) => {
         logger.logger.error(msg);
         process.exit(1);
    });

