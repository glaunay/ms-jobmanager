"use strict";
/* Now that we have a profile typeguard we should consider loading profile jit */
Object.defineProperty(exports, "__esModule", { value: true });
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
