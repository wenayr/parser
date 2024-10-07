//type NUMBER = number
import {BinanceClient, IConstructorArgs, QueryStruct} from "./connector";
import {RateLimitString, SecurityType, tWeight, tWeights} from './interfaces'

import {Params, paramsResolver} from "./overload";
import {asEndPoint, EndPoint, RequestWeights, UserInfo, Weight} from "./weightLimiter";
import {parsedToFunction, parseFunctionString} from "./helper";


export type WeightVal = Weight;

//export type WeightVal = {UID? :number, IP? :number};



//export declare interface MyBinanceClient { }


//declare const weights : {[func :string] : tWeights};

function getWeightValue(weight :tWeight, funcParams :QueryStruct) : number {
    type tFunc= Extract<tWeight, Function>;
    return typeof(weight)=="function" ? weight(funcParams)
        : typeof(weight)=="string" ? parsedToFunction<tFunc>(parseFunctionString(weight))(funcParams)
        : weight;
}

function parseRateLimitString(str :RateLimitString) {
    let checkStr : `${number}/${number}s` | `${number}/${number}min` = str;
    let match= str.match(/^(\d+)\/(\d+)(\S+)$/);
    if (! match) throw new Error("Wrong RateLimitString:"+str);
    return { weight: +match[1], interval: match[3] as "s"|"min", intervalNum: +match[2] };
}


export function getWeight(weights :{[func :string] :tWeights},  functionName :string,  params :QueryStruct) : WeightVal|undefined
{
    let weight = weights[functionName];
    if (! weight) return undefined;
    // let obj = Object.fromEntries( Object.entries(weight).map(
    //     ([key, weight])=>([
    //         key,
    //         getWeightValue(weight, params)
    //     ] as const)
    // ));
    // return obj as { [key in keyof tWeights] : typeof obj[string]; };
    let obj : WeightVal = {
        weightIP: weight.IP ? getWeightValue(weight.IP, params) : undefined,
        weightUID: weight.UID ? getWeightValue(weight.UID, params) : undefined,
        orders : typeof weight.orders=="number" ? weight.orders : weight.orders ? Math.max(...weight.orders.map(s=>parseRateLimitString(s)!.weight)) : undefined,
        connections : weight.isConnection==true ? 1 : undefined
    }
    return obj;
}



export function paramArgsToStruct(
    paramArgs : QueryStruct[string][] | [QueryStruct],
    keysOrOverloads : readonly string[] | readonly Params[],  // keys of overload params info
    funcName :string
) {
    let [keys, overloads]= typeof keysOrOverloads[0]=="object" ? [null, keysOrOverloads as Params[]] : [keysOrOverloads as string[], null];

    let resolver = overloads ? paramsResolver(overloads, funcName) : undefined;
    //let paramsObj : QueryStruct;
    if (typeof(paramArgs[0])=="object" && !Array.isArray(paramArgs[0])) {
        if (resolver) {
            let resolveData = resolver.resolveByStruct(paramArgs[0])?.data ?? (()=>{throw new Error("Failed to resolve overloaded function "+funcName)})();
            keys= Object.keys(resolveData);
        }
        paramArgs= keys!.map(key=>(paramArgs[0] as QueryStruct)[key]);
        //paramsObj= paramArgs[0];
    }
    else if (resolver) {
        let resolveData= resolver.resolveByValues(paramArgs)?.data;
        if (! resolveData) throw new Error("Failed to resolve overloaded function "+funcName);
        //paramArgs = Object.values(resolveData);
        keys= Object.keys(resolveData);
    }
    //let obj = Object.fromEntries( keys.map((key, i)=>[key, paramArgs[i]] as const).filter(([key,val])=>val!=undefined) );
    return keys!.reduce((obj, key, i)=> { if (paramArgs[i]!=null) obj[key]= paramArgs[i] as QueryStruct[string];  return obj; },  { } as QueryStruct);// (param,i)=>{param.name+": "+ar;
}


interface IConstructorArgsExt extends IConstructorArgs {
    useWeightControl : boolean
}

export enum BinanceError { WeightLimitExceed= "WeightLimitExceed" }


async function myIP() {
  const response = await fetch("https://api.ipify.org/");
  return await response.text();
}


export abstract class MyBinanceClientBase extends BinanceClient {

    protected readonly weightsCounter = new RequestWeights();
    protected readonly useWeightControl : boolean;
    protected          tasksMap : Map<number, Promise<unknown>> = new Map();
    protected          taskCounter = 0;
    protected          banFinishTime = 0;

    protected abstract _getWeight(functionName :string, params :QueryStruct) : WeightVal;

    constructor(options :Partial<IConstructorArgsExt>) {
        super(options);
        this.useWeightControl= options.useWeightControl ?? true;
        //this.weightsCounter= options.useWeightControl ? new RequestWeights() : undefined;
    }

    protected _getUserInfo() : UserInfo { return { ip: "1.1.1.1", uid : "MyUser" } };


    protected async _sendRequest<TReturn=any>(
        endPoint :string,
        method :string,
        securityType :SecurityType,
        hmac256 :boolean,
        paramArgs : QueryStruct[string][] | [QueryStruct],
        keysOrOverloads : readonly string[] | readonly Params[],  // keys of overload params info
        funcName :string = endPoint,
    ) {

        if (Date.now() < this.banFinishTime) throw new Error("Banned until "+new Date(this.banFinishTime).toLocaleString(), {cause: BinanceError.WeightLimitExceed});

        let paramsObj = paramArgsToStruct(paramArgs, keysOrOverloads, funcName);

        let weight= this._getWeight(funcName, paramsObj);
        let endPnt= asEndPoint(endPoint);

        let userInfo= this._getUserInfo();

        if (this.useWeightControl) {

            if (! this.weightsCounter.isAvailableToAdd(endPnt, userInfo, weight))
                throw new Error(
                    "Failed to run "+funcName+":  it would exceed the weight limit."
                    + "  CurrentSumWeights: "
                    +JSON.stringify(this.weightsCounter.getSumRequestWeightsForAllIntervals(endPnt, userInfo)),
                    //) ["IP", "UID"] as const).filter(type=>weight[type]!=null).map(type => type+": "+this.weightsCounter.getSumRequestWeights(endPnt, userInfo, type)).join(", "),
                    { cause: BinanceError.WeightLimitExceed }
                );
        }

        let taskID = ++this.taskCounter;

        let task = this.sendRequest<TReturn>({endPoint, securityType, method, parameters: paramsObj}) .finally(()=>{this.tasksMap.delete(taskID)});
        task= task.then((res)=>{
            let responseInfo= this.responseInfo();
            let status= responseInfo.statusCode;
            if (status==429 /*limit exceed*/ || status==418 /*banned*/) {
                console.warn(status==429 ? "Limit exceed" : "Banned");
                console.warn(res);
                let retryAfter = this.responseInfo().headers["Retry-After"];  // number of seconds
                if (retryAfter) { retryAfter= +retryAfter;  console.log("Retry after:",retryAfter,"s");  if (isNaN(retryAfter)) retryAfter= 1e9; }
                else retryAfter = 1e9;
                this.banFinishTime= Date.now() + retryAfter*1000;
                console.log("Retry at",new Date(this.banFinishTime).toLocaleString());
                throw new Error( `Request error #${ responseInfo.statusCode }` );
            }
            return res;
        })
        this.tasksMap.set(taskID, task);
        this.weightsCounter.addRequestWeight(endPnt, userInfo, weight);

        return task;
    }

    getUsedWeight(endPnt :EndPoint, interval_s :number) { return this.weightsCounter.getSumRequestWeights(endPnt, this._getUserInfo(), interval_s); }


    waitForAvailableWeight(endPnt :EndPoint, weight :WeightVal, timeout_ms? :number) {
        let t= Date.now();
        return new Promise<boolean>((resolve, reject)=> {
            const fff = ()=>{
               if (this.weightsCounter.isAvailableToAdd(endPnt, this._getUserInfo(), weight))
                   resolve(true);
               else if (Date.now() < t + (timeout_ms ?? 1e12))
                   setTimeout(()=>fff(), 100);
               else resolve(false);
            }
            fff();
        });
    }


}



