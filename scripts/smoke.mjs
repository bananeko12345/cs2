// End-to-end smoke test for Strikefront. Builds must already exist in dist/.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
let browser
const guard = setTimeout(() => fail('timed out'), 120_000)
function cleanup() { clearTimeout(guard); try { server.kill('SIGTERM') } catch {} }
async function fail(msg) { console.error(`smoke: FAIL — ${msg}`); await browser?.close().catch(() => {}); cleanup(); process.exit(1) }
async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(url)).ok) return } catch {}
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error('preview server did not start')
}
async function openGame(context, errors) {
  const page = await context.newPage()
  page.on('console', m => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', e => errors.push(String(e)))
  page.on('response', r => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`))
  await page.goto(url)
  await page.waitForSelector('[data-screen="title"].is-active', { timeout: 30_000 })
  await page.waitForSelector('.title h1')
  await page.screenshot({ path: `${out}/01-title.png` })
  return page
}
const state = page => page.evaluate(() => {
  const { game } = window.__game
  const p = game['player']
  return { mode: game.mode, round: game.round, pos: { x: p.x, y: p.y, z: p.z } }
})
try {
  await waitForServer()
  browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] }).catch(() => chromium.launch({ args: ['--ignore-gpu-blocklist'], channel: 'chrome' }))
  const errors = []
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'ja-JP' })
  const page = await openGame(context, errors)
  await page.click('[data-action="play"]')
  await page.waitForSelector('[data-screen="hud"].is-active')
  const before = await state(page)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(900)
  await page.keyboard.up('KeyW')
  await page.waitForTimeout(350)
  const after = await state(page)
  await page.screenshot({ path: `${out}/02-gameplay.png` })
  const moved = Math.hypot(after.pos.x - before.pos.x, after.pos.z - before.pos.z)
  if (after.mode !== 'playing') throw new Error(`expected playing, got ${after.mode}`)
  if (!(after.round.timeLeft < before.round.timeLeft)) throw new Error('clock did not run')
  if (moved < 1) throw new Error(`player barely moved (${moved.toFixed(2)} m)`)
  await page.keyboard.press('KeyR')
  const reloaded = await state(page)
  if (reloaded.round.ammo !== 20) throw new Error('reload did not restore the magazine')
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-screen="pause"].is-active')
  await page.screenshot({ path: `${out}/03-pause.png` })
  await page.click('[data-screen="pause"] [data-action="resume"]')
  await page.waitForSelector('[data-screen="hud"].is-active')
  await page.evaluate(() => {
    const { game } = window.__game
    game['player'].set(-11, 1.65, -7)
  })
  await page.keyboard.down('KeyE')
  await page.waitForTimeout(1500)
  await page.keyboard.up('KeyE')
  const planted = await state(page)
  if (!planted.round.planted) throw new Error('bomb was not planted')
  await page.screenshot({ path: `${out}/04-planted.png` })
  if (errors.length) throw new Error(`console errors:\n  ${errors.join('\n  ')}`)
  await context.close()
  await browser.close()
  cleanup()
  console.log(`smoke: OK — moved ${moved.toFixed(1)} m, bomb planted, screenshots in ${out}/`)
} catch (err) { await fail(err?.message ?? String(err)) }
