import axios from "axios"
import jsdom from "jsdom"
import fs from "fs"
import {ApiInfo, ApiType, EndPntData,Param,Params,ParamType,ResponseType,SecurityType,tWeight,tWeightsExt,WeightFuncString,WeightType} from "./interfaces"
import {arrayToStruct, camelize,deepCloneCommentedJSON,deepEqual,deepIterateObject,getFunctionBody,getFunctionTemplateBodyWithReplacedKeys,getObjectValueByAddress,removeCodeIndents} from "./helper"
import CommentJSON ,{CommentJSONValue} from "comment-json"
import {BinanceClient,QueryStruct} from "./connector"
import {enums, getObjectCommentsRef, parseSectionList,resolveParamType,setObjectCommentsRef} from "./parser"
import {paramsResolver,tParam} from "./overload";
import JSON5 from "json5"
import * as headerModule from "./header"
import {MyBinanceClientBase} from "./header"; import {Mutable,MutableFull, ReadonlyFull} from "wenay-common";

export {}


const myClassName = "MyBinanceClient";



const jsonDatasFile = "datas.json";





async function start() {

    type ApiInfoExt = ApiInfo & { prefix: string, fullName: string };

    let apis : ApiInfoExt[] = [{
            url : "https://binance-docs.github.io/apidocs/spot/en",
            type: "spot",
            prefix: "api",
            fullName: "Spot/Margin/Savings/Mining"
            //ipLimit: "12000"
        }, {
            url: "https://binance-docs.github.io/apidocs/futures/en/",
            type: "usd-futures",
            defaultWeightType: "IP",
            prefix: "fapi",
            fullName: "USD Futures",
        }, {
            url: "https://binance-docs.github.io/apidocs/delivery/en/",
            type: "coin-futures",
            defaultWeightType: "IP",
            prefix: "dapi",
            fullName: "Coin Futures"
        }, {
            url: "https://binance-docs.github.io/apidocs/voptions/en/",
            type: "options",
            defaultWeightType: "IP",
            prefix: "eapi",
            fullName: "European Options"
        }, {
            url: "https://binance-docs.github.io/apidocs/pm/en",
            type: "portfolio",
            defaultWeightType: "IP",
            prefix: "papi",
            fullName: "Portfolio Margin"
            //ipLimit: 6000/min
            //orderLimit: 1200/min
        }
    ] as const;
    //apis= [apis[4]];
    //apis.splice(0, 1);

    let onlyParse :0|1 = 0;

    //type tDatasByAPI = { [api :string] : EndPntData[]; }
    let datasByFunc : { [funcName : string] : EndPntData } = { };
    let weights : { [funcName : string] : { IP? :tWeight,  UID?: tWeight } } = { };
    let datas : EndPntData[] = [];
    let funcStrings : string[] = [];

    const t0 = Date.now();


    let structsByType : { [key :string] : {info: ApiInfoExt, datas: EndPntData[]} } [] = [];


    let fromDisk = 0; //false;

    let fileDatas : { [api :string] : EndPntData[]; } = { } // | undefined;
    if (fromDisk) {
        let str= fs.readFileSync(jsonDatasFile).toString();
        fileDatas = CommentJSON.parse(str) as {} as typeof fileDatas;
        console.log("Read datas from",jsonDatasFile);
    }


    for(let apiInfo of apis)
    {

        const url = apiInfo.url;

        let parsedDatas : Iterable<EndPntData>;

        if (fromDisk && fileDatas)
            parsedDatas= fileDatas[apiInfo.prefix];
        else
            parsedDatas = await (async()=> {

            let t1= Date.now();

            const req = await axios.get<string>(url);

            console.log("Fetch from",url,": ",Date.now()-t1,"ms");

            const data = req.data;

            //let root= parseHTML(data);

            let t2= Date.now();

            let doc= new jsdom.JSDOM(data).window.document;
            let root = doc.firstElementChild as HTMLElement;

            console.log("parse dom: ",Date.now()-t2,"ms");

            //["#get-spot-rebate-history-records-user_data"]; //
            let whiteList : string[]|undefined;//=
            [
                "#get-funding-rate-history",
                //"#get-tokens-or-symbols-delist-schedule-for-cross-margin-and-isolated-margin-market_data",
                //"#new-order-list-oto-trade",
                //"#new-um-order-trade",
                //"#websocket-user-data-request-to-be-deprecated",
                //"#mark-price",
                //"#investment-plan-creation-user_data",
                // "#list-all-convert-pairs",
                // "#exchange-information",
                // "#query-order-quantity-precision-per-asset-user_data"
                //"#create-a-listenkey-user_stream",
                // "#listen-key",
                // "#listen-key-spot",
                // "#listen-key-margin",
                // "#listen-key-isolated-margin"

                //"#exchange-information"
                //"#eth-staking-account-v2-user_data"
                //"#redeem-eth-trade"
                //"#rolling-window-price-change-statistics",
                //"#query-margin-repay-record-user_data",
                //"#account-balance-user_data"
            ]; //"#symbol-price-ticker"];// "#trading-day-ticker"];//"#query-current-order-count-usage-trade"];//"#24hr-ticker-price-change-statistics"];// = ["#order-book"]; // = ["#rolling-window-price-change-statistics"];//= ["#redeem-a-binance-gift-card-user_data"];//"#check-locked-value-of-vip-collateral-account-user_data"];//"#get-vip-loan-ongoing-orders-user_data"]; //["#remove-liquidity-trade"];
            let startFrom : string|undefined;//= "#query-managed-sub-account-transfer-log-for-investor-master-account-user_data";// = "#get-simple-earn-flexible-product-list-user_data" //= "#rolling-window-price-change-statistics"; //= "#redeem-a-binance-gift-card-user_data";

            //if (typeof whiteList =="string") whiteList=[whiteList]

            return parseSectionList(doc, apiInfo, {whiteList, startFrom, });
        })();

        const prevDataLength= datas.length;
        let   lastParent = "";
        let   t3= Date.now();

        funcStrings.push("\n//======== " + apiInfo.fullName.toUpperCase() + " ========");

        for(let data of parsedDatas)  //parseSectionList(doc, apiInfo, {whiteList, startFrom, }))
        {
            if (onlyParse) continue;

            let ref= data.ref;  //console.log(data.name);

            let funcName= camelize(data.name.split(/\((?=[^(]+$)/)[0]); // до последней скобки  //  .substring(0, data.name.lastIndexOf("(")));
            funcName= funcName.replace("Bnb","BNB");
            //if (funcName=="dustTransfer") funcName = camelize(funcName+"_"+data.name)
            if (data.name=="Dust Transfer (USER_DATA)") funcName += "_UserData";
            if (data.name=="Dust Transfer (TRADE)") funcName += "_Trade";
            if (data.name=="Index Linked Plan Redemption(USER_DATA)") funcName += "_UserData";
            if (data.name=="Index Linked Plan Redemption(TRADE)") funcName += "_Trade";
            if (data.name=="Time-Weighted Average Price (Twap) New Order (TRADE)")
                if (data.requestEndPoint.includes("futures"))
                    funcName= "timeWeightedAveragePriceNewOrderFutures";
                else funcName= "timeWeightedAveragePriceNewOrder";
            if (funcName.match(/^(cancelAlgoOrder|queryCurrentAlgoOpenOrders|queryHistoricalAlgoOrders|querySubOrders)$/)) //data.name=="Cancel Algo Order (TRADE)")
                if (data.requestEndPoint.includes("futures"))
                    funcName += "Futures";
                else if (data.requestEndPoint.includes("spot"))
                    funcName += "";//"Spot";
                else throw new Error(ref+": unknown endpoint: "+data.requestEndPoint);
            if (funcName.match(/^getLoanableAssetsData$/))
                if (data.requestEndPoint.includes("vip"))
                    funcName+="VIP";
            if (funcName=="getAssetsThatCanBeConvertedIntoBNB")
                if (data.requestEndPoint.includes("margin"))
                    funcName = "getMarginAssetsThatCanBeConvertedIntoBNB";
            if (ref=="#top-trader-long-short-ratio-accounts")
                funcName= "topTraderLongShortAccountRatio";
            if (ref=="#top-trader-long-short-ratio-positions")
                funcName= "topTraderLongShortPositionRatio";

            if (funcName.match(/^(createAListenKey|generateAListenKey|pingKeepAliveAListenKey|closeAListenKey)$/))
                if (data.parentName?.includes("SPOT")) funcName+="_Spot"; else
                if (data.parentName?.includes("ISOLATED MARGIN")) funcName+="_MarginIso"; else
                if (data.parentName?.includes("MARGIN")) funcName+="_Margin"

            if (data.ref[0]=="#") data.ref = url + data.ref;
            //
            //if (data.name=='Time-Weighted Average Price (Twap) New Order (TRADE)')
            // if (data.name=="Index Linked Plan Rebalance Details(USER_DATA)") funcName += "_userData";
            // if (data.name=="Index Linked Plan Rebalance Details(TRADE)") funcName += "_trade";
            //console.log([data.name], data.name=="Index Linked Plan Rebalance Details(USER_DATA)");
            if (funcName=="24hrTickerPriceChangeStatistics")
                funcName= "tickerPriceChangeStatistics24hr";
            else if (!funcName.match(/^[a-zA-Z][a-zA-Z0-9_]*$/)) throw new Error("Invalid function name: "+funcName);

            if (apiInfo.prefix!="" && apiInfo.prefix!="api") funcName = apiInfo.prefix+"_" + funcName;

            if (datasByFunc[funcName]) {
                console.log(data.ref);
                console.log(data.name);
                throw new Error(ref+": function "+funcName+" is already defined");
                // let suffix= data.name.match(/(?<=\().*(?=\))/)?.[0];
                // if (suffix) {
                //     if (suffix=="USER_DATA") suffix= "userData"; else suffix= camelize(suffix);
                //     datasByFunc[funcName] = camelize(data.name.split("(")[0] +
                // }
                // if (data.name.includes("(")) )
            }

            let txt = createFunctionText(funcName, data);
            //console.log(txt);
            if (data.weights.IP || data.weights.UID)
                weights[funcName] = {...(data.weights.IP != null ? { IP : data.weights.IP } : {}), ...(data.weights.UID ? { UID : data.weights.UID } : {}) };

            if ((data.parentName??"") != lastParent) {
                funcStrings.push("\n//***** " + data.parentName + " *****\n");
                lastParent= data.parentName!;
            }

            // console.log(data.weights.IP);
            // console.log(data.weights.IP!.toString());
            // console.log(stringifyFunction(data.weights.IP as any));
            //if (1) throw "Exit";
            funcStrings.push(txt);
            datas.push(data);
            datasByFunc[funcName]= data;

            if (! fromDisk) (fileDatas[apiInfo.prefix] ??= []).push(data);
            //if (funcStrings.length==10) { console.warn("Прерываем цикл");  break; }
            //console.log(data);
        }

        console.log("parse "+apiInfo.prefix+" functions total:",datas.length-prevDataLength,", ",Date.now()-t3,"ms");
    }

    if (apis.length!=1) console.log("parse functions total:",datas.length,", ",Date.now()-t0,"ms");

    if (1 && onlyParse) { console.warn("exit");  return; }

    function stringifyFunction(f :Function|WeightFuncString, indents=0) {
        return removeCodeIndents( f.toString().replace(/^function [^\s(]+/, "function") ) // убираем название функции
        .replace(/^\s*\n/, "").replaceAll("\n", "\n".padEnd(indents)); // убираем \n перед функцией  и добавляем отступы для всех новых строк
    }
    const tagOpen="#codeStart";
    const tagClose="#codeEnd";

    // обернуть стринг с кодом в дополнительную обёртку
    function wrapCodeString(codeString :string) { return tagOpen + codeString + tagClose; }
    // вытащить код в стринге из обёртки с убиранием кавычек
    function unwrapCodeInString(text :string) { return text.replaceAll(new RegExp(`["']${tagOpen}|${tagClose}["']`,"g"), "").replaceAll("\\n", "\n"); }

    function stringifyPrepareWeight(weight :tWeight, indents=0) {
        return typeof(weight)!="number" ? wrapCodeString( stringifyFunction(weight, indents) ) : weight;
    }
    // объект (мэп) с весами по именам функций
    let weightsContentData = Object.fromEntries( Object.entries(weights).map(
        ([funcName, w]) =>
            ([funcName, Object.fromEntries(
                Object.entries(w).map(
                    ([key, val]) => ([key, stringifyPrepareWeight(val, 5)])
                )
            )])
    ) );

    //const baseClass= headerModule.MyBinanceClientBase;
    //const baseClassName = baseClass.name;

    let template= fs.readFileSync("template.ts").toString()

    //const $methods$ = "$methods$";
    //let methodsRegex= new RegExp(`${$methods$}\s*:\s*unknown\s*;`);
    const methodsRegex= /\/\/\s*\$methods\$/;  // pattern: // $methods$

    if (! template.match(methodsRegex)) throw new Error("$methods$ pattern is not found in template file");

    template = template.replace(methodsRegex,  funcStrings.join("\n\n").replaceAll("\n", "\n  "));

    //const $weights$ = "$weights$";
    //const weightsRegex = new RegExp(`(?<=${$weights$}.*={)`);
    const weightsRegex = /\/\/\s*\$weights\$/;  // pattern: // $weights$
    if (! template.match(weightsRegex)) throw new Error("$weights$ pattern is not found in template");
    template = template.replace(weightsRegex,
        unwrapCodeInString(JSON5.stringify(weightsContentData, null, 2))
        .replaceAll("\n", "\n    ").replaceAll(/^\s*\{\s*|\s*}\s*$/g, "")  // раскрываем фигурные скобки
    );

    const enumsRegex = /\/\/\s*\$enums\$/;
    if (! template.match(enumsRegex)) throw new Error("$enums$ pattern is not found in template");

    template= template.replace(enumsRegex,
        Object.entries(enums).map(([name, values])=> {
            let strValues = values.map(val=>`'${val}'`);
            return `export type ${name} = ${ values.length < 5 ? strValues.join(" | ") : "\n    "+strValues.join(" |\n    ") };\n`
        }).join("\n")
    );


    const content= template;

    fs.writeFileSync("result.ts", content);

    if (! fromDisk)
        fs.writeFileSync(jsonDatasFile, CommentJSON.stringify(fileDatas, null, 2));
    //fs.writeFileSync("datas.json", JSON.stringify(datas, null, 2));

    //let childs= root.querySelector('h1');
    console.log();

}


// переводим в стринг объект с типами response

function stringifyTypesObj_(obj :ResponseType, level: number, space: number|undefined, debug_key? :string) : string {
    if (! obj || typeof obj!="object") return obj+"";
    let itemPrefix= space!=null ? "\n".padEnd(level * space + space) : "";
    let endPrefix= space!=null ? "\n".padEnd(level * space) : "";
    let items : string[] = [];
    let itemComments : (string|undefined)[] = [];
    let itemLengths : number[] = [];
    for(let [key,val] of Object.entries(obj)) {
        if (val==undefined) continue;
        let itemStr = "";
        if (!Array.isArray(obj) || isNaN(+key)) {
            if (! key.match(/^[a-zA-Z$_][a-zA-Z$_0-9]*$/)) key=`"${key}"`;
            itemStr += key + ": ";
        }
        let valTypeStr= stringifyTypesObj_(val, level+1, space, key);
        let commentsRef = getObjectCommentsRef(obj, `after:${key}`);
        let comments :string|undefined = commentsRef?.map(comment=>comment.value).join(" // ") ?? "";
        if (comments!="") comments= space!=null ? "  // "+comments : "  /*"+comments+"*/";
        else comments= undefined;  //valTypeStr = valTypeStr.replace(/\n|$/, (str) => comments + str);
        itemStr += valTypeStr;
        items.push( itemPrefix + itemStr );
        itemComments.push(comments);
        itemLengths.push(itemStr.length);
        //maxLength= Math.max(itemStr.length, maxLength);
    }
    if (itemLengths.length>0) itemLengths[itemLengths.length-1]--;  // в последней строке нет разделителя (запятой)
    let maxLength = Math.max(...itemLengths);
    // выравниваем комментарии
    if (space!=null && maxLength <15 && itemComments.filter(comment=>!!comment).length>1)
        itemComments= itemComments.map((comment,i)=> comment ? "".padStart(maxLength-itemLengths[i]) + comment : "");

    function itemsJoin(separator :string) {
        return items.map((item,i)=> item + (i<items.length-1 ?separator :"") + (itemComments[i] ?? "")).join("");
    }
    let content= itemsJoin(",");
    if (Array.isArray(obj)) {
        let arr : unknown[] = obj;
        if (items.length==0) return "unknown[]";
        let hasItemObject= arr.some(item => typeof(item)=="object");
        if (items.length==1)
            content= items[0].replace(itemPrefix,"")+"[]" + (itemComments[0] ?? "");
        else if (hasItemObject) {
            // for(let [i,item] of [...items.entries()].reverse()) { // удаляем одинаковые типы
            //     //if (debug_key=="assets") console.log("!! ",i, ":", item, "->", ...items.slice(0,i));
            //     if (items.slice(0,i).includes(item)) {
            //         items.splice(i,1);
            //         //if (items[0].includes("asset") && items[0].includes("marginAvailable") && items[0].includes("autoAssetExchange"))
            //     }
            // }
            // content= itemsJoin(space==null ? "|" : " |") + endPrefix;
            // if (items.length>1) content= "(" + content + ")";
            // content= content + "[]";
            content = "("+itemsJoin(space==null ? "|" : " |") + endPrefix + ")[]";
        }
        else content = `[${content+endPrefix}]`
    }
    else content= `{${content+endPrefix}}`
    return content;
}


//function stringifyMy(value :any) { return JSON5.stringify(value, (k,v)=> v===undefined ? "undefined")}



// создание текста функции

function createFunctionText(funcName :string, srcData :ReadonlyFull<EndPntData>) : string { //s :readonly Data[]) {

    let allStr="";
    //let data = { ...srcData, overloads: [...srcData.overloads]}; //map(overload => ({...overload, params: {...overload.params}) })
    let data= deepCloneCommentedJSON(srcData) as MutableFull<EndPntData>;

    for(let [iOverload, overload] of data.overloads.entries()) {
        //let paramsJSON : {[k:string] :unknown} = { };
        let isExpanded= true; //data.params.length > 1;

        function paramTypeToString(type :ParamType, short=false) : string {
            if (typeof(type)=="string") return type;
            if ("arrayItemType" in type) {
                let s= paramTypeToString(type.arrayItemType, short);
                if ("enumItems" in type || (type.arrayItemType=="string" && s.includes("|"))) s="("+s+")";
                return s + "[]";
            }
            if ("enumItems" in type) return type.enumItems.map(item => typeof(item)=="string" ? `"${item}"` : item+"").join("|");
            if ("structItems" in type)
                return short ? "object" : (
                    "{"
                    + type.structItems.map(item => item.name+ (!item.required ?"?" :"") + " :"+paramTypeToString(item.type, short)).join(", ")
                    +"}");
            throw new Error(funcName+": wrong param type: "+JSON.stringify(type));
        }

        function paramTypeToStringShort(type :ParamType) : string { return paramTypeToString(type, true); }

        //overload.params= structuredClone(overload.params);
        if (data.securityType.match(/SIGNED|TRADE|USER_DATA/)) {
            for(let p of [overload.params["recvWindow"], overload.params["timestamp"]])
                if (p) p.required= false;  // делаем эти параметры опциональными, т.к. в node-binance-api они могут автоматически создаваться
        }
        let paramsArray= Object.values(overload.params);
        //let dataParams : Param<string>[] = overload.params.map( p => ({...p, type: paramTypeToString(p.type) }) );
        let dataParams : Param<string>[] = paramsArray.map( p => ({...p, type: paramTypeToString(p.type) }) );

        // добавляем к параметрам массивов префикс readonly
        dataParams= dataParams.map(param => param.type.match(/^\S+\[]/) ? {...param, type: "readonly "+param.type} : param);

        //let paramsStruct= arrayToStruct(dataParams, (p)=>p.name);

        let paramStringsBase = dataParams.map(param => param.name+ (!param.required ?"?" :"") + " :"+param.type);
        let paramStringsArgs = dataParams.map((param,i) => (
                param.required ? [param.name, param.type] :
                dataParams.slice(i+1).some(p=>p.required) ? [param.name, param.type+"|undefined"] : [param.name+"?", param.type]
            ).join(" :")
        );

        let paramStringsWithComment = dataParams.map(
            (param,i) => paramStringsBase[i] + (param.description!="" ? (isExpanded ? " //"+param.description : `/* ${param.description} */`) : "")
        );

        let hasRequired = dataParams.some(param => param.required);

        let paramJsonStr= "{ " + paramStringsBase.join(", ") + " }";
        console.log(paramJsonStr);

        //let paramJSON= CommentJSON.parse(paramJsonStr); //, null, 4);

        // переводим в стринг объект с типами response
        function stringifyTypesObj(obj :ResponseType, name :string) {
            let str= stringifyTypesObj_(obj, 0, 2);
            let nameComment= name=="" ? "" : name.includes("\n") ?  "/* " + name.replace("\n","    \n") + " */"  : "// "+name;
            if (nameComment!="") // && name!="Response:" && name!="OR")
                str= str.replace(/(?<=^\s*)\{\n?/, `{  ${nameComment}\n`);  // фигурные скобки разносим на разные строки
            //console.log("^^^^",nameComment, ",", str, str.match(/(?<=^\s*)\{(?=(.|\n)*})/)?.[0])
            return str;
        }

        //console.log("!!! ",data.responseExamples[0]);
        //console.log(overload.responseExamples[0]);
        //console.log(CommentJSON.stringify(overload.responseTypes[0],null,2));
        //overload.responseTypes= deepCloneCommentedJSON(overload.responseTypes);
        // добавляем в комментариях response значения из примера
        for(let [i,responseType] of overload.responseTypes.entries())
            if (typeof(responseType)=="object")
            for(let {object, key, value, address} of deepIterateObject(responseType)) {
                //console.log("!!!",{object, key, value, address});
                if (typeof value=="object") continue;
                let exampleVal = getObjectValueByAddress(overload.responseExamples[i] as typeof responseType, address);
                if (typeof exampleVal=="string" && exampleVal[0]!=`"`) exampleVal= `"${exampleVal}"`;
                let commentVal= "example: "+exampleVal;//?.toString() ?? unde
                //console.log(address, exampleVal);
                let commentsRef = getObjectCommentsRef(object, `after:${key}`);
                commentsRef ??= setObjectCommentsRef(object, `after:${key}`, []);
                if (commentsRef.length==0)
                    commentsRef.push({
                        type: 'LineComment',
                        value: "", //exampleVal?.toString() ?? "",
                        inline: true,
                        loc: null as any //{ start : { line: null as any, column: 10 }, end: null as any }
                    });
                commentsRef[0].value = commentVal + (commentsRef[0].value!="" ? "  //" + commentsRef[0].value : "");
            }
        //console.log(CommentJSON.stringify(data.overloads[0].responseTypes[0],null,2));
        //console.log(data.responseExamples);
        //throw "Exit";
        let returnTypeStr= overload.responseTypes.filter(t => t!==undefined).map((typeObj,i)=>
            stringifyTypesObj(typeObj, overload.responseNames[i])).join(" | ");//.replaceAll("// example", " // example");

        if (returnTypeStr=="") returnTypeStr="void";
        //let paramsJSON= .reduce((json, p)=>{}, { } as )
        //let argName=
        let optional= hasRequired ? "" : "?";

        returnTypeStr = returnTypeStr.replaceAll("\n", "\n  ");

        function bestFit(str :string) { return str.length<120 && !str.includes("//") ? str.replaceAll("\n", "  ") : str; }

        //declare function
        //let funcSignature= `${name}(${paramStringsArgs.join(", ")})\n: ReturnType<typeof ${name}>`;
        const promiseReturnStr1 = returnTypeStr.length < 20 ? `Promise<${returnTypeStr}>` : `ReturnType<${myClassName}["${funcName}"]>`;

        let funcSignature= bestFit( `${funcName}(${paramStringsArgs.join(", ")})\n: ${promiseReturnStr1}` );

        let funcSignature2= bestFit( `${funcName}(options${optional} : ${paramJsonStr})\n: Promise<${returnTypeStr}>` );

        let funcSignature3= `${funcName}(${paramStringsArgs.join(", ")}) : Promise<${returnTypeStr}>`;



        function getFuncImplementationBody(argsVarName :string) : string {

            const toQuotes = (text :string)=>`"${text}"`;

            // resolve param type
            function resolveParam(param? :Param) { return param?.required ? resolveParamType(param.type) : null; }

            // наборы параметров разрешения перегрузок. Пока перегружаются только базовые типы, а енумы - нет
            let resolveParamSets = data.overloads.map(data => Object.fromEntries(Object.values(data.params).map(p=>[p.name, resolveParam(p)] as const)));
            //let resolveParamSets = data.overloads.map(data => Object.fromEntries(data.params.map(p=>[p.name, resolveParam(p)] as const)));


            console.log(resolveParamSets);

            class XXX extends headerModule.MyBinanceClientBase { // шаблон, в котором мы будем заменять переменные
                override _getWeight(functionName :string, params :QueryStruct) { return { }; }
                methodTemplate( {$endPnt,$method,$type,$hmac256,$paramArgs,$keysOrOverloads,$funcName} : {$endPnt :string, $method :string, $type :SecurityType, $hmac256 :boolean, $paramArgs : QueryStruct[string][] | [QueryStruct], $keysOrOverloads : string[] | typeof resolveParamSets, $funcName :string}) {
                    return this._sendRequest($endPnt, $method, $type, $hmac256, $paramArgs, $keysOrOverloads, $funcName);
                }
            }
            // список ключей (если нет перегрузок), иначе список массивов перегруженных параметров
            let keysOrOverloads = data.overloads.length==1 ? paramsArray.map(p=>toQuotes(p.name)) : resolveParamSets.map(s=>JSON5.stringify(s)); //resolver.getResolveByStructExpressionStrings()


            return getFunctionTemplateBodyWithReplacedKeys(
                XXX.prototype.methodTemplate, {
                    $endPnt : toQuotes(data.requestEndPoint),
                    $method : toQuotes(data.requestMethod),
                    $type : toQuotes(data.securityType),
                    $hmac256 : data.hmacSHA256+"",
                    $paramArgs : argsVarName,
                    //$keys : "["+data.params.map(p=>toQuotes(p.name)).join(", ")+"]"
                    $keysOrOverloads : "["+keysOrOverloads.join(", ")+"]",
                    $funcName: toQuotes(funcName)
                }, true).replaceAll(/^\{\s*|\s*}$/g, "");  // убираем фигурные скобки и переводы строки в начале и конце
        }

        const weights= data.weights;
        let overloadWeights= overload.weightsStr;
        let weightsStr=
            ([
                ["IP", weights.IP, overloadWeights?.IP_text ?? weights.IP_text],
                ["UID", weights.UID, overloadWeights?.UID_text ?? weights.UID_text],
                ["orders", weights.orderCounts, overloadWeights?.orders_text ?? weights.orders_text]
            ] as const)
            .filter(item=>item[1]!=null)
            .map(([type, value, text]) => //Object.entries(data.weights).map(([type, value])=>
                value!=undefined ? (
                    `Weight(${type}): ` + (
                        //value instanceof Array ?  value.map((el,i)=>"<"+el.limit+": "+el.weight).join(",  ")
                        //typeof(value)=="object" ? "!!!" //value.header.join("\t") +"\n" + value.rows.join("\t")
                        text ?? value.toString()
                    ).replace(/^.*\d.*\n/, (str)=>"\n"+str)  // если несколько строк и есть цифра в первой строке, то вставляем \n вначале
                    .replaceAll("\n", "\n  ")
                ) : ""
            ).join("\n");

        let rateLimit=
            (weights.rateLimitPerAccount || weights.rateLimitPerParam || weights.rateLimitPerIP)
            ? "Rate Limit: " + (
                overload.weightsStr?.rateLimit_text ?? weights.rateLimit_text ?? [
                    [weights.rateLimitPerAccount, " per account"],
                    [weights.rateLimitPerIP, " per IP"],
                    Object.entries(weights.rateLimitPerParam ?? {})
                    .map(([param,limit])=>[limit, ` per param '${param}'`]).flat(1)
                ].filter(([value])=>value!=null).map(([value,text])=> value! + text).join(", ")
            )
            : null;

        // получить аннотацию JSDoc
        function getJSDoc(paramPrefix="") {
            if (overload.isMinor) return "";
            let name= data.name + (overload.name ? " "+ overload.name : "");
            let content=
                `${name}\n\n` +
                `{@link ${data.ref}}\n\n` +
                (data.description ? `${data.description}\n\n` : "") +
                "EndPoint: "+data.requestEndPoint + "\n" +
                (weightsStr ? "\n"+weightsStr+"\n" : "") +
                (rateLimit ? "\n"+rateLimit+"\n" : "") +
                //`weight: ${weightStr} (${data.weightType})\n` +
                (data.hmacSHA256 ? "\nHMAC SHA256\n" : "") +
                paramsArray.map(param=>
                    `\n@param {${paramTypeToStringShort(param.type)}} ${paramPrefix+param.name}` + (param.description!="" ? "  -  "+param.description : "") //+ "\n"
                ).join('');
            return "/** " + content.replaceAll("\n", "\n * ") + "\n */"
        }

        let jsdoc = getJSDoc();
        if (jsdoc!="") jsdoc += "\n";

        function isEqualTypes(params1 :Params, params2 :Params) { return deepEqual(Object.values(params1).map(p=>p.type), Object.values(params2).map(p=>p.type)); }
        // проверка наличия одинаковых типов в предыдущих перегрузках
        const  hasSameTypes= data.overloads.slice(0, iOverload).some(item=>isEqualTypes(item.params, overload.params));
        let str : string;

        if(dataParams.length > 0) {

            let jsdoc2 = getJSDoc("options.");
            if (jsdoc2!="") jsdoc2 += "\n";
            // TODO: Сделать проверку на одинаковость сигнатур с предыдущими перегрузками
            str = (!hasSameTypes ?
                    jsdoc +
                    funcSignature + ";\n" +
                    "\n\n"
                : "") +
                jsdoc2 +
                funcSignature2 + ";\n\n" +
                (iOverload== data.overloads.length-1 ?
                    `\n${funcName}(...args : any) {\n`+
                     "    "+getFuncImplementationBody("args") +
                    `\n}\n`
                : "");
        }
        else {
            str = jsdoc +
                (iOverload== data.overloads.length-1 ?
                    funcSignature3 + " {\n" +
                    "    "+getFuncImplementationBody("[]") +
                    "\n}\n"
                : funcSignature + ";\n");
        }
        if (iOverload>0) allStr += "\n";
        allStr += str;
    }

    //throw "Exit"
    return allStr;
}



start();

