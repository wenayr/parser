import {QueryStruct} from "./connector";
import {tWeights} from "./interfaces";
import {getWeight, MyBinanceClientBase, WeightVal} from "./header";

type INT = number
type DECIMAL = number
type INTEGER = number
type LONG = number
type BigDecimal = number
type DOUBLE = number
type NumberString = `${number}`
type ENUM = string;
//type ARRAY<T = any> = T[];

export type PortfolioDetail = { targetAsset :string, percentage :number };


// $enums$



type KeysByType<T, PickT extends T[keyof T]> = { [key in keyof T]: T[key] extends PickT ? key : never; }[keyof T];

type BinanceFunctionName = KeysByType<Omit<MyBinanceClient,"getWeight"|"getFunctionInfo">, (...arg :any)=>Promise<any>>



export default class MyBinanceClient extends MyBinanceClientBase {

  // $methods$

  static getWeight<TFunc extends BinanceFunctionName> (functionName :TFunc, ...params : Parameters<MyBinanceClient[TFunc]> & [QueryStruct]) : WeightVal;
  static getWeight<TFunc extends BinanceFunctionName> (functionName :TFunc, ...params : Parameters<MyBinanceClient[TFunc]> & undefined[]) : WeightVal;

  static getWeight<TFunc extends BinanceFunctionName> (functionName :TFunc, params : Extract<Parameters<MyBinanceClient[TFunc]>[0], QueryStruct>)
  {
    return getWeight(this.weights, functionName, params) ?? (()=>{throw new Error("Wrong function name: "+functionName)})();
  }

  getWeight<TFunc extends BinanceFunctionName> (functionName :TFunc, ...params : Parameters<MyBinanceClient[TFunc]> & [QueryStruct]) : WeightVal;
  getWeight<TFunc extends BinanceFunctionName> (functionName :TFunc, ...params : Parameters<MyBinanceClient[TFunc]> & undefined[]) : WeightVal;
  getWeight<TFunc extends BinanceFunctionName> (functionName :TFunc, ...params : [QueryStruct]|undefined[]) : WeightVal {
      return this._getWeight(functionName, params[0] ?? {});
  }

  //getFunctionInfo<TFunc extends BinanceFunctionName>(functionName :TFunc) { return }

  protected override _getWeight(functionName :string, params :QueryStruct)
  {
    return getWeight(MyBinanceClient.weights, functionName, params) ?? (()=>{throw new Error("Wrong function name: "+functionName)})();
  }

  private static weights : {[func :string] :tWeights} = {
      // $weights$
  }
}
