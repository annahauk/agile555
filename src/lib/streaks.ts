import { LsDb } from "./db";

type streak = {
    lastActivity: number;
    length: number;
    key: string;
    activities: Array<string>;
}

const PERSISTANCE_KEY = "STREAK_DATA";
const STREAK_LIFETIME = (60*60)*24; // one day in seconds

const db = new LsDb<streak>("streak");

export class Streak {
    private length: number; // streak length in days
    private lastActivity: number;
    private lost:boolean = false;
    private initialized:boolean = false;

    constructor() {
        // attempt to load previously streak data
        this.length = 0;
        this.lastActivity = 0;
    }

    /**
     * Async initializer to get data from db
     */
    public init = async() => {
        const data = await db.findOne({key: PERSISTANCE_KEY});

        // if no persistance data, create new, else load
        if(!data) {
            // new data
            this.lastActivity = Date.now();
            this.length = 1;
            this.save("Logged in.");
            this.initialized = true;
        } else {
            this.lastActivity = data.lastActivity;
            this.length = data.length;

            /**
             * Check if streak has been lost
             */
            if(Date.now().valueOf() - this.lastActivity.valueOf() >= STREAK_LIFETIME) {
                /**
                 * Streak lost
                 */
                this.lost = true;
                this.length = 0;
                await this.clearActivities();
            } else {
                // check if logging in on a new day (streak length changes per-day)
                // midnight of the last day of last activity
                let lastCheckedDay = new Date(this.lastActivity).setHours(0, 0, 0, 0).valueOf();
                let currentDay = new Date(Date.now()).setHours(0,0,0,0).valueOf();

                // if current day is ahead of previous activity day, increment streak
                // prevents incrementing streak every time the app is opened.
                if(currentDay > lastCheckedDay) {
                    this.length++;
                }
            }

            await this.save("Logged in.");
            this.initialized = true;
        }
    }

    /**
     * Report streak length
     */
    public getLength = async(): Promise<number> => {
        if(!this.initialized) {
            throw `Cannot use streak class before initialization. Use streak.init() to initialize it.`;
        }

        return this.length;
    }

    /**
     * Check if streak has been lost
     */
    public wasLost = async(): Promise<boolean> => {
        if(!this.initialized) {
            throw `Cannot use streak class before initialization. Use streak.init() to initialize it.`;
        }

        return this.lost;
    }

    /**
     * Add an activity to the streak
     * @param activity 
     */
    public add = async(activity:string): Promise<void> => {
        if(!this.initialized) {
            throw `Cannot add activities before initializaiton. Initialize with streak.init()`
        }
        this.lastActivity = Date.now();
        await this.save(activity);
    }

    /**
     * Clear the streak's activity array
     */
    private clearActivities = async() => {
        if(!this.initialized) {
            throw `Cannot clear activities befire initialization.`;
        }

        await db.updateOne({key: PERSISTANCE_KEY}, {activities: []});
    }

    /**
     * Get list of activities
     */
    public getActivities = async(): Promise<Array<string>> => {
        if(!this.initialized) {
            throw `Cannot get activities before initialization. Initlalize with streak.init()`;
        }

        return (await db.findOne({key:PERSISTANCE_KEY}))?.activities ?? [];
    }

    /**
     * Save state to the db
     */
    private save = async(newActivity:string) => {
        if(await db.findOne({key: PERSISTANCE_KEY})) {
            // update
            await db.updateOne({key: PERSISTANCE_KEY}, {
                "key": PERSISTANCE_KEY,
                "lastActivity": this.lastActivity,
                "length": this.length,
                "activities": {$append: newActivity}
            })
        } else {
            // insert
            await db.insert({
                "key": PERSISTANCE_KEY,
                "lastActivity": this.lastActivity,
                "length": this.length,
                "activities": [newActivity]
            })
        }
    }
}