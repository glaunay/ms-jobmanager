import logger = require('winston');


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

export function performDummyPush(jm:any, jobObpt:{}, killTest:boolean=false, jobProfile:string='default'):Promise<{}>{
    //let jobProfile:string = 'default';
    let p = new Promise((resolve, reject)=> {
        let j = jm.push(jobProfile, jobObpt);
        j.on('completed',(stdout:any, stderr:any)=>{
            logger.info("**Job Completion callback **");
            logger.info(`<<<(*-*)>>>`);
            let stdoutStr = '';
            stdout.on("data", (buffer:any) => {
                logger.info('some data');
                let part = buffer.toString(); 
                stdoutStr += part;
            });
            stdout.on("end", () => {logger.info('This is stdout :\n', stdoutStr);});

            let sterrStr = '';
            stderr.on("data", (buffer:any) => {
                logger.info('some data');
                let part = buffer.toString(); 
                sterrStr += part;
            });
            stderr.on("end", () => {logger.info('This is stderr :\n', sterrStr);});

            resolve(j);
        // reject on specify event
        })
        .on('killed',()=>{ if(killTest) resolve(j);});
    });
    return p;

}