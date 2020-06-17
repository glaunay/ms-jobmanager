"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slurmEngine = void 0;
const events = require("events");
const util = require("util");
const childP = require("child_process");
const logger_js_1 = require("../../logger.js");
const slurm_js_1 = require("./profiles/slurm.js");
const index_js_1 = require("./profiles/index.js");
let localProfiles = slurm_js_1.profiles;
let preprocessorMapper = {
    nNodes: function (v) {
        return "#SBATCH -N " + v + " # Number of nodes, aka number of worker \n";
    },
    nCores: function (v) {
        return "#SBATCH -n " + v + " # number of task, ie core\n";
    },
    tWall: function (v) {
        return "SBATCH -t " + v + " # Runtime in D-HH:MM\n";
    },
    partition: function (v) {
        return "#SBATCH -p " + v + " # Partition to submit to\n";
    },
    qos: function (v) {
        return "#SBATCH --qos " + v + " # Partition to submit to\n";
    },
    gid: function (v) {
        return "#SBATCH --gid " + v + "\n";
    },
    uid: function (v) {
        return "#SBATCH --uid " + v + "\n";
    } /*,
    gres: function(v) {
        return "#SBATCH --gres=" + jobObject.gres + "\n";
    }*/
};
class slurmEngine {
    constructor(engineBinaries) {
        // Typeguard this w/ setters and path/Exec check
        this.submitBin = '/opt/slurm/bin/sbatch';
        this.cancelBin = '/opt/slurm/bin/scancel';
        this.queueBin = '/opt/slurm/bin/squeue';
        this.specs = 'slurm';
        if (engineBinaries) {
            this.submitBin = engineBinaries.submitBin;
            this.queueBin = engineBinaries.queueBin;
            this.cancelBin = engineBinaries.cancelBin;
        }
    }
    setSysProfile(sysKeyProfile) {
        if (!slurm_js_1.engineSys.definitions.hasOwnProperty(sysKeyProfile)) {
            logger_js_1.logger.error(`No such sysProfile {sysKeyProfile}`);
            return;
        }
        const sysSettings = slurm_js_1.engineSys.definitions;
        this.submitBin = sysSettings[sysKeyProfile].binaries.submitBin;
        this.queueBin = sysSettings[sysKeyProfile].binaries.queueBin;
        this.cancelBin = sysSettings[sysKeyProfile].binaries.cancelBin;
        if (sysSettings[sysKeyProfile].hasOwnProperty('iCache')) {
            this.iCache = sysSettings[sysKeyProfile].iCache;
        }
    }
    generateHeader(jobID, jobProfileKey) {
        let processorType = index_js_1.defaultGetPreprocessorContainer(jobProfileKey, slurm_js_1.profiles);
        logger_js_1.logger.debug(`preprocesor container:\n${util.format(processorType)}`);
        return _preprocessorDump(jobID, processorType);
    }
    list() {
        let emitter = _squeue(this, '');
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
    kill(jobList, overrideBinary) {
        var emitter = new events.EventEmitter();
        var targetJobID = jobList.map(function (jobObj) {
            return jobObj.id;
        });
        logger_js_1.logger.debug("Potential pending target job ids are:");
        logger_js_1.logger.debug(`${util.format(targetJobID)}`);
        let targetProcess = [];
        let self = this;
        _squeue(this)
            .on('listError', function (err) {
            emitter.emit('listError', err);
        })
            .on('data', function (squeueLookupDict) {
            squeueLookupDict.nameUUID.forEach(function (uuid, i) {
                if (targetJobID.indexOf(uuid) >= 0)
                    targetProcess.push(squeueLookupDict.id[i]);
            });
            _kill(self, targetProcess, emitter, overrideBinary);
        });
        return emitter;
    }
    testCommand() {
        return 'sleep 10; echo "this is a dummy command"';
    }
}
exports.slurmEngine = slurmEngine;
function _preprocessorDump(id, preprocessorOpt) {
    let string = "#SBATCH -J " + id + "\n";
    string += "#SBATCH -o " + id + ".out\n";
    string += "#SBATCH -e " + id + ".err\n";
    for (let opt in preprocessorOpt) {
        if (!preprocessorMapper.hasOwnProperty(opt)) {
            logger_js_1.logger.warn("\"" + opt + "\" is not known profile parameters\"");
            continue;
        }
        let value = preprocessorOpt[opt];
        let s = preprocessorMapper[opt](value);
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
function _kill(engine, processIDs, emitter, overrideBinary) {
    let exec_cmd = childP.exec;
    if (processIDs.length == 0) {
        emitter.emit('emptyExit');
        return;
    }
    exec_cmd(`${overrideBinary !== null && overrideBinary !== void 0 ? overrideBinary : engine.cancelBin} ${processIDs.join(' ')}`, function (err, stdout, stderr) {
        if (err) {
            emitter.emit('cancelError', err);
            return;
        }
        //final recount
        setTimeout(function () {
            _squeue(engine).on('data', function (squeueLookupDict) {
                var nLeft = 0;
                squeueLookupDict.id.forEach(function (pid, i) {
                    if (processIDs.indexOf(parseInt(pid)) >= 0)
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
function _squeue(engine, paramSqueue = '') {
    // if (!paramSqueue) paramSqueue = '';
    //paramSqueue = ''; // to remove when it will be take into account in the implementation
    let emitter = new events.EventEmitter();
    let squeueRes_dict = {
        'id': [],
        'partition': [],
        'nameUUID': [],
        'status': []
    };
    // squeue command
    let exec_cmd = childP.exec;
    exec_cmd(engine.queueBin + '  -o \"\%i \%P \%j \%t\" ' + paramSqueue, function (err, stdout, stderr) {
        if (err) {
            emitter.emit('listError', err);
            return;
        }
        let squeueRes_str = ('' + stdout).replace(/\"/g, ''); // squeue results
        //logger.debug(squeueRes_str);
        squeueRes_str.split('\n')
            .filter(function (jobArray, i) {
            return jobArray.length > 0 && i > 0;
        })
            .map(function (jobLine, i) {
            return jobLine.split(' ').filter(function (val) {
                return val != ''; // keep values that are not empty
            });
        })
            .map(function (jobArray, i) {
            squeueRes_dict['id'].push(jobArray[0]); // job ID gived by slurm
            squeueRes_dict['partition'].push(jobArray[1]); // gpu, cpu, etc.
            squeueRes_dict['nameUUID'].push(jobArray[2]); // unique job ID gived by Nslurm (uuid)
            squeueRes_dict['status'].push(jobArray[3]); // P, R, CF, CG, etc.
        });
        emitter.emit('data', squeueRes_dict);
    });
    return emitter;
}
