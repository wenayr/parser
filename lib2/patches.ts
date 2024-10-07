import {ElData, Patch,tWeightsExt} from "./interfaces";
import {getHTMLTableContent,tableToString} from "./helper";


function getPatchesWrapper(patchesRef :readonly Patch[]) {
    return new Proxy({} as {readonly [key in Exclude<keyof Patch,"ref"> |number] : NonNullable<Patch[Exclude<key,number>]>}, {
        get(target,prop) {
            if (typeof prop!="string") return patchesRef[prop as any];
            let index= +prop;
            if (!isNaN(index)) return patchesRef[index];
            type tKey= keyof typeof target & string;
            let key= prop as tKey;
            let targetMutable = target as unknown as { [k : string] : typeof target[tKey] }
            //target[key] = (data :ElData)=> { return {} as typeof target[typeof key]}
            return targetMutable[key] ??= ((data :ElData, ...args :any)=> {
                let item = patchesRef.find(item => item[key]!=null && data.ref.match(item.ref) && data.type==(item.type ?? data.type));// as Patch[typeof key|"ref"]|undefined;
                if (item) console.log(data.ref+": patches: find match for "+prop)
                let funcOrVal = item?.[key];  // as Exclude<typeof key,string>
                if (typeof funcOrVal == "function") return funcOrVal(data, ...args);// as typeof target[typeof key];// as Patch[typeof key];
                else return funcOrVal;// as typeof target[typeof key];
            }) as typeof target[tKey]
        }
    })
}



let patches_ : readonly Patch[] =
[
    // {
    //     ref: "#current-open-orders-user_data",
    //     weight: ({weightStr, params}) =>
    //         weightStr=="Weight(IP): 6 for a single symbol; 80 when the symbol parameter is omitted;" && params && "symbol" in params
    //         ? ((params) => params["symbol"] ? 6 : 80)
    //         : (()=>{console.log(weightStr);  throw new Error()})() //undefined
    // },

    {
        ref: /#test-new-order-trade|#test-new-order-using-sor-trade/,
        weight : (data,params) => {
            let $weight= data.dom.$weight;
            //console.log(params);
            if (! params?.["computeCommissionRates"]) throw new Error(data.ref+": parameter 'computeCommissionRates' is not found");
            //let text= $weight?.nextElementSibling?.textContent?.trim().replaceAll(/\n+/g, " ");
            let table= $weight?.nextElementSibling?.tagName.toLowerCase()=="table" ? getHTMLTableContent($weight?.nextElementSibling) : null;
            //console.log([$weight?.nextElementSibling?.textContent]); throw "exit";
            if ($weight?.textContent=="Weight:"
                && table?.toString()==
                    ("Condition\tRequest Weight\n"
                    +"Without computeCommissionRates\t1\n"
                    +"With computeCommissionRates\t20") //.replaceAll(/[\n\t]/g, " ")
                )
                return { IP: (params)=>params["computeCommissionRates"] ? 20 : 1, IP_text: "\n"+tableToString(table,"alignBySpaces"), UID: undefined }
            else throw new Error(data.ref+" invalid text for weight: "+$weight?.textContent+"\n"+$weight?.nextElementSibling?.textContent?.trim());
        }

    },

    {
        ref: /#get-funding-rate-history|#get-funding-rate-info/,
        type: "usd-futures",
        weight : (data)=> {
            if (data.dom.$weight) return undefined;
            let el= data.dom.elements.find(el=>el.textContent?.match(/^\s*rate limit/i));  // начинается с "rate limit" (регистронезависимый)
            if (! el) throw new Error(data.ref+": RateLimit element is not found");
            console.log(el.textContent)
            let match = el.textContent?.match(/(?:Rate Limit|rate limit)\s+share (\d+)\/5min\/IP rate limit with GET ([\w/]+)/); // Rate Limit share 500/5min/IP rate limit with GET /fapi/v1/fundingInfo
            if (! match) throw new Error(data.ref+": Unknown rate limit");
            //let el2= data.dom.elements.find(el=>el.textContent?.trim().replaceAll(/\s+/g," ")=="Rate Limit share 500/5min/IP rate limit with GET /fapi/v1/fundingInfo");
            return {
                rateLimitPerIP: `${+match[1]}/5min`,  // 500/5min
                UID: undefined,
                IP: undefined,
                sharedWithEndpoint: match[2] //"/fapi/v1/fundingInfo"
            } satisfies tWeightsExt;
        }
    },

    {
        ref: /#open-interest-statistics|#top-trader-long-short-ratio-accounts|#top-trader-long-short-ratio-positions|#long-short-ratio|#taker-buy-sell-volume/,
        type: "usd-futures",
        weight : (data) => {
            if (data.dom.$weight) throw new Error(data.ref+": weight element is not undefined!");
            for(let el of data.dom.elements.filter(el=>el.tagName.toLowerCase()=="ul")) {
                let num= el.textContent?.match(/IP rate limit \d+ requests\/5min/)?.[0]?.match(/\d+/)?.[0];
                if (num!=null) return { rateLimitPerIP: "1000/5min", UID: undefined, IP: undefined }
            }
            throw new Error(data.ref+": IP limit is not defined");
        }
    }


];// satisfies readonly Patch[]


const patches= getPatchesWrapper(patches_);

export default patches;



//patches[0].weight({})