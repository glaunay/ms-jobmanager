"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lookup = void 0;
const child_process_1 = require("child_process");
const events = require("events");
const tableParser = require("table-parser");
function lookup(query) {
    let emitter = new events.EventEmitter();
    /**
    * add 'lx' as default ps arguments, since the default ps output in linux like "ubuntu", wont include command arguments
    */
    query = query ? query : {};
    let exeArgs = query.psargs || ['aux'];
    //console.dir(exeArgs);
    const child = child_process_1.spawn('ps', [exeArgs]);
    let stdout = '';
    let stderr = null;
    child.stdout.on('data', function (data) {
        stdout += data.toString();
    });
    child.stderr.on('data', function (data) {
        if (stderr === null) {
            stderr = data.toString();
        }
        else {
            stderr += data.toString();
        }
    });
    child.on('exit', function () {
        if (stderr) {
            emitter.emit('psError', stderr);
        }
        else {
            let data = _parse(stdout);
            emitter.emit('data', data);
        }
    });
    return emitter;
}
exports.lookup = lookup;
;
var _parse = function (rawData) {
    let data = tableParser.parse(rawData);
    //console.log(data);
    return data;
};
//var _kill = function( pid, signal, next ){};
