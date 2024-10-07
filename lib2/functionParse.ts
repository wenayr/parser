// удаляем начальный отступ строк кода
export function removeCodeIndents(str :string) {
    let lines= str.split("\n");
    let minIndent= lines.reduce(
        (minVal, line)=>
            line.length>0 ? Math.min(minVal, line.length - line.trimStart().length) : minVal,
        Number.MAX_SAFE_INTEGER
    );
    if (minIndent > 0) str= lines.map(line=>line.substring(minIndent)).join("\n");
    return str;
}


{
let str= `
                            IP: (params :QueryStruct) =>
                                typeof(params["limit"])=="number"
                                    ? [[100,5],[500,25],[1000,50],[5000,250]].find((item,i,arr)=> (params["limit"] as number)<=item[0] || i==arr.length-1)! [1]
                                    : (()=>{throw new Error("Parameter \'limit\' is not a number")})(),
`;
//console.log(removeCodeIndents(str));
}


type FunctionParseBase = { body: string, args: string[] };

type FunctionParse = FunctionParseBase & { async: boolean };


export function parseFunctionString(str :string) : Readonly<FunctionParse>
{
    str= str.trim();
    const match = str.match(/\)\s*(=>)?\s*|\)?\s=>\s*/); //str.match(/\)\s*{|\)?\s=>\s*[({]?/);
    if (! match) throw new Error("Failed to find beginning of a function body", {cause: 1});
    let matchStr= match[0];
    // если есть лишние скобки вокруг всей функции, то раскрываем их
    if ([...str.slice(0, match.index).matchAll(/\(/g)].length  > (matchStr[0]==")" ? 1 : 0)) {
        if (str.match(/^\((.|\n)*\)$/)) //
            return parseFunctionString( str.replaceAll(/^\(|\)$/g, "") );
        else throw new Error("Wrong parentheses in function: "+str, {cause: 2});
    }

    let iNext= match.index!+matchStr.length;
    let iEnd= str.length;
    //if (str[iNext]=="{") { iNext++;  iEnd= str.lastIndexOf("}"); }
    return {
        get body() { return str.substring(iNext, iEnd); },
        get args() {
            let argsMatch= str.slice(0, match.index!).match(/(?<=\().*|[^\s,()]+\s*$/); //+(?=\s*$)/);
            if (! argsMatch) throw new Error("Failed to find function arguments", {cause: 2});
            return argsMatch[0].split(",").map(arg=>arg.trim());
        },
        get async() { return str.startsWith("async"); }
    }
}


export function tryParseFunctionString(str :string) : FunctionParse | null {
    try {
        return parseFunctionString(str);
    }
    catch(e) { if ((e as Error).cause != null) return null;  else throw e; } //(e as Error).cause)
}

type UnknownFunction = (...args :never)=>unknown;

export function parseFunction(func :Function) { return parseFunctionString(func.toString()); }

export function tryParseFunction(func :Function) { return tryParseFunctionString(func.toString()); }

export function parsedToFunction<TFunc extends Function = UnknownFunction> (parse :Readonly<FunctionParseBase>) {
    let body= parse.body;  if (body[0]!="{") body= "return "+body;
    let func = Function(...parse.args, body) as TFunc;
    if (parse.body[0]!="{")
        func.toString = ()=> "("+parse.args.join(",")+") => "+parse.body;
    return func;
}

export function functionFromString<TFunc extends Function = UnknownFunction>(str :string) {
    let parsed = parseFunctionString(str);
    return parsedToFunction<TFunc>(parsed);
}




if (0)  // test parse
(()=>
{
    function parseTest(str :string) {
        console.log(str);
        return {...parseFunctionString(str)};
    }

    let funcStr = `   
        methodTemplate({ $endPnt, $method, $hmac256, $paramArgs, $keysOrOverloads, $funcName }) {                    
                            return this._sendRequest($endPnt, $method, $hmac256, $paramArgs, $keysOrOverloads, $funcName);      
                        } 
    `;
    //console.log(parseTest(funcStr));  return;

    function fff1(a :number, b :string) {
        console.log("hello", { x: 10});
    }
    const fff2 = (a :string)=> console.log("hello", { x: 10})
    //@ts-ignore
    const fff3 = a=> console.log("hello", { x: 10})
    //@ts-ignore
    const fff4 = async a=> console.log("hello", { x: 10})

    const fff5 = ({a} : {a :string})=> console.log("hello", { x: 10})

    const fff6 = (a :number) => ({b :10});

    console.log(parseTest(fff1.toString()));
    console.log(parseTest(fff2.toString()));
    console.log(parseTest(fff3.toString()));
    console.log(parseTest(fff4.toString()));
    console.log(parseTest(fff5.toString()));
    console.log(parseTest(fff6.toString()));

    let func = (params :any) => typeof (params["limit"]) == "number" ? true : false;
    console.log({...parseFunction(func)},"\n",parsedToFunction({...parseFunction(func)}).toString());

})();


/** Получаем тело функции
*/
export function getFunctionBody(f :Function, removeIndent=false) {
    let str= parseFunction(f).body;
    return removeIndent ? removeCodeIndents(str) : str;
}


/** Получаем тело функции-шаблона с заменёнными ключами на свои текстовые значения
*/
export function getFunctionTemplateBodyWithReplacedKeys<T extends {[k:string]:unknown}> (
    templateFunc :(arg :T)=>void,
    replacements :{[key in keyof T] :string},
    removeIndent = false
) {
    let str = getFunctionBody(templateFunc, removeIndent);
    for(let key in replacements) str= str.replace(key, replacements[key]);
    return str;
}

// модифицируем текст тела функции
export function updateFunctionBody<TFunc extends Function>(func :TFunc, updater: (body :string)=>string) : TFunc {
    let parse : FunctionParse = {...parseFunction(func)};
    parse.body= updater(parse.body);
    return parsedToFunction(parse) as Function as TFunc;
}

export function replaceInFunctionBody<TFunc extends Function>(func :TFunc, searchVal: string|RegExp, replaceStr: string) {
    return updateFunctionBody(func, body=>body.replaceAll(searchVal, replaceStr));
}

type BaseType = string|number|boolean|null|undefined;

/** Развернуть шаблон функции, заменив в теле функции аргументы шаблона (ключи) на заданные значения
*  * например:  resolveFunctionTemplate((a,b)=>((x :number)=>(a+x)*b), [10, 20])  - вернёт функцию (x)=>(10+x)*20
*  * либо:      resolveFunctionTemplate(({a,b})=>((x :number)=>(a+x)*b), {a:10, b:20})
*/
export function resolveFunctionTemplate<Templ extends {[key :string] :BaseType} | BaseType[],  TFuncTempl extends (Templ extends any[] ? (...arg :Templ)=>Function : (arg :Templ)=>Function)> (
    templateFunc :TFuncTempl,     // функция-шаблон, возвращающая итоговую функцию, использующую аргументы шаблона
    replacements :Templ,          // замены ключей шаблона
    removeIndent = false  // удалить начальный отступ
) :ReturnType<TFuncTempl> {
    let parsed= parseFunction(templateFunc);
    let bodyStr= parsed.body;  // getFunctionBody(templateFunc, removeIndent);
    if (replacements instanceof Array)
        for(let [i, key] of parsed.args.entries()) bodyStr= bodyStr.replace(key, replacements[i]+"");
    else for(let key in replacements) bodyStr= bodyStr.replace(key, replacements[key]+"");
    return functionFromString(bodyStr);
}

//resolveFunctionTemplate((a,b)=>((x :number)=>(a+x)*b), [10, 20])
//resolveFunctionTemplate(({a,b})=>((x :number)=>(a+x)*b), {a:10, b:20})

