"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jmClient = require("../job-manager-client.js");
let data = {
    'uuid': 'toto',
    'script': '../scripts/local_test.sh',
    'inputs': {
        'file': '../data/file.txt',
        'file2': '../data/file2.txt'
    }
};
jmClient.start({ port: 8080, TCPip: 'localhost' })
    .on('ready', () => {
    jmClient.push(data);
});
