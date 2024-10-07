import {Table} from "./interfaces";

export * from "./functionParse"




// Перевод в верблюжий регистр
export function camelize(str :string) { return str.trim().replace(/[^a-z]?[A-Z]/, match=>match.toLowerCase()).replace(/\W+(.|$)/g, (match, chr)=>chr.toUpperCase()); }


export function deepCloneCommentedJSON<T extends {readonly [k :string|symbol] :unknown} | readonly any[]> (obj : T) : T;

export function deepCloneCommentedJSON<T extends {readonly [k :string|symbol] :unknown}> (obj : T, keyNameReplace :(key :string)=>string) : { [k :string|symbol] :T[string|symbol]};

export function deepCloneCommentedJSON<T extends {readonly [k :string|symbol] :unknown}> (obj : T, keyNameReplace? :(key :string)=>string)
{
    let newObj= (obj instanceof Array ? [] : {}) as {[k :symbol|string] :unknown};
    keyNameReplace ??= (key)=>key;
    //CommentJSON.assign(newObj, obj);
    for(let key in obj) {  //for(let key of Reflect.ownKeys(obj)) {
        let val= obj[key];
        //console.log("!", key, val);
        if (val && typeof(val)=="object")
            val= deepCloneCommentedJSON(val as {}, keyNameReplace) as T[typeof key];
        //if (typeof(val)=="string") val= keyValPrefix + val + keyValPostfix;
        //if (typeof(key)=="symbol") {}
        if (!(obj instanceof Array) || isNaN(+key))  // если это не число
            key= keyNameReplace(key) as typeof key;
        newObj[key]= val;
    }
    for(let key of Object.getOwnPropertySymbols(obj)) {
        let val= obj[key];
        let descr= key.description;
        let split= descr?.split(":") ?? [];
        let commentKey= split.length==2 ? split[1] : null;
        if (commentKey && commentKey in obj)
            if (! Array.isArray(obj) || isNaN(+commentKey))
                key= Symbol.for(split[0] + ":" + keyNameReplace(commentKey));
        newObj[key]= structuredClone(val);
    }
    return newObj;
}


class RemoveableItems<T> {
    arr : T[];
    constructor(arr :readonly T[]) { this.arr= [...arr]; }
    // вынимаем из массива элемент, удовлетворяющий условию
    remove(predicate :(el :T, index :number, arr :T[])=>boolean) {
        let i= this.arr.findIndex(predicate);
        if (i<0) return null;
        let el= this.arr[i];
        this.arr.splice(i,1);
        return el;
    }
}


export type ObjectDeepValType<T> = T extends object ? T | ObjectDeepChildValType<T> : T

type ObjectDeepValType_<TObj, T> = TObj extends T  ? T : ObjectDeepValType<T>;

export type ObjectDeepChildValType<T> =
    //T extends any[] ? ObjectDeepChildValType< Omit<T, keyof any[] &(symbol|string)> >  // исключаем ключи объекта Array кроме числовых
    T extends readonly any[] ? ObjectDeepValType_<T, T[number | Exclude<keyof T &string, keyof any[]>]>
    : T extends object ? ObjectDeepValType_<T, keyof T extends symbol ? never : T[keyof T]>
    : never;
//export type ObjectDeepChildValType<T> = T extends any[] ? ObjectDeepValType<T[number] | Omit<T, keyof any[]>> : T extends {[k:string]:any} ? ObjectDeepValType<T[keyof T &(string|number)]> : never;



// глубокая итерация по всем entries объекта

export function* deepIterateObject<TObj extends object> (object : TObj, address :readonly string[]= [])
: Iterable<{object :typeof object, key :string, value :ObjectDeepChildValType<TObj>, address : string[]}>
{
    for(let key in object) {
        let addr= address.concat(key);
        let value= object[key];// as keyof typeof object];
        yield { object, key, value: value as ObjectDeepChildValType<TObj>, address: addr };
        if (value && typeof(value)=="object") yield *deepIterateObject(value as TObj, addr);
        //else yield { object, key, value, address: addr };
    }
}

//a: "ggg", b: [56] as const,
// for(let item of deepIterateObject({ c: {} as {[s: symbol] : boolean}})) {
//     let val = item.value;
//     type gthth = Omit<[56], keyof any[]|symbol>
//
//     console.log(val);
// }

function __getObjectValueByAddress(object :unknown, address :readonly string[]) : unknown {
    if (address.length==0) return undefined;
    let val= (object as any)[address[0]];
    return address.length==1 ? val : __getObjectValueByAddress(val, address.slice(1));
}

export function getObjectValueByAddress(object :{readonly[k :string] :unknown}|unknown[], address :readonly string[]) : unknown {
    return __getObjectValueByAddress(object, address);
}


export function arrayToStruct<T>(array : readonly T[], getKey :(item :T)=>string) {
    let obj : {[k :string] :T} = {};
    for(let el of array) obj[getKey(el)] = el;
    return obj;
}

//export function deepEqual<T extends { [key: string]: any }>(object1: T, object2: T)

//export function deepEqual<T extends {[s :string|number] :T} | string|number|boolean|null|undefined> (object1: T, object2: T) : boolean //}, equalityComparer? :(a :any, b :any)=>boolean|undefined) {

export function deepEqual<T> (object1: T, object2: T) : boolean //}, equalityComparer? :(a :any, b :any)=>boolean|undefined) {
{
    if (object1===object2) return true;
    if (object1==null || object2==null) return object1===object2;
    if (typeof object1 != "object" || typeof object2 != "object") return object1===object2;

    const keys1 = Object.keys(object1);
    const keys2 = Object.keys(object2);

    if (keys1.length != keys2.length) return false;

    for (const key of keys1) {
        const val1 = object1[key as keyof T];
        const val2 = object2[key as keyof T];
        if (! deepEqual(val1, val2))
            return false;
    }
    return true;
}



export function getHTMLTableContent($table : Element, fillSpans :boolean= false) : Table & {toString() :string} {  // fillSpans - заполнить все ячейки объединения одинаковым значением

    let columns : { text :string, iNextRow :number }[] = [];

    return {
        header : Array.from($table.getElementsByTagName("th")).map(el => el.textContent ??""),
        rows : Array.from($table.querySelectorAll("tbody > tr"))
            .map(($row,iRow)=>{
                let tdIterator= Array.from($row.getElementsByTagName("td"))[Symbol.iterator]();
                let values : string[] = [];
                for(let iCol=0;  ; iCol++) {
                    let col = columns[iCol] ??= { text: "", iNextRow: 0 };
                    if (iRow < col.iNextRow) { values.push(fillSpans ? col.text : ""); continue; }
                    let $item= tdIterator.next().value;
                    if (! $item) break
                    let text= $item.textContent ?? "";
                    let rowSpan = $item.getAttribute("rowspan");
                    if (rowSpan) {
                        let spanNum= +rowSpan;
                        if (isNaN(spanNum)) throw new Error("Wrong rowspan at table row #"+iRow);
                        col.iNextRow= iRow + spanNum;
                        col.text= text;
                    }
                    values.push(text);
                }
                return values;
            }),
        toString() { return tableToString(this, "alignByTab"); }
    }
}
//import {resolveParamType} from "./parser";


export function tableToString(table :Table, mode: "alignBySpaces"|"alignByTab"= "alignBySpaces") {
    let fullTable= [table.header].concat(table.rows); //table.rows.concat(table.header)
    if (mode=="alignByTab") return fullTable.map(row=>row.join("\t")).join("\n");
    let maxWidths= fullTable.reduce(
            (prevWidths, row) =>row.map(
                (cellTxt,iRow)=>Math.max(cellTxt.length, prevWidths[iRow] ?? 0)
            ),
            [] as number[]
        );
    return fullTable.map(cells=>cells.map((cellTxt,i)=>cellTxt.padEnd(maxWidths[i]," ")).join(" ")).join("\n");
    //return table.header.join("\t") + "\n" + table.rows.map(cells=>cells.join("\t")).join("\n");
}