import crypto from "crypto";

import axios from "axios";

import NodeBinanceAPI, { ResponseInfo } from "node-binance-api_my"; //./my_modules/
import {SecurityType} from "./interfaces";
import {deepClone} from "wenay-common";


export type QueryStruct = {[key :string] :string|number|boolean|undefined | (string|number|boolean)[]};


export function getQuery(queryData : QueryStruct) {
    return Object.entries(queryData)
        .reduce((a, [key,val]) => {
            if (Array.isArray(val)) {
                val.forEach(v => {
                    a.push(key + "=" + encodeURIComponent(v))
                })
            } else if (val !== undefined) {
                a.push(key + "=" + encodeURIComponent(val));
            }
            return a;
        }, [] as string[])
        .join("&");
}


export function getSignature(queryData : QueryStruct | string, secretKey :string)
{
    let query : string = typeof(queryData)=="object" ? getQuery(queryData) : queryData;
    // console.log(query);
    return crypto.createHmac( 'sha256', secretKey).update( query ).digest( 'hex' )
}


export type RequestData = {
    parameters : QueryStruct,
    endPoint : string,
    method : string, //"GET"|"POST"|"DELETE",
    securityType : SecurityType
}

export type RequestDataExt = RequestData & {
    publicKey : string,
    secretKey : string
}


async function send(requestData : RequestDataExt) {
    const timestamp = Date.now();
    let queryStruct = {...requestData.parameters, timestamp};
    let queryStr = getQuery(queryStruct);
    const signature = getSignature(queryStr, requestData.secretKey);
    const url = `${requestData.endPoint}?${queryStr}&signature=${signature}`

    const res = await axios.get(url, {headers: {'Content-type': 'application/x-www-form-urlencoded', 'X-MBX-APIKEY': requestData.publicKey}})
}



export interface IConstructorArgs {
    recvWindow: number;
    useServerTime: boolean;
    reconnect: boolean;
    test: boolean;
    //hedgeMode: boolean;
    log: (...args: any[]) => void;
    verbose: boolean;
    keepAlive: boolean;
    localAddress: boolean;
    family: number;
    urls: Partial<{
        base: string;
        wapi: string;
        sapi: string;
        fapi: string;
        fapiTest: string;
        stream: string;
        combineStream: string;
        fstream: string;
        fstreamSingle: string;
        fstreamTest: string;
        fstreamSingleTest: string;
        dstream: string;
        dstreamSingle: string;
        dstreamTest: string;
        dstreamSingleTest: string;
    }>;
    timeOffset: number,
    APIKEY: string,
    APISECRET: string,

    proxy : {
        auth : {
            username : string,
            password : string
        },
        host : string,
        port : number
   }
}




// const base = 'https://api.binance.com/api/';
// const wapi = 'https://api.binance.com/wapi/';
// const sapi = 'https://api.binance.com/sapi/';
// const fapi = 'https://fapi.binance.com/fapi/';
// const dapi = 'https://dapi.binance.com/dapi/';


export class BinanceClient {
    protected nodeBinanceApi : NodeBinanceAPI;

    constructor(options : Partial<IConstructorArgs>) {
        options= {family: 0, ...deepClone(options) };
        this.nodeBinanceApi= new NodeBinanceAPI(options);// structuredClone(options));
    }

    responseInfo() : ResponseInfo { return {...this.nodeBinanceApi.getInfo()}; }

    async sendRequest<TReturn=unknown>(requestData : RequestData) : Promise<TReturn>
    {
        const servers = {
            api  : 'https://api.binance.com',
            wapi : 'https://api.binance.com',
            sapi : 'https://api.binance.com',
            fapi : 'https://fapi.binance.com',
            dapi : 'https://dapi.binance.com',
            papi : "https://papi.binance.com"
        } as const;

        function getServerURL(endPoint :string) {
            for(let key in servers)
                if (endPoint.startsWith("/"+key+"/"))
                    return servers[key as keyof typeof servers];
            return undefined;
        }

        const req = requestData

        let serverURL=  getServerURL(req.endPoint);
        if (! serverURL) throw new Error("Can not find server URL for endpoint "+req.endPoint);
        let split= req.endPoint.split(/(?<=^\/[^/]+\/)/);  // отделяем /apiType/ и последующую часть
        let baseURL = serverURL + split[0];  // получаем адрес вида https://api.binance.com/sapi/
        let endPnt= split[1];  // адрес вида /v3/ticker/24hr

        //let url= "https://api.binance.com" + req.endPoint;

        let  type= req.securityType=="" ? undefined
                   : req.securityType=="MARGIN" ? "SIGNED"
                   : req.securityType;
        //if (requestData.securityType=="USER_STREAM" || requestData.securityType=="MARKET_DATA")
            //TRADE, SIGNED, MARKET_DATA, USER_DATA, USER_STREAM

        return this.nodeBinanceApi.promiseRequest( endPnt, req.parameters, {method: req.method, type, base: baseURL})
    }

    // public sendRequest2<TReturn=any>(endPoint :string, method :string, hmac256 :boolean, params :QueryStruct)
    // {
    //     return this.sendRequest<TReturn>({endPoint, method, parameters: params});
    // }

    subscribeMarketStream() {

    }

}




// function createAPIProxy(options : Partial<IConstructorArgs>)
// {
//     const _funcMap = new Map<string, Function>;
//     const _client = new BinanceClient(options);
//     return new Proxy({} as {[p :string|symbol] :unknown}, {
//         get(target, p) {
//             if (typeof(p)=="symbol") return target[p];
//             let func= _funcMap.get(p);
//             if (! func) {
//                 func= (...args :any)=>{
//                     if (args[0]!=undefined && typeof(args[0])!="object")
//                         args=
//
//                 }
//             }
//         }
//     })
//
// }