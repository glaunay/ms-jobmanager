import jobLib = require('../job.js');
import deepEqual = require('deep-equal');

let processArray:jobLib.jobSerialInterface[] = [];


interface constraintsInterface {


}

/*
 Returns list of common element bewteen a and b sets
*/
function _intersect(a:any[], b:any[]):any[] {
    // console.dir(a);
    // console.dir(b);
    let t;
    if (b.length > a.length) t = b, b = a, a = t; // indexOf to loop over shorter
    return a.filter(function (e) { // loop onto the shorter
        for (let i in b) {
            if (deepEqual(b[i], e)) return true;
        }
        return false;
    });
}
//lambda function to filterout item/warehouse elemnt
function isConstraintsOk(item:jobLib.jobSerialInterface, query:jobLib.jobSerialInterface): boolean {

    // Deep check
    ['exportVar', 'modules', 'inputHash'].forEach((field)=> {
        if(!query[field] && item[field]) return false;

        if (query[field]) {
            if (!item[field]) return false;

            if ( Object.keys(query[field]).length !=  Object.keys(item[field]).length) return false;
            if (_intersect(Object.keys(query[field]), Object.keys(item[field])).length !=  Object.keys(query[field]).length) return false;
            for (let k in query[field])
                if (query[field][k] !== item[field][k]) return false;
        }
    });

    // Scalar check
    ['tagTask', 'scriptHash'].forEach((field)=> {
        if(!query[field] && item[field]) return false;

        if (query[field]) {
            if (!item[field]) return false;
            if (query[field] !== item[field]) return false;
        }
    });

    //}
    //exportVar? :cType.stringMap,
    //modules? :string [],
    //tagTask? :string,
    //scriptHash :string,
    //inputHash? :cType.stringMap

    return true;
}




/* --  a function that look for jobs satisfying a constraints in a list --*/
export function lookup(jobAsked:jobLib.jobSerialInterface):jobLib.jobSerialInterface[] {




}






export function remove(constraints:jobLib.jobSerialInterface):boolean {

}

export function add(constraints:jobLib.jobSerialInterface):boolean {
    
}


function extractConstraint(jobAsked:jobLib.jobSerialInterface):constraintsInterface {


}