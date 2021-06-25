import path = require('path');
import {logger} from './logger.js';

import engineLib = require('./lib/engine/index.js');
import util = require('util');

export interface jobManagerSpecs {
    cacheDir : string,
    tcp : string,
    port : number,
    nWorker?:number,
    cycleLength? : string,
    forceCache? : string,
    engineSpec : engineLib.engineSpecs,
    microServicePort?:number;
    warehouseAddress?: string,
    warehousePort?: number,
    warehouseTest?: boolean,
    engineBinaries? : engineLib.BinariesSpec
}

export function isSpecs(opt: any): opt is jobManagerSpecs {
    if(!path.isAbsolute(opt.cacheDir)) {
        logger.error('cacheDir parameter must be an absolute path');
        return false;
    }

    if (opt.engineBinaries) {
        logger.debug("Testing specified engineBinaries")
        if (!engineLib.isBinariesSpec(opt.engineBinaries)) {
            logger.error(`Wrong binariesSpec\n ${util.inspect(opt.engineBinaries)}`)
            return false;
        }
    }

    if ('cacheDir' in opt && 'tcp' in opt && 'port' in opt && 'engineSpec' in opt){
        return typeof(opt.cacheDir) == 'string' && typeof(opt.tcp) == 'string' &&
               typeof(opt.port) == 'number' && engineLib.isEngineSpec(opt.engineSpec);
    }
        
    return false;
}