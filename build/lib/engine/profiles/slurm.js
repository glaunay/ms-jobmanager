"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
let profiles = {
    "comments": "Definition of slurms set of preprocessors options values",
    "definitions": {
        "ifb-slurm": {},
        "default": {
            "partition": "medium",
            "qos": "medium"
        },
        "crispr-dev": {
            "partition": "ws-dev",
            "qos": "ws-dev",
            "gid": "ws_users",
            "uid": "ws_crispr"
        },
        "arwen_gpu": {
            "partition": "gpu_dp",
            "qos": "gpu"
        },
        "arwen_cpu": {
            "partition": "mpi",
            "qos": "mpi"
        },
        "arwen_express": {
            "partition": "express",
            "qos": "express"
        },
        "arwen-dev_gpu": {
            "partition": "gpu",
            "qos": "gpu",
            "gid": "ws_users",
            "uid": "ws_ardock"
        },
        "arwen-dev_cpu": {
            "partition": "ws-dev",
            "qos": "ws-dev",
            "gid": "ws_users",
            "uid": "ws_ardock"
        },
        "arwen-prod_cpu": {
            "partition": "ws-prod",
            "qos": "ws-prod",
            "gid": "ws_users",
            "uid": "ws_ardock"
        },
        "arwen-dev_hex_16cpu": {
            "partition": "ws-dev",
            "qos": "ws-dev",
            "gid": "ws_users",
            "uid": "ws_ardock",
            "nNodes": '1',
            "nCores": '16'
        },
        "arwen-prod_hex_16cpu": {
            "partition": "ws-prod",
            "qos": "ws-prod",
            "gid": "ws_users",
            "uid": "ws_ardock",
            "nNodes": '1',
            "nCores": '16'
        },
        "arwen_hex_16cpu": {
            "partition": "mpi",
            "qos": "mpi",
            "nCores": '16'
        },
        "slurm_error": {
            "partition": "toto",
            "qos": "toto"
        }
    }
};
exports.default = profiles;
