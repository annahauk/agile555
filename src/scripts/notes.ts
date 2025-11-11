import { LsDb } from "../lib/db";

type Noid_Note = {
    content: string;
    updatedAt: number;
};

type Note =  {
    _id: string;
    content: string;
    updatedAt: number;
}

export function mountNotes(target: HTMLElement) {
    const notesdb = new LsDb<Note>("stickynotes");

    const tmplNotes = document.getElementById('tmpl-notes') as HTMLTemplateElement;
    const tmplNote = tmplNotes.content.querySelector('#tmpl-note') as HTMLTemplateElement;
    const clone = tmplNotes.content.cloneNode(true) as DocumentFragment;
  
    const board = clone.querySelector('#notes-board') as HTMLElement;
    const addBtn = clone.querySelector('#add-note') as HTMLButtonElement;
  
    // In-memory cache (until persistence is wired up)
    let notes: Note[] = [];
  
    async function render() {
        board.innerHTML = '';
        for (const note of notes) {
          const frag = tmplNote.content.cloneNode(true) as DocumentFragment;
          const wrapper = frag.firstElementChild as HTMLElement;          // .note
          const body = wrapper.querySelector('.note-body') as HTMLElement; // contenteditable
          const btnDelete = wrapper.querySelector('.btn-delete') as HTMLButtonElement;
    
          wrapper.dataset._id = note._id;
          body.innerText = note.content;
    
          // Edit handler
          body.addEventListener('blur', async () => {
            note.content = body.innerText ?? '';
            note.updatedAt = Date.now();
            await notesdb.updateOne({_id: note._id}, note);
          });
    
          // Delete handler
          btnDelete.addEventListener('click', async () => {
            const _id = wrapper.dataset._id!;
            // Update in-memory list FIRST
            notes = notes.filter(n => n._id !== _id);
            wrapper.remove();
            // inform db layer
            await notesdb.removeOne({ _id: _id });
          });
    
          board.appendChild(wrapper);
        }
      }
  
    // --- Add new note ---
    addBtn.addEventListener('click', async () => {
      const newNote: Noid_Note = {
        content: '',
        updatedAt: Date.now(),
      };

      let note_doc = await notesdb.insert(newNote)
      notes.unshift(note_doc);
      await render();
  
      // Focus the new note immediately
      requestAnimationFrame(() => {
        const el = board.querySelector('.note') as HTMLElement | null;
        el?.focus();
      });
    });
  
    render();
    target.appendChild(clone);
  }