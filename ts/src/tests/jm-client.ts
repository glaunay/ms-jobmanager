import jobManagerMS = require('../nativeJS/job-manager-client.js');

/*
    Prototype of a micro service subscribing to the jobManager Microservice.

*/


let jobProxyOpt = {
    'script' : '../scripts/local_test.sh',
    'inputs' : {
        'file' : '../data/file.txt',
        'file2' : '../data/file2.txt'
    }
}

jobManagerMS.start({port:8080, TCPip:'localhost'})
.on('ready', ()=>{
    jobManagerMS.push(jobProxyOpt);
});



