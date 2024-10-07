///<reference types= "jsdom" />
///??<reference lib="dom" />

//import fetch from "node-fetch"

//import { HTMLElement, parse as parseHTML} from "node-html-parser"

//import {HTMLElement} from "node-html-parser";
//type HTMLElement = Element;
import {QueryStruct} from "./connector"

import CommentJSON, {CommentDescriptor, CommentSymbol, CommentToken} from "comment-json"

import {ApiInfo, ElData, EndPntData, FuncData, Param,Params,ParamType, ResponseData, ResponseType, ResponseTypeObj, SecurityType, Table, tWeight,tWeights, tWeightsExt, WeightFuncString, WeightType} from "./interfaces"

import patches from "./patches"
import {arrayToStruct, deepEqual, deepIterateObject, getHTMLTableContent,getObjectValueByAddress, removeCodeIndents, resolveFunctionTemplate, tableToString} from "./helper";
import {arrayShallowEqual, deepClone} from "wenay-common";
import * as enums from "./enums";
import {OrderSide} from "./enums";


function isNumberString(str :string) { return str.trim()!="" && ! isNaN(+str); }
function stringToNumber(str :string) { let num = str.trim() !="" ? +str : NaN;  return isNaN(num) ? null : num; }


type SectionInfo = Readonly<{ name: string, ref :string|null|undefined, path: string, children: readonly SectionInfo[], parent?: SectionInfo }>; //elements: HTMLElement[]

type SectionInfoExt = SectionInfo & { elements: readonly Element[] };



function getChildSections(list :Element, parentSection? :SectionInfo) : SectionInfo[]
{
    //parentSection ??= { name: list.textContent, }
    let mainChildren: SectionInfo[] = [];
    let items= list.querySelectorAll(":scope > li");
    for(let item of items) {
        let a= item.querySelector(":scope > a");
        if (! a) continue;
        let ref= a.getAttribute("href");
        let name= a.textContent ?? "";
        let parentPath= parentSection?.path ?? list.id;
        let itemPath= parentPath+"."+ref?.replace("#","");
        let childList= item.querySelector(":scope > ul");
        let section : SectionInfo = { name, ref, get children() {return children}, path: itemPath, parent: parentSection }
        let children = childList ? getChildSections(childList as HTMLElement, section) : [];
        mainChildren.push(section);
    }
    if (! parentSection) console.log("Main section refs:",mainChildren.map(item=>item.ref));
    return mainChildren;
}


function* deepIterateSections(main : SectionInfo | readonly SectionInfo[]) : Iterable<SectionInfo> {
    let array= Array.isArray(main) ? main : [main];
    for(let item of array) {
        yield item;
        yield * deepIterateSections(item.children)
    }
}

function getElementTextContent(el :Element) {
    return el.textContent;
    // let dom = new jsdom.JSDOM(el.outerHTML);
    // return dom.window.document.firstElementChild!.textContent;
}


function* iterateSectionElements(startElement :Element, stopOnSameTagName= false, stopElementID? :string) : Iterable<Element>
{
    for(let el : Element|null =startElement;  (el= el?.nextElementSibling) !=null;  ) {
        if ((el.id ?? "") != "")
            if (!stopOnSameTagName || el.tagName==startElement.tagName)
                if (!stopElementID || el.id==stopElementID)
                    break;
        yield el; //if (startElement.id=="system-status-system") {
    }
}



function findStringBetween(src: string, prefix :string, postfix :string) {
    let i= src.indexOf(prefix);  if (i==-1) return null;
    let j= src.indexOf(postfix, i+prefix.length);  if (j==-1) return null;
    return src.substring(i+prefix.length, j);
}

// разбить стринг на полные части (последняя часть всегда до конца стринга).  В обычном split возвращаются только первые разбитые части (при заданном параметре limit)
function splitFullParts(str :string, separator :string, partsCount :number) {
    let split= str.split(separator);
    for(let i=partsCount; i<split.length; i++) split[partsCount-1] += separator + split[i];
    return split.slice(0, partsCount);
}




type ParseListOptions = {blackList?: readonly string[], whiteList?: readonly string[], startFrom? :string };


export function* parseSectionList(document :Document, apiInfo :ApiInfo, options?: ParseListOptions) : Iterable<EndPntData>
{
    let list= document.querySelector("ul#toc"); //<ul id="toc" class="toc-list-h1">

    if (! list) throw new Error("Section list is not found");

    let sections= getChildSections(list);

    let ignoreSectionRefs= ["#change-log", "#introduction", "#general-info", "#error-codes"];

    if (1)
    for(let s of [
        "#websocket-market-streams",
        //"#user-data-streams"
        "#websocket-api"  // futures
    ]) {
        ignoreSectionRefs.push(s);  console.warn("Ignore",s,"section");
    }
    sections = sections.filter(sect => sect.ref && ! ignoreSectionRefs.includes(sect.ref));

    console.log(sections.length)
    let sectTotal=0;
    let refsTotal=0;
    let elemTotal=0;
    let startFrom = options?.startFrom;

    let dataMap : {[ref :string] : EndPntData } = { };

    //for(let section of deepIterateSections(sections)) {
    for(let [iMainSection, mainSection] of sections.entries())
        for(let section of mainSection.children)
        {
            sectTotal++;
            const ref= section.ref;
            if (! ref) continue;
            refsTotal++;

            function getSectionName(section :SectionInfo) { return section.name.replace("（", "(").replace("）", ")"); }

            if (startFrom && ref!=startFrom) continue;
            startFrom= undefined;

            let ignoredRefs = [
                //"#rolling-window-price-change-statistics",
                "#websocket-blvt-info-streams",
                "#websocket-blvt-nav-kline-candlestick-streams",
                "#websocket-pool-price-streams",
                "#classic-portfolio-margin-user-data-stream", // usd-m futures
                "#websocket-user-data-request", // futures
                "#websocket-user-data-request-to-be-deprecated", // futures
                "#request-user-39-s-account-information", // coin-futures
                "#request-user-39-s-account-balance",
                "#request-user-39-s-position",
                "#portfolio-margin-pro-user-data-stream" // futures
                //"#new-order-using-sor-trade"
            ];

            if (ignoredRefs.includes(ref)) { console.warn("Ignore",ref);  continue;}

            if (options?.blackList?.includes(ref)) { console.warn("Ignore",ref);  continue; }

            if (options?.whiteList)
                if (! options?.whiteList?.includes(ref)) { /*console.warn("Ignore",ref);*/  continue; }

            const defaultSecurityType : SecurityType|undefined = mainSection.name.startsWith("Market Data") ? "MARKET_DATA" : undefined;

            //let refElement= root.querySelector(ref); // невозможно выбрать по id, начинающегося с цифры.

            //console.log(data);  //if (1) throw "exit"

            //if (ref=="#current-open-orders-user_data") throw new Error("exit");

            //let childrenDatas : EndPntData[] = [];

            function getDatas(section :SectionInfo) {
                let res= getData(section, false);
                return res ? (res instanceof Array ? res : [res]) : [];
            }

            function getData(section :SectionInfo, exact= false) : EndPntData | EndPntData[] | undefined {
                let childrenDatas : EndPntData[] = [];
                let ref= section.ref;  if (! ref) throw "ref is not defined for section "+section.name;
                const name= getSectionName(section); //section.name.replace("（", "(").replace("）", ")");
                if (dataMap[ref]) return dataMap[ref];

                let refElement= document.getElementById(ref.replace("#","")); // либо так: .querySelector("[id='222']")
                if (! refElement) { console.error(name+":", "ref element is not found:",ref);  return undefined; }

                const elements= [...iterateSectionElements(refElement)];
                console.log("\n"+refElement.id, " elements: ",elements.length);
                console.log(apiInfo.url + ref);
                if (elements.length==0 && !exact) {
                    if (ref.startsWith("#listen-key")) {
                        let children= section.children;
                        if (children.length==0)
                            children= [...(function*() {
                                let stopID = sections[iMainSection+1]?.ref?.replace("#","");
                                //for(let el of iterateSectionElements(refElement, true, stopID)) {
                                let tag :string|undefined;
                                for(let el : Element|null =refElement;  (el= el?.nextElementSibling) !=null;) {
                                    if ((el.id ?? "")!="") {
                                        //console.log("tag:",el.tagName);
                                        if (tag && el.tagName!=tag) break;
                                        tag= el.tagName;
                                        //if (el.id!="create-a-listenkey-user_stream") continue;
                                        let childSection : SectionInfo = {
                                            name: el.textContent ?? "", ref :"#"+el.id, path: section.path+"."+el.id, children: [], parent: section
                                        }
                                        yield childSection;
                                    }
                                }
                            })()];
                        for(let child of children) {
                            let res = getDatas(child);
                            childrenDatas.push(...res);
                        }
                        return childrenDatas;
                    }
                }

                let data = parseEndpointData(ref, name, elements, defaultSecurityType, apiInfo,
                    (otherRef , otherRequest)=>{
                        console.log(ref+": Requesting internal data for",otherRef);
                        let otherSection= mainSection.children.find(sect => sect.ref==otherRef)!;
                        let otherData = getData(otherSection, true) ?? (()=>{throw new Error("Failed to get other data by ref "+otherRef)})();
                        if (otherData instanceof Array) throw new Error("Wrong other data by ref "+otherRef);
                        if (otherRequest && otherData.request != otherRequest) throw new Error(ref+`: data.request for ${otherRef} doesn't match a required string: `+otherRequest);
                        return otherData;
                    });
                if (!data) return undefined;

                let fullData : EndPntData = {
                    ...data,
                    parentName: section.parent?.name,
                    path: section.path,
                    apiType: apiInfo.type,
                    ref,
                    name
                }
                return dataMap[ref]= fullData;
            }

            let datas= getDatas(section);

            for(let data of datas)
                yield data;

            console.log("sect counted:",sectTotal);
            //if (1) throw "Exit";
            //(section as SectionInfoExt).elements= elements;
            //elemTotal += elements.length;
        }

    console.log({sectTotal, refsTotal, elemTotal});
}




// function parseEndpointData(document :Document, ref :string, name :string, defaultSecurityType :SecurityType|undefined,
//     apiInfo :ApiInfo, getOtherData :(ref :string, request? :string)=>EndPntData
// )
function parseEndpointData(ref :string, name :string, elements : readonly Element[], defaultSecurityType :SecurityType|undefined,
    apiInfo :ApiInfo, getOtherData :(ref :string, request? :string)=>EndPntData
)
: Omit<EndPntData,"parentName"|"path"|"apiType"|"ref"|"name"> |undefined
{
    //let refElement= document.getElementById(ref.replace("#","")); // либо так: .querySelector("[id='222']")
    //if (! refElement) { console.error(name+":", "ref element is not found:",ref);  return undefined; }

    //const elements= [...iterateSectionElements(refElement)];
    //console.log(refElement.id, elements.length);
    //console.log(apiInfo.url + ref);
    if (elements.length==0) return undefined;

    //let [elemResponseHeader, elemResponse, elemRequest, elemDescription, elemWeight] : (Element|undefined|null) [] = [];
    //let elemParams : HTMLCollection|undefined; //Element[]|undefined;

    // const it= elements[Symbol.iterator]();
    // function findNext(check? :(el :Element)=>boolean) {
    //     while(true) { let next= it.next().value as Element;  if (!next) return null;  if(check?.(next) ??true) return next; }
    // }

    const msgPrefix= ref ?? "undefined";

    // массив вида: [elementName,elementCode][]
    let  elemResponsePairs = elements
        .filter((el)=> (el.previousElementSibling?.tagName.toLowerCase()=="blockquote" || el.previousElementSibling?.textContent=="Response:")
            && el.tagName.toLowerCase()=="pre"
            && (
                (el.className.match(/javascript|json/))
                || (el.className.match(/plaintext/) && el.textContent?.match(/^\s*\{(.|\n)*}\s*$/))
                //|| (el.className.match(/plaintext/) && el.textContent?.match(/^\s*\{\s*}\s*$/)) // пустые фигурные скобки //&& el.previousElementSibling.textContent.match(/Response*|OR/g))// &&
            ))
        .map(el=>([el.previousElementSibling!, el.querySelector("code")] as const))
        .filter(([elName,elCode])=> elCode?.textContent!=null) as (readonly [Element|undefined,Element]) [];

    if (elemResponsePairs.length==0 && (
        ref=="#symbol-order-book-ticker" /*futures-coin*/ ||
        ref.match(/#set-market-maker-protection-config-trade|#get-market-maker-protection-config-trade|#reset-market-maker-protection-config-trade/)
    )) { /*options*/
        elemResponsePairs[0]= [undefined, elements.find(el=>el.querySelector("pre.javascript > code")) ?? (()=>{throw new Error(ref+": Response is not find")})()];
    }

    if (elemResponsePairs.length==0 && ref=="#query-margin-repay-record-user_data") {  // portfolio
        elemResponsePairs= elements.filter(
            el => el.tagName.toLowerCase()=="blockquote" && el.querySelector("strong")?.textContent=="Response:" && el.querySelector("code"))
            .map(el => [undefined, el.querySelector("code")!]);

        // for(let el of elements) {
        //     if (el.tagName.toLowerCase()=="blockquote")
        //         console.log("!!!! ",el.querySelector("strong")?.textContent, el.querySelector("code")!=null)
        // }
        // if (1) throw "Exit"
    }

    let elemResponseNames = elemResponsePairs.map(pair=>pair[0]);
    let elemResponses= elemResponsePairs.map(pair=>pair[1]);

    const elemRequest = elements.find(el => el.tagName.toLowerCase()=="p" && el.querySelectorAll("code").length==1)?.querySelector("code");

    const elemWeight = elements.find(el => el.querySelector("p > strong")?.textContent?.toLowerCase().includes("weight") ?? false);

    if (elements.filter(el => el.querySelector("p > strong")?.textContent?.toLowerCase().includes("weight") ?? false)
        .length >1) throw new Error(msgPrefix+": More than one Weight element is found");

    let elemParams= elements.find(el => el.previousElementSibling?.querySelector("strong")?.textContent?.match(/^(Parameter:|Parameters)/));

    const elemDescription = elements.find(el => el!=elemParams && el.tagName.toLowerCase()=="p" && el.childNodes.length==1 && el.childNodes[0].nodeType==3); // "textNode"  // !el.querySelector("code"));

        //el.tagName.toLowerCase()=="table"
    //#exchange-information
    if (elemParams?.textContent=="There are 4 possible options:") elemParams= elemParams.nextElementSibling ?? undefined;
        // "Parameter:|"Parameters"
    let elemParamTable= elemParams?.tagName.toLowerCase()=="table" ? elemParams : undefined;
    //console.log(elemParamTable); if (1) throw "Exit"
    let paramTable = elemParamTable ? getHTMLTableContent(elemParamTable) : undefined;

    let elData : ElData = {
        ref,
        type: apiInfo.type,
        name, //path : section.path,
        paramTable,
        dom: {
            $request : elemRequest ?? undefined,
            $responses : elemResponses,
            $description : elemDescription ?? undefined,
            $weight : elemWeight,
            $params : elemParams,
            elements : elements
        }
    }

    let request= elemRequest?.textContent?.replaceAll(/\n/g, "");

    let responses= elemResponses.map(el=>getElementTextContent(el)?.trim() ?? "") as (string|null)[]; //.filter(el=>!!el) as (string|null)[];

    let responseNames= elemResponseNames.map(el=>(el?.textContent?.replace(/(Response|OR):?\s*/, "") ?? "").trim());

    if (responseNames[0]?.startsWith("Payload")) return undefined; // это событие сокета  // #payload-liability-update

    let description= elemDescription?.textContent ?? undefined;

    //console.log(elemResponsePairs.length);  if (1) throw "Exit";

    // найти текст между последними скобками
    let securityTypeStr = name.match(/(?<=\()[^()]*(?=\)\s*$)/)?.[0] ?? ""; // findStringBetween(name, "(", ")") ?? "";
    if (securityTypeStr !="" && !(securityTypeStr in SecurityType)) {
        if (Object.keys(SecurityType).some(item => securityTypeStr.includes(item))) //. securityTypeStr)
            throw new Error(msgPrefix+": Failed to get security type from string: "+securityTypeStr);
            //throw new Error(msgPrefix+": Unknown security type: "+securityTypeStr);  //For Master Account
        if (securityTypeStr.match(/^(Accounts|Positions|For Master Account|For Sub-account|For Investor Master Account)$/)) // futures #top-trader-long-short-ratio-accounts
            securityTypeStr= "";
        else throw new Error(msgPrefix+": Wrong security type: "+securityTypeStr);
    }
    if (securityTypeStr=="") securityTypeStr= defaultSecurityType ?? "";

    const securityType = securityTypeStr as SecurityType; // as SecurityType;


    let method : string|undefined;
    let endpoint : string|undefined;
    let useHMAC_SHA256 : boolean|undefined;

    if (request) {
        // DELETE /sapi/v1/margin/isolated/account (HMAC SHA256)
        let requestUpper= request.toUpperCase();
        useHMAC_SHA256 = requestUpper.includes("HMAC SHA256");
        if (! useHMAC_SHA256 && requestUpper.includes("HMAC")) throw new Error(msgPrefix+": Unknown HMAC used in request "+request);
        request = request.split("(")[0].trim();
        let requestSplit = splitFullParts(request, "/",2 );
        if (requestSplit.length<=1) throw new Error(msgPrefix+": Wrong request: "+request);
        method = requestSplit[0].trim(); //request?.split("/")[0];
        endpoint = "/"+requestSplit[1].trim();
    }

    let localPatch : { params?: Params, weights? : Partial<tWeightsExt> } | undefined;

    for(let [thisRef, otherRef, otherRequest] of [  // spot
        ["#test-new-order-trade",           "#new-order-trade",           "POST /api/v3/order"],
        ["#test-new-order-using-sor-trade", "#new-order-using-sor-trade", "POST /api/v3/sor/order"],
    ])
        if (ref==thisRef) { // spot
            if (elemParams?.textContent?.replace("\n"," ")==`In addition to all parameters accepted by ${otherRequest}, the following optional parameters are also accepted:`) {
                let otherData= getOtherData(otherRef, otherRequest);
                let params= structuredClone(otherData.baseParams);
                elemParamTable= elemParams.nextElementSibling ?? (()=>{throw new Error(msgPrefix+": param table is not found")})();
                paramTable = getHTMLTableContent(elemParamTable);
                //localPatch= {params: [...params, ...getParams(paramTable, elemParamTable, msgPrefix, ref) ??[]] }
                localPatch= {params: {...params, ...getParams(paramTable, elemParamTable, msgPrefix, ref) ??{}} }
            }
            else console.warn([elemParams?.textContent]);
        }

    if (ref=="#test-order-trade") { // futures
        if (elemParams?.textContent=="Please refer to POST /fapi/v1/order") {
            let otherData= getOtherData("#new-order-trade", "POST /fapi/v1/order");
            let params= structuredClone(otherData.baseParams);
            let weights = elemWeight ? undefined : deepClone(otherData.weights);
            localPatch= {params, weights};
            if (responses[0]=="response result matches request") {
                responses= [null];  responseNames= [""];
            }
        }
    }


    let params_ = localPatch?.params  ??  patches.params(elData)  ??  (paramTable ? getParams(paramTable, elemParamTable!, msgPrefix, ref) : undefined);

    let paramsArr : Param[]|undefined = Array.isArray(params_) || !params_ ? params_ : Object.values(params_);
    let params : Params|undefined = Array.isArray(params_) ? Object.fromEntries(params_.map(p => [p.name, p])) : params_;
    //if (params && !Array.isArray(params)) params= Object.values(params);

    if (! params && !paramTable && elemParams && elemParams.textContent?.toUpperCase()!="NONE")
        throw new Error(msgPrefix+": failed to get parameters");

    //let paramsObj= params ? arrayToStruct(paramsArr, param=>param.name) : undefined; // params?.reduce((obj, param)=> { obj[param.name]= param; return obj; },  {} as {[k :string] :Param})

    //console.log("???",paramsObj);  if (1) throw "exit"

    //let weight : tWeight|undefined; //number|tWeightByLimits|Table|undefined;
    //let weights : { UID : tWeight|undefined, IP : tWeight|undefined }  = { UID : undefined, IP : undefined }
    //let weights = elemWeight ? getWeights(ref, elemWeight, paramsObj, msgPrefix) : undefined;

    let weights_ = localPatch?.weights  ??  patches.weight(elData,params)  ??  getWeights(ref, elemWeight, params, msgPrefix, apiInfo.defaultWeightType);
    let weights= weights_ ? { IP: undefined, UID: undefined, ...weights_ } : undefined;


    if (weights && weights.UID==undefined && weights.IP==undefined) {
        console.warn(msgPrefix+": Weights is not defined");
        //weights= undefined;
    }
    function Throw(key :string) : never { throw new Error(msgPrefix+": "+key+" is not found") }

    //type Patch = typeof patches_[number];

    if (!request) {
        if (ref=="#historical-blvt-nav-kline-candlestick") {
            console.log("Data for",ref,"is not defined ");
            return undefined;
        }
    }
    //futures #new-future-account-transfer  futures #get-future-account-transaction-history-list-user_data
    if (elements.length==1 && elements[0]?.textContent=="Please find details from here.") {
        return undefined;
    }


    if (! request) Throw("Request");
    if (! method) Throw("Request method");
    if (! endpoint) Throw("Request endpoint");
    if (useHMAC_SHA256==null) Throw("Request HMAC_SHA256");

    if (! responses.length) {
        if (ref=="#small-liability-exchange-margin") { responses= [null];  responseNames= [""]; }
        else
        if (!ref.match(/#switch-on-off-busd-and-stable-coins-conversion-user_data/))  // Response: Returns code 200 on success without body.
            Throw("response");
    }
    if (! responses.length) { console.warn(msgPrefix+": Response is not found");  responses= []; }
    if (! description) console.warn(msgPrefix+": Description is not found"); // Throw("description");
    if (! weights) Throw("Weights");
    //if (! paramsArr) { console.log(msgPrefix+": Params is not found");  paramsArr=[];  } //Throw("params");
    //if (! paramsHeader) { console.log(msgPrefix+": Params header is not found");  paramsHeader=[]; }
    if (! params) { console.log(msgPrefix+": Params is not found");  params={}; }
    //paramsObj ??= {}

    console.warn(msgPrefix+":","responses total: ",responses.length);
    // #repay-crypto-loan-repay-trade:
    if (responses.length==1 && responses[0]) { // находим разделитель объектов
        let split= responses[0].split("\nor\n");
        if (split.length>1) {
            console.log("Source response #0","\n"+responses[0]);
            responses= split;
            responseNames= Array<string>(split.length).fill(responseNames[0]);
            console.log(`response #0: split responses by 'or' on ${split.length} parts\n`);
        }
        else {  // portfolio #account-balance-user_data
            split= responses[0].split(/(?<=^|\n)(?=\*)/);  // находим разделители типа  *какой-то текст  или  *какой-то текст*
            //console.log(split);
            if (split.length>1) {
                responses = [];
                responseNames = [];
                for(let part of split) {
                    part= part.trim();
                    if (part=="") continue;
                    let [respName, resp] =
                        part[0]=="*" ? [part.match(/(?<=\*+)[^*].*?(?=\**(\n|$))/)![0],  part.match(/(?<=\n+)(.|\n)*/)?.[0] ?? null]
                                     : ["", part];
                    //part.split("\n")[0].replace(/^\*+|\**$/,"")
                    //console.log("??",part.split(/(?<=^\*+)(?=\**(\n|$))/, 2));
                    console.log("!!!",respName)
                    responseNames.push(respName);
                    responses.push(resp);
                }
                console.log(`response #0: split responses by '*' on ${split.length} parts\n`);
            }
        }
        //if (1) throw "exit";
    }

    let responseJSONs= responses.map((response,i)=>{
        console.log("Source response #"+i,"\n"+response);
        if (response==null) return response;
        if (0)
            try { CommentJSON.parse(response); } // проверка
            catch(e) {
                let {message,line,column} = e as { message: string, line: number, column :number };
                console.error({message, line, column});
            }
        if (ref=="#get-vip-loan-ongoing-orders-user_data") {  // удаляем текст 'or 0' после значения поля expirationTime
            response = response.replace(/(?<="expirationTime": [0-9]+) or 0/, "");
            if (response != responses[i]) console.log(`response #${i}: remove string 'or 0' after value of "expirationTime"`);
        }
        if (ref=="#check-locked-value-of-vip-collateral-account-user_data") { // удаляем лишние квадратные скобки внутри массива rows
            response = response.replace(/(?<="rows": \[(.|\n)*)\s*],\s*\[/, ",");
            if (response != responses[i]) console.log(`response #${i}: remove '],[' inside array "rows"`);
        }
        if (ref=="#get-pay-trade-history-user_data") {  // заменяем квадратные скобки на фигурные для поля extend
            response= response.replace(/"extend":\[\s*\/\/.*\n\s*"institutionName": "",(.|\n)*]/, (s)=>s.replace("[","{").replace("]", "}"));
            if (response != responses[i]) console.log(`response #${i}: change '[' & ']' to '{' & '}' for member 'extend'`);
        }

        response= response.replace(/^javascript\s*/, "");  // portfolio #query-margin-repay-record-user_data

        if (ref=="#get-tokens-or-symbols-delist-schedule-for-cross-margin-and-isolated-margin-market_data")
            response= response.replace(/,\s*"updateTime": [0-9]+/, "");  // удаляем ошибочное поле в массиве

        if (response.trim().match(/^[a-zA-Z]+$/)) return response; // если не объект, а простой тип
        response = getFixedJsonString(response);
        if (response != responses[i])
            console.log("Fixed response #"+i,"\n"+response);
        else console.log("Response is correct");
        //let a= "".match(/:|:/)
        return CommentJSON.parse(response) as ResponseData;
    });

    //let responsesJSON= responses.map(response => CommentJSON.parse(response) as CommentJSON.CommentObject);
    function getCustomType(key :string, val :unknown) {
        if (ref=="#exchange-information" && key=="filterType" && typeof val=="string") return `"${val}"`;
        return undefined;
    }

    let responseTypes = responseJSONs.map(responseJSON => responseJSON!=null ? getObjectTypeWrapper(responseJSON, getCustomType) as ResponseType : "unknown");//CommentJSON.CommentObject);

    for(let [i,responseType] of responseTypes.entries()) {
        console.log("Response type #"+i+":", responseType);
        if (responseTypes.slice(0,i).some(r => deepEqual(r, responseType)))
            responseTypes[i]= undefined;
    }

    //let returnType = response ? parseJSONTypes(response) : undefined;

    // console.log("Skipped other steps");
    // if (1) continue;

    let overloads : EndPntData["overloads"] = [{ params, responseNames, responseTypes: responseTypes, responseExamples: responseJSONs, name: "", isMinor : false }];

    if (ref.match(new RegExp([
        "#rolling-window-price-change-statistics", "#24hr-ticker-price-change-statistics", "#trading-day-ticker",
        "#symbol-price-ticker", "#symbol-order-book-ticker"].join("|")
    ))) {
        // разбиваем на 2 перегруженные функции для одиночного символа и мульти-символа
        if (params["symbol"] && params["symbols"]) {
            let params1= {...params};
            let params2= {...params};
            delete params1["symbols"];  params1["symbol"].required= true;
            delete params2["symbol"];
            let weightStrKeys = ["IP_text","UID_text","rateLimit_text"] satisfies (keyof tWeightsExt)[];// (keyof((typeof overloads)[number]["weightsStr"]))[];// = ["IP_text","UID_text","rateLimit_text"];
            let weightStrEntries= weightStrKeys.filter(k=> weights![k]!=null).map(k => [k, weights![k]!] as const);
            overloads= [
                {
                    params: params1, //Object.values(paramsObj),
                    responseNames: responseNames.filter((obj,i)=> ! Array.isArray(responseTypes[i])),
                    responseTypes: responseTypes.filter(obj=> ! Array.isArray(obj)),
                    responseExamples: responseJSONs.filter(obj=> ! Array.isArray(obj)),
                    name: "(single symbol)",
                    weightsStr: Object.fromEntries(weightStrEntries.map(([k,v])=>[k, v.replaceAll(/\nsymbols\s.*/g, "")])) //new Array<Data["overloads"][0]["weightsStr"]>("IP_text","UID_text","rateLimit_text")
                },{
                    params: params2,
                    responseNames: responseNames.filter((obj,i)=>Array.isArray(responseTypes[i])),
                    responseTypes: responseTypes.filter(obj=> Array.isArray(obj)),
                    responseExamples: responseJSONs.filter(obj=> Array.isArray(obj)),
                    name: "(multi symbols)",
                    weightsStr: Object.fromEntries(weightStrEntries.map(([k,v])=>[k, v.replaceAll(/\nsymbol\s.*/g, "")]))
                }
            ];

            if (params["type"]?.type==`"FULL"|"MINI"`)
                if (overloads.every(func => func.responseTypes.length==2)) { // Object.keys(paramsObj).length==2 &&
                    let iDefault= params["type"].description.includes("the default is FULL") ? 0 : -1;
                    overloads= overloads.map(func=> splitOverloads(func, "type", iDefault, ["", "MINI"], 0))
                    .flat();
                }
            //console.log(Object.keys(paramsObj).length);  if (1) throw "exit";
        }
    }
    else if (params["symbol"] && params["symbols"] && 0) {
        throw new Error(msgPrefix+": has symbol and symbols param");
    }
    else if (params["type"]?.type==`"FULL"|"MINI"`)
        throw new Error(msgPrefix+ `: paramsObj["type"].type=="FULL"|"MINI"`);

    // "#get-summary-of-sub-account-39-s-futures-account-v2-for-master-account"
    {
        let param= params["futuresType"];
        if (param?.description=="1:USDT Margined Futures, 2:COIN Margined Futures") {
            param.type= "1|2";
            if (responseNames[0].includes("USDT Margined Futures") && responseNames[1].includes("COIN Margined Futures"))
                overloads= splitOverloads(overloads[0], param.name);
        }
    }
    //function findParam(params: readonly Param[], name :string) { return params.find(p=>p.name==name); }
    //coin-futures #all-orders-user_data
    if (params["symbol"] && params["pair"])
        if (ref=="#all-orders-user_data") {
            if (overloads.length>1) throw new Error(ref+": overloads length > 1")
            overloads[1]= deepClone(overloads[0]);
            delete overloads[0].params["pair"];
            delete overloads[1].params["symbol"];
            overloads[0].params["symbol"].required= true;
            overloads[1].params["pair"].required= true;
        }

    // проверяем массивы типов и заменяем массивы одинаковых элементов на массивы с одним элементом
    if (0)
    for(let {params, responseTypes, name} of overloads) {
        console.log("==== START check responses type arrays");
        for(let [i,response] of responseTypes.entries()) {
            console.log("CHECK response #"+i);
            if (typeof response=="object") {
                for(let {key,value} of [{key: null, value: response},...deepIterateObject(response)]) {
                    //console.log({key, type: typeof(value)})
                    if (Array.isArray(value)) {
                        const arr= value as unknown[];
                        if (arr.length>1 && arr.slice(1).every(item => deepEqual(item, arr[0]))) {
                            console.log("### SAME array item: ",key!=null ? "key "+key : "", arr[0]);
                            arr.splice(1);
                        }
                        //else console.log("### NOT SAME: ",arr[0]);
                    }
                }
            }
        }
    }
    return {
        description,
        securityType,
        request,
        requestMethod: method,
        requestEndPoint: endpoint,
        hmacSHA256: useHMAC_SHA256,
        weights,
        baseParams: params,
        overloads
        // :overloads.map(item=> ({
        //     name : item.namePostfix,
        //     responseExamples : item.responsesJSON,
        //     responseTypes : item.responsesType, //responsesType,
        //     params : item.params,
        //     isMinor : item.
        // }))
    }
}



// разбить функцию на перегрузки по параметру

function splitOverloads(funcData : FuncData, paramName :string, defaultOverloadIndex? :number, overloadNames? :readonly string[], iMajor :number|"default"|"all"= "all") { //paramValues : number[] | string[] | undefined,
    let paramsObj= funcData.params;//arrayToStruct(funcData.params, param=>param.name);
    let paramType= paramsObj[paramName].type;//
    let paramSplit= typeof paramType=="string" ? paramType.split("|")
        : "enumItems" in paramType ? paramType.enumItems.map(item=>typeof item=="string" ? `"${item}"` : item+"") : [];
    if (paramSplit.length != funcData.responseTypes.length)
        throw new Error(`param '${paramName}' splits count(${paramSplit.length}) != responses count(${funcData.responseTypes.length})`);
    let names= overloadNames ?? funcData.responseNames;
    return funcData.responseTypes.map((resp,i) => {
        let data : FuncData = {
            params: structuredClone(funcData.params),
            responseNames: [funcData.responseNames[i]],
            responseTypes : [funcData.responseTypes[i]],
            responseExamples : [funcData.responseExamples[i]],
            name: funcData.name + (names[i]!="" ? ` (${names[i]})` : ""),
            isMinor:  iMajor=="all" ? false : iMajor=="default" ? i!=defaultOverloadIndex : i!=iMajor
        }
        let param= data.params[paramName];//  data.params.find(p=>p.name==paramName)!;
        param.type= paramSplit[i];
        param.required = (i != defaultOverloadIndex);
        return data;
    })
}


function getWeights(ref :string,  elemWeight :Element|undefined,  paramsObj :Params|undefined,  msgPrefix :string, defaultType?: WeightType) : Partial<tWeightsExt>|undefined
{
    if (!elemWeight) {
        if (ref=="#test-new-order-using-sor-trade")
            return { IP: 1 }
        if (ref=="#margin-dustlog-user_data") return { }
        if (ref=="#quarterly-contract-settlement-price") return { } // futures
        if (ref=="#basis") return { } // futures
        if (ref=="#get-funding-rate-info") return { } // coin-futures
        if (ref=="#open-interest") return { } // options
        if (ref=="#new-order-trade") return { IP: 5 } // options   // взял значение исходя из соседних ендпоинтов
        return undefined;
    }

    let weightsData = (()=>{
        if (!elemWeight) return null;
        let text= elemWeight.textContent?.trim();  if (!text) return null;
        let splits= text.split(/(?=(?:Weight\(\S+\)|Weight|Rate Limit):(?:.|\n)*?)/); //[...text.matchAll(/(?:Weight\(\S+\)|Weight):(.|\n)*/g)];
        if (! splits || ! text.startsWith(splits[0])) return null;
        if (1)
        return splits.map(txt => {
            //console.log(item);
            //let txt= item[0];
            let parts= splitFullParts(txt, ":", 2); // пример:  Weight(IP): 10
            let typeStr= findStringBetween(parts[0], "(", ")")?.trim() ?? "";  // тип веса в скобках
            if (txt.startsWith("Rate Limit")) typeStr= "Rate Limit";
            //console.log("!!!<",txt,">!!!")
            let valueStr= parts[1]?.trim() ?? ""; //txt.split(":", 2)[1]?.trim() ?? "";
            //#new-order-list-oto-trade
            if (typeStr=="" && valueStr.startsWith("(IP)")) { typeStr="IP";  valueStr= valueStr.replace("(IP)", "").trim(); }
            return {typeStr, valueStr};
        });
    })();

    if (ref=="#get-liquidity-information-of-a-pool-user_data")
        if (weightsData?.length==1 && weightsData[0].typeStr=="IP" && weightsData[0].valueStr=="") {
            // парсим следующие 3 элемента <p>
            let elements= [...(function*() { for(let el=elemWeight, i=0;  i<3 && (el= el.nextElementSibling!)!=null; i++) yield el; })()];
            let txt= elements.map(el => el.textContent??"").join("\n");
            //console.log(elements.map(el=>el.textContent));
            //console.log(txt);
            if (txt=="1 for one pool\n10 when the poolId parameter is omitted\nRate Limit:\n3/1s per account and per pool"
              && "poolId" in paramsObj!)
                return {
                    IP: (params)=>params["poolId"]!=null ? 1 : 10,
                    IP_text: txt.split("Rate Limit:")[0].trim().replaceAll("\n", "; "),
                    rateLimitPerAccount: "3/1s",
                    rateLimitPerParam: {poolId : "3/1s"},
                    rateLimit_text: txt.split("Rate Limit:")[1].trim(),
                }
                else throw new Error(msgPrefix+": Wrong weights text");
        }
    //#rolling-window-price-change-statistics
    if (elemWeight.textContent=="Weight:(IP)") // && elemWeight.nextElementSibling?.textContent==)
        if (elemWeight.nextElementSibling?.textContent?.match(
            /4 for each requested symbol regardless of windowSize\s*The weight for this request will cap at 200 once the number of symbols in the request is more than 50./
        ))
            if (paramsObj && "symbol" in paramsObj && "symbols" in paramsObj)
                return {
                    IP: (params)=> Math.min(200,  (Array.isArray(params["symbols"]) ? params["symbols"].length * 4 : 0) + (params["symbol"] ? 4 : 0)),
                    IP_text: elemWeight.nextElementSibling!.textContent!
                }
            else throw new Error(msgPrefix+": parameter 'symbol' or 'symbols' is not found");

    if (ref=="#trading-day-ticker") {
        if (weightsData?.[0]?.typeStr=="")  // elemWeight.textContent=="Weight:")
            if (elemWeight.nextElementSibling?.textContent?.match(
                /4 for each requested symbol\.\s*The weight for this request will cap at 200 once the number of symbols in the request is more than 50/)
            ) {
                if ("symbol" in paramsObj! && "symbols" in paramsObj!)
                    return {
                        IP: (params)=> Math.min(200,  (Array.isArray(params["symbols"]) ? params["symbols"].length * 4 : 0) + (params["symbol"] ? 4 : 0)),
                        IP_text: elemWeight.nextElementSibling!.textContent!
                    }
                else throw new Error(msgPrefix+": parameter 'symbol' or 'symbols' is not found");
            }
    }
    //
    //console.log(elemWeight.textContent, weightsData);

    let weights : tWeightsExt = { UID : undefined, IP : undefined }; //minDelayPerAccount_s? : undefined


    if (weightsData) {
        for(let item of weightsData) {
            let {typeStr, valueStr} = item;
            if (typeStr=="" && defaultType) typeStr= defaultType;
            if (typeStr=="" && ref.match(new RegExp(
                "#uiklines|#test-new-order-trade|#new-order-using-sor-trade|#query-allocations-user_data|#query-commission-rates-user_data"
                +"|"+["#create-a-listenkey-user_stream","#ping-keep-alive-a-listenkey-user_stream","#close-a-listenkey-user_stream",
                  "#generate-a-listen-key-user_stream","#ping-keep-alive-a-listen-key-user_stream"
                ].join("|")
            )))
              typeStr= "IP";

            // #redeem-eth-trade
            if (typeStr=="Rate Limit") {
                weights.rateLimit_text= valueStr;
                if (valueStr=="1/3s per account")
                    weights.rateLimitPerAccount= "1/3s"; // minDelayPerAccount_s= 3;
                else throw new Error(msgPrefix+": Invalid Rate Limit");
                continue;
            }
            // TODO:  Тип веса 'order' заменяем на 'UID'.  Возможно это некорректно!
            if (typeStr.toLowerCase()=="order") typeStr= "UID" satisfies keyof tWeights;

            //console.log([typeStr], typeof typeStr)
            if (!(typeStr in weights)) { console.log(elemWeight.textContent); throw new Error(msgPrefix+": wrong weight type: "+typeStr); }
            let weightType = typeStr as keyof Pick<typeof weights,"UID"|"IP">;
            let weight : tWeight|undefined;

            const textTypeStr : keyof tWeightsExt = weightType=="IP" ? "IP_text" : "UID_text";

            if (1
             //    ref=="#query-portfolio-margin-asset-index-price-market_data"  //
             // || ref=="#fund-auto-collection-user_data"
             // || ref=="#fund-collection-by-asset-user_data"
             // || ref=="#bnb-transfer-user_data"
             // || ref=="#change-auto-repay-futures-status-trade"
             // || ref=="#get-auto-repay-futures-status-user_data"
             // || ref=="#repay-futures-negative-balance-user_data"
             // || ref=="#get-portfolio-margin-asset-leverage-user_data"
             // || ref=="#24hr-ticker-price-change-statistics" // futures
             // || ref=="#symbol-price-ticker" // futures
             // || ref=="#symbol-price-ticker-v2" // futures
             // weightsData?.[0].typeStr==""
             )  // парсим следующий элемент
                if (weightsData.length==1 && valueStr=="" && (typeStr=="IP" || (typeStr=="" && defaultType))) {
                    if (elemWeight.nextElementSibling?.tagName.toLowerCase().match(/^(p|ul|table)$/)) {
                        elemWeight= elemWeight.nextElementSibling;
                        valueStr= elemWeight.textContent ?? "";  //  elemWeight= elemWeight.nextElementSibling!;
                    }
                }

            valueStr= valueStr.trim();
            let valueStrReplaced= valueStr.replaceAll("\n", " ");

            //if (ref=="#current-open-orders-user_data") console.log([...valueStr])
            //console.log(valueStr);
            //valueStr= valueStr.replace("\r", " ").trim();
            //console.log(item, valueStr ? true : false, valueStr!=null, valueStr=="", weightsData.length==1);
            //console.log(ref, item, valueStr, valueStr=="", weightsData.length==1);



            // futures #24hr-ticker-price-change-statistics
            // futures #symbol-price-ticker // futures #symbol-price-ticker-v2
            // futures #symbol-order-book-ticker
            // #current-open-orders-user_data
            //function getMatch(regexp :RegExp) { return [...valueStr.matchAll(regexp)].at(0); }
            let match : RegExpMatchArray|null;
            function get<T>(val :T) { return val; }


            function matchAnyOf(str :string, regexp :RegExp|RegExp[]) {
                let regexps= regexp instanceof Array ? regexp : [regexp];
                for(let regexp of regexps) {
                    let res = str.match(regexp); if (res) return res;
                }
                return null;
            }

            function getMatch(str :string, regexp :RegExp|RegExp[]) {
                let match = matchAnyOf(str, regexp);
                return match ? { then(func : (res :RegExpMatchArray)=>void) { func(match); return true; } } : null
            }

            function checkMatch(str :string, regexp :RegExp|RegExp[], func :(match :RegExpMatchArray)=>void) {
                let match= matchAnyOf(str, regexp);
                if (match) { func(match);  return true; }
                return false;
            }

            if ((match= valueStr.match(/^(\d+) for a single symbol;?\s+(\d+) when the symbol parameter is omitted;?$/)
                    ?? valueStr.match(/^with symbol (\d+)\s+no symbol (\d+)$/)
                    ?? valueStr.match(/^(\d+) with symbol[,;]\s*(\d+) without symbol$/)  // futures #user-39-s-force-orders-user_data
                    ?? valueStr.match(/^with symbol (\d+)[,;]\s*without symbol (\d+)$/)
                    ?? valueStr.match(/^(\d+) for a single symbol;?\s+(\d+) for (mutltiple|multiple) symbols;?$/)
                    ?? valueStr.match(/^(\d+) when a single is specified;\s*(\d+) when the symbol parameter is omitted$/) // #query-isolated-margin-fee-data-user_data
                )) {
                        if (paramsObj && "symbol" in paramsObj)  //weight = ((params) => params["symbol"] ? +match[1] : +match[2]);
                            weight = resolveFunctionTemplate(
                                ($a,$b) => ((params :QueryStruct) => params["symbol"] ? $a : $b),
                                [+match[1], +match[2]]
                                );
                        else throw new Error(msgPrefix+": param 'symbol' is not found");
                    }
            // else
            // if (checkMatch(valueStr,[
            //         /^(\d*) for a single symbol;?\s+(\d*) when the symbol parameter is omitted;?$/,
            //         /^with symbol (\d*)\s+no symbol (\d*)$/,
            //         /^(\d*) with symbol,\s+(\d*) without symbol$/,  // futures #user-39-s-force-orders-user_data
            //         /^(\d*) for a single symbol;?\s+(\d*) for (mutltiple|multiple) symbols;?$/], // coin-futures #current-all-open-orders-user_data
            //     //)?.then((match)=> {
            //     (match)=>{
            //         if (paramsObj && "symbol" in paramsObj)  //weight = ((params) => params["symbol"] ? +match[1] : +match[2]);
            //             weight = resolveFunctionTemplate(
            //                 ($a,$b) => ((params :QueryStruct) => params["symbol"] ? $a : $b),
            //                 [+match[1], +match[2]]
            //                 );
            //         else throw new Error(msgPrefix+": param 'symbol' is not found");
            //     })) { }
            else // #query-cross-margin-fee-data-user_data
            if (valueStr.match(/^1 when coin is specified;\s*5 when the coin parameter is omitted$/)) {
                if (paramsObj && "coin" in paramsObj)
                    weight = ((params) => params["coin"] ? 1 : 5);
            }
            else // #query-portfolio-margin-asset-index-price-market_data
            if (valueStr=="1 if send asset or 50 if not send asset") {
                if (paramsObj && "asset" in paramsObj)
                    weight = ((params) => params["asset"] ? 1 : 50);
            }
            else // #add-liquidity-trade
            if (valueStr=="1000 (Additional: 1 request every two seconds per pool and per account)") {
                if (paramsObj && "poolId" in paramsObj) {
                    weight = 1000;
                    weights.rateLimitPerAccount = "1/2s";
                    weights.rateLimitPerParam = {poolId: "1/2s"}
                }
                else throw new Error(msgPrefix+": param 'poolId' is not found");
            }
            else // #swap-trade
            if (valueStr=="100 (Additional: 1 request every two seconds per pool)") {
                if (paramsObj) {//} && "poolId" in paramsObj) {
                    weight = 100;
                    if ("poolId" in paramsObj)  // сейчас такого поля там нет
                        weights.rateLimitPerParam = {poolId: "1/2s"};
                    else weights.rateLimitPerAccount = "1/2s";
                }
                //else throw new Error(msgPrefix+": param 'poolId' is not found");
            } //
            else  // futures #modify-order-trade  #place-multiple-orders-trade
            if ((match = valueStr.match(/(\d+) on 10s order rate limit\(X-MBX-ORDER-COUNT-10S\);\s*(\d+) on 1min order rate limit\(X-MBX-ORDER-COUNT-1M\);\s*(\d+) on IP rate limit\(x-mbx-used-weight-1m\);/))) {
                let nums= match.slice(1); //[...valueStr.matchAll(/\d+(?=\s+)/g)];
                return {
                    orderCounts: [`${+nums[0]}/10s`, `${+nums[1]}/1min`],
                    IP: +nums[2],
                    //rateLimitPerIP: `${+nums[2]}/1min`,
                    IP_text: match[0].split(";")[2],
                    orders_text: "\n"+match[0].split(";", 2).join(";\n")
                    //full_text: "\n"+valueStr.replaceAll("; ", ";\n")
                }
            }
            else // coin-futures #all-orders-user_data
            if (valueStr.match(/^20 with symbol\s+40 with pair$/)) { // /^\d+ with symbol\s+\d+ with pair$/
                //let matches= [...valueStr.matchAll(/\d+/)];
                if (paramsObj && "symbol" in paramsObj && "pair" in paramsObj)
                    weight = ((params) => params["pair"] || !params["symbol"] ? 40 : 20);
            }
            else {
                if (weightsData.length==1)
                weight= (()=>{
                    //#order-book ||  futures #kline-candlestick-data
                    if (valueStr=="Adjusted based on the limit:" || valueStr=="based on parameter LIMIT") {
                        let elemTable= elemWeight.nextElementSibling;
                        if (elemTable?.textContent?.match(/^Update Speed:\s+\d+ms$/)) elemTable= elemTable.nextElementSibling; // coin-m futures
                        if (elemTable?.tagName.toLowerCase()!="table") throw new Error(msgPrefix+": Weight table is not found");
                        let table = getHTMLTableContent(elemTable);
                        msgPrefix += ": weight table";
                        let tableHeader = table.header;
                        if (tableHeader.join("\t").toLowerCase()!="limit\tweight") throw new Error(msgPrefix+": Invalid headers: "+table.header.join(", "));

                        let limits = table.rows.map((row,i)=>{
                            let [limits, weight] = row;
                            let [from,to] = limits?.split("-") ?? [];
                            if (limits.match(/^\[[0-9]+,\s*[0-9]+[)\]]$/))  // например: [100, 500) или [100, 500]   // futures #kline-candlestick-data
                                from= limits.match(/[0-9]+/)![0];
                            else if (limits.match(/>\s*[0-9]+$/))  // например: > 1000    // futures #kline-candlestick-data
                                from = (+(limits.match(/[0-9]+/)![0]) + 1) + "";
                            else
                            if (limits.includes(",")) { // futures #order-book
                                let vals= limits.split(",").map(val => val.trim()!="" ? +val : NaN);
                                if (vals.every(val=>!isNaN(val))) from= Math.min(...vals)+"";
                                else from= "";
                            }
                            if (! from || isNaN(+from) || !weight || isNaN(+weight)) { console.log(row); throw new Error(msgPrefix+": Invalid data at row #"+i); }
                            return [+from, +weight] as const; //{ limit: +to, weight: +weight }
                        }).sort((a, b) => b[0] - a[0]);  // сортируем по убыванию
                        if (! paramsObj || ! ("limit" in paramsObj)) throw new Error(msgPrefix+": param 'limit' is not found");
                        valueStr= "Adjusted based on the limit:\n" + tableToString(table);
                        //elemWeightTable.textContent;
                        //let $limits = limits; //:typeof limits
                        // Задаём функцию в текстовом виде, т.к. будем вставлять этот код в файле .ts
                        // а если получать код функции по toString, то это будет голый js код, могущий не компилироваться
                        let weightFunc : WeightFuncString = `
                            (params :QueryStruct) =>
                                typeof(params["limit"])=="number"
                                    ? $limits.find((item,i)=> (params["limit"] as number)>=item[0] || i==0)! [1]
                                    : (()=>{throw new Error("Parameter 'limit' is not a number")})()`;
                        //return replaceInFunctionBody(weightFunc, "$limits", JSON.stringify(limits)) as typeof weightFunc;
                        return weightFunc.replace("$limits", JSON.stringify(limits)) as WeightFuncString;
                    }

                    else if (elemWeight?.tagName.toLowerCase()=="table") {
                        let table = getHTMLTableContent(elemWeight, true);
                        msgPrefix += ": weight table";
                        if (ref=="#query-prevented-matches-user_data" && arrayShallowEqual(table.header, ["Case","Weight"])) {
                            let rowsTxt= table.rows.map(row=>row.join("\t")).join("\n");
                            if (rowsTxt !=
                                "If symbol is invalid\t2\n"+
                                "Querying by preventedMatchId\t2\n"+
                                "Querying by orderId\t20"
                            ) throw new Error(msgPrefix+": wrong table text: "+rowsTxt);
                            for(let p of ["preventedMatchId","orderId"])
                                if (!paramsObj?.[p]) throw new Error(msgPrefix+`: parameter '${p}' is not defined`);
                            valueStr= "By parameters:\n"+tableToString(table);
                            return (params) => params["orderId"]!=null ? 20 : 2;
                        }
                        //#24hr-ticker-price-change-statistics  #symbol-price-ticker
                        if (! arrayShallowEqual(table.header, ["Parameter", "Symbols Provided", "Weight"]))
                            throw new Error(msgPrefix+": Invalid headers: "+table.header.join(", "));
                        // console.log("table1");
                        // console.log(tableToString(table));
                        // console.log("table2");
                        // console.log(tableToString(getHTMLTableContent(nextElement,false)));
                        if (! paramsObj || ! ("symbol" in paramsObj)) throw new Error(msgPrefix+": param 'symbol' is not found");
                        if (! paramsObj || ! ("symbols" in paramsObj)) throw new Error(msgPrefix+": param 'symbols' is not found");
                        let symbolWeight = 0;
                        let symbolWeights : [number,number][] = [];
                        let omittedWeight = 0;
                        for(let rowCells of table.rows) {
                            let weight= stringToNumber(rowCells[2]);
                            if (weight==null) throw new Error(msgPrefix+": wrong value in column 3: "+rowCells[2]);
                            if (rowCells[0]=="symbol") {
                                if (rowCells[1]=="symbol parameter is omitted")
                                    omittedWeight = weight;
                                else if (rowCells[1]=="1")
                                    symbolWeight= weight;
                                else throw new Error(msgPrefix+": wrong text in column 2: "+rowCells[1]);
                            }
                            else if (rowCells[0]=="symbols") {
                                if (rowCells[1]=="symbols parameter is omitted")
                                    omittedWeight = Math.max(weight, omittedWeight);
                                else
                                if (rowCells[1].toLowerCase()=="any")
                                    symbolWeights.push([0, weight]);
                                else {
                                    if (! rowCells[1].match(/^[0-9]+(-[0-9]+$| or more$)/))
                                        throw new Error(msgPrefix+": wrong text in column 2: "+rowCells[1]);
                                    let fromVal= Number.parseInt(rowCells[1].split("-")[0]);
                                    symbolWeights.push([fromVal, weight]);
                                }
                            }
                            else throw new Error(msgPrefix+": wrong text in column 1: "+rowCells[0]);
                        }
                        symbolWeights.sort((a,b) => b[0] - a[0]);  // сортируем по убыванию
                        let weightFunc : WeightFuncString = (
                            symbolWeights.length !=1 ? `
                                (params :QueryStruct) =>
                                    Array.isArray(params["symbols"]) 
                                    ? symbolWeights.find((item, i)=> (params["symbols"] as []).length >= item[0] || i==0)! [1]
                                    : params["symbol"] ? symbolWeight : omittedWeight`
                                .replace("symbolWeights", JSON.stringify(symbolWeights))
                                .replace("symbolWeight", symbolWeight+"")
                                .replace("omittedWeight", omittedWeight+"")
                            : `
                                (params :QueryStruct) =>
                                    Array.isArray(params["symbols"]) ? ${symbolWeights[0][1]} : params["symbol"] ? ${symbolWeight} : ${omittedWeight}`
                        ) as WeightFuncString;

                        console.log({symbolWeight, symbolWeights, omittedWeight});
                        valueStr= "Adjusted based on the number of symbols:\n" + tableToString(table);
                        return  weightFunc;
                        //throw new Error(msgPrefix+": Table weight"); //return getHTMLTableContent(nextElement);
                    }
                    else return undefined;
                })();
                if (! weight) {
                    let match= valueStr.match(/^(\d+)\s+(\d+)$/); // типа: 3000  3000  //#close-a-margin-listenkey-user_stream)
                    if (match) if (match[1]==match[2]) valueStr= match[1];

                    //console.log([elemWeight.textContent]);
                    weight = +valueStr;  if (isNaN(weight)) throw new Error(msgPrefix+`: wrong weight (${weightType}): `+valueStr);
                }
            }
            if (weight==null) throw new Error(msgPrefix+`: wrong weight (${weightType}): `+valueStr);
            if (typeof weight == "string") weight= removeCodeIndents(weight) as WeightFuncString;
            weights[weightType] = weight;
            weights[textTypeStr] = valueStr;
        }
    }
    //throw new Error("Exit");
    return weights;
}


// const MyTypes : {[key :string] : "number"|"string"|"boolean"} = {
//     INT : "number",
//     INTEGER : "number",
//     LONG : "number",
//     DECIMAL : "number",
//     BIGDECIMAL : "number",
//     DOUBLE : "number"
// }

export {enums};

const NumberTypes= ["LONG","INT","DECIMAL","BIGDECIMAL","INTEGER", "DOUBLE"] as const;

const EnumTypes= Object.keys(enums) as readonly EnumTypeName[];   //["Permission", "OCOStatus", "OCOOrderStatus", "WorkingFloor"] as const;

type EnumTypeName = keyof typeof enums; //typeof EnumTypes[number]; //"Permission"

type ValidTypeName = EnumTypeName | "string" | "number" | "boolean";


function isNumberType(typeName :string) { return typeName.match(/^(LONG|INT|DECIMAL|BIGDECIMAL|INTEGER|DOUBLE|number)$/i); }
//["LONG","INT","DECIMAL","BIGDECIMAL","INTEGER", "DOUBLE"].includes(typeName)

// TODO: Добавить выходной тип enum
export function resolveParamTypeStr(typeName :string) : "string" | "number" | "boolean" | "[]" | "object" {
    if (typeName=="ENUM") return "string";
    if (EnumTypes.includes(typeName as EnumTypeName)) return "string";
    return typeName.match(/^(string|boolean|number)$/) ? typeName as "string"|"number"|"boolean"
    : isNumberType(typeName) ? "number"
    : typeName.match(/^[0-9]+$/) ? "number"
    : typeName.endsWith("[]") ? "[]"
    : typeName.split("|").length>1 ?
        (()=>{
            let types= typeName.split("|").map(t=>resolveParamTypeStr(t));
            if (types.every(t => t==types[0])) return types[0]; else throw new Error("Invalid type for resolve: "+typeName);
        })()
    : typeName.endsWith("[]") ? "[]"
    : typeName[0]=="{" ? "object"
    : typeName.match(/^".*"$/) ? "string"
    : (()=>{throw new Error("Unknown type for resolve: "+typeName)})();
}

export function resolveParamType(type :ParamType) : ReturnType<typeof resolveParamTypeStr>{
    return typeof(type)=="string" ? resolveParamTypeStr(type)
    : "arrayItemType" in type ? "[]"
    : "structItems" in type ? "object"
    : "enumItems" in type ? resolveParamTypeStr(type.enumItems.join("|")) : (()=>{throw new Error("Wrong param type: "+type);})();
}


// таблица умолчательных типов по имени параметра
const defaultParamTypesByName : {[key :string] : ValidTypeName|`${ValidTypeName}[]`|undefined} = {
    symbol : 'string', symbols : 'string[]',
    asset : 'string', assets : 'string[]',
    permissions: 'Permission[]', //'string[]'
    listStatusType: "OCOStatus",
    listOrderStatus: "OCOOrderStatus",
    workingFloor: "WorkingFloor",
    orderTypes: "OrderType",
    "type?" : "OrderType",
    newOrderRespType : "OrderResponseType",
    orderSide : "OrderSide",
    "side?" : "OrderSide",
    positionSide : "PositionSide",
    workingType : "WorkingType",
    timeInForce : "TimeInForce",
    rateLimitType : "RateLimitType",
    interval : "RateLimitInterval",
    priceMatch : "PriceMatch"
};

const defaultParamTypesByNameUppercase = Object.fromEntries(Object.entries(defaultParamTypesByName).map(([key,val])=>[key.toUpperCase(), val]));



function getParams(paramTable :Table, elemParams :Element, msgPrefix :string, ref? :string) : Params|undefined {

    let paramsHeader= paramTable.header;
    let paramsArr= paramTable.rows;

    function nonEmpty(p : string|undefined|null) { return p!="" ? p : null; }

    let [iParamName, iParamType, iParamRequired, iParamDescription] =
        [/Name|Options/, "Type", "Mandatory", "Description"].map(str=>paramsHeader!.findIndex((s => s?.match(str)!=null)))
    console.log(paramsHeader);
    console.log(paramsArr);
    paramsArr = paramsArr.filter(p=>p.some(cellValue => cellValue.trim()!="")); // убираем пустые строки
    // Если присутствует параметр с именем "No parameter", значит по умолчанию все параметры опциональны
    let filteredArr = paramsArr.filter(param => ! param[iParamName]?.match(/\s*No parameter\s*/i)); // удаляем этот параметр
    let requiredDefault = filteredArr.length==paramsArr.length;
    paramsArr = filteredArr;


    // В некоторых случаях текстовое описание параметра находится в столбце с именем параметра
    // поэтому перемещаем его в соответствующий столбец
    function moveDescriptionFromNameColumn(paramName :string, descriptionPart :string)
    {
        const i= paramsArr.findIndex(param => param[iParamName].includes(descriptionPart)); // номер строки
        if (i>=0) {
            let description= paramsArr[i][iParamName];
            paramsArr.splice(i,1);
            let ownerParam= paramsArr.find(param => param[iParamName]==paramName);
            if (ownerParam) ownerParam[iParamDescription] = (ownerParam[iParamDescription] ?? "") + "\n" + description; //descriptionPart;
        } //paramsArr= paramsArr.filter(()=>param[iParamName]!=findStr)
    }
    // #get-cross-or-isolated-margin-capital-flow-user_data
    moveDescriptionFromNameColumn("fromId", "If fromId is set, the data with id > fromId will be returned. Otherwise the latest data will be returned");
    // #investment-plan-creation-user_data:
    moveDescriptionFromNameColumn("details", "details[1].percentage"); //=40");
    // #investment-plan-adjustment-trade
    //moveDescriptionFromNameColumn("details", "when in request parameter ,just like this details[0].targetAsset=BTC details[0].percentage=60 details[1].targetAsset=ETH details[1].percentage=40");

    let params : Param[]|undefined = paramsArr?.map(
        (arr,i)=> ({
            name: nonEmpty(arr[iParamName]) ?? (()=>{throw new Error(msgPrefix+`: parameter #${i}: Name is not defined`)})(),
            type: nonEmpty(arr[iParamType]) ?? defaultParamTypesByName[arr[iParamName] ?? ""]
                                            ?? (()=>{throw new Error(msgPrefix+`: parameter #${i}: Type is not defined (name: ${arr[iParamName]})`)})(),
            required: arr[iParamRequired] ? arr[iParamRequired]!.toLowerCase()!="no" : requiredDefault,
            description: (arr[iParamDescription] ?? "").replaceAll(/\s+$/g, "")  // удаляем в конце пробелы и переносы строк
        })
    );

    if (params.length==2 && paramsArr.every(p=>p[iParamRequired]=="EITHER OR BOTH"))
        if (ref=="#list-all-convert-pairs")
            for(let p of params) p.required=false;
        else throw new Error(ref+": got params with mandatory=EITHER OR BOTH");
        //else params[1].required=false;

    // #symbol-price-ticker
    if (params[0]?.name=="symbol" && params[1]?.name=="symbols") {
        let split= params[0].description.split(/(?=Examples of accepted format for the symbols parameter:\s*\[.*,.*])/);
        if (split.length>1) { params[0].description= split[0];  params[1].description= split[1] + (params[1].description ?? ""); }
        if (params[1].type=="STRING") params[1].type= "string[]";
    }

    //console.log(params); if (1) throw new Error("exit");

    for(let p of params) {
        //#redeem-eth-trade
        console.log([p.type]);
        if (p.type=="STRING ｜  NO ｜ WBETH or BETH, default to BETH ｜") {  // сбой форматирования строки таблицы
            p.type= `"WBETH"|"BETH"`;
            p.required= false;
            p.description= "WBETH or BETH, default to BETH";
            continue;
        }
        // futures #place-multiple-orders-trade, coin-futures #place-multiple-orders-trade
        if (p.name=="batchOrders" && (p.type as string).toUpperCase()=="LIST<JSON>") {
            //console.log([elemParams.nextElementSibling?.textContent])
            if (elemParams.nextElementSibling?.textContent=="Where batchOrders is the list of order parameters in JSON") {
                let nextEl= elemParams.nextElementSibling!.nextElementSibling
                if (nextEl!.textContent?.trim().replaceAll("\n"," ").startsWith("Example: /"))  // fapi или dapi
                    // 'Example: /fapi/v1/batchOrders?batchOrders=[{"type":"LIMIT","timeInForce":"GTC", ' +
                    // '"symbol":"BTCUSDT","side":"BUY","price":"10001","quantity":"0.001"}]'
                    // )
                    nextEl= nextEl!.nextElementSibling;
                if (nextEl!.tagName.toLowerCase()!="table") throw new Error(ref+": second table is not found");

                let orderParams = getParams(getHTMLTableContent(nextEl!), nextEl!, msgPrefix, ref);
                if (! orderParams) throw new Error(ref+": Failed to parse order param table");
                p.type= { arrayItemType: { structItems: Object.values(orderParams) } };
                continue;
                // p.type= JSON.stringify({
                //     type: "OrderType" satisfies EnumTypeName,
                //     timeInForce: "TimeInForce" satisfies EnumTypeName,
                //     symbol: "string",
                //     side: "OrderSide" satisfies EnumTypeName,
                //     price: "number",
                //     quantity: "number"
                // }).replaceAll(`"`,"") +"[]";
            }
            else throw new Error(ref+": batchOrders comment is not found")
            //if (1) throw "Exit"
        }
        if (typeof p.type != "string") continue;
        // #24hr-ticker-price-change-statistics
        if (p.name=="type" && p.description.startsWith("Supported values: FULL or MINI.")) {
            p.type= `"FULL"|"MINI"`;  continue;
        } // #new-order-trade
        if (p.type=="ENUM" && ref=="#new-order-trade")
            if (p.description.includes("The possible supported values are EXPIRE_TAKER, EXPIRE_MAKER, EXPIRE_BOTH, NONE.")) {
                p.type= `"EXPIRE_TAKER"|"EXPIRE_MAKER"|"EXPIRE_BOTH"|"NONE"`;  continue;
            }
            // else if (p.description.includes("Set the response JSON. ACK, RESULT, or FULL;")) {
            //     p.type= `"ACK"|"RESULT"|"FULL"`;  continue;
            // }
        if (! p.type.match(/[a-z][A-Z]/) && p.type!=defaultParamTypesByName[p.name])  // если нет переходов с малой буквы на большую
            p.type= p.type.toUpperCase();
        p.type= p.type.replace("STRING", "string");
        p.type= p.type.replace("BOOLEAN", "boolean");
        if (p.type=="ARRAY" || p.type=="LIST") p.type="[]";
        let matchArrType= p.type.match(/(?<=(ARRAY|LIST)<)\S*(?=>)/i)?.[0];
        if (matchArrType) p.type= matchArrType+"[]"
        if (p.type=="[]") {
            let typeByName = defaultParamTypesByName[p.name];
            if (typeByName) p.type = (typeByName.endsWith("[]")) ? typeByName : typeByName+"[]";
        }
        if (p.type=="boolean" || p.type.endsWith("[]")) continue;
        let isNum = isNumberType(p.type) ? true : p.type=="string" || p.type=="ENUM" ? false : undefined;
        if (isNum==undefined) {
            let type= EnumTypes.find(item => item.toUpperCase()==p.type);
            if (type) p.type= type;  else throw new Error(msgPrefix+": param "+p.name+": Unknown param type: "+p.type);
        }

        p.description= p.description.replaceAll(/“|”/g, '"');

        // Если текст вида:  value1 or value2.  (value может состоять из символов, цифр, знака подчёркивания. Оба слова либо в кавычках, либо без)
        if (p.type=="ENUM" && p.description.match(/^[a-zA-Z0-9_]+ or [a-zA-Z0-9_]+\./)
            || (p.type.match(/^(ENUM|string)$/) && p.description.match(/^"[a-zA-Z0-9_]+" or "[a-zA-Z0-9_]+"[.,]/)))
                p.type= p.description.split(/[.,]/,2)[0].split(" or ").map(str => str[0]==`"` ? str : `"${str}"`).join("|");
        //if (p.name=="priceProtect") { console.log(p.description.split(/[.,]/,2)[0].split(" or ").map(str => str[0]==`"` ? str : `"${str}"`).join("|"));  throw new Error("!!")}//{ console.log(p.type.match(/^(ENUM|string)$/), p.description.match(/^"[a-zA-Z0-9_]+" or "[a-zA-Z0-9_]+"[.,]/));  throw "Exit"}
        else {
            let split= p.description.split(";")[0].split(",").map(item=>item.trim());
            if (split.length>1) {
                if (split.every(item=> isNum ? item!="" && !isNaN(+item) : item.match(/^"[a-zA-Z0-9_]+"$/)!=null)) // проверка, что элемент в кавычках
                    p.type= split.join("|");
                else if (p.type=="ENUM") {
                    let last= split.at(-1)!;
                    // если последний элемент содержит default и название какого-то из предыдущих элементов, то удаляем его
                    if (last.toLowerCase().includes("default") && split.slice(0,split.length-1).some(el=>last.includes(el)))
                        split.pop();
                    if (split.every((item, i) => item.match(/^[a-zA-Z0-9_]+$/)!=null)) {  // элемент из букв и цифр, без кавычек
                        p.type= split.map(str => `"`+str+`"`).join("|");
                    }
                }
            }
        }
        if (p.type=="ENUM") {
            let typeByName = defaultParamTypesByName[p.name] ?? defaultParamTypesByName[p.name+"?"];
            if (typeByName) { p.type= typeByName; }
        }
        //console.log("!!!", p);
    }
    return params ? Object.fromEntries(params.map(p => [p.name, p])) : undefined;
    //return params;
}



// получить исправленный JSON стринг
function getFixedJsonString(text :string) : string {
    let bracketBalance=0;
    let bracketStack= [];
    let lastIndex = 0;
    let lastDataToken : string|undefined = undefined;
    let lastDataTokenType : string|undefined = undefined;
    let lastDataMatch : { index: number, token: string } | undefined = undefined;
    function getLineRowCol(pos :number) { let split= text.slice(0,pos).split("\n");  return [split.length, split.at(-1)!.length]; }
    function getPosStr(pos :number) { let [line, col] = getLineRowCol(pos);  return "row "+line + ", col "+col; }
    let origText= text;
    text= text.replaceAll("：", ":");
    text= text.replaceAll("，", ",");
    if (! text.includes(`"`)) text= text.replaceAll(`'`, `"`);  // coin-futures #account-trade-list-user_data
    if (text!=origText) for(let i of [...text].keys()) if (text[i]!=origText[i]) console.warn(`Replace '${origText[i]}'->'${text[i]}' at `+getPosStr(i));
    // Regex:
    // 1) любой текст в кавычках: от одной кавычки до другой, иначе до конца строки либо до запятой либо до комментария  (кавычки могут быть заданы нестандартным символом “)
    // 2) число (цифры, точка или минус), после него не должно стоять буквы или прочего символа, используемого в имени переменных
    // 3) имя переменной: символы a-z либо A-Z либо _ либо $
    // 4) комментарий: от // до конца строки или стринга
    // 5) любой символ, не входящий в имя переменной и не пробел
    let regex= /["“][^"“”]*?(["”]|\s?(?=((,|，|\s*\/\/)[^"”]*\n)|\n))|(-?[0-9]+\.?[0-9]*|[a-zA-Z0-9_$]+)(?=[^a-zA-Z_$])|\/\/.*(\n|$)|[^a-zA-Z0-9_$"\s]/g  // // /^[{}\[\],:]/;
    let result=""; // итоговый стринг
    let temp="";  // временный стринг, который потом будет слит в итоговый
    // if (0) if (sectTotal==8) console.log([...text.matchAll(regex)].map(match=>match[0]))

    for(let match of text.matchAll(regex)) {
        let   token= match[0];
        const index= match.index!;
        temp += text.slice(lastIndex, index);
        lastIndex= index + token.length;
        if (token=="{") { bracketBalance++; bracketStack.push("{"); }
        if (token=="}") { bracketBalance--; bracketStack.pop(); }
        if (token=="[") { bracketBalance++; bracketStack.push("["); }
        if (token=="]") { bracketBalance--; bracketStack.pop(); }
        if (bracketBalance<0) { bracketBalance++;  console.warn(`Remove '${token}' at`,getPosStr(index));  continue; }  // пропускаем лишнюю закрытую скобку
        if (token.startsWith("//")) temp += token.replace(/ +(?=\n|$)/, "");  // удаляем пробелы в конце
        else {
            let isTextOrNumber = token.match(/[a-zA-Z0-9_$"“]+/)!=null;
            //if (token=="：") token=":";  // нестандартный символ двоеточия
            //if (token=="，") token=",";
            if (token=="=") { token=":";  console.warn("Replace '=' -> ':' at",getPosStr(index)); }
            // if (sectTotal==66 && token==":") console.log({token, bracket: bracketStack.at(-1), lastTokenType, lastToken,  "+lastToken" : +lastToken!, "lastToken==\"0\"": lastToken=='0'});
            // если пропущена запятая у предыдущего элемента, добавляем её
            if ((isTextOrNumber || token=="{" || token=="[") && (lastDataTokenType=="text" || lastDataTokenType=="}" || lastDataTokenType=="]"))
                { result += ",";  console.warn("Add ',' at",getPosStr(lastDataMatch!.index + lastDataMatch!.token.length)); }
            else // если лишняя запятая у предыдущего элемента, то удаляем её
                if ((token=="}" || token==")") && lastDataTokenType==",") //if (result.at(-1)==",")
                    { result= result.slice(0, -1);  console.warn("Remove ',' at",getPosStr(lastDataMatch!.index)); }//, "token: ",token); }
            // если у массива был задан числовой ключ, то убираем его
            if (bracketStack.at(-1)=="[")
                if (token==":" && lastDataTokenType=="text" && !isNaN(+lastDataToken!.slice(1,-1))) { // убрали кавычки для проверки числового значения ключа
                    result= result.slice(0, -lastDataToken!.length);  // удалили прошлый текст
                    console.warn("Remove array index "+lastDataToken+" at",getPosStr(lastDataMatch!.index));
                    lastDataToken = lastDataTokenType = result.at(-1)!;
                    continue;
                }
            if (isTextOrNumber) {
                token = token.replaceAll(/^“|”$/g, "\""); // заменяем нестандартный символ кавычек
                if (token[0]!=`"`) { // Если имя ключа либо значения (не числового и не булевого) без кавычек, то добавляем кавычки
                    if ((lastDataTokenType!=":" && (bracketStack.at(-1)=="{")) || (isNaN(+token) && token!="true" && token!="false" && token!="null")) {
                        console.warn(`Wrap by quotes: ${token} => "${token}" at`,getPosStr(index));
                        token= `"${token}"`;
                    }
                }
                else if (token.at(-1)!=`"`) {  // пропущена только конечная кавычка
                    console.warn(`Wrap by quotes: ${token} => ${token}" at`,getPosStr(index));
                    token += `"`;
                }
            }
            if (!isTextOrNumber)
                if (! token.match(/[{}\[\]:,]/))
                    console.warn("Invalid token:",token," at",getPosStr(index));
            if (token=="," && lastDataToken==",") { console.warn("Remove ',' at",getPosStr(index)); continue; }
            result += temp + token
            temp="";
            lastDataToken= token;
            lastDataTokenType = isTextOrNumber ? "text" : token;
            lastDataMatch = { token: match[0], index };
        }
    }
    result += temp;
    return result;
}




export function getObjectCommentsRef(object : object, commentDescriptor :CommentDescriptor)
{
    return (object as any)[Symbol.for(commentDescriptor) as CommentSymbol] as CommentToken[] | undefined
}

export function setObjectCommentsRef<T extends CommentToken[]|undefined>
    (object : object, commentDescriptor :CommentDescriptor, tokens :T)
: T {
    const symbol= Symbol.for(commentDescriptor) as CommentSymbol;
    if (tokens) (object as any)[symbol] = tokens;
    else delete (object as any)[symbol];
    return tokens;
}




type JsonObject = {[k :string] :JsonType} | JsonType[];

type JsonType = number|string|boolean|undefined|null | JsonObject;

// Создаём обёртку из имён типов для переданного объекта

function getObjectTypeWrapper(val : Readonly<JsonType>, getCustomType? : (key :string,val :unknown)=>string|undefined)  {
    //console.log("!",val, typeof(val));
    if (typeof(val)=="object")
        if (val) return _getObjectTypeWrapper(val, getCustomType);
        else return "null";
    if (typeof(val)=="string")
        if (val!="" && ! isNaN(+val)) return "NumberString";
    //console.log("!!!",typeof val);
    return typeof val;
}



function _getObjectTypeWrapper<T extends Readonly<JsonObject>> (obj : T,  getCustomType? : (key :string,val :unknown)=>string|undefined) : ResponseTypeObj
{
    let newObj = (Array.isArray(obj) ? [] : {}) as (unknown[] | {}) & {[k in keyof T] :unknown}; //as {[k in keyof T] :unknown} & [] : {} as {[k in keyof T] :unknown};
    // копируем только комментарии из исходного объекта
    for(let prop of Object.getOwnPropertySymbols(obj))
        (newObj as any)[prop] = (obj as any)[prop];
    //CommentJSON.assign(newObj, obj); for(let prop in newObj) delete newObj[prop];

    for(let [key,val] of Object.entries(obj)) {

        const type = getType();
        (newObj as any)[key] = type;

        function getType() {
            //let type : unknown = typeof(val);
            let customType= getCustomType?.(key, val);
            if (customType!==undefined) return customType;

            let defType = defaultParamTypesByName[key] ?? defaultParamTypesByName[key+"?"];
            if (defType) {
                defType= defType.replace(/\[]/,"") as NonNullable<typeof defType>;  // отделяем тип массива от квадратных скобок
                if (! defType.match(/string|number|boolean/)) {
                    let enumVals : readonly string[]|undefined = enums[defType as EnumTypeName];
                    //console.log("!!",key, enumVals);
                    if (enumVals) {
                        let checkVal = val instanceof Array ? val[0] as unknown : val;
                        if (checkVal==null || (typeof(checkVal)=="string" && enumVals.includes(checkVal))) {
                            if (val instanceof Array) //{ if (val.length==0 || typeof(val[0])=="string")
                                return [defType];
                            else return defType;
                        }
                    }
                }
            }

            let type= getObjectTypeWrapper(val as any, getCustomType);
            //if (key=="autoAssetExchange") console.log("$$ ",key, val, typeof(val)=="object" && val, typeof val);

            if (typeof(val)=="string" || typeof(val)=="number") {
                let comment= getObjectCommentsRef(obj, `after:${key}`)?.[0]?.value;
                if (comment) {
                    let list = comment.split(/[,，]/g); // разделяем запятыми (они там разные!)
                    if (list.length>1) { // && type=="string" || type=="number") {
                        let types :string[] = [];
                        //console.log("items: ",list.length);
                        let lastPairSize = 0;
                        for(let item of list) {
                            let pair= item.split(/[:：]/g).map(str=>str.trim());  // разделяем двоеточиями (они там разные!)
                            if (lastPairSize && pair.length != lastPairSize) {
                                console.error("Wrong values list in comment: ",comment);
                                break;
                            }
                            lastPairSize= pair.length;
                            let itemVal= pair[0].trim();
                            let itemType= isNumberString(itemVal) ? "number" : "string";
                            if (itemType=="string") {
                                // если стринг не в кавычках, значит это не значение
                                if (! itemVal.match(/^".*"$/)) continue;
                                //console.log(itemType);
                                if (type=="NumberString")  // раскрываем кавычки и проверяем, есть ли там число
                                    if (isNumberString(itemVal.slice(1,-1))) //typeStr.replace(/^"|"$/g, "");
                                        itemType= "NumberString";
                            }
                            if (itemType!=type) {
                                console.error("itemType!=type: ",{key, val, type, itemVal, itemType, comment});
                                break;
                            }
                            types.push(itemVal);
                        }
                        if (types.length==list.length)
                            type= types.join("|");
                    }
                    //newRows.push("comment_")
                }
            }
            return type;
        }
    }

    if (Array.isArray(newObj)) {
        let arr : unknown[] = newObj;
        let hasItemObject= arr.some(item => typeof(item)=="object");
        if (hasItemObject)
            for(let [i,item] of [...arr.entries()].reverse()) { // удаляем дублирующие типы
                if (arr.slice(0,i).find(it => deepEqual(it, item))) {
                    arr[i]= undefined;
                    // сдвигать элементы массива нельзя, т.к. иначе нарушится соответствие с responseExample
                    // arr.splice(i,1);
                    // for(let j=i; j<arr.length; j++)
                    //     setObjectCommentsRef(arr, `after:${j}`, getObjectCommentsRef(arr, `after:${j+1}`));
                }
            }
        else // если все элементы массива имеют одинаковые типы, то оставляем только первый
            if (arr.every((item)=> deepEqual(item, arr[0]))) //JSON.stringify(item)==JSON.stringify(arr[0])))
                arr.splice(1);
    }
    //console.log(obj); console.log(newObj); if (1) throw "exit";
    return newObj as ResponseTypeObj;
}




{

    let str=`{ 
        "status": 0,              // 0: normal，1：system maintenance
        "msg": "normal"           // "normal", "system_maintenance"
    }`;

    let str2=`
    {
       "code":200, // 200 for success; others are error codes
       "msg":"", // error message
       "snapshotVos":[
          {
             "data":{
                "marginLevel":"2748.02909813",
                "totalAssetOfBtc":"0.00274803",
                "totalLiabilityOfBtc":"0.00000100",
                "totalNetAssetOfBtc":"0.00274750",
                "userAssets":[
                   {
                      "asset":"XRP",
                      "borrowed":"0.00000000",
                      "free":"1.00000000",
                      "interest":"0.00000000",
                      "locked":"0.00000000",
                      "netAsset":"1.00000000"
                   }
                ]
             },
             "type":"margin",
             "updateTime":1576281599000
          }
       ]
    }`

    let myJson= CommentJSON.parse(str2);
    //console.log("!!!");
    if (0)
    (()=> {
        if (myJson) {
            let res= getObjectTypeWrapper(myJson);
            console.log(res)
            console.log(CommentJSON.stringify(res, null, 2))
            return;
        }
    })()
}

