"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/*
    Managing the jobManager Core jobs Object References
*/
const deepEqual = require("deep-equal");
const util = require("util");
//import {lookup as liveLookup, add as liveStore, remove as liveDel} from "./warehouse.js";
const logger_js_1 = require("../logger.js");
function isJobStatus(type) {
    return type == "CREATED" || type == "SUBMITTED" || type == "COMPLETED" || type == "START" || type == "FINISHED";
}
exports.isJobStatus = isJobStatus;
function isShimOrStatus(type) {
    return type == "CREATED" || type == "SUBMITTED" || type == "COMPLETED" || type == "START" || type == "FINISHED" || type == "source" || type == "bound";
}
exports.isShimOrStatus = isShimOrStatus;
;
let jobsArray = {};
function size(opt) {
    let c = 0;
    if (!opt) {
        for (let w of wrapperIter())
            c++;
    }
    else if (opt === 'source') {
        for (let w of sourceWrapperIter())
            c++;
    }
    else if (opt === 'notBound') {
        for (let w of notBoundWrapperIter())
            c++;
    }
    return c;
}
exports.size = size;
/*  We should follow shimmerings */
function removeJob(query) {
    logger_js_1.logger.debug(`Trying to remove ${query}`);
    let queryID = coherceToID(query);
    if (!queryID)
        return false;
    let jobToDel = getJob(query);
    if (!jobToDel) {
        logger_js_1.logger.debug(`No job in memory for job selector ${query}`);
        return false;
    }
    logger_js_1.logger.debug(`Removing ${util.format(jobToDel)}\n
==>[${jobToDel.hasShimmerings.length} shimmerings to delete]`);
    jobToDel.hasShimmerings.forEach((shimerJob) => { removeJob({ jobObject: shimerJob }); });
    delete jobsArray[queryID];
    logger_js_1.logger.debug("Removing successfully");
    return true;
}
exports.removeJob = removeJob;
function addJob(newJob) {
    let nWrapper = {
        'obj': newJob,
        'status': 'CREATED',
        'nCycle': 0,
        'sType': undefined
    };
    jobsArray[newJob.id] = nWrapper;
    logger_js_1.logger.debug("Adding successfully");
}
exports.addJob = addJob;
function setCycle(query, n) {
    let w = getJobWrapper(query);
    if (!w) {
        logger_js_1.logger.error('Cant set cycle');
        return false;
    }
    if (typeof (n) == "number")
        w.nCycle = n;
    else if (n === '++')
        w.nCycle += 1;
    else {
        logger_js_1.logger.error('Cant set cycle with that \"${util.format(n)}\"');
        return false;
    }
    return true;
}
exports.setCycle = setCycle;
function getCycle(query) {
    let w = getJobWrapper(query);
    if (!w) {
        logger_js_1.logger.error('Cant get cycle');
        return undefined;
    }
    return w.nCycle;
}
exports.getCycle = getCycle;
function getJobWrapper(query) {
    let queryID = coherceToID(query);
    if (!queryID)
        return undefined;
    if (jobsArray.hasOwnProperty(queryID))
        return jobsArray[queryID];
    logger_js_1.logger.error(`id \"${queryID}\" not found in current jobs pool:\n
${asString()}`);
    return undefined;
}
function getJob(query) {
    let jobWrapper = getJobWrapper(query);
    if (jobWrapper)
        return jobWrapper.obj;
    return undefined;
}
exports.getJob = getJob;
function getJobStatus(query) {
    let jobWrapper = getJobWrapper(query);
    if (jobWrapper)
        return jobWrapper.status;
    return undefined;
}
exports.getJobStatus = getJobStatus;
function* startedJobiterator() {
    for (let w of sourceWrapperIter()) {
        if (w.status !== "CREATED")
            yield w.obj;
    }
}
exports.startedJobiterator = startedJobiterator;
function asString() {
    return Object.keys(jobsArray).map((jid) => {
        let j = getJob({ 'jid': jid });
        return `${util.format(j.toJSON())}`;
    }).join('\n');
}
exports.asString = asString;
function jobSet(status, query) {
    let jobWrapper = getJobWrapper(query);
    if (!jobWrapper)
        return false;
    if (!isShimOrStatus(status)) {
        logger_js_1.logger.error(`unrecognized status to set \"${status}\"`);
        return false;
    }
    if (isJobStatus(status))
        jobWrapper.status = status;
    else // its a shim
        jobWrapper.sType = status;
    return true;
}
exports.jobSet = jobSet;
/* low-level iterators */
function* wrapperIter() {
    for (let j in jobsArray) {
        yield jobsArray[j];
    }
}
function* sourceWrapperIter() {
    for (let _w of wrapperIter()) {
        let w = _w;
        if (w.sType)
            if (w.sType == 'source')
                yield w;
    }
}
// To count the number of job that are source or yet to be set
function* notBoundWrapperIter() {
    //logger.info("notBoundWrapperIter");
    for (let _w of wrapperIter()) {
        let w = _w;
        if (!w.sType)
            yield w;
        else if (w.sType == 'source')
            yield w;
    }
}
function* sourceJobIter() {
    for (let w of sourceWrapperIter())
        yield w.obj;
}
function coherceToID(query) {
    if ('jid' in query)
        return query.jid;
    if ('jobSerial' in query)
        return query.jobSerial.id;
    if ('jobObject' in query)
        return query.jobObject.id;
    logger_js_1.logger.error(`can\'t coherce that ${util.format(query)}`);
    return undefined;
}
/*  job resurrection source search
    Operation are performed on a subset of jobsArray element, the ones that are wrapped with the "source" sType

*/
/*
 Returns list of common element bewteen a and b sets
*/
function _intersect(a, b) {
    // console.dir(a);
    // console.dir(b);
    let t;
    if (b.length > a.length)
        t = b, b = a, a = t; // indexOf to loop over shorter
    return a.filter(function (e) {
        for (let i in b) {
            if (deepEqual(b[i], e))
                return true;
        }
        return false;
    });
}
function isConstraintsOk(item, query) {
    // Deep check // escaping module values check
    for (let field of ['exportVar', 'inputHash', 'modules']) {
        let k = field;
        if (!query[k] && item[k])
            return false;
        if (query[k]) {
            if (!item[k])
                return false;
            if (field === 'module')
                continue;
            let queryIter = query[k];
            let itemIter = item[k];
            if (Object.keys(queryIter).length != Object.keys(itemIter).length)
                return false;
            if (_intersect(Object.keys(queryIter), Object.keys(itemIter)).length != Object.keys(queryIter).length)
                return false;
            for (let i in queryIter)
                if (queryIter[i] !== itemIter[i])
                    return false;
        }
    }
    ;
    for (let field of ['modules']) {
        let k = field;
        let queryIter = query[k];
        let itemIter = item[k];
        if (queryIter.length != itemIter.length)
            return false;
        if (_intersect(queryIter, itemIter).length != queryIter.length)
            return false;
    }
    // Scalar/shallow check
    for (let field in ['tagTask', 'scriptHash']) {
        let k = field;
        if (!query[k] && item[k])
            return false;
        if (query[k]) {
            if (!item[k])
                return false;
            if (query[k] !== item[k])
                return false;
        }
    }
    ;
    return true;
}
/* --  a function that look for jobs satisfying a constraints in a list --*/
function lookup(jobAsked) {
    let hits = [];
    let query = jobAsked.getSerialIdentity();
    for (let job of sourceJobIter()) {
        let item = job.getSerialIdentity();
        if (isConstraintsOk(query, item))
            hits.push(job);
    }
    logger_js_1.logger.debug(`Found ${hits.length} hits`);
    if (hits.length == 0)
        return undefined;
    return hits;
}
exports.lookup = lookup;
