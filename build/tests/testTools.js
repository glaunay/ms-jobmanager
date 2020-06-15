"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.performDummyPush = exports.createJobOpt = exports.selfTest = void 0;
const logger = require("winston");
const figures = require("figures");
function selfTest(jm, n) {
    selfSubmissionTest(jm, n)
        .then((jobObjArray) => {
        logger.info(`${figures.tick} Submission test successfull`);
        selfKillTest(jm, n).then((jobObjArray) => {
            logger.info(`${figures.tick} Killing test successfull`);
        }).catch((e) => {
            logger.error(`${figures.cross} Killing test not completed`);
            process.exit();
        });
    }).catch((e) => {
        logger.error(`${figures.cross} Submission test not completed`);
        process.exit();
    });
}
exports.selfTest = selfTest;
/* Sequential testing w/ synchronous pushes */
function selfSubmissionTest(jm, n, ttl) {
    /*
        const logUpdate = require('log-update');
    const frames = ['-', '\\', '|', '/'];
    let _i = 0;
     
    setInterval(() => {
        const frame = frames[_i = ++_i % frames.length];
     
        logUpdate(
    `
            ♥♥
       ${frame} unicorns ${frame}
            ♥♥
    `
        );
    }, 80);
    */
    let i = 1;
    let jArray = [];
    let ttlBool = typeof ttl !== 'undefined';
    if (!ttlBool)
        logger.info(`${figures.warning} Starting submission test`);
    let jobPromises = [];
    while (i <= n) {
        let jobOpt = createJobOpt(i);
        if (ttlBool)
            jobOpt.ttl = ttl;
        jobPromises.push(performDummyPush(jm, jobOpt, ttl /*ttlBool*/));
        i++;
    }
    return Promise.all(jobPromises);
}
function selfKillTest(jm, n) {
    logger.info(`${figures.warning} Starting kill test`);
    let ttl = 2;
    return selfSubmissionTest(jm, n, ttl);
}
/*
A function to create a suitable jobOpt container to perform sequential push test
*/
function createJobOpt(id) {
    let sleepTime = (Math.floor(Math.random() * 3) + 1) * 5;
    let jobProxyOpt = {
        'script': '../scripts/local_test.sh',
        'ttl': undefined,
        'inputs': {
            'file': '../data/file.txt',
            'file2': '../data/file2.txt'
        },
        'exportVar': {
            'waitingTime': sleepTime
        }
    };
    if (id)
        jobProxyOpt.exportVar['jobID'] = id;
    return jobProxyOpt;
}
exports.createJobOpt = createJobOpt;
/**/
function performDummyPush(jm, jobObpt, killTime, jobProfile = 'default') {
    let ttlBool = typeof killTime !== 'undefined';
    if (ttlBool)
        jobObpt.exportVar.waitingTime += killTime;
    //let jobProfile:string = 'default';
    let p = new Promise((resolve, reject) => {
        let j = jm.push(jobProfile, jobObpt);
        j.on('completed', (stdout, stderr) => {
            logger.silly("**Job Completion callback **");
            logger.silly(`<<<(*-*)>>>`);
            let stdoutStr = '';
            stdout.on("data", (buffer) => {
                logger.silly('some data');
                let part = buffer.toString();
                stdoutStr += part;
            });
            stdout.on("end", () => { logger.silly('This is stdout :\n', stdoutStr); });
            let sterrStr = '';
            stderr.on("data", (buffer) => {
                logger.silly('some data');
                let part = buffer.toString();
                sterrStr += part;
            });
            stderr.on("end", () => { logger.silly('This is stderr :\n', sterrStr); });
            resolve(j);
            // reject on specify event
        })
            .on('killed', () => { if (ttlBool)
            resolve(j); });
    });
    return p;
}
exports.performDummyPush = performDummyPush;
