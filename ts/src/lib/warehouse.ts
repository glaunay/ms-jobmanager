import util = require('util');
import jobLib = require('../job.js');
import deepEqual = require('deep-equal');
import logger = require('winston');

import { stringMap } from '../commonTypes.js';

interface jobContainer { [s: string] : jobLib.jobSerialInterface; }
let processArray:jobContainer = {};

/*
 Returns list of common element bewteen a and b sets
*/
function _intersect(a:any[], b:any[]):any[] {
    // console.dir(a);
    // console.dir(b);
    let t;
    if (b.length > a.length) t = b, b = a, a = t; // indexOf to loop over shorter
    return a.filter(function (e) { // loop onto the shorter
        for (let i in b) {
            if (deepEqual(b[i], e)) return true;
        }
        return false;
    });
}

//lambda function to filterout item/warehouse elemnt

type deepKey = 'exportVar'| 'modules'| 'inputHash';
type shallowKey = 'tagTask'| 'scriptHash';
function isConstraintsOk(item:jobLib.jobSerialInterface, query:jobLib.jobSerialInterface): boolean {
    // Deep check // escaping module values check
    for ( let field of ['exportVar', 'inputHash', 'modules']) {
        let k = <deepKey>field;
        if(!query[k] && item[k]) return false;
       
        if (query[k]) {
            if (!item[k]) return false;
            if(field === 'module') continue;

            let queryIter = <stringMap>query[k];
            let itemIter = <stringMap>item[k];

            if ( Object.keys(queryIter).length !=  Object.keys(itemIter).length) return false;
            if (_intersect( Object.keys(queryIter), Object.keys(itemIter) ).length !=  Object.keys(queryIter).length) return false;
            
            for (let i in queryIter)
                if (queryIter[i] !== itemIter[i]) return false;
        }
    };

    for ( let field of ['modules']) {
        let k = <deepKey>field;
        let queryIter = <[]>query[k];
        let itemIter = <[]>item[k];
        if (queryIter.length != itemIter.length) return false;
        if (_intersect(queryIter, itemIter).length !=  queryIter.length) return false;
    }

    // Scalar/shallow check
    for ( let field in ['tagTask', 'scriptHash']) {
        let k = <shallowKey>field;
        if(!query[k] && item[k]) return false;

        if (query[k]) {
            if (!item[k]) return false;
            if (query[k] !== item[k]) return false;
        }
    };

    return true;
}

/* --  a function that look for jobs satisfying a constraints in a list --*/
export function lookup(jobAsked:jobLib.jobSerialInterface):jobLib.jobSerialInterface[]|undefined {
    let hits = Object.keys(processArray).map((k:string)=>{ return processArray[k] })
                    .filter((jobCurr:jobLib.jobSerialInterface)=>{ 
                        return isConstraintsOk(jobAsked, jobCurr);
                    });
    logger.debug("Some hits");
    if(hits.length == 0) return undefined;
    return hits;
}

export function remove(jobAsked:jobLib.jobSerialInterface):boolean {
    if (!processArray.hasOwnProperty(jobAsked.id)) {
        logger.error(`Can\'t delete following job, reason \"id not found\"\n${util.format(jobAsked)}`);
        return false;
    }
    delete(processArray[jobAsked.id]);
    return true;
}

export function add(jobAsked:jobLib.jobSerialInterface):boolean {
    if (processArray.hasOwnProperty(jobAsked.id)) {
        logger.error(`Can\'t add following job, reason \"id already in-use\"\n${util.format(jobAsked)}`);
        return false;
    }
    processArray[jobAsked.id] = jobAsked;
    return true;
}
