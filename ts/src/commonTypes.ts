import libStream = require("stream");


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



