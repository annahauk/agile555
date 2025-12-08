import { PomodoroTimer } from './scripts/timer'
import '/src/styles/components/music.css'
import '/src/styles/components/timer.css'
import '/src/styles/components/nav.css'
import '/src/styles/components/home.css'
import '/src/styles/components/todo.css'
import '/src/styles/components/affirmations.css'
import '/src/styles/components/notes.css'
import '/src/styles/components/views.css'
import '/src/styles/components/journal.css'
import { mountAffirmations } from './scripts/affirmations';
import { mountMusic, getPlayer, setPlayerStateChangeListener, hasPlayed } from "./scripts/music";
import { Streak } from './lib/streaks'
import { LsDb } from './lib/db'
import { MountJournal } from './scripts/journal'

// small helper to play a short chime using Web Audio (no external asset needed)
// Shared AudioContext and mute state (persisted)
let __audioCtx: AudioContext | null = null
let isMuted = (localStorage.getItem('pomodoro-muted') === 'true')

async function ensureAudioContext(){
  const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext
  if(!AudioCtx) return null
  if(!__audioCtx){
    __audioCtx = new AudioCtx()
  }
  if(__audioCtx && __audioCtx.state === 'suspended'){
    try{ await __audioCtx.resume() }catch(e){/* ignore */}
  }
  return __audioCtx
}

// small helper to play a short chime using Web Audio (no external asset needed)
function playChime(){
  if(isMuted) return
  try{
    // create/resume shared context
    ensureAudioContext().then((ctx)=>{
      if(!ctx) return
      // configurable parameters for the chime
      const ATTACK = 0.02        // seconds: how quickly the chime ramps up
      const PEAK_GAIN = 0.18     // louder peak (was ~0.12)
      const START_FREQ = 880     // start frequency in Hz
      const END_FREQ = 440       // end (bell) frequency in Hz
      const GLIDE_TIME = 1.2     // seconds to glide from start->end frequency
      const RELEASE_TIME = 3.0   // seconds until gain fades almost to silence
      const TOTAL_MS = Math.ceil((RELEASE_TIME + 0.2) * 1000)

      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'

      // initial values
      o.frequency.setValueAtTime(START_FREQ, ctx.currentTime)
      // keep gain extremely low at start then ramp to PEAK_GAIN quickly
      g.gain.setValueAtTime(0.00001, ctx.currentTime)

      o.connect(g)
      g.connect(ctx.destination)

      // quick attack to peak for a clear chime
      g.gain.linearRampToValueAtTime(PEAK_GAIN, ctx.currentTime + Math.max(0.005, ATTACK))

      // glide frequency down to END_FREQ for a bell-like drop
      o.frequency.exponentialRampToValueAtTime(END_FREQ, ctx.currentTime + GLIDE_TIME)

      o.start()

      // schedule an exponential fade to near-silence over RELEASE_TIME
      // using a small target (not exactly 0) to avoid issues with exponential ramps
      const TARGET = 0.00001
      g.gain.exponentialRampToValueAtTime(TARGET, ctx.currentTime + RELEASE_TIME)

      // stop oscillator after the fade completes
      setTimeout(()=>{
        try{ o.stop() }catch(e){}
      }, TOTAL_MS)
    })
  }catch(e){
    console.warn('Chime failed to play', e)
  }
}

// Simple hash router
type Route = '#/home' | '#/pomodoro' | '#/todo' | '#/notes' | '#/affirmations' | '#/music' | '#/journal'

/**
 * Initialize streak
 */
export const STREAK = new Streak();
await STREAK.init();

// Time-of-day theme switching: updates CSS variables for nav color and background image
function applyTimeOfDayTheme(){
  try{
    const now = new Date();
    const h = now.getHours();
    // 6:00 - 14:59 => day; 17:00 - 19:59 => sunset; 20:00 - 5:59 => night
    let nav = '#b3eee6'
    let bg = "url('/src/assets/pond-bg-day.png') center/cover no-repeat fixed"
    if(h >= 6 && h < 17){
      nav = '#b3eee6'
      bg = "url('/src/assets/pond-bg-day.png') center/cover no-repeat fixed"
    } else if(h >= 17 && h < 20){
      nav = '#a399b1'
      bg = "url('/src/assets/pond-bg-Sunset.png') center/cover no-repeat fixed"
    } else {
      nav = '#2b366b'
      bg = "url('/src/assets/pond-bg-night.png') center/cover no-repeat fixed"
    }
    document.documentElement.style.setProperty('--nav-bg', nav)
    document.documentElement.style.setProperty('--pond-bg-image', bg)
    // brand text color: dark for day, white for sunset/night
    const brandColor = (h >= 6 && h < 17) ? '#053f3d' : '#ffffff'
    document.documentElement.style.setProperty('--brand-color', brandColor)
  }catch(e){
    console.warn('Failed to apply time-of-day theme', e)
  }
}

// apply immediately and refresh every minute in case the user crosses a threshold
applyTimeOfDayTheme()
setInterval(applyTimeOfDayTheme, 60 * 1000)

const viewRoot = document.getElementById('view-root')!
const navButtons = Array.from(document.querySelectorAll('.nav-btn')) as HTMLButtonElement[]
const brandBtn = document.querySelector('.brand') as HTMLElement | null

// Create a persistent hidden container for the YouTube player that survives navigation
const playerContainer = document.createElement('div')
playerContainer.id = 'persistent-player-container'
playerContainer.style.display = 'none'
document.body.appendChild(playerContainer)

// Delegated handler for any element with a data-route attribute (including
// buttons inside templates). This keeps routing consistent whether the button
// is in the header or in a page template.
document.addEventListener('click', (e)=>{
  const target = e.target as HTMLElement
  const btn = target.closest('[data-route]') as HTMLElement | null
  if(!btn) return
  const route = btn.getAttribute('data-route')
  if(!route) return
  e.preventDefault()
  window.location.hash = route
})

function clearView(){
  viewRoot.innerHTML = ''
}

function mountTemplate(id:string){
  const tmpl = document.getElementById(id) as HTMLTemplateElement | null
  if(!tmpl) return
  const clone = tmpl.content.cloneNode(true) as DocumentFragment
  viewRoot.appendChild(clone)
}

// --- To-Do mounting and behavior ---
const TODOS_KEY = 'pomodoro-todos'
type Priority = 'low'|'medium'|'high'
interface TodoItem { id: string; text: string; done: boolean; priority: Priority }

// setup todo
const TodoDB = new LsDb<TodoItem>(TODOS_KEY);

async function loadTodos(): Promise<TodoItem[]> {
  return await TodoDB.find({});
}

async function saveTodos(items: TodoItem[]): Promise<void> {
  for(const item of items) {
    let update = await TodoDB.updateOne({id: item.id}, item);

    if(!update) {
      await TodoDB.insert(item);
    }
  }
}

async function mountTodo(){
  // insert template
  mountTemplate('tmpl-todo')

  const input = document.getElementById('todo-input') as HTMLInputElement | null
  const addBtn = document.getElementById('todo-add') as HTMLButtonElement | null
  const prioritySel = document.getElementById('todo-priority') as HTMLSelectElement | null
  const listEl = document.getElementById('todo-list') as HTMLUListElement | null
  const completedEl = document.getElementById('todo-completed') as HTMLUListElement | null
  const emptyEl = document.getElementById('todo-empty') as HTMLElement | null
  if(!listEl || !input || !addBtn || !prioritySel || !completedEl || !emptyEl) return

  let items = await loadTodos();

  const list = listEl as HTMLUListElement
  const completed = completedEl as HTMLUListElement
  const inpt = input as HTMLInputElement
  const sel = prioritySel as HTMLSelectElement
  const empty = emptyEl as HTMLElement

  function render(){
    list.innerHTML = ''
    completed.innerHTML = ''
    const active = items.filter(x=>!x.done)
    const done = items.filter(x=>x.done)

    // order by priority: high -> medium -> low, then by creation (id) to keep stable order
    const priorityRank = (p: Priority) => p === 'high' ? 0 : p === 'medium' ? 1 : 2
    active.sort((a,b)=> priorityRank(a.priority) - priorityRank(b.priority) || a.id.localeCompare(b.id))
    done.sort((a,b)=> priorityRank(a.priority) - priorityRank(b.priority) || a.id.localeCompare(b.id))

    if(items.length === 0){
      empty.style.display = 'block'
    } else {
      empty.style.display = 'none'
    }

    active.forEach(async (it) =>{
      const li = document.createElement('li')
      li.className = 'todo-item'
      li.dataset.id = it.id

      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = !!it.done
      cb.addEventListener('change', async ()=>{
        it.done = cb.checked
        await saveTodos(items);
        render()
      })

      const span = document.createElement('div')
      span.className = 'text'
      span.textContent = it.text

      const badge = document.createElement('span')
      badge.className = `priority ${it.priority}`
      badge.textContent = it.priority[0].toUpperCase() + it.priority.slice(1)

      const del = document.createElement('button')
      del.className = 'delete'
      del.type = 'button'
      del.textContent = 'Delete'
      del.addEventListener('click', async  ()=>{
        items = items.filter(x=>x.id !== it.id)
        await TodoDB.removeOne({id: it.id});
        render()
      })

      li.appendChild(cb)
      li.appendChild(badge)
      li.appendChild(span)
      li.appendChild(del)
      list.appendChild(li)
    })

    done.forEach(it=>{
      const li = document.createElement('li')
      li.className = 'todo-item'
      li.dataset.id = it.id

      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = !!it.done
      cb.addEventListener('change', async ()=>{
        it.done = cb.checked
        await saveTodos(items)
        render()
      })

      const span = document.createElement('div')
      span.className = 'text completed'
      span.textContent = it.text

      const badge = document.createElement('span')
      badge.className = `priority ${it.priority}`
      badge.textContent = it.priority[0].toUpperCase() + it.priority.slice(1)

      const del = document.createElement('button')
      del.className = 'delete'
      del.type = 'button'
      del.textContent = 'Delete'
      del.addEventListener('click', async ()=>{
        items = items.filter(x=>x.id !== it.id)
        await TodoDB.removeOne({id: it.id});
        render()
      })

      li.appendChild(cb)
      li.appendChild(badge)
      li.appendChild(span)
      li.appendChild(del)
      completed.appendChild(li)
    })
  }

  async function addTask(text: string){
    const t = text.trim()
    if(!t) return
    const priority = (sel.value as Priority) || 'medium'
    const newItem: TodoItem = { id: String(Date.now()) + Math.random().toString(36).slice(2,8), text: t, done: false, priority }
    items.unshift(newItem)
    await saveTodos(items)
    render()
    inpt.value = ''
    inpt.focus()
  }

  addBtn.addEventListener('click', ()=> addTask(inpt.value))
  inpt.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') { addTask(inpt.value) } })

  render()
}

// Keep a reference to the running pomodoro timer so we can pause it when navigating away
let activeTimer: PomodoroTimer | null = null

// Generic mini widget
interface MiniWidgetConfig {
  className: string
  displayLabel: string
  toggleTitle: string
  openTitle: string
  openRoute: Route
  getDisplayText: () => string
  onToggle: () => void
  shouldShow: () => boolean
}

class MiniWidget {
  private el: HTMLElement | null = null
  private interval: number | null = null
  private closed: boolean = false
  private keepOpenUntil: number = 0
  private config: MiniWidgetConfig

  constructor(config: MiniWidgetConfig) {
    this.config = config
  }

  private create() {
    if (this.el) return this.el
    const div = document.createElement('div')
    div.className = this.config.className
    // initial hidden state; will be shown with animation
    div.style.display = 'none'
    div.innerHTML = `
      <div class="mini-display">${this.config.displayLabel}</div>
      <div class="mini-controls">
        <button class="mini-toggle" title="${this.config.toggleTitle}">⏯</button>
        <button class="mini-open" title="${this.config.openTitle}">⏏</button> 
        <button class="mini-close" title="Close">✕</button>
      </div>
    ` // ▢

    // Ensure a shared container exists for stacking mini widgets
    let container = document.getElementById('mini-widget-container') as HTMLElement | null
    if (!container) {
      container = document.createElement('div')
      container.id = 'mini-widget-container'
      container.className = 'mini-widget-container'
      document.body.appendChild(container)
    }

    // Append into the shared container so widgets stack vertically
    container.appendChild(div)
    // Ensure the widget receives pointer events (container may not)
    div.style.pointerEvents = 'auto'
    this.el = div

    const toggle = div.querySelector('.mini-toggle') as HTMLButtonElement
    const open = div.querySelector('.mini-open') as HTMLButtonElement
    const close = div.querySelector('.mini-close') as HTMLButtonElement
    toggle.addEventListener('click', () => {
      // keep the widget shown briefly after user interaction to avoid
      // transient player state changes hiding it when resuming playback
      this.keepOpenUntil = Date.now() + 1500
      this.config.onToggle()
    })
    open.addEventListener('click', () => {
      window.location.hash = this.config.openRoute
    })
    close.addEventListener('click', () => this.close())

    return div
  }

  show() {
    // respect manual close until user re-enters the owning page
    if (this.closed) return
    if (!this.config.shouldShow()) return
    const el = this.create()
    // cancel any pending hide animation
    el.classList.remove('mini-closing')
    el.style.display = 'flex'
    // allow the browser to paint before adding the open class
    requestAnimationFrame(() => el.classList.add('mini-open'))

    if (this.interval) return
    this.interval = window.setInterval(() => {
      if (!this.config.shouldShow() && Date.now() > this.keepOpenUntil) {
        this.hide()
        return
      }
      const display = el.querySelector('.mini-display') as HTMLElement
      display.textContent = this.config.getDisplayText()
    }, 250) as unknown as number
  }

  hide() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    if (!this.el) return
    const el = this.el
    // play closing animation, then hide
    el.classList.remove('mini-open')
    el.classList.add('mini-closing')
    // after animation completes, remove from view
    const cleanup = () => {
      el.style.display = 'none'
      el.classList.remove('mini-closing')
      el.removeEventListener('animationend', cleanup)
    }
    // fallback timeout in case animationend doesn't fire
    el.addEventListener('animationend', cleanup)
    setTimeout(cleanup, 300)
  }

  // mark this widget as closed by the user; it will not re-open until resetClosed() is called
  close(){
    this.closed = true
    this.hide()
  }

  // clear the closed flag so the widget can show again
  resetClosed(){
    this.closed = false
  }
}

// Pomodoro mini widget instance
const pomodoroMini = new MiniWidget({
  className: 'pomodoro-mini',
  displayLabel: '00:00',
  toggleTitle: 'Pause/Resume',
  openTitle: 'Open Pomodoro',
  openRoute: '#/pomodoro',
  getDisplayText: () => {
    if (!activeTimer) return '00:00'
    return formatSeconds(Math.max(0, activeTimer.getRemaining()))
  },
  onToggle: () => {
    if (!activeTimer) return
    if (activeTimer.getState() === 'running') {
      activeTimer.pause()
    } else {
      activeTimer.start()
    }
  },
  shouldShow: () => !!activeTimer && activeTimer.getState() !== 'stopped',
})

// Music mini widget instance
const musicMini = new MiniWidget({
  className: 'music-mini',
  displayLabel: '♪',
  toggleTitle: 'Pause/Resume Music',
  openTitle: 'Open Music',
  openRoute: '#/music',
  getDisplayText: () => {
    if (!getPlayer()) return '♪'
    const player = getPlayer()!
    try{
      const state = player.getPlayerState()
      if(state === (window as any).YT?.PlayerState?.PLAYING){
        return 'Playing'
      }
      else if(state === (window as any).YT?.PlayerState?.PAUSED){
        return 'Paused'
      }
      return '♪'
    }catch(e){
      return '♪'
    }
  },
  onToggle: () => {
    const player = getPlayer()
    if (!player) return
    // YT.PlayerState.PLAYING = 1, PAUSED = 2
    if (player.getPlayerState() === 1) {
      player.pauseVideo()
    } else {
      player.playVideo()
    }
  },
  shouldShow: () => {
    const player = getPlayer()
    if (!player || !hasPlayed()) return false
    try{
      const state = player.getPlayerState()
      const YTState = (window as any).YT?.PlayerState
      return state === YTState?.PLAYING || state === YTState?.PAUSED
    }catch(e){
      return false
    }
  },
})

function showMiniWidget(mini: MiniWidget) {
  mini.show()
}

function hideMiniWidget(mini: MiniWidget) {
  mini.hide()
}

function mountPomodoro(){
  // mount template
  mountTemplate('tmpl-pomodoro')

  // Query elements inside the mounted view
  const timeDisplay = document.getElementById('time-display')!
  const titleEl = document.querySelector('.timer-title') as HTMLElement
  const startBtn = document.getElementById('start') as HTMLButtonElement
  const pauseBtn = document.getElementById('pause') as HTMLButtonElement
  const resetBtn = document.getElementById('reset') as HTMLButtonElement
  const muteBtn = document.getElementById('mute') as HTMLButtonElement | null
  const progressEl = document.getElementById('progress') as HTMLElement
  const duck = document.querySelector('.duck') as HTMLElement

  const durationButtons = Array.from(document.querySelectorAll('[data-min][data-type]')) as HTMLButtonElement[]
  const workButtons = durationButtons.filter(b=>b.dataset.type === 'work')
  const breakButtons = durationButtons.filter(b=>b.dataset.type === 'break')
  const initialBtn = durationButtons.find(b=>b.getAttribute('aria-pressed')==='true') || workButtons.find(b=>b.dataset.min === '25')
  // if there's already an active timer, prefer its duration so we don't reset when remounting
  let selectedMinutes = Number(initialBtn?.dataset.min ?? 25)
  if(activeTimer){
    selectedMinutes = Math.floor(activeTimer.getDuration() / 60)
  }

  // set initial title based on whether initial selection is break or work
  if(titleEl){
    const initType = (initialBtn?.dataset.type) || 'work'
    titleEl.textContent = initType === 'break' ? 'Time to take a break...' : 'Time to get to work!'
  }

  // mark selected visuals
  durationButtons.forEach(b=>{
    if(b.getAttribute('aria-pressed') === 'true') b.classList.add('selected')
    else b.classList.remove('selected')
  })

  let timer: PomodoroTimer
  if(activeTimer){
    // reuse existing timer so it continues running across navigation
    timer = activeTimer
    // attach UI handlers to the existing timer
    timer.onTick = (remaining)=>{
      timeDisplay.textContent = formatSeconds(Math.max(0, remaining))
      const pct = 1 - (remaining / timer.getDuration())
      progressEl.style.width = `${Math.min(100, Math.max(0, pct*100))}%`
    }
    timer.onFinish = ()=>{
      if(duck){
        duck.classList.add('floating')
        setTimeout(()=>duck.classList.remove('floating'), 3000)
      }
      playChime()
      startBtn.classList.remove('start-active')
      pauseBtn.classList.remove('pause-active')
    }
  } else {
    timer = new PomodoroTimer({minutes:selectedMinutes, onTick: (remaining)=>{
      timeDisplay.textContent = formatSeconds(Math.max(0, remaining))
      const pct = 1 - (remaining / timer.getDuration())
      progressEl.style.width = `${Math.min(100, Math.max(0, pct*100))}%`
    }, onFinish: ()=>{
      if(duck){
        duck.classList.add('floating')
        setTimeout(()=>duck.classList.remove('floating'), 3000)
      }
      playChime()
      startBtn.classList.remove('start-active')
      pauseBtn.classList.remove('pause-active')
    }})
    activeTimer = timer
  }

  // synchronize UI selections and controls with the timer state/duration
  try{
    const currentMins = Math.floor(timer.getDuration() / 60)
    let matched: HTMLButtonElement | undefined
    durationButtons.forEach(b=>{
      const mins = Number(b.dataset.min)
      if(mins === currentMins){
        b.setAttribute('aria-pressed','true')
        b.classList.add('selected')
        matched = b
      } else {
        b.setAttribute('aria-pressed','false')
        b.classList.remove('selected')
      }
    })

    if(titleEl){
      const type = matched?.dataset.type || 'work'
      titleEl.textContent = type === 'break' ? 'Time to take a break...' : 'Time to get to work!'
    }

    // reflect running/paused state on the start/pause buttons
    const state = timer.getState()
    if(state === 'running'){
      startBtn.disabled = true
      startBtn.classList.add('start-active')
      pauseBtn.classList.remove('pause-active')
    } else if(state === 'paused'){
      startBtn.disabled = false
      pauseBtn.classList.add('pause-active')
      startBtn.classList.remove('start-active')
    } else {
      startBtn.disabled = false
      startBtn.classList.remove('start-active')
      pauseBtn.classList.remove('pause-active')
    }
  }catch(e){
    // if something goes wrong syncing UI, fail silently
    console.warn('Failed to sync pomodoro UI', e)
  }

  // visual highlighting: start (green) and pause (red) are mutually exclusive
  startBtn.addEventListener('click', ()=>{
    // ensure audio is unlocked/resumed by a user gesture before starting
    ensureAudioContext()
    timer.start()
    startBtn.disabled = true
    startBtn.classList.add('start-active')
    pauseBtn.classList.remove('pause-active')
  })
  pauseBtn.addEventListener('click', ()=>{
    timer.pause()
    startBtn.disabled = false
    pauseBtn.classList.add('pause-active')
    startBtn.classList.remove('start-active')
  })
  resetBtn.addEventListener('click', ()=>{ 
    timer.reset()
    startBtn.disabled = false
    startBtn.classList.remove('start-active')
    pauseBtn.classList.remove('pause-active')
    // brief visual cue that reset was pressed
    resetBtn.classList.add('reset-active')
    setTimeout(()=>resetBtn.classList.remove('reset-active'), 500)
  })

  // initialize mute button state and handler
  if(muteBtn){
    const setMuteUI = ()=>{
      muteBtn.setAttribute('aria-pressed', isMuted ? 'true' : 'false')
      muteBtn.textContent = isMuted ? '🔇' : '🔊'
      muteBtn.title = isMuted ? 'Unmute notifications' : 'Mute notifications'
    }
    setMuteUI()
    muteBtn.addEventListener('click', ()=>{
      isMuted = !isMuted
      try{ localStorage.setItem('pomodoro-muted', isMuted ? 'true' : 'false') }catch(e){}
      setMuteUI()
      // if unmuting, ensure audio context is ready for immediate playback
      if(!isMuted) ensureAudioContext()
    })
  }

  durationButtons.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const mins = Number(btn.dataset.min)
      const type = btn.dataset.type
      // clear aria-pressed and selected state for all duration buttons (only one selection allowed)
      durationButtons.forEach(b=>{ b.setAttribute('aria-pressed','false'); b.classList.remove('selected') })
      // mark clicked button as selected
      btn.setAttribute('aria-pressed','true')
      btn.classList.add('selected')
      // change the header copy when switching to a break
      if(titleEl){
        titleEl.textContent = type === 'break' ? 'Time to take a break...' : 'Time to get to work!'
      }
      // selecting a new duration resets the timer; ensure start/pause highlights are cleared
      startBtn.classList.remove('start-active')
      pauseBtn.classList.remove('pause-active')
      timer.setMinutes(mins)
      startBtn.disabled = false
    })
  })

  // initial render
  timeDisplay.textContent = formatSeconds(timer.getRemaining())
}

/**
 * Set up notes types and DB
 */
type Noid_Note = {
  content: string;
  updatedAt: number;
};

type Note =  {
  _id: string;
  content: string;
  updatedAt: number;
}


export async function mountNotes() {
  const notesdb = new LsDb<Note>("stickynotes");

  // Mount it into the DOM
  mountTemplate("tmpl-notes");

  // Now select from the live DOM
  const tmplNote = document.querySelector('#tmpl-note') as HTMLTemplateElement;
  const board    = document.querySelector('#notes-board') as HTMLElement;
  const addBtn   = document.querySelector('#add-note') as HTMLButtonElement;

  let notes: Note[] = (await notesdb.find({})) ?? [];

  async function render() {
    board.innerHTML = '';
    for (const note of notes) {
      const frag    = tmplNote.content.cloneNode(true) as DocumentFragment;
      const wrapper = frag.firstElementChild as HTMLElement;
      const body    = wrapper.querySelector('.note-body') as HTMLElement;
      const btnDelete = wrapper.querySelector('.btn-delete') as HTMLButtonElement;

      wrapper.dataset._id = note._id;
      body.innerText = note.content;

      body.addEventListener('blur', async () => {
        note.content = body.innerText ?? '';
        note.updatedAt = Date.now();
        await notesdb.updateOne({ _id: note._id }, note);

        // add to streak
        await STREAK.add("Notes");
      });

      btnDelete.addEventListener('click', async () => {
        const _id = wrapper.dataset._id!;
        notes = notes.filter(n => n._id !== _id);
        wrapper.remove();
        await notesdb.removeOne({ _id });
      });

      board.appendChild(wrapper);
    }
  }

  addBtn.addEventListener('click', async () => {
    const newNote: Noid_Note = {
      content: '',
      updatedAt: Date.now(),
    };

    const note_doc = await notesdb.insert(newNote);
    notes.unshift(note_doc);
    await render();

    requestAnimationFrame(() => {
      const el = board.querySelector('.note') as HTMLElement | null;
      el?.focus();
    });
  });

  render();
}


function formatSeconds(s:number){
  const mm = Math.floor(s/60).toString().padStart(2,'0')
  const ss = Math.floor(s%60).toString().padStart(2,'0')
  return `${mm}:${ss}`
}

async function navigate(route:Route){
  // update nav active states
  navButtons.forEach(b=>{
    if(b.dataset.route === route) b.classList.add('active')
    else b.classList.remove('active')
  })
  clearView()

  switch(route){
    case '#/home':
      mountTemplate('tmpl-home')
      const today = new Date();
      const formatted = today.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      });
      const dateE1 = document.getElementById("date-display");

      let streak_text;
      if(await STREAK.wasLost()) {
        // streak lost, display lost message / apply class
        streak_text = `Started a new streak!`;
      } else {
        // streak maintained, display with emoji
        streak_text = `${await STREAK.getLength()} day streak! 🔥`;
      }

      if (dateE1) dateE1.textContent = `${formatted} -- ${streak_text}`;
      break

    case '#/pomodoro':
      mountPomodoro()
      // reset any manual close so widget can reappear after user returns to this page
      pomodoroMini.resetClosed()
      break
    case '#/todo':
      mountTodo()
      break
    case '#/notes':
      mountNotes();
      break
    case '#/affirmations':
      mountTemplate('tmpl-affirmations')
      mountAffirmations();
      break
    case '#/music':
      mountTemplate('tmpl-music')
      mountMusic();
      // reset manual close state so music widget can reappear after visiting the music page
      musicMini.resetClosed()
      // For spinning record animation
      setPlayerStateChangeListener((state) => {
        const recordElement = document.getElementById("record") as HTMLElement | null;
        if (!recordElement) return;
        // YT.PlayerState.PLAYING = 1
        if (state === 1) {
          recordElement.classList.add('spinning');
        } else {
          recordElement.classList.remove('spinning');
        }
      });
      // Sync initial state in case music was already playing
      const player = getPlayer();
      const recordElement = document.getElementById("record") as HTMLElement | null;
      if (player && recordElement) {
        if (player.getPlayerState() === 1) {
          recordElement.classList.add('spinning');
        } else {
          recordElement.classList.remove('spinning');
        }
      }
      break
    case '#/journal':
      mountTemplate('tmpl-journal')
      MountJournal();
      break
  }

  // show mini widgets when not on their respective pages
  if(route !== '#/pomodoro' && activeTimer){
    showMiniWidget(pomodoroMini)
  } else {
    hideMiniWidget(pomodoroMini)
  }
  if(route !== '#/music' && getPlayer()){
    showMiniWidget(musicMini)
  } else {
    hideMiniWidget(musicMini)
  }
}

// set up nav click handlers
navButtons.forEach(b=>{
  b.addEventListener('click', ()=>{
    const r = (b.dataset.route as Route) || '#/home'
    window.location.hash = r
  })
})

// brand click navigates home
if(brandBtn){
  brandBtn.addEventListener('click', ()=>{
    window.location.hash = '#/home'
  })
}

// handle hash change and initial route
window.addEventListener('hashchange', ()=>{
  const route = (window.location.hash || '#/pomodoro') as Route
  navigate(route)
})

// Load HTML templates at runtime (avoid importing .html which Vite may parse)
async function loadTemplates(paths: string[]){
  const fetched = await Promise.all(paths.map(p=>fetch(p).then(r=>{
    if(!r.ok) throw new Error(`Failed to fetch ${p}`)
    return r.text()
  })))
  fetched.forEach(htmlText=>{
    const wrapper = document.createElement('div')
    wrapper.innerHTML = htmlText
    // append the templates (they use <template> tags) to the document so mountTemplate can find them
    document.body.appendChild(wrapper)
  })
}

await loadTemplates([
    '/src/components/home.html',
    '/src/components/timer.html',
    '/src/components/views.html', 
    'src/components/notes.html',
    'src/components/music.html'
])

// initial navigation (default to home)
navigate((window.location.hash as Route) || '#/home')