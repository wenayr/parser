import {commentSymbol,CommentToken} from "comment-json";
import {QueryStruct} from "./connector";

export type Table = { header : string[], rows : string[][] };

export type tWeightByLimits = {limit: number, weight: number}[];

export type WeightFuncString = `function ${string}` | `(${string})=>${string}` | `\n${string}(${string})=>${string}`;// | `${string}=>${string}`;

export type tWeight = number|((params: QueryStruct)=>number)|WeightFuncString;//|Table;  //tWeightByLimits|

export type RateLimitString = `${number}/${number}s` | `${number}/${number}min`;

export type tWeights = {IP? :tWeight, UID? :tWeight, orders? :readonly RateLimitString[]|number, isConnection? :boolean};

export type tWeightsExt = {
    UID : tWeight|undefined,
    IP : tWeight|undefined,
    rateLimitPerAccount? :RateLimitString,
    rateLimitPerParam? : { [param :string] : RateLimitString },
    rateLimitPerIP? : RateLimitString,
    orderCounts? : RateLimitString[],
    sharedWithEndpoint? : string, //TODO: Реализовать обработку поля sharedWithEndpoint
    UID_text? :string,
    IP_text? :string,
    orders_text? :string
    rateLimit_text? :string
};


export type ParamTypeArray = { arrayItemType : ParamType }

export type ParamTypeStruct = { structItems : Param[] }

export type ParamTypeEnum = { enumItems: (string|number)[] }

export type ParamType = string | ParamTypeArray | ParamTypeEnum | ParamTypeStruct;


export type Param<T extends ParamType = ParamType> = {
    name : string,
    type : T,
    required : boolean,
    description : string
}

export type Params = { [key :string] : Param };

export type ParamArray = Param[] & { get(name :string) : Param|undefined };

export class CParamArray extends Array<Param> implements ParamArray { readonly get= (name :string)=> this.find(param=>param.name==name); }

// let aaa= new CParamArray;
// aaa.push({name:"myName", type: "string", required: true, description: ""});
// console.log({...aaa}.length)

export const SecurityType = {TRADE: "TRADE", MARGIN: "MARGIN", USER_DATA: "USER_DATA", USER_STREAM: "USER_STREAM", MARKET_DATA: "MARKET_DATA", System: "System"} as const; //, NONE: ""
export type SecurityType = keyof typeof SecurityType | "";

export type ApiType= "spot"|"usd-futures"|"coin-futures"|"options"|"portfolio";

export type ApiInfo = Readonly<{
    url : string,
    type : ApiType;
    defaultWeightType? : WeightType
}>

//export class CParamsArray extends Array<Param> { get(name :string) { return this.find(p => p.name==name); }}
//export type ParamsArray = Readonly<CParamsArray>


export type ResponseData = string | number | boolean | null | (({[key:string] :ResponseData} | ResponseData[]) & {[k :symbol]: CommentToken[]});

export type ResponseTypeObj = ({[key:string] :ResponseType} | ResponseType[]) & {[k :symbol]: CommentToken[]}
//export type ResponseTypeObj = {[key:string] :ResponseType} | (ResponseType[] & {ggg :boolean })

export type ResponseType = string | ResponseTypeObj | undefined;  //CommentObject | CommentArray<CommentJSONValue> | //Exclude<CommentJSON.CommentJSONValue, null> | undefined;

//console.log({...new class { fff() { } }});

export type EndPntData = {
    apiType :ApiType,
    parentName? :string,
    name :string,
    ref :string,
    path :string,
    description? :string,
    request :string,
    requestEndPoint : string,
    requestMethod : string,
    securityType : SecurityType,
    hmacSHA256 :boolean,
    weights : tWeightsExt, //number|tWeightByLimits|Table,
    baseParams : Params, //Param[],
    overloads : {  // перегрузки функций
        name? : string,
        params : Params, //Param[],
        //responses : { name :string, example :ResponseData, type :ResponseType }[];
        responseNames : string[],
        responseExamples : ResponseData[], // массив примеров ответов
        responseTypes : ResponseType[],    // массив типов ответов
        weightsStr? : Pick<tWeightsExt, "IP_text"|"UID_text"|"rateLimit_text"|"orders_text">
        isMinor? :boolean  // флаг, означающий, что данная перегрузка второстепенная
    }[],
    //paramUnions? : readonly {params: readonly string[], aliasName :string} []
}


export type FuncData = EndPntData["overloads"][0];


export type ElData =
    //Omit<Partial<Data>,"params"> & Pick<Data, "name"|"ref"|"path"> &
{
    //weightStr : string|undefined,
    name :string,
    ref :string,
    type :ApiType,
    paramTable :Table|undefined;
    dom : {
        elements : readonly Element[]
        $request : Element|undefined,
        $responses : readonly Element[],
        $description : Element|undefined,
        $weight : Element|undefined,
        $params : Element|undefined,
    },
    //check: boolean,
    //params : {[name :string] : Param|undefined} | undefined;
}

export type WeightType= "IP" | "UID";


export type Patch = {
    ref : `#${string}` | RegExp;
    type? : ApiType
} & Partial<{

    /* пока отключил
    description : (data :ElData) => string|undefined,  // { matchString :string|RegExp, result :string },
    requestMethod : (data :ElData) => string|undefined,
    requestEndPoint : (data :ElData) => string|undefined,
    hmacSHA256 : (data :ElData) => boolean|undefined,

    responseExamples : (data :ElData) => CommentJSON.CommentObject[]|undefined,  // массив примеров возвращаемых данных
    responseTypes : (data :ElData) => CommentJSON.CommentObject[]|undefined,  // массив типов возвращаемых данных
    */

    //weight :  (data :ElData) => number|undefined|((params: QueryStruct)=>number),
    //weightType : (data :ElData) => WeightType|undefined,

    weight :  (data :ElData, params?: Params) => tWeightsExt|undefined,

    params : (data :ElData) => Param[]|Params|undefined,

}>