
import * as fs from "fs";

//import {BSearch} from "wenay-common"

type RequestArray = [number,number][];  // [time,weight]


export interface RequestArrayMap {
    [endPnt:string] : RequestArray // [time, weight] [enpnt]
}


type RequestsData= {
    requestUIDWeights: { [key :string] : RequestArrayMap }
    requestUIDOrders: { [key :string] : RequestArrayMap }
    requestIPWeights: { [key :string] : RequestArrayMap }
    requestIPConnections: { [key :string] : RequestArrayMap }
}

// function checkRequestData(data : unknown) {
//     let defaultData= newData();
//     for(let k in defaultData)
//         if (typeof data[k as keyof typeof defaultData]!=type)
// }




function newData() : RequestsData { return { requestUIDWeights:{}, requestUIDOrders:{}, requestIPWeights:{}, requestIPConnections:{} } }

export type ApiType= "api"|"sapi"|"fapi"|"dapi"|"eapi"|"papi";

const apiTypes = ["api", "sapi", "fapi", "dapi", "eapi", "papi"] as const satisfies ApiType[];

export type EndPoint = `/${ApiType}/${string}`;// | `/sapi/${string}`;

export function asEndPoint(endPnt :string) { getEndPointType(endPnt as EndPoint);  return endPnt as EndPoint; }

function getEndPointType(endPnt :EndPoint) : ApiType {
    for(let apiType of apiTypes)
        if (endPnt.startsWith(`/${apiType}/`)) return apiType;
    throw new Error("Wrong endpoint: "+endPnt);
}


type Interval = "SECOND"|"MINUTE"|"HOUR"|"DAY";
type RateLimitType = 'REQUEST_WEIGHT' | 'ORDERS' | 'RAW_REQUESTS' | 'CONNECTIONS';

function getInterval_s(interval :Interval) { return interval=="SECOND" ? 1 : interval=="MINUTE" ? 60 : interval=="HOUR" ? 3600 : interval=="DAY" ? 3600*24 : (()=>{throw "wrong interval: "+interval})()}

type RateLimit = { interval: Interval, intervalNum:number, limit:number };

type ApiRateLimits = { [api in ApiType] : Readonly<{ by: WeightTypeExt, limit: RateLimit, /*separateEndPoints?: boolean*/ }>[] };

type RateLimit1 = Readonly<{ by: WeightTypeExt, interval_s: number, limit :number, separateEndPoints?: boolean }>;

type ApiRateLimitsExt = { [api in ApiType] : RateLimit1[] };


//type WeightType = 'UID'|'IP'

export type Weight = Readonly<{ weightUID? :number, weightIP? :number, orders? :number, connections? :number }>;

export type WeightExt = Weight & { readonly rawRequests? :number }

type WeightType = keyof Weight; //'weightUID'|'weightIP'|'orders'|'connections';

type WeightTypeExt = keyof WeightExt;

const weightTypeKeys = ['weightUID', 'weightIP', 'orders', 'connections'] as const satisfies WeightType[];

//const weightTypeOutKeys = ['weightUID', 'weightIP', 'orders', 'connections', 'rawRequests'] as const satisfies WeightTypeExt[];

//type Weight = Readonly<{UID? :number, IP? :number}>;

//type WeightInput = Readonly<{weightUID? :number, weightIP? :number, isOrder :boolean, isConnection :boolean, ip :string, uid :string}>;




export function loadRequestsData(file :string) : RequestsData|null {
    if (! fs.existsSync(file)) return null;
    let str = fs.readFileSync(file, 'utf-8');
    let data = JSON.parse(str);
    let validData= newData(); ////{...newData(), ...data};
    for(let k in validData) validData[k as keyof RequestsData]= data[k] ?? {};
    return validData;
}

export function saveRequestsData(file :string, data :RequestsData) {
    let str= JSON.stringify(data, (key,val)=> val instanceof Array ? "<"+JSON.stringify(val)+">" : val, 2);
    str= str.replaceAll(/"<|>"/g, "");
    fs.writeFileSync(file, str);
    //fs.writeFileSync(file, JSON.stringify(data, null, 2));
}


function _getSumRequestsWeight(requests :RequestArray,  timeInterval_s :number, useWeight :boolean, maxTimeInterval_s? :number) {
    const timeNow = Date.now();
    //const startIntervalTime = timeNow - 1000 * (timeInterval_s + 0.5);
    function getStartIntervalTime(interval_s :number) { return Math.floor(timeNow / (interval_s*1000)) * interval_s*1000; }
    const startIntervalTime = getStartIntervalTime(timeInterval_s);
    const startMaxIntervalTime = getStartIntervalTime(maxTimeInterval_s ?? 1e12);  // если maxTimeInterval_s==null, то time = 0
    let sumWeight = 0;
    let spliceIdx = -1;
    for (let i= requests.length-1; i>=0; i--) {
        if (requests[i][0] >= startIntervalTime - 500) {  // добавляем полсекунды для подстраховки, т.к. могли быть задержки с передачей запросов
            sumWeight += useWeight ? requests[i][1] : 1;
        }
        else {
            if (!startMaxIntervalTime) break;
            if (requests[i][0] < startMaxIntervalTime - 500) {
                spliceIdx = i;
                break;
            }
        }
    }
    if (spliceIdx >= 0) {
        requests.splice(0, spliceIdx+1)
    }
    return sumWeight
}

function getSumRequestsWeight(requests :RequestArray,  timeInterval_s :number,  maxTimeInterval_s? :number) {
    return _getSumRequestsWeight(requests, timeInterval_s, true, maxTimeInterval_s )
}

function getSumRequestsCount(requests :RequestArray,  timeInterval_s :number,  maxTimeInterval_s? :number) {
    return _getSumRequestsWeight(requests, timeInterval_s, false, maxTimeInterval_s )
}


export const defaultRateLimits : ApiRateLimits = {
    "api" : [
        { by: "weightIP", limit : { interval: "MINUTE", intervalNum : 1, limit : 6000 } },
        { by: "weightUID", limit : { interval: "MINUTE", intervalNum : 1, limit : 6000 } },
        { by: "orders", limit : { interval: "SECOND", intervalNum:10, limit: 100 }},
        { by: "orders", limit : { interval: "DAY", intervalNum:1, limit: 200000 }},
        { by: "rawRequests", limit : { interval: "MINUTE", intervalNum: 5, limit: 61000 }},
        { by: "connections", limit : { interval: "MINUTE", intervalNum: 5, limit: 300 }},
    ],
    "sapi" : [
        { by: "weightIP", limit : { interval: "MINUTE", intervalNum : 1, limit : 12000 } },
        { by: "weightUID", limit : { interval: "MINUTE", intervalNum : 1, limit : 18000 } },
        { by: "rawRequests", limit : { interval: "MINUTE", intervalNum: 5, limit: 61000 }},
        { by: "connections", limit : { interval: "MINUTE", intervalNum: 5, limit: 300 }},
    ],
    "fapi" : [
        {by: "weightIP", limit: { interval: "MINUTE", intervalNum: 1, limit: 2400} },
        {by: "orders", limit: { interval: "MINUTE", intervalNum: 1, limit: 1200} },
        {by: "orders", limit: { interval: "SECOND", intervalNum: 10, limit: 300} }
    ],
    "dapi" : [],
    "eapi" : [],
    "papi" : [
        {by: "weightIP", limit: { interval: "MINUTE", intervalNum: 1, limit: 6000} },
        {by: "orders", limit: { interval: "MINUTE", intervalNum: 1, limit: 1200} },
    ]
}


export type UserInfo = Readonly<{ip :string, uid :string}>;



export class RequestWeights
{
    private readonly fileName : string
    private readonly requestsData : RequestsData = newData();
    private          limits : ApiRateLimitsExt;

    private endPointData(endpoint: EndPoint, UIDAndIP: UserInfo, type: WeightType,  mode: "get" | "set" = "get") {
        //let apiType= getEndPointType(endpoint);
        //endpoint = apiType=="sapi" && (type=="weightUID" || type=="weightIP") ? endpoint : `/${apiType}/`; // '/api/';
        const {ip, uid}= UIDAndIP;
        const [requestsData,key] =
            type=='weightUID' ? [this.requestsData.requestUIDWeights, uid] :
            type=='weightIP' ? [this.requestsData.requestIPWeights, ip] :
            type=='orders' ? [this.requestsData.requestUIDOrders, uid] :
            type=='connections' ? [this.requestsData.requestIPConnections, ip] : (()=>{throw new Error("Wrong WeightType: "+type)})();
        let requestsMap = requestsData[key];
        if (! requestsMap) { requestsMap={};  if (mode=="set") requestsData[key]= requestsMap; }
        let requests= requestsMap[endpoint];
        if (! requests) { requests= [];  if (mode=="set") requests = requestsMap[endpoint]= []; }
        return requests;
    }


    constructor(rateLimits : ApiRateLimits = defaultRateLimits, fileName :string = 'requestsData.json') {
        //this.limits= structuredClone(rateLimits);
        let lim : ApiRateLimitsExt = { } as { [key in ApiType] : RateLimit1[]};
        for(let api of apiTypes) {
            let limits = rateLimits[api];
            lim[api]= limits.map(item => ({
                interval_s: getInterval_s(item.limit.interval) * item.limit.intervalNum,
                limit : item.limit.limit,
                by : item.by,
                //separateEndPoints : item.separateEndPoints
            }));
        }
        this.limits= lim;
        this.fileName= fileName;
        let data = loadRequestsData(fileName);
        if (data) this.requestsData= data;
    }

    private getSumRequestWeight(endpoint :EndPoint, userInfo :UserInfo, type :WeightTypeExt, timeInterval_s :number) : number {
        let apiType= getEndPointType(endpoint);
        let apiEndPnt= `/${apiType}/` satisfies EndPoint;
        if (! (apiType=="sapi" && (type=="weightUID" || type=="weightIP")))
            endpoint = apiEndPnt; // '/api/';
        let isRawRequests= false;
        if (type=="rawRequests") { type= "weightIP";  isRawRequests=true; }
        let requests= this.endPointData(endpoint, userInfo, type);
        if (! requests) return 0; //throw new Error("requestsArray is not defined for type: "+type); //return 0

        let lastLen= requests.length;
        let maxInterval_s = Math.max(...this.getLimits(endpoint, type).map(limit => limit.interval_s), 60);
        if (type=="weightIP" && endpoint==apiEndPnt) maxInterval_s = Math.max(maxInterval_s, Math.max(...this.getLimits(endpoint, "rawRequests").map(limit => limit.interval_s), 60));
        let sumWeight = isRawRequests ? getSumRequestsCount(requests, timeInterval_s, maxInterval_s) : getSumRequestsWeight(requests, timeInterval_s, maxInterval_s);
        if (requests.length < lastLen)
            saveRequestsData(this.fileName, this.requestsData);
        return sumWeight;
    }

    getSumRequestWeights(endpoint :EndPoint, userInfo :UserInfo, timeInterval_s :number) : Required<Weight> {
        let entries= (weightTypeKeys).map(key => [key, this.getSumRequestWeight(endpoint, userInfo, key, timeInterval_s)] as const);
        return Object.fromEntries(entries) as Required<Weight>;
    }

    getSumRequestWeightsForAllIntervals(endpoint :EndPoint, userInfo :UserInfo) {
        let intervals= this.getLimits(endpoint).map(limit => limit.interval_s);
        if (! intervals.includes(60)) intervals.push(60);
        return intervals.map(interval => ({ interval, weights: this.getSumRequestWeights(endpoint, userInfo, interval) }));
    }


    private _addRequestWeight1(endpoint :EndPoint, userInfo :UserInfo, type :WeightType, weight :number) : void {
        let apiType= getEndPointType(endpoint);
        let apiEndPnt= `/${apiType}/` satisfies EndPoint;
        if (! (apiType=="sapi" && (type=="weightUID" || type=="weightIP")))
            endpoint = apiEndPnt; // '/api/';
        let requests= this.endPointData(endpoint, userInfo, type,"set");
        const timeNow = Date.now();
        requests.push([timeNow, weight]);
        if (endpoint != apiEndPnt) return this._addRequestWeight1(apiEndPnt, userInfo, type, weight);
        saveRequestsData(this.fileName, this.requestsData);
    }
    private _addRequestWeight2(endpoint :EndPoint, userInfo :UserInfo, weights : Weight) {
        weights = {weightIP : 0, ...weights };  // добавляем нулевой вес IP при необходимости,  т.к. это необходимо для rawRequests
        //for(let [key, val] of Object.entries(weights)) this._addRequestWeight1(endpoint, userInfo, key as keyof Weight, val)
        for(let key of weightTypeKeys)
            if (weights[key]!=null)
                this._addRequestWeight1(endpoint, userInfo, key, weights[key]!);
    }

    addRequestWeight(endpoint :EndPoint, userInfo :UserInfo, weights : Weight) {
        return this._addRequestWeight2(endpoint, userInfo, weights);
    }

    // addRequestWeight(endpoint :EndPoint, userInfo :UserInfo, type :WeightType, weight :number) : void;
    // addRequestWeight(endpoint :EndPoint, userInfo :UserInfo, weights : Weight) : void;
    //
    // addRequestWeight(endpoint :EndPoint, userInfo :UserInfo, ...nextArgs : [type :WeightType, weight :number] | [weights : Weight]){//endpoint :EndPoint, typeOrWeight :WeightType|Weight, weightNum? :number) {
    //     if (typeof nextArgs[0]=="object")
    //         this._addRequestWeight2(endpoint, userInfo, nextArgs[0]);
    //     else this._addRequestWeight1(endpoint, userInfo, nextArgs[0], nextArgs[1]);
    // }

    getLimits(endPoint :EndPoint, type? :WeightTypeExt) : readonly RateLimit1[] {
        return this.limits[getEndPointType(endPoint)]?.filter(limit => type ? limit.by==type : true);
    }

    isAvailableToAdd(endPoint :EndPoint, userInfo :UserInfo, weight :Weight) {
        let datas : [WeightType, number?][] = Object.entries(weight) as [keyof Weight, number?][];
        for(let [type, weight] of datas) {
            if (!weight) continue;
            let limits= this.getLimits(endPoint, type);
            for(let limit of limits) {
                const curSumWeight = this.getSumRequestWeight(endPoint, userInfo, type, limit.interval_s);
                if (curSumWeight + weight >= limit.limit * 0.95) return false;  // 0.95 - для подстраховки
            }
        }
        return true;
    }

    tryAddRequestWeight(endPoint :EndPoint, userInfo :UserInfo, weight :Weight)
    {
        if (! this.isAvailableToAdd(endPoint, userInfo, weight)) return false;
        this._addRequestWeight2(endPoint, userInfo, weight);
        return true;
    }

}


