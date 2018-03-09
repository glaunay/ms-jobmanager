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
    cacheDir : './testCache',
    engineSpec : "emulate" as jobManagerCore.engineSpecs,
    tcp : '127.0.0.1',
    port : 2222
  /*  tcp : ,
    port : number,
   // jobProfiles : any, // Need to work on that type
    cycleLength? : string,
    forceCache? : string,
    engineSpec : engineSpec*/
};
jobManagerCore.start(dummyParameters);

logger.logger.debug("FIN");