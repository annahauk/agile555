/* Pomodoro timer logic separated from DOM manipulation
   Exports PomodoroTimer class which handles timing, state, and events.
*/

export type TimerState = 'stopped' | 'running' | 'paused'

export interface PomodoroOptions {
  minutes?: number
  onTick?: (remainingSeconds: number) => void
  onFinish?: () => void
}

export class PomodoroTimer {
  private durationSeconds: number
  private remaining: number
  private state: TimerState = 'stopped'
  private intervalId: number | null = null
  onTick?: (remainingSeconds: number) => void
  onFinish?: () => void

  constructor(opts: PomodoroOptions = {}){
    const mins = opts.minutes ?? 25
    this.durationSeconds = Math.max(1, Math.floor(mins)) * 60
    this.remaining = this.durationSeconds
    this.onTick = opts.onTick
    this.onFinish = opts.onFinish
  }

  setMinutes(mins:number){
    const wasRunning = this.state === 'running'
    if(wasRunning) this.pause()
    this.durationSeconds = Math.max(1, Math.floor(mins)) * 60
    this.reset()
  }

  start(){
    if(this.state === 'running') return
    this.state = 'running'
    const tick = ()=>{
      this.remaining -= 1
      this.onTick?.(this.remaining)
      if(this.remaining <= 0){
        this.stop()
        this.onFinish?.()
      }
    }
    // call initial tick to update UI immediately
    this.onTick?.(this.remaining)
    this.intervalId = window.setInterval(tick, 1000)
  }

  pause(){
    if(this.state !== 'running') return
    this.state = 'paused'
    if(this.intervalId !== null){
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  reset(){
    this.pause()
    this.remaining = this.durationSeconds
    this.state = 'stopped'
    this.onTick?.(this.remaining)
  }

  stop(){
    this.pause()
    this.remaining = 0
    this.state = 'stopped'
  }

  getRemaining(){return this.remaining}
  getDuration(){return this.durationSeconds}
  getState(){return this.state}
}
