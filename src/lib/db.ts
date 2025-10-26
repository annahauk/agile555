import { JsTypeMap } from "./utils";

// constants
const DBP = {
    "DOCUMENTS": "LDB.Documents",
    "LAST_UPDATED": "LDB.LastUpdate",
    "LOCKED": "LDB.LOCKED",
    "LAST_UPDATER": "LDB.LastUpdater"
}
const LOCK_INTERVAL_MS = 100;
const LOCK_TIMEOUT_MS = 5000;
const UUID_LENGTH = 4;

const QUERY_OPTS = ["$includes", "$ge", "$le", "$regex", "$append", "$remove"] as const;
type QUERY_OPT = typeof QUERY_OPTS[number];

export interface Document {
    [key:string]: any;
}

// collection type (each key of db documents), map of _id to document content
export type Collection <T extends object> = Record<string, WithId<T>>;

export type Query<T extends object> = Partial<
    {[K in keyof T]: any} &
    {[K in QUERY_OPT]?: any}
>

// provide extender type WithId<> for returns to guarantee that _id is present
export type WithId<T extends Document, Id = string> =
  Omit<T, "_id"> & { _id: Id };   // keep as intersection; no mapped "flattening"

/**
 * 
 * Begin helpers
 * 
 */

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
function lsGetJSON(key:string): {[key:string]: any} {
    let ls_object;
    try {
        ls_object = lsGetProperty(key, "object");
    } catch (e) {
        throw new Error(`Failed to parse item ${key} of localStorage: ${e}`);
    }

    if(ls_object === null) {
        throw new Error(`Object key not found: ${key}`);
    }

    return ls_object;
}

/**
 * 
 * Begin main database class
 * 
 */
export class LsDb<T extends Document> {
    private Documents:{[key:string]: Collection<T>};
    private LastUpdated: number;
    private UniqueID: string = randomUUID(4);
    private collection: string;
    private locked: Boolean;

    constructor(collection: string) {
        // instantiate localstorage if it doesnt exist
        if(!lsHasProperty(DBP.DOCUMENTS)) {lsSetProperty(DBP.DOCUMENTS, {})};
        if(!lsHasProperty(DBP.LAST_UPDATED)) {lsSetProperty(DBP.LAST_UPDATED, Date.now())};
        if(!lsHasProperty(DBP.LAST_UPDATER)) {lsSetProperty(DBP.LAST_UPDATER, this.UniqueID)}
        if(!lsHasProperty(DBP.LOCKED)) {lsSetProperty(DBP.LOCKED, false)};

        try {
            this.Documents = lsGetJSON(DBP.DOCUMENTS) as T;
            this.LastUpdated = lsGetProperty(DBP.LAST_UPDATED, "number");
            this.locked = lsGetProperty(DBP.LOCKED, "boolean");
        } catch (e) {
            throw new Error(`Failed to instantiate on existing data: ${e}`);
        }

        this.collection = collection;

        // create collection if it doesnt exist
        if(typeof this.Documents[collection] === "undefined") {
            this.Documents[collection] = {};
        }
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

        // update last updater property
        lsSetProperty(DBP.LAST_UPDATER, this.UniqueID);
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

    private sync = async() => {
        const last_updater = lsGetProperty(DBP.LAST_UPDATER, "string");

        // if last updater was this instance, skip resync
        if(last_updater !== this.UniqueID) {
            // resync documents
            this.Documents = lsGetJSON(DBP.DOCUMENTS);
        };

        // update last updated
        this.LastUpdated = lsGetProperty(DBP.LAST_UPDATED, "number");

        return;
    }

    public insert = async(document:any): Promise<WithId<T>> => {
        // acquire lock & sync
        await this.lock();
        await this.sync();
        
        // find a unique primary key
        let p_key = randomUUID(UUID_LENGTH);

        // check for collisions
        while(typeof this.Documents[p_key] !== "undefined") {
            p_key = randomUUID(UUID_LENGTH);
        }

        // build document
        let new_document: WithId<T> = {
            _id: p_key,
            ...document
        }

        // create collection if not yet defined
        if(typeof this.Documents[this.collection] === "undefined") {
            this.Documents[this.collection] = {};
        }

        // insert
        this.Documents[this.collection][p_key] = new_document;

        // write to storage
        lsSetProperty(DBP.DOCUMENTS, this.Documents);

        // release lock and return document
        await this.unlock();
        return new_document;
    }

    // public update = async(query:Query, document:T): Promise<T | null> {

    // }

    public find = async(query: Query<T>): Promise<Array<WithId<T>>> => {
        await this.sync()
        const COLLECTION = this.Documents[this.collection];
        
        let res = new Array<WithId<T>>();

        for(const k of Object.keys(COLLECTION)) {
            if(await this.query_filter(COLLECTION[k], query)) {
                res.push(COLLECTION[k]);
            }
        }

        return res;
    }

    public findOne = async(query: Query<T>): Promise<WithId<T> | null> => {
        let res = await this.find(query);
        return res[0] ?? null;
    }

    // public remove = async(query:Query): Promise<Boolean> {

    // }

    private query_filter = async(doc: any, query: Query<T>): Promise<boolean> => {
        for(const prop of Object.keys(query)) {
            const val = query[prop];

            switch(typeof val) {
                /**
                 * Direct comparisons
                 */
                case "bigint":
                case "boolean":
                case "number":
                case "string": {
                    if(doc[prop] !== val) {
                        return false;
                    }
                } break;

                /**
                 * Query operator
                 */
                case "object": {
                    if(val === null) {
                        break;
                    }

                    const opts = Object.keys(val);

                    for(const op of opts) {
                        const doc_val = doc[prop];
                        const test_val = (val as any)[op];

                        switch (op as QUERY_OPT) {
                            /**
                             * greater than / equal to
                             */
                            case "$ge": {
                                // ensure both are numbers
                                if(typeof doc_val === "number" && typeof test_val === "number") {
                                    if(!(doc_val >= test_val)) {
                                        return false;
                                    }
                                } else {
                                    throw new Error(`Cannot use $ge with non-numerical values.`);
                                }
                            } break;

                            /**
                             * less than / equal to
                             */
                            case "$le": {
                                // ensure both are numbers
                                if(typeof doc_val === "number" && typeof test_val === "number") {
                                    if(!(doc_val <= test_val)) {
                                        return false;
                                    }
                                } else {
                                    throw new Error(`Cannot use $le with non-numerical values.`);
                                }
                            } break;

                            /**
                             * Array includes
                             */
                            case "$includes": {
                                if(Array.isArray(doc_val) || typeof doc_val === "string") {
                                    // test if included
                                    if(!doc_val.includes(test_val)) {
                                        return false;
                                    }
                                } else {
                                    throw new Error(`Cannot use $includes on non-string or non-array value.`);
                                }
                            } break;

                            /**
                             * Do regex match
                             */
                            case "$regex": {
                                if(typeof doc_val === "string") {
                                    let reg = new RegExp(test_val);
                                    if(reg.exec(doc_val) === null) {
                                        return false;
                                    }
                                } else {
                                    throw new Error(`Cannot use $regex on non-string value`);
                                }
                            } break;

                            default: {
                                throw new Error(`Bad query operation: ${op}`);
                            }
                        }
                    }

                } break;

                /**
                 * Values not comparable (functions, symbols, undefined)
                 */
                default: {
                    return false;
                }
            }
        }

        return true;
    }
}
