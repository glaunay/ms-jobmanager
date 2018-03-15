import jmServer = require('../nativeJS/job-manager-server.js');



jmServer.listen(8080)
.on('newJob', (data) => {
    console.log("newJob");
    console.log(data);
});

