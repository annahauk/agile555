import { PomodoroTimer } from './scripts/timer'
import '/src/styles/components/timer.css'
import '/src/styles/components/nav.css'
import '/src/styles/components/home.css'
import { mountAffirmations } from './scripts/affirmations';

// Simple hash router
type Route = '#/home' | '#/pomodoro' | '#/todo' | '#/notes' | '#/affirmations' | '#/music' | '#/journal'

const viewRoot = document.getElementById('view-root')!
const navButtons = Array.from(document.querySelectorAll('.nav-btn')) as HTMLButtonElement[]

function clearView(){
  viewRoot.innerHTML = ''
}

function mountTemplate(id:string){
  const tmpl = document.getElementById(id) as HTMLTemplateElement | null
  if(!tmpl) return
  const clone = tmpl.content.cloneNode(true) as DocumentFragment
  viewRoot.appendChild(clone)
}

// Keep a reference to the running pomodoro timer so we can pause it when navigating away
let activeTimer: PomodoroTimer | null = null

function mountPomodoro(){
  // mount template
  mountTemplate('tmpl-pomodoro')

  // Query elements inside the mounted view
  const timeDisplay = document.getElementById('time-display')!
  const startBtn = document.getElementById('start') as HTMLButtonElement
  const pauseBtn = document.getElementById('pause') as HTMLButtonElement
  const resetBtn = document.getElementById('reset') as HTMLButtonElement
  const progressEl = document.getElementById('progress') as HTMLElement
  const duck = document.querySelector('.duck') as HTMLElement

  const durationButtons = Array.from(document.querySelectorAll('[data-min]')) as HTMLButtonElement[]
  let selectedMinutes = Number(durationButtons.find(b=>b.getAttribute('aria-pressed')==='true')?.dataset.min ?? 25)

  const timer = new PomodoroTimer({minutes:selectedMinutes, onTick: (remaining)=>{
    timeDisplay.textContent = formatSeconds(Math.max(0, remaining))
    const pct = 1 - (remaining / timer.getDuration())
    progressEl.style.width = `${Math.min(100, Math.max(0, pct*100))}%`
  }, onFinish: ()=>{
    if(duck){
      duck.classList.add('floating')
      setTimeout(()=>duck.classList.remove('floating'), 3000)
    }
  }})

  activeTimer = timer

  startBtn.addEventListener('click', ()=>{ timer.start(); startBtn.disabled = true })
  pauseBtn.addEventListener('click', ()=>{ timer.pause(); startBtn.disabled = false })
  resetBtn.addEventListener('click', ()=>{ timer.reset(); startBtn.disabled = false })

  durationButtons.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const mins = Number(btn.dataset.min)
      durationButtons.forEach(b=>b.setAttribute('aria-pressed','false'))
      btn.setAttribute('aria-pressed','true')
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

  // teardown
  if(activeTimer){
    // pause when leaving
    activeTimer.pause()
    activeTimer = null
  }

  clearView()

  switch(route){
    case '#/home':
      mountTemplate('tmpl-home')
      break
    case '#/pomodoro':
      mountPomodoro()
      break
    case '#/todo':
      mountTemplate('tmpl-todo')
      break
    case '#/notes':
      mountTemplate('tmpl-notes')
      break
    case '#/affirmations':
      mountTemplate('tmpl-affirmations')
      mountAffirmations();
      break
    case '#/music':
      mountTemplate('tmpl-music')
      break
    case '#/journal':
      mountTemplate('tmpl-journal')
      break
  }
}

// set up nav click handlers
navButtons.forEach(b=>{
  b.addEventListener('click', ()=>{
    const r = (b.dataset.route as Route) || '#/home'
    window.location.hash = r
  })
})

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

await loadTemplates(['/src/components/home.html','/src/components/timer.html','/src/components/views.html'])

// initial navigation (default to home)
navigate((window.location.hash as Route) || '#/home')
