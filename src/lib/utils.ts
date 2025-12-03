export type JsTypeMap = {
    string: string;
    number: number;
    boolean: boolean;
    object: object;
    function: Function;
    undefined: undefined;
    symbol: symbol;
    bigint: bigint;
};

export const date_formatter = new Intl.DateTimeFormat('en-US', { 
    month: '2-digit', 
    day: '2-digit', 
    year: 'numeric' 
});