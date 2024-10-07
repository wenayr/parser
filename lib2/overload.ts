import {getFunctionTemplateBodyWithReplacedKeys} from "./helper";

type BaseParamTypeName = "string" | "number" | "boolean" | "function" | "[]" | "object" | "undefined" | "null";



export type tParam = { name : string,  type : BaseParamTypeName,  required : true };

function resolveParamType_(param? :tParam) { return param?.required ? param.type : undefined; }


type ParamTypeName= BaseParamTypeName|undefined|null;


export type Params<T extends ParamTypeName = ParamTypeName> = { [name :string] : T };


function resolveParamType(type :ParamTypeName) : BaseParamTypeName { return type ?? "undefined"; }


function getResolveParamDatas(paramSets : readonly Params[], msgPrefix: string, byIndexes= true, byNames=true)
: {resolveParamNames :string[], resolveParamIndexes :number[]}[]
{
    const sets= paramSets;
    return sets.map((params, i)=> {
        let resolveParamNames : string[] = [];
        let resolveParamIndexes : number[] = [];
        for(let [j,nextParams] of sets.slice(i+1).entries()) {
            if (byNames) {
                let allNames= Object.keys({...params, ...nextParams}); //.map(p => p.name);
                let paramName = allNames.find(name => resolveParamType(params[name]) != resolveParamType(nextParams[name]));
                if (! paramName) throw new Error(msgPrefix+": Failed to choose parameter name for split overload functions #"+i+" and #"+(i+j+1));
                resolveParamNames.push(paramName);
            }
            if (byIndexes) {
                let paramsArray= Object.values(params);
                let nextParamsArray= Object.values(params);
                let allIndexes= (paramsArray.length > nextParamsArray.length ? paramsArray : nextParamsArray).map((p,i)=>i);
                let paramIndex = allIndexes.find(index => resolveParamType(paramsArray[index]) != resolveParamType(nextParamsArray[index]));
                if (paramIndex==null) throw new Error(msgPrefix+": Failed to choose parameter index for split overload functions #"+i+" and #"+(i+j+1));
                resolveParamIndexes.push(paramIndex);
            }
        }
        return {resolveParamNames, resolveParamIndexes};
    });
}



//function({$paramType :typeof $paramType, $val: unknown}) :boolean


function getResolveFunctionBase($paramType :BaseParamTypeName) : (arg :{$paramType :typeof $paramType, $val: unknown})=>boolean {
    if ($paramType=="[]")
        return ({$val})=>Array.isArray($val);
    else
    if ($paramType=="null")
        return ({$val})=> $val===null;
    else return ({$val,$paramType}) => typeof($val)===$paramType;
}

function getResolveFunction(paramType :BaseParamTypeName, val: unknown)
{
    return ()=>getResolveFunctionBase(paramType)({$paramType: paramType, $val: val});
}


export function paramsResolver<T extends ParamTypeName> (paramSets : readonly Params<T>[], msgPrefix: string)
{
    //paramSets= paramSets as unknown as readonly Params[];
    paramSets= structuredClone(paramSets);
    let paramSets_ = paramSets as readonly Params[];
    let resolveSets= getResolveParamDatas(paramSets_, msgPrefix);
    let paramArraySets = paramSets.map(set=>Object.values(set));

    function* getResolveFunctionsByParamValues(iSet :number, values : readonly unknown[]) { //resolveParamIndexes :number[],
        let resolveParamIndexes= resolveSets[iSet].resolveParamIndexes;
        for(let iParam of resolveParamIndexes) {
            let val= values[iParam];
            let paramType= resolveParamType(paramArraySets[iSet][iParam]);
            yield getResolveFunction(paramType, val);
        }
    }
    function* getResolveFunctionsByParamStruct(iSet :number, struct : {readonly [name :string] :unknown}) { //resolveParamIndexes :number[],
        let resolveParamNames= resolveSets[iSet].resolveParamNames;
        for(let paramName of resolveParamNames) {
            let val= struct[paramName];
            let paramType= resolveParamType(paramSets[iSet][paramName]); //.find(p => p.name==paramName));
            yield getResolveFunction(paramType, val);
        }
    }

    function getResolveExpressionByParamValues(iSet :number,  $getParamVarName :(i :number)=>string) { //resolveParamIndexes :number[],
        let resolveParamIndexes= resolveSets[iSet].resolveParamIndexes;
        return resolveParamIndexes.map(iParam => {
            let paramType= resolveParamType(paramArraySets[iSet][iParam]);
            let func= getResolveFunctionBase(paramType);
            return getFunctionTemplateBodyWithReplacedKeys(func, { $paramType: paramType ?? "undefined",  $val: $getParamVarName(iParam)});
        }).join(" && ");
    }

    function getResolveExpressionByParamStruct(iSet :number, $getParamVarName :(i :number, name :string)=>string) { //$varNames : readonly string[]) { //resolveParamIndexes :number[],
        let resolveParamNames= resolveSets[iSet].resolveParamNames;
        return resolveParamNames.map(paramName => {
            let iParam= Object.keys(paramSets[iSet]).indexOf(paramName); // findIndex(p => p.name==paramName);
            let paramType= resolveParamType(paramSets[iSet][paramName]);//.find(p => p.name==paramName));
            let func= getResolveFunctionBase(paramType);
            return getFunctionTemplateBodyWithReplacedKeys(func, { $paramType: paramType ?? "undefined",  $val: $getParamVarName(iParam,paramName)});
        }).join(" && ");
    }

    // function getExpressionBody(functions :ReturnType<typeof getResolveFunction>[], values : unknown[], ) {
    //     functions.map(func => getFunctionTemplateBodyWithReplacedKeys(func)
    // }

    return {
        resolveByValues(values : unknown[]) : {index :number, data :Params<T>}|undefined {
            for(let [iSet] of resolveSets.entries()) {
                for(let func of getResolveFunctionsByParamValues(iSet, values))
                    if (func()==true) return { index: iSet, data: paramSets[iSet] };
                }
            return undefined;
        },
        resolveByStruct(struct : {[name :string] :unknown}) : {index :number, data :Params<T>}|undefined {
            for(let [iSet] of resolveSets.entries()) {
                for(let func of getResolveFunctionsByParamStruct(iSet, struct))
                    if (func()==true) return { index: iSet, data: paramSets[iSet] };
                }
            return undefined;
        },
        //getResolveByValuesExpressionStrings($argsVarNames : readonly string[]) : string[],
        //getResolveByValuesExpressionStrings($arrayVarName : string)            : string[],

        getResolveByValuesExpressionStrings($varNames : readonly string[]|string) : string[] {
            const getParamVarName = (i :number) => typeof($varNames)=="string" ?  $varNames+"["+i+"]" :  $varNames[i];
            return resolveSets.map((set,iSet)=>
                getResolveExpressionByParamValues(iSet, getParamVarName)
            );
        },
        getResolveByStructExpressionStrings($varNames : readonly string[]|string) : string[] {
            const getParamVarName = (i :number, name :string) => typeof($varNames)=="string" ?  $varNames+"."+name :  $varNames[i];
            return resolveSets.map((set,iSet)=>
                getResolveExpressionByParamStruct(iSet, getParamVarName)
            );
        }
    }
}