import { JsTypeMap } from "./utils";

// constants
const DBP = {
    "DOCUMENTS": "LDB.Documents",
    "LAST_UPDATED": "LDB.LastUpdate",
    "LOCKED": "LDB.LOCKED"
}
const LOCK_INTERVAL_MS = 100;
const LOCK_TIMEOUT_MS = 5000;

export interface Document {
    _id: string;
    [key:string]: any;
}

export interface Query {
    [key:string]: string | Query;
    "$in": Query;
}

function randomUUID(len:number): string {
    let array = new Uint32Array(len);

    // populate array with random values using window crypto api
    window.crypto.getRandomValues(array);
    return [...array].map((n) => {return n.toString(16)}).join('-');
}

/**
 * Boolean if localstorage has property
 * @param key
 * @returns 
 */
function lsHasProperty(key:string): Boolean {
    return Boolean(localStorage.getItem(key));
}

/**
 * Set string value in localstorage
 * Implicitly convert type to string for storage, un-convert with lsGetProperty
 * @param key 
 * @param value 
 */
function lsSetProperty(key:string, value:any | object): void {
    switch(typeof value) {
        case "object": {
            localStorage.setItem(key, JSON.stringify(value));
        } break;

        case "string":
        case "bigint":
        case "number": {
            localStorage.setItem(key, String(value));
        } break;

        case "boolean": {
            localStorage.setItem(key, (value)? "true" : "false");
        } break;

        default:
            throw new Error(`Incompatible data type: ${typeof value}`);
    }
}

/**
 * Return value from localstorage casted as specified type
 * @param key 
 * @param expect 
 * @returns 
 */
function lsGetProperty<Expect extends keyof JsTypeMap>(key:string, expect: Expect): JsTypeMap[Expect] {
    const value = localStorage.getItem(key);

    if(value === null) {
        throw new Error(`Property not defined: ${key}`);
    }

    /**
     * Handle explicit type recast from localstorage
     */
    switch (expect) {
        // return number
        case "bigint":
        case "number": {
            return parseFloat(value) as JsTypeMap[Expect];
        } break;

        case "boolean": {
            return Boolean(value === "true") as JsTypeMap[Expect];
        } break;

        case "object": {
            try {
                return JSON.parse(value) as JsTypeMap[Expect];
            } catch (e) {
                throw new Error(`Failed to parse value expected to be object: ${value}: ${e}`);
            }
        } break;

        case "string": {
            return value as JsTypeMap[Expect];
        } break;

        default:
            return value as any;
    }
} 

/**
 * Get json object from localstorage
 * @param key 
 * @returns 
 */
function lsGetJSON(key:string): null | {[key:string]: any} {
    let ls_object;
    try {
        ls_object = lsGetProperty(key, "object");
    } catch (e) {
        throw new Error(`Failed to parse item ${key} of localStorage: ${e}`);
    }

    if(ls_object === null) {
        return null;
    }

    return ls_object;
}

/**
 * 
 */
export class LsDb<T extends Document> {
    private Documents:{[key:string]: T};
    private LastUpdated: number;
    private locked: Boolean;

    constructor(collection: string) {
        // instantiate localstorage if it doesnt exist
        if(!lsHasProperty(DBP.DOCUMENTS)) {lsSetProperty(DBP.DOCUMENTS, {})};
        if(!lsHasProperty(DBP.LAST_UPDATED)) {lsSetProperty(DBP.LAST_UPDATED, Date.now())};
        if(!lsHasProperty(DBP.LOCKED)) {lsSetProperty(DBP.LOCKED, false)};

        try {
            this.Documents = lsGetJSON(DBP.DOCUMENTS) as T;
            this.LastUpdated = lsGetProperty(DBP.LAST_UPDATED, "number");
            this.locked = lsGetProperty(DBP.LOCKED, "boolean");
        } catch (e) {
            throw new Error(`Failed to instantiate on existing data: ${e}`);
        }

        // test lock & unlock
        this.lock();
        console.log("lock");

        setTimeout(() => {
            this.unlock();
            console.log("unlock");
        }, 5000);
    }

    /**
     * Handle locking and unlocking the database
     */
    private lock = async() => {
        if(this.locked) {
            return;
        }

        // check if currently unlocked
        let lock_awaiter;
        let lock_timeout;
        try {
            await new Promise((resolve,reject) => {
                lock_awaiter = setInterval(() => {
                    if(!lsGetProperty(DBP.LOCKED, "boolean")) {
                        resolve(null);
                    }
                }, LOCK_INTERVAL_MS);
    
                // reject the checker if acquiring lock times out
                lock_timeout = setTimeout(() => {
                    reject(`Could not acquire lock within ${LOCK_TIMEOUT_MS}ms`);
                }, LOCK_TIMEOUT_MS)
            });
        } catch (e) {
            throw new Error(`Failed to acquire database lock: ${e}`);
        } finally {
            // clean up intervals
            clearInterval(lock_awaiter);
            clearTimeout(lock_timeout);
        }

        // acquire lock
        lsSetProperty(DBP.LOCKED, true);
        this.locked = true;
    }
    private unlock = async() => {
        if(!this.locked) {
            return;
        }

        lsSetProperty(DBP.LOCKED, false);
        this.locked = false;
    }

    /**
     * Clear any locks that could have been left, call on onload
     */
    public clear_locks = async () => {
        lsSetProperty(DBP.LOCKED, false);
        this.locked = false;
    }

    // public insert = async(document:T): Promise<T | null> {

    // }

    // public update = async(query:Query, document:T): Promise<T | null> {

    // }

    // public find = async(query:Query): Promise<T | null> {

    // }

    // public delete = async(query:Query): Promise<Boolean> {

    // }

    // private make_id = async(): Promise<string> {

    // }
}