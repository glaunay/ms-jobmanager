let profiles = {
    "comments" : "Definition of local set of preprocessors options values",
    "definitions" : {
        "default" : {
            "WORKDIR" : "$PWD",// to mimic other engines : specify a workdir
            "user": "buddy",
            "system": "nix",
            "waitingTime" : "10",
            }
        }
    };

export default profiles;
