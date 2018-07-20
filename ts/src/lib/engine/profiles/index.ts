/* Now that we have a profile typeguard we should consider loading profile jit */
import logger = require('winston');
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


export function defaultGetPreprocessorString (profileKey:string|undefined, profileContainer:profileInterface):string {
    let container:{} = defaultGetPreprocessorContainer(profileKey, profileContainer);
    let string:string = _preprocessorDump(container);
    string += "export JOBPROFILE=\"" + profileKey + "\"\n";
    return string;
}

export function defaultGetPreprocessorContainer(profileKey:string|undefined, profileContainer:profileInterface):{}{ 
    if (!profileKey){
        logger.warn(`profile key undefined, using "default"`);
        profileKey = "default";
    }
    else if (!profileContainer.definitions.hasOwnProperty(profileKey)) {
        logger.error(`profile key ${profileKey} unknown, using "default"`);
        profileKey = "default";
    }
    return  profileContainer.definitions[profileKey];
}

function _preprocessorDump (obj:cType.stringMap):string {
    let str = '';
    for (let k in obj)
        str += `export ${k}=${obj[k]}\n`;
    return str;
}
