import logger = require('winston');
//var Loggly = require('winston-loggly').Loggly;
//var loggly_options={ subdomain: "mysubdomain", inputToken: "efake000-000d-000e-a000-xfakee000a00" }
//logger.add(Loggly, loggly_options);
//logger.add(logger.transports.File, { filename: "./logs/production.log" });
//logger.info('Chill Winston, the logs are being captured 2 ways');
//module.exports=logger;



logger.setLevels({
    debug:0,
    info: 1,
    silly:2,
    warn: 3,
    error:4,
});
logger.addColors({
    debug: 'green',
    info:  'cyan',
    silly: 'magenta',
    warn:  'yellow',
    error: 'red'
});

logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, { level: 'info', colorize:true });
logger.add(logger.transports.File, { filename: "./logs/devel.log" });


export {logger};