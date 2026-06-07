// Headless playtest: boot the game, start a run, AIM (via the __bb debug
// surface) and drop on real cars. Verifies the core verb end-to-end:
// steer → lead → drop → splat → score → combo.
// Usage: node scripts/smoke.mjs [url]  (default http://localhost:4173/)
import puppeteer from 'puppeteer-core'

const url = process.argv[2] ?? 'http://localhost:4173/'
const shot = (n) => `/tmp/badbirds-${n}.png`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--mute-audio',
  ],
  defaultViewport: { width: 420, height: 860, isMobile: true, hasTouch: true },
})

const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
})

await page.goto(url, { waitUntil: 'networkidle0' })
await page.waitForSelector('#title-screen button', { timeout: 10_000 })
await page.screenshot({ path: shot('1-title') })
await page.tap('#title-screen button')
await sleep(1200)
await page.screenshot({ path: shot('2-intro') })
await sleep(2200) // let the intro card pass

const snap = () => page.evaluate(() => window.__bb.snapshot())

// Aim-and-drop loop: pick the car whose predicted reticle-z gap is smallest,
// steer x to align, drop when the reticle will land on it.
let drops = 0
const deadline = Date.now() + 45_000
let steering = null // current held key
const steer = async (dir) => {
  const key = dir > 0 ? 'ArrowRight' : dir < 0 ? 'ArrowLeft' : null
  if (steering === key) return
  if (steering) await page.keyboard.up(steering)
  steering = key
  if (key) await page.keyboard.down(key)
}

while (Date.now() < deadline && drops < 14) {
  const s = await snap()
  if (s.state !== 'playing') break
  if (s.loaf === 0) {
    // out of ammo — keep flying a bit so food can drift by, press E hopefully
    await page.keyboard.press('KeyE')
    await sleep(400)
    continue
  }
  // Choose target: car ahead of the reticle's z whose lead gap is small.
  // Payload needs the car to be AT reticle.z when it lands (~t0 later); the
  // reticle math already includes bird velocity, so aim where the CAR will be:
  // pick cars whose z is within a window behind the reticle (they close at
  // |vz_bird| - |vz_car| ... simpler: pick the car minimizing |carFutureZ - reticleZ|
  // with carFutureZ = z + vz * t0; t0 from bird altitude ≈ sqrt(2y/22).
  const t0 = Math.sqrt((2 * s.bird.y) / 22)
  let best = null
  for (const c of s.cars) {
    const futureZ = c.z + c.vz * t0
    const dz = Math.abs(futureZ - s.reticle.z)
    const dx = Math.abs(c.x - s.bird.x)
    if (dz < 4 && (!best || dz + dx < best.dz + best.dx)) best = { ...c, dz, dx }
  }
  if (!best) {
    await steer(0)
    await sleep(120)
    continue
  }
  // Steer to align x.
  const xerr = best.x - s.bird.x
  if (Math.abs(xerr) > 0.6) {
    await steer(Math.sign(xerr))
    await sleep(100)
    continue
  }
  await steer(0)
  await page.keyboard.press('Space')
  drops++
  await sleep(420) // respect the 0.35s drop cooldown
  if (drops === 4) await page.screenshot({ path: shot('3-flying') })
}
await steer(0)
await page.screenshot({ path: shot('4-late') })

const end = await snap()
const hud = await page.evaluate(() => ({
  score: document.querySelector('#hud-score')?.textContent,
  timer: document.querySelector('#hud-timer')?.textContent,
  stars: document.querySelector('#hud-stars')?.textContent,
  combo: document.querySelector('#combo')?.textContent,
  loafFill: document.querySelector('#drop-fill')?.style.height,
}))

// ── End-of-run: wait for results, then verify RETRY fully resets ────────────
let resultsOk = false
let retryOk = false
for (let i = 0; i < 70; i++) {
  await sleep(1000)
  const s = await snap()
  if (s.state === 'results') {
    resultsOk = true
    break
  }
}
if (resultsOk) {
  await sleep(500)
  await page.screenshot({ path: shot('5-results') })
  const resultsText = await page.evaluate(
    () => document.querySelector('#results-screen')?.textContent ?? '',
  )
  console.log('results screen text:', resultsText.slice(0, 300))
  // Tap RETRY (first .big-btn) and confirm a fresh run.
  await page.evaluate(() => {
    const btns = document.querySelectorAll('#results-screen .big-btn')
    ;(btns[0] /* RETRY */)?.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    )
    ;(btns[0])?.click()
  })
  await sleep(4500) // intro card passes
  const fresh = await snap()
  retryOk =
    fresh.state === 'playing' && fresh.score === 0 && fresh.loaf === 6
  console.log(
    `retry: state=${fresh.state} score=${fresh.score} loaf=${fresh.loaf} → ${retryOk ? 'RESET OK' : 'RESET BROKEN'}`,
  )
  await page.screenshot({ path: shot('6-retry') })
}

console.log(`drops fired: ${drops}`)
console.log('engine score:', end.score, '| loaf left:', end.loaf)
console.log('HUD:', JSON.stringify(hud))
console.log(
  errors.length
    ? `ERRORS (${errors.length}):\n${errors.join('\n')}`
    : 'NO RUNTIME ERRORS',
)
await browser.close()
// Pass requires: no errors, at least one scored hit, results reached, RETRY resets.
const pass = !errors.length && end.score > 0 && resultsOk && retryOk
console.log(pass ? 'SMOKE PASS' : 'SMOKE FAIL')
process.exit(pass ? 0 : 1)
