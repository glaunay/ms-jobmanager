"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger = require("winston");
exports.logger = logger;
//var Loggly = require('winston-loggly').Loggly;
//var loggly_options={ subdomain: "mysubdomain", inputToken: "efake000-000d-000e-a000-xfakee000a00" }
//logger.add(Loggly, loggly_options);
//logger.add(logger.transports.File, { filename: "./logs/production.log" });
//logger.info('Chill Winston, the logs are being captured 2 ways');
//module.exports=logger;
logger.setLevels({
    error: 0,
    warn: 1,
    info: 2,
    verbose: 3,
    debug: 4,
    silly: 5
});
logger.addColors({
    debug: 'green',
    info: 'cyan',
    verbose: 'gray',
    silly: 'magenta',
    warn: 'yellow',
    error: 'red'
});
logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, { level: 'info', colorize: true });
logger.add(logger.transports.File, { filename: "./logs/devel.log" });
function isLogLvl(value) {
    return value === 'debug' || value === 'info' || value === 'verbose' || value === 'silly'
        || value === 'warn' || value === 'error';
}
function setLogLevel(value) {
    if (!isLogLvl(value))
        throw `Unrecognized logLvel "${value}"`;
    logger.level = value;
}
exports.setLogLevel = setLogLevel;
