import {jobOptInterface} from './index';
import * as engineLib from '../lib/engine' ;

interface jtSpecs {
    engine : engineLib.engineInterface,
    emulator: boolean,
    TCPip : string,
    TCPport : number
}

export function coherceIntoJobTemplate(jobProfileString:string, _jt:any, workDir:string, jtSpec:jtSpecs):jobOptInterface {

    let jt:jobOptInterface=  {
        // "engineHeader": engine.generateHeader(jobID, jobProfileString, workDir),
     "engine" : jtSpec.engine,
     "workDir": workDir,
     "emulated": jtSpec.emulator,
     "adress": jtSpec.TCPip,
     "port": jtSpec.TCPport,
     "jobProfile" : jobProfileString ? jobProfileString : "default"
    };

    if('exportVar' in _jt)
        jt.exportVar =  _jt.exportVar;
    if('modules' in _jt )
        jt.modules = _jt.modules;
    if ('script' in _jt)
        jt.script = _jt.script;
    if ('cmd' in _jt)
        jt.cmd = _jt.cmd;
    if ('inputs' in _jt)
        jt.inputs = _jt.inputs;
    if ('tagTask' in _jt)
        jt.tagTask = _jt.tagTask;
    if ('ttl' in _jt)
        jt.ttl = _jt.ttl;
    if ('socket' in _jt)
        jt.socket = _jt.socket;
    if ('sysSettingsKey' in _jt)
        jt.sysSettingsKey = _jt.sysSettingsKey;

    return jt;
}