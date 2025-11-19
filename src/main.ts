import { PomodoroTimer } from './scripts/timer'
import '/src/styles/components/music.css'
import '/src/styles/components/timer.css'
import '/src/styles/components/nav.css'
import '/src/styles/components/home.css'
import '/src/styles/components/todo.css'
import '/src/styles/components/notes.css'
import { mountAffirmations } from './scripts/affirmations';
import { mountMusic } from "./scripts/music";
import { mountNotes } from './scripts/notes';
import { Streak } from './lib/streaks'
import { LsDb } from './lib/db'

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
  if(__audioCtx.state === 'suspended'){
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

const viewRoot = document.getElementById('view-root')!
const navButtons = Array.from(document.querySelectorAll('.nav-btn')) as HTMLButtonElement[]
const brandBtn = document.querySelector('.brand') as HTMLElement | null

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

// mini widget elements and updater
let __miniEl: HTMLElement | null = null
let __miniInterval: number | null = null

function createMiniWidget(){
  if(__miniEl) return __miniEl
  const div = document.createElement('div')
  div.className = 'pomodoro-mini'
  div.innerHTML = `
    <div class="mini-time">00:00</div>
    <div class="mini-controls">
      <button class="mini-toggle" title="Pause/Resume">⏯</button>
      <button class="mini-open" title="Open Pomodoro">▢</button>
    </div>
  `
  document.body.appendChild(div)
  __miniEl = div

  // wire buttons
  const toggle = div.querySelector('.mini-toggle') as HTMLButtonElement
  const open = div.querySelector('.mini-open') as HTMLButtonElement
  toggle.addEventListener('click', ()=>{
    if(!activeTimer) return
    if(activeTimer.getState() === 'running'){
      activeTimer.pause()
    } else {
      activeTimer.start()
    }
    // UI will be updated by the interval
  })
  open.addEventListener('click', ()=>{
    window.location.hash = '#/pomodoro'
  })

  return div
}

function showMiniWidget(){
  if(!activeTimer) return
  const el = createMiniWidget()
  el.style.display = 'flex'
  // start interval to update time display
  if(__miniInterval) return
  __miniInterval = window.setInterval(()=>{
    if(!activeTimer) return
    const timeEl = el.querySelector('.mini-time') as HTMLElement
    const rem = activeTimer.getRemaining()
    timeEl.textContent = formatSeconds(Math.max(0, rem))
  }, 250) as unknown as number
}

function hideMiniWidget(){
  if(__miniInterval){
    clearInterval(__miniInterval)
    __miniInterval = null
  }
  if(__miniEl) __miniEl.style.display = 'none'
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

function formatSeconds(s:number){
  const mm = Math.floor(s/60).toString().padStart(2,'0')
  const ss = Math.floor(s%60).toString().padStart(2,'0')
  return `${mm}:${ss}`
}

function navigate(route:Route){
  // update nav active states
  navButtons.forEach(b=>{
    if(b.dataset.route === route) b.classList.add('active')
    else b.classList.remove('active')
  })
  clearView()

  switch(route){
    case '#/home': //might remove later idk
      mountTemplate('tmpl-home')
      const today = new Date();
      const formatted = today.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      });
      const dateE1 = document.getElementById("date-display")
      if (dateE1) dateE1.textContent = formatted;
      break

    case '#/pomodoro':
      mountPomodoro()
      break
    case '#/todo':
      mountTodo()
      break
    case '#/notes':
    //   mountTemplate('tmpl-notes')
      mountNotes(document.querySelector("#app")!);
      break
    case '#/affirmations':
      mountTemplate('tmpl-affirmations')
      mountAffirmations();
      break
    case '#/music':
      mountTemplate('tmpl-music')
      mountMusic();
      break
    case '#/journal':
      mountTemplate('tmpl-journal')
      break
  }

  // show a mini popout widget when not on the Pomodoro page and a timer is active
  if(route !== '#/pomodoro' && activeTimer){
    showMiniWidget()
  } else {
    hideMiniWidget()
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
