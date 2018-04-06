import logger = require('winston');
import figures = require('figures');


export function selfTest(jm:any, n:number):void {
    selfSubmissionTest(jm, n)
    .then((jobObjArray)=>{
        logger.info(`${figures.tick} Submission test successfull`);
        selfKillTest(jm, n).then((jobObjArray)=>{
            logger.info(`${figures.tick} Killing test successfull`);
        }).catch((e)=>{
            logger.error(`${figures.cross} Killing test not completed`);
            process.exit();
        });
    }).catch((e)=>{
        logger.error(`${figure.cross} Submission test not completed`);
        process.exit();
    });
}

/* Sequential testing w/ synchronous pushes */
function selfSubmissionTest(jm:any, n:number, ttl?:number):Promise<{}> {

/*
    const logUpdate = require('log-update');
const frames = ['-', '\\', '|', '/'];
let _i = 0;
 
setInterval(() => {
    const frame = frames[_i = ++_i % frames.length];
 
    logUpdate(
`
        ♥♥
   ${frame} unicorns ${frame}
        ♥♥
`
    );
}, 80);
*/

    let i:number = 1;
    let jArray:any[] = [];
    let ttlBool:boolean = typeof ttl !== 'undefined';

    if(!ttlBool)
        logger.info(`${figures.warning} Starting submission test`);

    let jobPromises:Promise<{}>[] = [];
    while(i <= n) {       
        let jobOpt:any = createJobOpt(i);
        if(ttlBool)jobOpt.ttl = ttl;
        jobPromises.push(performDummyPush(jm, jobOpt, ttl/*ttlBool*/));
        i++;
    }
    return Promise.all(jobPromises);
}

function selfKillTest(jm:any, n:number):Promise<{}> {
    logger.info(`${figures.warning} Starting kill test`);
    let ttl = 2;
    return selfSubmissionTest(jm, n, ttl);
}



/*
A function to create a suitable jobOpt container to perform sequential push test
*/
export function createJobOpt(id?:number):{} {
    let sleepTime:number = (Math.floor( Math.random() * 3 ) + 1) * 5;
    let jobProxyOpt:any = {
        'script' : '../scripts/local_test.sh',
        'ttl' : undefined,
        'inputs' : {
            'file' : '../data/file.txt',
            'file2' : '../data/file2.txt'
        },
        'exportVar' : {
            'waitingTime' : sleepTime
        }
    }

    if (id) 
        jobProxyOpt.exportVar['jobID'] = id;

    return jobProxyOpt;
}
/**/

export function performDummyPush(jm:any, jobObpt:any, killTime?:number, jobProfile:string='default'):Promise<{}>{
    let ttlBool:boolean = typeof killTime !== 'undefined';
    if(ttlBool)
        jobObpt.exportVar.waitingTime += killTime;
    //let jobProfile:string = 'default';
    let p = new Promise((resolve, reject)=> {
        let j = jm.push(jobProfile, jobObpt);
        j.on('completed',(stdout:any, stderr:any)=>{
            logger.silly("**Job Completion callback **");
            logger.silly(`<<<(*-*)>>>`);
            let stdoutStr = '';
            stdout.on("data", (buffer:any) => {
                logger.silly('some data');
                let part = buffer.toString(); 
                stdoutStr += part;
            });
            stdout.on("end", () => {logger.silly('This is stdout :\n', stdoutStr);});

            let sterrStr = '';
            stderr.on("data", (buffer:any) => {
                logger.silly('some data');
                let part = buffer.toString(); 
                sterrStr += part;
            });
            stderr.on("end", () => {logger.silly('This is stderr :\n', sterrStr);});

            resolve(j);
        // reject on specify event
        })
        .on('killed',()=>{ if(ttlBool) resolve(j);});
    });
    return p;

}