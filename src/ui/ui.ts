import type { RoundState } from '../game/game'

export type Screen = 'boot' | 'title' | 'hud' | 'pause' | 'results'
type Tone = 'info' | 'warning' | 'danger' | 'success'
type Actions = { play(): void; resume(): void; restart(): void; quit(): void }

export class Ui {
  screen: Screen = 'boot'
  private root: HTMLElement
  private bannerTimer = 0

  constructor(private readonly actions: Actions) {
    this.root = document.getElementById('ui')!
    this.root.innerHTML = this.template()
    this.root.addEventListener('click', e => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
      if (!target) return
      const action = target.dataset.action
      if (action === 'play') this.actions.play()
      if (action === 'resume') this.actions.resume()
      if (action === 'restart') this.actions.restart()
      if (action === 'quit') this.actions.quit()
    })
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape' && this.screen === 'results') this.actions.quit()
    })
  }

  show(screen: Screen): void {
    this.screen = screen
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-screen]')) {
      const active = el.dataset.screen === screen || (screen === 'pause' && el.dataset.screen === 'hud')
      el.classList.toggle('is-active', active)
      el.setAttribute('aria-hidden', String(!active))
    }
    this.root.dataset.activeScreen = screen
  }

  setBootProgress(progress: number): void {
    const bar = this.root.querySelector<HTMLElement>('.boot-fill')
    if (bar) bar.style.transform = `scaleX(${Math.max(0.05, Math.min(1, progress))})`
  }

  frame(dt: number): void {
    this.bannerTimer = Math.max(0, this.bannerTimer - dt)
    if (this.bannerTimer === 0) this.root.querySelector('.banner')?.classList.remove('is-visible')
  }

  updateHud(round: RoundState): void {
    this.set('.hud-round', `ROUND ${String(round.round).padStart(2, '0')}`)
    this.set('.hud-score', String(round.score).padStart(5, '0'))
    this.set('.hud-timer', round.planted ? `${Math.ceil(round.bombTime)}.${Math.floor((round.bombTime % 1) * 10)}` : formatTime(round.timeLeft))
    this.set('.hud-objective', round.objective)
    this.set('.hud-ammo', `${String(round.ammo).padStart(2, '0')} <small>/ ${String(round.reserve).padStart(2, '0')}</small>`)
    this.set('.hud-kills', `${round.kills} / 5 排除`)
    this.set('.hud-site', round.plantedSite ? `SITE ${round.plantedSite}` : 'ATTACKER')
    this.set('.hud-health-value', `${round.hp}`)
    const health = this.root.querySelector<HTMLElement>('.health-fill')
    if (health) health.style.width = `${round.hp}%`
    const progress = this.root.querySelector<HTMLElement>('.interaction-fill')
    if (progress) progress.style.transform = `scaleX(${round.interactionProgress})`
    this.set('.interaction-label', round.interaction)
    this.root.querySelector('.interaction')?.classList.toggle('is-visible', Boolean(round.interaction))
    this.root.querySelector('.hud-timer')?.classList.toggle('is-critical', round.planted && round.bombTime < 10)
    const dot = this.root.querySelector<HTMLElement>('.map-player')
    if (dot) {
      dot.style.left = `${50 + (round.playerX / 24) * 43}%`
      dot.style.top = `${50 + (round.playerZ / 24) * 43}%`
    }
  }

  banner(text: string, tone: Tone = 'info'): void {
    const el = this.root.querySelector<HTMLElement>('.banner')!
    el.textContent = text
    el.dataset.tone = tone
    el.classList.remove('is-visible')
    void el.offsetWidth
    el.classList.add('is-visible')
    this.bannerTimer = 3.2
  }

  hurt(): void {
    const el = this.root.querySelector('.damage-flash')!
    el.classList.remove('is-visible')
    void (el as HTMLElement).offsetWidth
    el.classList.add('is-visible')
  }

  showResults(round: RoundState): void {
    this.set('.result-kicker', round.phase === 'won' ? 'MISSION COMPLETE' : 'MISSION FAILED')
    this.set('.result-title', round.phase === 'won' ? '任務成功' : round.phase === 'defused' ? '爆弾解除' : 'ラウンド敗北')
    this.set('.result-reason', round.reason)
    this.set('.result-score', String(round.score).padStart(5, '0'))
    this.set('.result-stats', `${round.kills} 排除  /  HP ${round.hp}  /  残り ${formatTime(round.timeLeft)}`)
    this.root.querySelector('.results')?.classList.toggle('is-win', round.phase === 'won')
    this.show('results')
  }

  hurtHint(): void { this.hurt() }

  private set(selector: string, text: string): void {
    const el = this.root.querySelector<HTMLElement>(selector)
    if (el) el.innerHTML = text
  }

  private template(): string {
    return `
      <section class="screen boot is-active" data-screen="boot">
        <div class="boot-mark"><span></span><span></span><span></span></div>
        <div class="boot-title">STRIKE<span>FRONT</span></div>
        <div class="boot-track"><i class="boot-fill"></i></div>
        <p>TACTICAL SYSTEMS INITIALIZING</p>
      </section>
      <section class="screen title" data-screen="title">
        <div class="title-grid"></div><div class="title-glow"></div>
        <div class="title-copy">
          <div class="eyebrow">OPERATION / NIGHTFALL 01</div>
          <h1>STRIKE<span>FRONT</span></h1>
          <p>侵入し、設置し、生き残れ。</p>
          <div class="title-rule"></div>
          <button class="action primary" data-action="play"><b>▶</b> 作戦開始</button>
          <div class="title-controls"><span><kbd>W A S D</kbd> 移動</span><span><kbd>マウス</kbd> 視点</span><span><kbd>左クリック</kbd> 射撃</span><span><kbd>E</kbd> 設置 / 解除</span></div>
        </div>
        <div class="title-status"><span class="status-dot"></span> LOCAL SIMULATION / READY</div>
        <div class="title-footer">STRIKEFRONT // ORIGINAL TACTICAL FPS PROTOTYPE</div>
      </section>
      <section class="screen hud" data-screen="hud" aria-hidden="true">
        <div class="hud-topline"><div><span class="hud-round">ROUND 01</span><span class="hud-site">ATTACKER</span></div><div class="hud-score">00000</div></div>
        <div class="hud-objective-wrap"><span class="hud-objective">サイトAまたはBへ移動して爆弾を設置</span><strong class="hud-timer">01:50</strong></div>
        <div class="crosshair"><i></i><i></i><i></i><i></i><b></b></div>
        <div class="banner" data-tone="info"></div><div class="damage-flash"></div>
        <div class="minimap"><span class="map-label">TACTICAL MAP</span><span class="map-road road-a"></span><span class="map-road road-b"></span><span class="map-site site-a">A</span><span class="map-site site-b">B</span><span class="map-player"></span></div>
        <div class="hud-bottom"><div class="health"><span class="hud-kicker">VITALS</span><div class="health-row"><div class="health-track"><i class="health-fill"></i></div><b class="hud-health-value">100</b></div><span class="hud-kills">0 / 5 排除</span></div><div class="weapon"><span class="hud-kicker">PRIMARY / VPR-09</span><strong class="hud-ammo">20 <small>/ 80</small></strong><span class="weapon-name">VECTOR PULSE RIFLE</span></div></div>
        <div class="interaction"><span class="interaction-label"></span><div class="interaction-track"><i class="interaction-fill"></i></div></div>
        <div class="hud-help"><kbd>ESC</kbd> ポーズ　 <kbd>R</kbd> リロード</div>
      </section>
      <section class="screen overlay" data-screen="pause" aria-hidden="true"><div class="panel"><span class="eyebrow">FIELD LINK SUSPENDED</span><h2>一時停止</h2><p>作戦は一時的に保留されています。</p><button class="action primary" data-action="resume">作戦に戻る</button><button class="action" data-action="quit">タイトルへ</button></div></section>
      <section class="screen overlay results" data-screen="results" aria-hidden="true"><div class="panel"><span class="eyebrow result-kicker">MISSION COMPLETE</span><h2 class="result-title">任務成功</h2><p class="result-reason"></p><div class="result-score">00000</div><div class="result-stats"></div><button class="action primary" data-action="restart">もう一度作戦を開始</button><button class="action" data-action="quit">タイトルへ戻る</button></div></section>
    `
  }
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
