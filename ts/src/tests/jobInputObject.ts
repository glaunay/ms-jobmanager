import jobLib = require('../job.js');
import logger = require('../logger.js');
import util = require('util');
/*
    Prototype of a micro service subscribing to the jobManager Microservice.

*/

logger.logger.info('Starting jobInput test');

let jobProxyOpt = {
    'script' : '../scripts/local_test.sh',
    'inputs' : {
        'file' : '../../data/file.txt',
        'file2' : '../../data/file2.txt'/*,
        'file3' : 'Qui ne saute pas n\'est pas Lyonnais!!'*/
    }
}

let jobInput = new jobLib.jobInputs(jobProxyOpt.inputs);
//logger.logger.info(`${util.format(jobInput)}`);

let d = jobInput.hash(); // Impossible file not written yet
if(d)
    logger.logger.info(`${util.format(d)}`);

jobInput.write('../../testCache/JI')
    .on('OK', (values)=>{
        /*logger.logger.info(`${util.format(values)}`)
        logger.logger.info(`${util.format(jobInput)}`);*/
        let d = jobInput.hash(); //-> works
        if(d)
            logger.logger.info(`${util.format(d)}`);
    });
    