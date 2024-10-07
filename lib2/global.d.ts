///<reference types="node/console"/>

export {}

//type AnyType= number|string|boolean|object|symbol|null|undefined;

declare global {
    interface ArrayConstructor {
        //isArray<T>(arg :T & (Extract<T,readonly any[]> extends never ? never : T)) : arg is Extract<typeof arg,readonly any[]>;
        //isArray<T>(arg :T & (Extract<T,readonly unknown[]> extends never ? never : T)) : arg is Extract<typeof arg,readonly unknown[]>;
        //isArray<T extends AnyType>(arg : T) : arg is Extract<typeof arg,readonly any[]>;
        //isArray<T extends AnyType|readonly any[]>(arg : T) : arg is Extract<T,readonly unknown[]|unknown>;
        //isArray<T extends AnyType,T2>(arg : T|readonly T2[]) : arg is T2[];
        //isArray(arg : unknown) : arg is readonly unknown[];
        isArray<T>(arg : T|readonly unknown[]) : arg is readonly unknown[];

    }
    //var Array : ArrayConstructor
}
