import {insert, update, del, make_id} from '../lib/db';

type Note =  {
    id: string;
    content: string;
    updatedAt: number;
}

export function mountNotes(target: HTMLElement) {
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
    
          wrapper.dataset.id = note.id;
          body.innerText = note.content;
    
          // Edit handler
          body.addEventListener('blur', async () => {
            note.content = body.innerText ?? '';
            note.updatedAt = Date.now();
            await update({ id: note.id }, note);
          });
    
          // Delete handler
          btnDelete.addEventListener('click', async () => {
            const id = wrapper.dataset.id!;
            // Update in-memory list FIRST
            notes = notes.filter(n => n.id !== id);
            wrapper.remove();
            // inform db layer
            await del({ id });
          });
    
          board.appendChild(wrapper);
        }
      }
  
    // --- Add new note ---
    addBtn.addEventListener('click', async () => {
      const id = await make_id();
      const newNote: Note = {
        id,
        content: '',
        updatedAt: Date.now(),
      };
      notes.unshift(newNote);
      await insert(newNote);
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