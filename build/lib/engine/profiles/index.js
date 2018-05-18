"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/* Now that we have a profile typeguard we should consider loading profile jit */
const logger = require("winston");
const cType = require("../../../commonTypes.js");
function isProfile(obj) {
    if (typeof (obj) != 'object')
        return false;
    if (!obj.hasOwnProperty('comments'))
        return false;
    if (!obj.hasOwnProperty('definitions'))
        return false;
    for (let key in obj.defintions) {
        if (typeof (key) != 'string')
            return false;
        if (!cType.isStringMap(obj[key]))
            return false;
    }
    return true;
}
exports.isProfile = isProfile;
function defaultGetPreprocessorString(profileKey, profileContainer) {
    let container = defaultGetPreprocessorContainer(profileKey, profileContainer);
    let string = _preprocessorDump(container);
    return string;
}
exports.defaultGetPreprocessorString = defaultGetPreprocessorString;
function defaultGetPreprocessorContainer(profileKey, profileContainer) {
    if (!profileKey) {
        logger.warn(`profile key undefined, using "default"`);
        profileKey = "default";
    }
    else if (!profileContainer.definitions.hasOwnProperty(profileKey)) {
        logger.error(`profile key ${profileKey} unknown, using "default"`);
        profileKey = "default";
    }
    return profileContainer.definitions[profileKey];
}
exports.defaultGetPreprocessorContainer = defaultGetPreprocessorContainer;
function _preprocessorDump(obj) {
    let str = '';
    for (let k in obj)
        str += `export ${k}=${obj[k]}\n`;
    return str;
}
