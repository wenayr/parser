
import Binance from "./result"
import {QueryStruct} from "./connector";
import "dotenv/config"; import {setTimeout} from "timers/promises";

const apiKey= process.env["APIKEY"];
const apiSecret= process.env["APISECRET"];


async function test() {

    let binance = new Binance({
        APIKEY: apiKey,
        APISECRET: apiSecret,
        useWeightControl: false,
        recvWindow: 60000
    });
    // binance.papi_fundAutoCollection({timestamp}).then(e=>e.msg)
    // получаем вес
    let weight= binance.getWeight("exchangeInformation");
    //let weight= binance.getWeight("testConnectivity"); //
    //let weight2= binance.getWeight("orderBook", {symbol: "aaa"});



    console.log("weight:",weight);
    let tasks : Promise<unknown>[] = [];
    let ok= true;
    let count= 0;
    let t= Date.now();
    let lastCount=0;
    let timer= setInterval(()=>{ if (count>lastCount) { console.log("count:",count);  lastCount= count; }}, 1000);
    //return;
    for(let i=0; i<1; i++) {
        //let res= await binance.testConnectivity();
        const silentCount = 0;
        if (i>=silentCount)
            console.log("#"+i, ", ",new Date().toTimeString());
        //let task = binance.queryOrderQuantityPrecisionPerAsset(undefined, undefined as any) //binance.listAllConvertPairs("BTC","ETH")
        let task = binance.exchangeInformation({symbol: "BTCUSDT"})
            .then(()=> count++)
            .catch(e=>{ console.error("i="+i,e); ok=false; });
        let timestamp= Date.now() + binance.responseInfo().timeOffset;
        tasks.push(task);
        if (i>=silentCount) {
            tasks= [Promise.all(tasks)];
            await tasks[0];
            //let res= await binance.allCoinsInformation({timestamp})
            //console.log("res:", res);

            console.log("responseInfo:",binance.responseInfo());
            console.log("weightUsed: ",binance.getUsedWeight("/api/v3/exchangeInfo", 60));
            if (binance.responseInfo().statusCode != 200) break;
        }
        if (!ok) break;
        //await setTimeout(1000);
        //break;
        //List-all-convert-pairs   /sapi/v1/convert/exchangeInfo
    }
    clearInterval(timer);
    console.log();
}
////tickerPriceChangeStatistics24hr

test();

let exchangeInfo = {
    rateLimits: [
        { rateLimitType: "REQUEST_WEIGHT", interval: "MINUTE", intervalNum:1, limit:6000 },
        { rateLimitType: "ORDERS", interval: "SECOND", intervalNum:10, limit:100 },
        { rateLimitType: "ORDERS", interval: "DAY", intervalNum:1, limit:200000 },
        { rateLimitType: "RAW_REQUESTS", interval: "MINUTE", intervalNum:5, limit:61000 }
    ]
}

type Interval = "SECOND"|"MINUTE"|"HOUR"|"DAY";
type RateLimitType = 'REQUEST_WEIGHT' | 'ORDERS' | 'RAW_REQUESTS' | 'CONNECTIONS';

type RateLimit = { rateLimitType: RateLimitType, interval: Interval, intervalNum:number, limit:number };


type RateLimit2 = { rateLimitType : string, }


