import cType = require('./commonTypes.js');
import libStream = require("stream");




export interface readStreamMap { [s: string] :libStream.Readable }
export interface writeStreamMap { [s: string] :libStream.Writable }

export interface streamMapRead {
        script : libStream.Readable;
        inputs : readStreamMap;
    }


export interface streamMapWrite {
        script : libStream.Writable;
        inputs : writeStreamMap;
    }