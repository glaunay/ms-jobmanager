import jm = require('../index.js');
import logger = require('../logger.js');

//let x = jm.jobManager;
logger.logger.info("TEST");

let binLitt = {
    cancelBin : "titi",
    queueBin : "toto",
    submitBin : "tata"
};
jm.start(200, "slurm", binLitt);

logger.logger.debug("FIN");