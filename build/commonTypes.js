"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isStreamOrStringMap = exports.isStreamMap = exports.isStringMapOpt = exports.isStringMap = void 0;
const isStream = require("is-stream");
function isStringMap(obj) {
    if (typeof (obj) != 'object')
        return false;
    for (let key in obj) {
        if (typeof (key) != 'string')
            return false;
        if (typeof (obj[key]) != 'string')
            return false;
    }
    return true;
}
exports.isStringMap = isStringMap;
function isStringMapOpt(obj) {
    if (typeof (obj) != 'object')
        return false;
    for (let key in obj)
        if (typeof (key) != 'string')
            return false;
    return true;
}
exports.isStringMapOpt = isStringMapOpt;
function isStreamMap(obj) {
    if (typeof (obj) != 'object')
        return false;
    for (let key in obj) {
        if (typeof (key) != 'string')
            return false;
        if (!isStream(obj[key]))
            return false;
    }
    return true;
}
exports.isStreamMap = isStreamMap;
function isStreamOrStringMap(obj) {
    if (typeof (obj) != 'object')
        return false;
    for (let key in obj) {
        if (typeof (key) != 'string')
            return false;
        if (!isStream(obj[key]) && typeof (obj[key]) != 'string')
            return false;
    }
    return true;
}
exports.isStreamOrStringMap = isStreamOrStringMap;
