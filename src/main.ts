import './styles/main.css'
import { Audio } from './engine/audio'
import { Input } from './engine/input'
import { Renderer } from './engine/renderer'
import { GameLoop } from './engine/loop'
import { Game, type RoundState } from './game/game'
import { Ui } from './ui/ui'
import { TouchControls } from './ui/touch'

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const input = new Input(canvas)
  const audio = new Audio()
  let game!: Game
  let ui!: Ui

  function startRun(): void {
    audio.unlock()
    audio.startMusic()
    game.start()
    ui.show('hud')
    input.lockPointer()
  }
  function pause(): void {
    if (game.mode !== 'playing') return
    game.pause()
    ui.show('pause')
    input.unlockPointer()
  }
  function resume(): void {
    if (game.mode !== 'paused') return
    game.resume()
    ui.show('hud')
    input.lockPointer()
  }

  ui = new Ui({
    play: startRun,
    resume,
    restart: startRun,
    quit: () => {
      game.toTitle()
      ui.show('title')
      input.unlockPointer()
    },
  })
  ui.show('boot')
  ui.setBootProgress(0.16)
  await document.fonts.ready
  ui.setBootProgress(0.42)
  await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
  ui.setBootProgress(0.78)

  const renderer = new Renderer(canvas, 'medium')
  game = new Game(renderer, input, audio, {
    hud: (round: RoundState) => ui.updateHud(round),
    banner: (text: string, tone: 'info' | 'warning' | 'danger' | 'success') => ui.banner(text, tone),
    hurt: () => ui.hurt(),
    end: (round: RoundState) => {
      input.unlockPointer()
      window.setTimeout(() => ui.showResults(round), 550)
    },
  })
  new TouchControls(document.getElementById('ui')!, input, () => game.mode === 'playing')
  ui.setBootProgress(1)
  ui.show('title')

  const loop = new GameLoop({
    step: dt => game.step(dt),
    render: (alpha, frameSeconds) => {
      input.update()
      if (input.consume('pause')) {
        if (game.mode === 'playing') pause()
        else if (game.mode === 'paused') resume()
      }
      ui.frame(frameSeconds)
      loop.paused = game.mode === 'paused'
      game.render(alpha, frameSeconds)
      if (game.mode === 'playing' || game.mode === 'ended') ui.updateHud(game.round)
    },
  })
  loop.start()

  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && game.mode === 'playing') pause()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.mode === 'playing') pause()
  })
  canvas.addEventListener('click', () => {
    if (game.mode === 'playing') input.lockPointer()
  })
  window.addEventListener('game:pause', pause)

  ;(window as unknown as { __game: unknown }).__game = { game, ui, input }
}

boot().catch(err => {
  console.error(err)
  const el = document.getElementById('ui')
  if (el) el.innerHTML = `<div class="fatal">Boot failed: ${String((err as Error)?.message ?? err).replace(/[<>&]/g, '')}</div>`
})
