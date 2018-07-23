import libStream = require("stream");
import isStream = require('is-stream');

export as namespace cTypes;
/*
    Usual basic container type interface and predicates
*/

export interface stringMap { [s: string] : string; }

export function isStringMap(obj: any): obj is stringMap;


export interface stringMapOpt { [s: string] : string|undefined; }
export function isStringMapOpt(obj: any): obj is stringMapOpt;



export interface streamMap { [s: string] : libStream.Readable; }
export function isStreamMap(obj: any): obj is streamMap;

export interface streamOrStringMap { [s: string] : libStream.Readable|string; }
export function isStreamOrStringMap(obj: any): obj is streamOrStringMap;