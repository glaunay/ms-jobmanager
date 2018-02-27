import fs = require('fs'); // file system
import uuid = require('uuid/v4');
import events = require('events');
import net = require('net');
import path = require('path');
import date = require('date-and-time');

import logger = require('winston');

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

interface BinariesSpec {
   cancelBin : string;
   queueBin : string;
   submitBin : string;
}

let engine = null;
let schedulerID = uuid();
export let start = function(TCPport:number=2222, engineType:string, binaries:BinariesSpec) {
    //console.log("Job Manager [" + schedulerID + "]")
    logger.info("<<Job Manager [" + schedulerID + "]")
}

