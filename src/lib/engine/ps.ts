import {spawn} from 'child_process';
import events = require('events');
import tableParser = require('table-parser');

export interface  psData{
    COMMAND?: string[]
    PID     : string[];

    USER   ?: string[];
    VSZ    ?: string[];
    RSS    ?: string[];
    TT     ?: string[];
    STAT    : string[];
    STARTED?: string[];
    TIME   ?: string[];
    /*\%CPU   : string[];
    \%MEM'   : string[];*/

}




export function lookup(query?:any):events.EventEmitter {
    let emitter = new events.EventEmitter();
    /**
    * add 'lx' as default ps arguments, since the default ps output in linux like "ubuntu", wont include command arguments
    */
    query = query ? query : {};
    let exeArgs = query.psargs || ['aux'];
    //console.dir(exeArgs);
    const child = spawn('ps', [exeArgs]);
    let stdout:string = '';
    let stderr:string|null = null;

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
        } else {
            let data = _parse(stdout);
            emitter.emit('data', data);
        }

    });

    return emitter;
};

var _parse = function(rawData:any) {
    let data = tableParser.parse(rawData);
    //console.log(data);
    return data;
}

//var _kill = function( pid, signal, next ){};