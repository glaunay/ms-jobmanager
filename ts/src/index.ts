import fs = require('fs'); // file system
import uuid = require('uuid/v4');
import events = require('events');
import net = require('net');
import path = require('path');
//import date = require('date-and-time');

import logger = require('winston');

import jobLib = require('./job');

/*
export function init() {
    console.log('titi');
    let now = new Date();
    console.log(date.format(now, 'YYYY/MM/DD HH:mm:ss'));
}


let value = 0;
export function stash(x:number, uuid?:string): number {
    console.log(value + "-prev-");
    value += x;
    console.log(value + "-prev-");
    return value;
}
*/




let jobsArray : { [id:string] : jobWrapper } = {};

interface BinariesSpec {
   cancelBin : string;
   queueBin : string;
   submitBin : string;
}
interface jobWrapper {
    'obj': jobLib.jobObject,
    'status': jobStatus,
    'nCycle': number
};

type engineSpec = "slurm" | "sge" | "emulate";
type jobStatus = "CREATED" | "SUBMITTED" | "COMPLETED";

let engine = null;
let schedulerID = uuid();
export let start = function(TCPport:number=2222, engineType:engineSpec, binaries:BinariesSpec) {
    //console.log("Job Manager [" + schedulerID + "]")
    let d = new Date().toLocaleString();
    logger.info(`${d} Job Manager ${schedulerID}`);

}

function _getCurrentJobList () {
    let jobObjList:jobLib.jobObject[] = [];
    for (let key in jobsArray) {
        jobObjList.push(jobsArray[key].obj);
    }
    return jobObjList;
}