import EasyMDE from "easymde";
import { LsDb, WithId } from "../lib/db";
import { date_formatter } from "../lib/utils";

import "../styles/components/home.css";

export interface Journal {
    last_opened: string | null; //_id
    key:string; // journal base
}

export interface JournalEntry {
    _id: string;
    key:string; // journal entry
    title: string;
    last_edited: string;
    content: string;
}

const JOURNAL_BASE_KEY = "0";
const JOURNAL_ENTRY_KEY = "1";
const JOURNAL_COLLECTION = "journals";

export async function MountJournal(): Promise<any> {
    const jdb = new LsDb<Journal | JournalEntry>(JOURNAL_COLLECTION);
    const select_container = document.getElementById("journal-select") as HTMLDivElement;
    const edit_container = document.getElementById("journal-edit") as HTMLDivElement;
    const edit_area = document.getElementById("journal-edit-area") as HTMLDivElement;
    const new_entry_button = document.getElementById("journal-new-button") as HTMLDivElement;

    const checked = [select_container, edit_container, new_entry_button, edit_area];

    if((checked as Array<any>).includes(null)) {
        console.error(checked);
        alert(`Failed to bind to journal components. Check console for more info.`);
        return;
    }

    /**
     * Working vars
     */
    let CURRENT_JOURNAL_ID:string;

    /**
     * Editor setup
     */
    let editor = new EasyMDE({element: edit_area});
    editor.codemirror.on("blur", async(e) => {
        if(!CURRENT_JOURNAL_ID) {
            return;
        }
        console.log(`update content for ${CURRENT_JOURNAL_ID}`);
        if(!(await jdb.updateOne({_id: CURRENT_JOURNAL_ID}, {content: editor.value()}))) {
            alert(`Failed to save editor content!`);
        }
    });

    /**
     * Create journal function
     */
    let _create_journal = async (entry?:WithId<JournalEntry>) => {
        let j = entry ?? await jdb.insert({
            key: JOURNAL_ENTRY_KEY,
            title: "New Entree",
            last_edited: date_formatter.format(new Date()),
            content: "",
        } as JournalEntry);

        // create element
        let el = await build_entry(j as WithId<JournalEntry>);

        // append to root
        select_container.appendChild(el);

        // edit the new journal
        await _edit(j._id);
    }

    /**
     * Edit journal
     */
    let _edit = async(id:string): Promise<any> => {
        console.log(`edit::`, id);
        let j = await jdb.findOne({_id: id}) as WithId<JournalEntry>;
        if(!j) {
            alert(`Journal not found!`);
        }

        CURRENT_JOURNAL_ID = j._id;
        editor.value(j.content);

        // color selected editor
        for(const el of document.getElementsByClassName("journal-entry")) {
            let id = el.getAttribute("data-id");
            if(id) {
                if(id === j._id) {
                    // color
                    el.classList.add("journal-entry-selected");
                } else {
                    // un-color
                    el.classList.remove("journal-entry-selected");
                }
            }
        }

        // update last opened
        await jdb.updateOne({key: JOURNAL_BASE_KEY}, {last_opened: j._id});
    }

    /**
     * Element crafters
     */
    const build_entry = async (entry:WithId<JournalEntry>): Promise<HTMLDivElement> => {
        let element = document.createElement("div");
        let del = document.createElement("button");
        let title = document.createElement("p");
        let date = document.createElement("p");
        let title_edit = document.createElement("input");
        
        // entry element
        element.className = "journal-entry";
        element.setAttribute(`data-id`, entry._id);
        
        // title
        title.textContent = entry.title;
        title.className = "journal-entry-title";
        element.appendChild(title);

        // title editor
        title_edit.type = "text";
        title_edit.defaultValue = title.textContent;
        title_edit.className = "journal-entry-title-edit";
        // reveal on click and replace title
        title.onclick = async(e) => {
            e.stopPropagation();
            title.style.display = "none";
            title_edit.style.display = "block";
            title_edit.focus();
            title_edit.select();
        }
        // hide on blur and save new name
        title_edit.onblur = async(e) => {
            // dont allow empty titles
            if(title_edit.value.length < 1) {
                alert(`Entry title cannot be empty.`);
                return;
            }
            console.log(`edit title:: ${title.textContent} --> ${title_edit.value}`);

            // insert to db
            if(!(await jdb.updateOne({_id: entry._id}, {title: title_edit.value, last_edited: date_formatter.format(new Date())}))) {
                alert(`Failed to edit title.`);
            }

            title.textContent = title_edit.value;
            // reveal title again
            title_edit.style.display = "none";
            title.style.display = "block";
        }
        element.appendChild(title_edit);

        // date
        date.textContent = entry.last_edited;
        element.appendChild(date);

        // delete button
        del.className = "journal-entry-delete";
        del.textContent = "Delete";
        del.onclick = async(e) => {
            e.stopPropagation();
            if(!confirm(`Are you sure you want to delete "${entry.title}"?`)) {
                return;
            }
            
            // delete
            if(!(await jdb.removeOne({_id: entry._id}))) {
                alert(`Delete failed!`);
            }

            // if deleting the active journal, remove lastopened
            if(entry._id === CURRENT_JOURNAL_ID) {
                await jdb.updateOne({key: JOURNAL_BASE_KEY}, {last_opened: null});
                editor.value("");
            }

            element.remove();
        }
        element.appendChild(del);

        /**
         * Edit event listener
         */
        element.onclick = async() => {await _edit(entry._id)};

        return element;
    }

    /**
     * Set up journal base
     */
    let journal = await jdb.findOne({key: JOURNAL_BASE_KEY}) as WithId<Journal>;
    if(!journal) {
        journal = await jdb.insert({key: JOURNAL_BASE_KEY, last_opened: null} as Journal) as WithId<Journal>;
    }
    // open last edited journal if real
    if(journal.last_opened) {
        await _edit(journal.last_opened);
    }

    /**
     * Import all journals
     */
    let entries = await jdb.find({key: JOURNAL_ENTRY_KEY});
    for(const e of entries) {
        await _create_journal(e as WithId<JournalEntry>);
    }

    /**
     * Register event listeners
     */
    // new journal button
    new_entry_button.onclick = async () => {await _create_journal()};
}