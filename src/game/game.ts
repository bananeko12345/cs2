import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Audio } from '../engine/audio'
import type { Input } from '../engine/input'
import type { Renderer } from '../engine/renderer'

export type Mode = 'attract' | 'playing' | 'paused' | 'ended'
export type RoundState = {
  phase: 'briefing' | 'playing' | 'won' | 'lost' | 'defused'
  timeLeft: number
  bombTime: number
  score: number
  kills: number
  enemies: number
  hp: number
  ammo: number
  reserve: number
  round: number
  planted: boolean
  plantedSite: 'A' | 'B' | null
  objective: string
  interaction: string
  interactionProgress: number
  playerX: number
  playerZ: number
  reason: string
}

export type GameHooks = {
  hud(round: RoundState): void
  banner(text: string, tone: 'info' | 'warning' | 'danger' | 'success'): void
  hurt(): void
  end(round: RoundState): void
}

type Enemy = { mesh: THREE.Group; hp: number; alive: boolean; cooldown: number; patrol: THREE.Vector3[]; waypoint: number }
type Block = { minX: number; maxX: number; minZ: number; maxZ: number }
const UP = new THREE.Vector3(0, 1, 0)

export class Game {
  mode: Mode = 'attract'
  round: RoundState = initialRound()
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(74, 1, 0.1, 180)
  private readonly raycaster = new THREE.Raycaster()
  private readonly mapBlocks: Block[] = []
  private readonly sites = { A: new THREE.Vector3(-11, 0.03, -7), B: new THREE.Vector3(12, 0.03, -5) }
  private readonly siteRings: Record<'A' | 'B', THREE.Mesh> = {} as Record<'A' | 'B', THREE.Mesh>
  private readonly enemies: Enemy[] = []
  private readonly player = new THREE.Vector3(0, 1.65, 18)
  private readonly playerVelocity = new THREE.Vector3()
  private readonly bombGroup = new THREE.Group()
  private readonly bombGlow = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshBasicMaterial({ color: '#59f3d4' }))
  private yaw = Math.PI
  private pitch = -0.04
  private clock = 0
  private fireCooldown = 0
  private interaction = 0

  constructor(private readonly renderer: Renderer, private readonly input: Input, private readonly audio: Audio, private readonly hooks: GameHooks) {
    this.scene.background = new THREE.Color('#07111e')
    this.scene.fog = new THREE.Fog('#07111e', 30, 92)
    this.scene.add(new THREE.HemisphereLight('#8ab9d8', '#07111e', 1.2))
    const sun = new THREE.DirectionalLight('#d9f3ff', 2.5)
    sun.position.set(-18, 28, 12)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.left = -35; sun.shadow.camera.right = 35; sun.shadow.camera.top = 35; sun.shadow.camera.bottom = -35
    this.scene.add(sun)
    this.buildMap()
    this.buildSites()
    this.scene.add(this.bombGroup)
    this.bombGroup.add(this.bombGlow)
    this.bombGroup.visible = false
    this.loadBombModel()
    this.camera.rotation.order = 'YXZ'
  }

  get cameraObject(): THREE.PerspectiveCamera { return this.camera }

  start(): void {
    this.clock = 0; this.yaw = Math.PI; this.pitch = -0.04
    this.player.set(0, 1.65, 18); this.playerVelocity.set(0, 0, 0)
    this.round = { ...initialRound(), phase: 'playing', round: 1, objective: 'サイトAまたはBへ移動して爆弾を設置', enemies: 5 }
    this.interaction = 0; this.fireCooldown = 0
    this.bombGroup.visible = false
    this.resetEnemies()
    this.mode = 'playing'
    this.input.endFrame()
    this.hooks.banner('ラウンド開始 — 侵入して爆弾を設置せよ', 'info')
  }

  pause(): void { if (this.mode === 'playing') this.mode = 'paused' }
  resume(): void { if (this.mode === 'paused') { this.mode = 'playing'; this.input.endFrame() } }
  toTitle(): void { this.mode = 'attract' }

  step(dt: number): void {
    this.clock += dt
    if (this.mode !== 'playing') return
    const r = this.round
    r.timeLeft = Math.max(0, r.timeLeft - dt)
    this.fireCooldown = Math.max(0, this.fireCooldown - dt)
    this.updateMovement(dt)
    this.handleCombat()
    this.updateEnemies(dt)
    this.handleObjective(dt)
    if (r.phase === 'playing' && r.timeLeft <= 0) this.finish(false, '時間切れ — 防衛ラインを突破できなかった')
    r.playerX = this.player.x; r.playerZ = this.player.z
    this.hooks.hud(r)
  }

  render(_alpha: number, frameSeconds: number): void {
    const look = this.input.takeLook()
    if (this.mode === 'playing') {
      this.yaw -= look.x
      this.pitch = THREE.MathUtils.clamp(this.pitch - look.y, -1.2, 1.2)
      this.camera.position.copy(this.player)
      this.camera.rotation.set(this.pitch, this.yaw, 0)
    } else if (this.mode === 'attract') {
      const t = this.clock * 0.16
      this.camera.position.set(Math.sin(t) * 30, 15 + Math.sin(t * 1.4) * 1.4, Math.cos(t) * 30)
      this.camera.lookAt(0, 0, -5)
    }
    if (this.bombGroup.visible) {
      this.bombGroup.rotation.y += frameSeconds * 0.75
      this.bombGlow.position.y = 0.72 + Math.sin(this.clock * 5) * 0.08
    }
    for (const enemy of this.enemies) if (enemy.alive) enemy.mesh.position.y = 0.15 + Math.sin(this.clock * 4 + enemy.mesh.position.x) * 0.025
    this.renderer.render(this.scene, this.camera)
  }

  private updateMovement(dt: number): void {
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(UP, this.yaw)
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, this.yaw)
    const desired = new THREE.Vector3().addScaledVector(right, this.input.move.x).addScaledVector(forward, this.input.move.y)
    if (desired.lengthSq() > 1) desired.normalize()
    const speed = this.input.held('sprint') ? 7.2 : 5.3
    desired.multiplyScalar(speed)
    this.playerVelocity.lerp(desired, 1 - Math.exp(-13 * dt))
    const next = this.player.clone().addScaledVector(this.playerVelocity, dt)
    next.y = 1.65
    next.x = THREE.MathUtils.clamp(next.x, -24, 24)
    next.z = THREE.MathUtils.clamp(next.z, -23, 22)
    if (!this.collides(next.x, next.z)) this.player.copy(next)
    else this.playerVelocity.multiplyScalar(0.18)
  }

  private handleCombat(): void {
    if (this.input.consume('reload')) {
      const needed = 20 - this.round.ammo
      const loaded = Math.min(needed, this.round.reserve)
      if (loaded > 0 && this.round.ammo < 20) {
        this.round.ammo += loaded; this.round.reserve -= loaded
        this.hooks.banner('マガジン交換完了', 'info'); this.audio.play('ui')
      }
    }
    if (this.input.consume('fire') && this.fireCooldown <= 0) {
      if (this.round.ammo <= 0) { this.hooks.banner('弾切れ — Rでリロード', 'warning'); this.audio.play('hurt'); return }
      this.fireCooldown = 0.13; this.round.ammo -= 1; this.audio.play('dash')
      this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera)
      const targets = this.enemies.filter(e => e.alive).flatMap(e => [e.mesh])
      const hit = this.raycaster.intersectObjects(targets, true)[0]
      if (hit) {
        let node: THREE.Object3D | null = hit.object
        while (node && !node.userData.enemy) node = node.parent
        const enemy = node?.userData.enemy as Enemy | undefined
        if (enemy?.alive) {
          enemy.hp -= 50
          this.round.score += 100
          if (enemy.hp <= 0) {
            enemy.alive = false; enemy.mesh.visible = false; this.round.kills += 1; this.round.enemies -= 1
            this.hooks.banner(`敵を排除  +100  (${this.round.enemies}残り)`, 'success')
            this.audio.play('win')
            if (this.round.enemies <= 0 && !this.round.planted) this.finish(true, '敵部隊を全滅させた')
          }
        }
      }
    }
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue
      const pos = enemy.mesh.position
      const toPlayer = this.player.clone().sub(pos); toPlayer.y = 0
      const distance = toPlayer.length()
      if (distance < 21) {
        if (distance > 7) {
          toPlayer.normalize(); const next = pos.clone().addScaledVector(toPlayer, dt * 1.35)
          if (!this.collides(next.x, next.z)) pos.copy(next)
        }
        enemy.mesh.lookAt(this.player.x, pos.y, this.player.z)
        enemy.cooldown -= dt
        if (distance < 18 && enemy.cooldown <= 0) {
          enemy.cooldown = 1.2 + Math.random() * 1.1
          if (Math.random() < 0.58) {
            this.round.hp = Math.max(0, this.round.hp - 7)
            this.hooks.hurt(); this.audio.play('hurt')
            if (this.round.hp <= 0) this.finish(false, '体力が尽きた — ラウンド敗北')
          }
        }
      } else {
        const target = enemy.patrol[enemy.waypoint]
        const toWaypoint = target.clone().sub(pos); toWaypoint.y = 0
        if (toWaypoint.length() < 0.7) enemy.waypoint = (enemy.waypoint + 1) % enemy.patrol.length
        else pos.addScaledVector(toWaypoint.normalize(), dt * 0.8)
      }
    }
  }

  private handleObjective(dt: number): void {
    const r = this.round
    const nearA = this.player.distanceTo(this.sites.A) < 2.5
    const nearB = this.player.distanceTo(this.sites.B) < 2.5
    const nearSite = nearA || nearB
    if (!r.planted) {
      r.objective = nearSite ? 'Eを長押しして爆弾を設置' : 'サイトAまたはBへ移動して爆弾を設置'
      if (nearSite && this.input.held('interact')) this.interaction += dt
      else this.interaction = Math.max(0, this.interaction - dt * 2)
      r.interactionProgress = THREE.MathUtils.clamp(this.interaction / 1.25, 0, 1)
      r.interaction = r.interactionProgress > 0 ? '設置中…' : nearSite ? '設置可能' : ''
      if (this.interaction >= 1.25) {
        r.planted = true; r.plantedSite = nearA ? 'A' : 'B'; r.bombTime = 35; this.interaction = 0
        this.bombGroup.position.copy(r.plantedSite === 'A' ? this.sites.A : this.sites.B); this.bombGroup.visible = true
        r.objective = '爆弾を守れ — タイマーが0になるまで耐えろ'; r.interaction = ''
        this.hooks.banner(`爆弾設置完了 / サイト${r.plantedSite}`, 'warning'); this.audio.play('win')
      }
    } else {
      r.bombTime = Math.max(0, r.bombTime - dt)
      const bombPos = r.plantedSite === 'A' ? this.sites.A : this.sites.B
      const nearBomb = this.player.distanceTo(bombPos) < 2.4
      r.objective = nearBomb ? 'Eを長押しして爆弾を解除' : `サイト${r.plantedSite}を防衛 — 爆発まで ${Math.ceil(r.bombTime)}秒`
      if (nearBomb && this.input.held('interact')) this.interaction += dt
      else this.interaction = Math.max(0, this.interaction - dt * 2)
      r.interactionProgress = THREE.MathUtils.clamp(this.interaction / 2.5, 0, 1)
      r.interaction = r.interactionProgress > 0 ? '解除中…' : nearBomb ? '解除可能' : ''
      if (this.interaction >= 2.5) this.finish(false, '爆弾を解除した — 防衛側の勝利')
      if (r.bombTime <= 0) this.finish(true, '爆弾が爆発した — ミッション成功')
    }
  }

  private finish(won: boolean, reason: string): void {
    if (this.mode !== 'playing') return
    this.round.phase = won ? 'won' : reason.includes('解除') ? 'defused' : 'lost'
    this.round.reason = reason
    this.round.objective = reason
    if (won) this.round.score += Math.max(0, Math.ceil(this.round.timeLeft) * 10)
    this.mode = 'ended'
    this.hooks.end(this.round)
  }

  private resetEnemies(): void {
    for (const enemy of this.enemies) { enemy.mesh.visible = false; enemy.alive = false }
    this.enemies.length = 0
    const points = [[-17, -13], [-4, -9], [17, -12], [16, 8], [-15, 9]]
    points.forEach(([x, z], i) => {
      const mesh = this.makeBot(i)
      mesh.position.set(x, 0.15, z)
      const enemy: Enemy = { mesh, hp: 100, alive: true, cooldown: 0.5 + i * 0.25, patrol: [new THREE.Vector3(x, 0.15, z), new THREE.Vector3(x * 0.75, 0.15, z + 5), new THREE.Vector3(x * 0.5, 0.15, z)], waypoint: 1 }
      mesh.userData.enemy = enemy; this.enemies.push(enemy); this.scene.add(mesh)
    })
  }

  private buildMap(): void {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: '#121f2e', roughness: 0.94, metalness: 0.06 }))
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.add(ground)
    const roadMat = new THREE.MeshStandardMaterial({ color: '#1b3140', roughness: 0.88 })
    for (const [x, z, w, d] of [[0, 0, 3.2, 52], [0, -2, 48, 3.2]]) {
      const road = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, d), roadMat); road.position.set(x, 0.018, z); road.receiveShadow = true; this.scene.add(road)
    }
    const blocks = [
      [-21, -13, -20, -12, '#1e4b57'], [-8, -1, -18, -12, '#233e66'], [5, 13, -18, -11, '#59415e'], [18, 23, -17, -7, '#314d62'],
      [-22, -14, -7, 0, '#384a68'], [-5, 2, -8, -2, '#6b493d'], [6, 13, -8, -2, '#315e5a'], [17, 23, -5, 4, '#614554'],
      [-21, -12, 4, 12, '#39586a'], [-7, 0, 4, 13, '#574c38'], [6, 15, 4, 12, '#294e67'], [18, 23, 9, 19, '#4b3f66'],
    ] as [number, number, number, number, string][]
    for (const [minX, maxX, minZ, maxZ, color] of blocks) this.addBuilding(minX, maxX, minZ, maxZ, color)
    this.addCover(-2, 1, 1, 4, '#c77b43'); this.addCover(2, 5, -11, -8, '#4d9c9e'); this.addCover(-16, -11, 1, 4, '#a55d49')
    const lines = new THREE.Group(); const lineMat = new THREE.MeshBasicMaterial({ color: '#59f3d4', transparent: true, opacity: 0.22 })
    for (let i = -24; i <= 24; i += 4) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 1.8), lineMat); line.position.set(i, 0.05, 0); lines.add(line)
      const line2 = line.clone(); line2.position.set(0, 0.051, i); line2.rotation.y = Math.PI / 2; lines.add(line2)
    }
    this.scene.add(lines)
    const border = new THREE.Mesh(new THREE.BoxGeometry(52, 0.08, 0.2), new THREE.MeshBasicMaterial({ color: '#ff8b4d', transparent: true, opacity: 0.45 }))
    for (const z of [-25, 25]) { const b = border.clone(); b.position.z = z; this.scene.add(b) }
  }

  private addBuilding(minX: number, maxX: number, minZ: number, maxZ: number, color: string): void {
    const w = maxX - minX, d = maxZ - minZ, h = 2.8 + ((Math.abs(minX * 13 + minZ * 7) % 3) * 0.65)
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.12 }))
    body.position.set((minX + maxX) / 2, h / 2, (minZ + maxZ) / 2); body.castShadow = true; body.receiveShadow = true; this.scene.add(body)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.12, d + 0.12), new THREE.MeshStandardMaterial({ color: '#172536', emissive: '#0b2533', emissiveIntensity: 0.25 }))
    roof.position.set(body.position.x, h + 0.04, body.position.z); this.scene.add(roof)
    this.mapBlocks.push({ minX: minX - 0.3, maxX: maxX + 0.3, minZ: minZ - 0.3, maxZ: maxZ + 0.3 })
    for (let z = minZ + 1.1; z < maxZ; z += 1.35) {
      const window = new THREE.Mesh(new THREE.BoxGeometry(Math.min(1.1, w * 0.35), 0.22, 0.05), new THREE.MeshBasicMaterial({ color: '#59f3d4', transparent: true, opacity: 0.55 }))
      window.position.set(body.position.x, Math.min(h - 0.55, 1.4 + (z - minZ) * 0.15), minZ - 0.03); this.scene.add(window)
    }
  }

  private addCover(minX: number, maxX: number, minZ: number, maxZ: number, color: string): void {
    const h = 1.15; const m = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, h, maxZ - minZ), new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.2 }))
    m.position.set((minX + maxX) / 2, h / 2, (minZ + maxZ) / 2); m.castShadow = true; this.scene.add(m)
    this.mapBlocks.push({ minX: minX - 0.45, maxX: maxX + 0.45, minZ: minZ - 0.45, maxZ: maxZ + 0.45 })
  }

  private buildSites(): void {
    for (const [key, pos] of Object.entries(this.sites) as ['A' | 'B', THREE.Vector3][]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.055, 8, 48), new THREE.MeshBasicMaterial({ color: key === 'A' ? '#ff8b4d' : '#59f3d4', transparent: true, opacity: 0.9 }))
      ring.rotation.x = Math.PI / 2; ring.position.copy(pos); this.scene.add(ring); this.siteRings[key] = ring
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.035, 48), new THREE.MeshStandardMaterial({ color: key === 'A' ? '#462e2c' : '#163d43', emissive: key === 'A' ? '#2c1713' : '#092f34', emissiveIntensity: 0.5, transparent: true, opacity: 0.72 }))
      pad.position.set(pos.x, 0.01, pos.z); this.scene.add(pad)
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 0.12), new THREE.MeshStandardMaterial({ color: key === 'A' ? '#ff8b4d' : '#59f3d4', emissive: key === 'A' ? '#ff4e30' : '#3de6ca', emissiveIntensity: 1.1 }))
      post.position.set(pos.x, 0.75, pos.z); this.scene.add(post)
    }
  }

  private makeBot(index: number): THREE.Group {
    const g = new THREE.Group(); const bodyMat = new THREE.MeshStandardMaterial({ color: index % 2 ? '#b14652' : '#c26b42', roughness: 0.55 }); const dark = new THREE.MeshStandardMaterial({ color: '#101a27', metalness: 0.35, roughness: 0.38 }); const visor = new THREE.MeshStandardMaterial({ color: '#ffca66', emissive: '#ff4b2e', emissiveIntensity: 1.3 })
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.9, 0.44), bodyMat); body.position.y = 0.75
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.46, 0.5), dark); head.position.y = 1.42
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.03), visor); eye.position.set(0, 1.43, -0.26)
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.76), dark); gun.position.set(0.34, 0.74, -0.32); gun.rotation.x = -0.12
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.16, 0.3), dark); shoulder.position.y = 1.02
    g.add(body, head, eye, gun, shoulder); g.traverse(o => { const m = o as THREE.Mesh; m.castShadow = true; m.userData.enemy = undefined })
    return g
  }

  private loadBombModel(): void {
    // Managed Preview serves registered game media from the stable storage path. The local Vite
    // smoke runner intentionally keeps the procedural bomb fallback instead of probing that route.
    if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') return
    new GLTFLoader().load('/manus-storage/game/sha256/efc3ab75cc4bd51fc78377e36323b19ea571cb0efb4bf7611145e6bc14160141.glb', gltf => {
      const model = gltf.scene; model.scale.setScalar(0.95); model.position.y = 0.03; model.traverse(o => { const m = o as THREE.Mesh; m.castShadow = true })
      this.bombGroup.add(model)
    }, undefined, () => undefined)
  }

  private collides(x: number, z: number): boolean {
    const r = 0.46
    return this.mapBlocks.some(b => x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r)
  }
}

function initialRound(): RoundState {
  return { phase: 'briefing', timeLeft: 110, bombTime: 0, score: 0, kills: 0, enemies: 5, hp: 100, ammo: 20, reserve: 80, round: 1, planted: false, plantedSite: null, objective: 'サイトAまたはBへ移動して爆弾を設置', interaction: '', interactionProgress: 0, playerX: 0, playerZ: 18, reason: '' }
}
