import libStream = require("stream");
import isStream = require('is-stream');

/*
    Usual basic container type interface and predicates
*/

export interface stringMap { [s: string] : string; }
export function isStringMap(obj: any): obj is stringMap {
    if(typeof(obj) != 'object') return false;

    for(let key in obj){
        if(typeof(key) != 'string') return false;

        if(typeof(obj[key]) != 'string') return false;
    }
    return true;
}


export interface stringMapOpt { [s: string] : string|undefined; }
export function isStringMapOpt(obj: any): obj is stringMapOpt {
    if(typeof(obj) != 'object') return false;
    for(let key in obj)
        if(typeof(key) != 'string') return false;
    return true;
}




export interface streamMap { [s: string] : libStream.Readable; }
export function isStreamMap(obj: any): obj is streamMap {
    if(typeof(obj) != 'object') return false;
    for(let key in obj) {
        if(typeof(key) != 'string') return false;
        if(!isStream(obj[key])) return false;
    }
    return true;
}

export interface streamOrStringMap { [s: string] : libStream.Readable|string; }
export function isStreamOrStringMap(obj: any): obj is streamOrStringMap {
    if(typeof(obj) != 'object') return false;
    for(let key in obj) {
        if(typeof(key) != 'string') return false;
        if(!isStream(obj[key]) && typeof(obj[key]) != 'string') return false;
    }
    return true;
}