import events = require('events');
import path = require('path');
import util = require('util');
import childP = require('child_process');
import {logger} from '../../logger.js';

//import engineInterface} from 'index.js';
import engineLib = require('./index.js');
import cType = require('../../commonTypes.js');
import {profileInterface, isProfile} from './profiles/index.js';

import profiles from './profiles/slurm.js'

import {defaultGetPreprocessorContainer as getPreprocessor} from './profiles/index.js';

let localProfiles:profileInterface = profiles;
type squeueField = 'id'|'partition'|'nameUUID'|'status';
type squeueData = { [K in squeueField ] : string[]; };


let preprocessorMapper:engineLib.preprocessorMapperType = {
    nNodes: function(v:string):string {
        return "#SBATCH -N " + v + " # Number of nodes, aka number of worker \n"
    },
    nCores: function(v:string):string {
        return "#SBATCH -n " + v + " # number of task, ie core\n"
    },
    tWall: function(v:string):string {
        return "SBATCH -t " + v + " # Runtime in D-HH:MM\n";
    },
    partition: function(v:string):string {
        return "#SBATCH -p " + v + " # Partition to submit to\n";
    },
    qos: function(v:any):string {
        return "#SBATCH --qos " + v + " # Partition to submit to\n";
    },
    gid: function(v:any):string {
        return "#SBATCH --gid " + v + "\n";
    },
    uid: function(v:any):string {
        return "#SBATCH --uid " + v + "\n";
    }/*,
    gres: function(v) {
        return "#SBATCH --gres=" + jobObject.gres + "\n";
    }*/
};



export class slurmEngine implements engineLib.engineInterface {
    // Typeguard this w/ setters and path/Exec check
    submitBin:string = '/opt/slurm/bin/sbatch'; 
    cancelBin:string = '/opt/slurm/bin/scancel';
    queueBin:string  = '/opt/slurm/bin/squeue';
    specs:engineLib.engineSpecs='slurm';
    
    constructor(engineBinaries:engineLib.BinariesSpec|undefined){
        if (engineBinaries){
            this.submitBin = engineBinaries.submitBin
            this.queueBin = engineBinaries.queueBin
            this.cancelBin = engineBinaries.cancelBin
        }
        
    }
    generateHeader (jobID:string, jobProfileKey:string|undefined, workDir:string):string {
        let processorType:{} = getPreprocessor(jobProfileKey, profiles);
        logger.debug(`preprocesor container:\n${util.format(processorType)}`);
        return _preprocessorDump(jobID, processorType);
    }
    list ():events.EventEmitter {
        let emitter = _squeue(this,'');

        /*

        let regex = /\.batch$/;
        
        emitter.emit('data', results);*/

        return emitter;
    }


/*
'cleanExit', noArgs :  all pending jobs were killed
                'leftExit', {Int} nJobs:  number of job left pending");
                'emptyExit', noArgs : No job were to be killed
                'cancelError', {String} message : An error occured during job cancelation
                'listError', {String} message : An error occured during joblisting"
*/
    kill(jobList:engineLib.jobObject[]) {
        var emitter = new events.EventEmitter();

        var targetJobID = jobList.map(function(jobObj) {
            return jobObj.id;
        })
        logger.debug("Potential pending target job ids are:");
        logger.debug(`${util.format(targetJobID)}`);
    
        let targetProcess:number[] = [];
        let self = this;
        _squeue(this)
            .on('listError', function(err) {
                emitter.emit('listError', err);
            })
            .on('data', function(squeueLookupDict) {
                squeueLookupDict.nameUUID.forEach(function(uuid:string, i:any) {
                    if (targetJobID.indexOf(uuid) >= 0)
                        targetProcess.push(squeueLookupDict.id[i]);
                });
                _kill(self, targetProcess, emitter);
            });
    
        return emitter;
    }
    testCommand(){
        return 'sleep 10; echo "this is a dummy command"';
    }
}



function _preprocessorDump (id:string, preprocessorOpt:cType.stringMap):string {
    let string = "#SBATCH -J " + id + "\n";
    string += "#SBATCH -o " + id + ".out\n";
    string += "#SBATCH -e " + id + ".err\n";
    for (let opt in preprocessorOpt) {
        if (!preprocessorMapper.hasOwnProperty(opt)) {
            logger.warn("\"" + opt + "\" is not known profile parameters\"");
            continue;
        }
        let value:string = preprocessorOpt[opt];
        let s:any = preprocessorMapper[opt](value);
        string += s;
    }

    if (preprocessorOpt.hasOwnProperty("qos")) {
        if (["ws-dev", "gpu", "ws-prod"].includes(preprocessorOpt.qos))
            string += "source /etc/profile.d/modules_cluster.sh\n";
        string += "source /etc/profile.d/modules.sh\n";
    }


    /*
    var nNodes = jobObject.hasOwnProperty('nNodes') ? jobObject.nNodes ? jobObject.nNodes : 1 : 1;
    string += "#SBATCH -N " + nNodes + " # Number of nodes, aka number of worker \n"
    var nCores = jobObject.hasOwnProperty('nCores') ? jobObject.nCores ? jobObject.nCores : 1 : 1;
    string += "#SBATCH -n " + nCores + " # number of task, ie core\n"

    var tWall = jobObject.hasOwnProperty('tWall') ? jobObject.tWall ? jobObject.tWall : '0-00:05' : '0-00:05';
    string += "#SBATCH -t " + tWall + " # Runtime in D-HH:MM\n";
    var qos = jobObject.hasOwnProperty('qos') ? jobObject.qos : 'mobi-express';
    var partition = jobObject.hasOwnProperty('partition') ? jobObject.partition : 'mobi-express';
    string += "#SBATCH -p " + partition + " # Partition to submit to\n" + "#SBATCH --qos " + qos + " # Partition to submit to\n";

    if (jobObject.hasOwnProperty('gid')) {
        string += "#SBATCH --gid " + jobObject.gid + "\n";
    }
    if (jobObject.hasOwnProperty('uid')) {
        string += "#SBATCH --uid " + jobObject.uid + "\n";
    }
    if (jobObject.gres != null) {
        string += "#SBATCH --gres=" + jobObject.gres + "\n";
    }
*/


    // NEW to load the modules
    return string;
}

function _kill(engine:slurmEngine, processIDs:number[], emitter:events.EventEmitter) {
    let exec_cmd = childP.exec;
    if (processIDs.length == 0) {
        emitter.emit('emptyExit');
        return;
    }
    exec_cmd(engine.cancelBin + ' ' + processIDs.join(' '), function(err, stdout, stderr) {
        if (err) {
            emitter.emit('cancelError', err);
            return;
        }
        //final recount
        setTimeout(function() {
            _squeue(engine).on('data', function(squeueLookupDict:squeueData) {
                var nLeft = 0;
                squeueLookupDict.id.forEach(function(pid:string, i:number) {
                    if (processIDs.indexOf( parseInt(pid)) >= 0)
                        nLeft++;
                });
                if (nLeft == 0)
                    emitter.emit('cleanExit');
                else
                    emitter.emit('leftExit', nLeft);

            });
        }, 2000);
    });
}
/*
 * Realize an asynchronous squeue command on slurm according a parameter (or not).
 * Data are formated into a literal.
 * @paramSqueue {string} optional. For example : ' -o "%j %i" ' // not implemented yet
 */
function _squeue(engine:slurmEngine, paramSqueue:string=''):events.EventEmitter {
   // if (!paramSqueue) paramSqueue = '';
    //paramSqueue = ''; // to remove when it will be take into account in the implementation
    let emitter = new events.EventEmitter();
    let squeueRes_dict:squeueData = {
        'id': [],
        'partition': [],
        'nameUUID': [],
        'status': []
    }

    // squeue command
    let exec_cmd =  childP.exec;
    exec_cmd(engine.queueBin + '  -o \"\%i \%P \%j \%t\" ' + paramSqueue, function(err, stdout, stderr) {
        if (err) {
            emitter.emit('listError', err);
            return;
        }
        let squeueRes_str = ('' + stdout).replace(/\"/g, ''); // squeue results

        //logger.debug(squeueRes_str);
        
        squeueRes_str.split('\n')
            .filter(function(jobArray, i) {
                return jobArray.length > 0 && i > 0;
            })
            .map(function(jobLine, i) { // for each job
                return jobLine.split(' ').filter(function(val) {
                    return val != ''; // keep values that are not empty
                });
            })
            .map(function(jobArray, i) { // save each field in the corresponding array of dict
                squeueRes_dict['id'].push(jobArray[0]); // job ID gived by slurm
                squeueRes_dict['partition'].push(jobArray[1]); // gpu, cpu, etc.
                squeueRes_dict['nameUUID'].push(jobArray[2]); // unique job ID gived by Nslurm (uuid)
                squeueRes_dict['status'].push(jobArray[3]); // P, R, CF, CG, etc.
            });
        emitter.emit('data', squeueRes_dict);
    });
    return emitter;
}
