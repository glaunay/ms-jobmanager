# MS CLIENT USAGE

```js
import * as jobManagerClient from "ms-jobmanager";
import { createReadStream } from 'fs';

//const script = 10;
//const script = createReadStream(__dirname + './test/hello.sh')
const script = './test/hello.sh'

const exportVar = { "titi" : "28" };

const port = 1234;
const TCPip = "127.0.0.1";
const wrong = "oo";
(async() => {

try { 
    console.dir(jobManagerClient);
    await jobManagerClient.start({port, TCPip})
} catch (e) {
    console.error(`Unable to connect ${e}`);
}

const j = jobManagerClient.push({script, exportVar});
    j.on("completed", (stdout:any, stderr:any)=> {
    const chunks:Uint8Array[] = [];
    console.log("STDOUT");
    stdout.on('data', (chunk:Uint8Array) => chunks.push(chunk))
    stdout.on('end', () => console.log(Buffer.concat(chunks).toString('utf8')));
    //console.log("STDERR");
    //console.log(stderr);
    })
})()
```
