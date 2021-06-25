import {logger} from './logger.js';
import { mkdirSync, existsSync} from 'fs'; // file system


 export function create(forceCache:string|undefined, baseCacheDir: string, scheduler_id : string):string {
 // cacheDir managment
    const cacheDir = forceCache ? baseCacheDir :  `${baseCacheDir}/${scheduler_id}`;
    if(forceCache) {
        logger.info("Checking force cache access");
        if (!existsSync(cacheDir) ) {
            logger.console.error(`cacheDir ${cacheDir} is invalid path`);
            throw('cacheDir error');
        }
    } else {
        logger.debug("Attempting to create cache for process at " + cacheDir);
        try {
            mkdirSync(cacheDir);
        } catch (e) {
            if (e.code != 'EEXIST') { 
                logger.error(`Can't create cache folder reason:\n${e}}`);
                throw e;
            }
            logger.error("Cache found already found at " + cacheDir);
        }
    }
    return cacheDir;
}