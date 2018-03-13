/* Now that we have a profile typeguard we should consider loading profile jit */

import cType = require('../../../commonTypes.js');

export interface profileInterface {
    'comments' : string;
    'definitions' : profileDefinition
}



export interface profileDefinition {
    [s:string] : cType.stringMap;
}

export function isProfile(obj: any): obj is profileInterface {
    if(typeof(obj) != 'object') return false;
    if(!obj.hasOwnProperty('comments')) return false;
    if(!obj.hasOwnProperty('definitions')) return false;

    for(let key in obj.defintions){
        if(typeof(key) != 'string') return false;
        if(!cType.isStringMap(obj[key])) return false;
    }
    return true;
}


