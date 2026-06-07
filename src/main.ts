// ─────────────────────────────────────────────────────────────────────────────
// main.ts — integrator. The game state machine + the one place where every
// concrete module meets. Wires the bus, owns the RAF loop, the hitstop timer,
// the fixed-dt clamp, the feel reactions (shake / haptics / hitstop), and the
// title → intro → playing → results flow with instant RETRY (no page reload).
//
// Coordinate system: forward = −Z, +X right, +Y up, ground y=0 (ARCHITECTURE).
// Call order in the play loop is canon — see ARCHITECTURE §"main.ts loop".
// ─────────────────────────────────────────────────────────────────────────────
import './styles.css'

import { EventBus } from './events'
import { SceneRig } from './render/scene'
import { Bird } from './bird/bird'
import { Controls } from './bird/controls'
import { TURNPIKE } from './world/level'
import { Traffic } from './world/traffic'
import { Payloads, Reticle } from './payload/ballistics'
import { Splats } from './payload/splat'
import { Scoring } from './systems/scoring'
import { Loaf } from './systems/loaf'
import { Stars } from './systems/stars'
import { Barks } from './systems/barks'
import { Hud } from './ui/hud'
import { Title } from './ui/title'
import { Results } from './ui/results'
import { buildSplatReport } from './ui/splatReport'
import { GameAudio } from './audio/audio'

import {
  BIRD_NAME,
  FORWARD_SPEED,
  HAPTIC_BULLSEYE,
  HAPTIC_DROP_MS,
  HAPTIC_HIT_MS,
  HITSTOP_BULLSEYE_MS,
  HITSTOP_MAX_MS,
  LEVEL_DURATION_S,
  SHAKE_BULLSEYE_PX,
  SHAKE_HIT_PX,
  STORAGE_KEY_BEST,
} from './constants'
import type { RunSummary, SplatTier } from './types'

// ── Fixed-dt clamp: never integrate more than 1/20s of physics per frame so a
// long stall (tab switch, GC) can't tunnel payloads or blow up the spring. ──
const MAX_DT = 1 / 20

// ── Game state machine ───────────────────────────────────────────────────────
type GameState = 'title' | 'intro' | 'playing' | 'results'

// Intro-card dwell (input is live the whole time per ARCHITECTURE).
const INTRO_SECONDS = 2.5

class Game {
  private readonly bus = new EventBus()

  // Rendering / input.
  private readonly sceneRig: SceneRig
  private readonly bird: Bird
  private readonly controls: Controls

  // World.
  private readonly traffic: Traffic

  // Payloads / FX.
  private readonly payloads: Payloads
  private readonly reticle: Reticle
  private readonly splats: Splats

  // Systems.
  private readonly scoring: Scoring
  private readonly loaf: Loaf
  private readonly stars: Stars
  private readonly barks: Barks

  // UI.
  private readonly hud: Hud
  private readonly title: Title
  private readonly results: Results

  // Audio.
  private readonly audio: GameAudio

  // ── Run clock + state ──
  private state: GameState = 'title'
  private runTime = 0 // seconds since the playing state began
  private introTime = 0 // seconds spent in the intro state
  private hitstopMs = 0 // remaining hitstop (pauses updates, keeps rendering)

  private best = 0
  private sharing = false // guards against overlapping SHARE flows

  // RAF bookkeeping.
  private lastTs = 0
  private rafId = 0
  private paused = false // document hidden

  constructor() {
    // SceneRig grabs #game itself; everything else is added to its scene.
    this.sceneRig = new SceneRig()
    const scene = this.sceneRig.scene

    this.bird = new Bird(scene)
    this.controls = new Controls()

    this.traffic = new Traffic(scene, TURNPIKE)

    this.payloads = new Payloads(scene, this.bus)
    this.reticle = new Reticle(scene)
    this.splats = new Splats(scene)

    this.scoring = new Scoring(this.bus)
    this.loaf = new Loaf(scene, TURNPIKE, this.bus)
    this.stars = new Stars(TURNPIKE, this.bus)
    this.barks = new Barks()

    this.hud = new Hud()
    this.title = new Title()
    this.results = new Results()

    this.audio = new GameAudio()

    // Toll plaza gantry (visual only) lives at a fixed z for the whole session.
    this.sceneRig.placeTollPlaza(-FORWARD_SPEED * TURNPIKE.tollPlazaSec)

    this.best = this.loadBest()

    this.wireBus()
    this.wireWindow()

    // Reticle is only meaningful while playing — hidden on title/results.
    this.reticle.setVisible(false)
    this.hud.setVisible(false)

    // Kick the RAF loop (it renders every frame regardless of state so the
    // scene is live behind the title screen).
    this.lastTs = performance.now()
    this.rafId = requestAnimationFrame(this.frame)

    // Read-only debug surface for headless smoke tests (scripts/smoke.mjs):
    // poll bird/reticle/cars to aim real drops. Harmless to ship in gray-box.
    ;(window as unknown as { __bb: unknown }).__bb = {
      snapshot: () => ({
        state: this.state,
        score: this.scoring.score,
        bird: {
          x: this.bird.view.pos.x,
          y: this.bird.view.pos.y,
          z: this.bird.view.pos.z,
        },
        reticle: { x: this.reticle.impact.x, z: this.reticle.impact.z },
        loaf: this.loaf.current,
        cars: this.traffic.cars.map((c) => ({
          x: c.pos.x,
          z: c.pos.z,
          vz: c.vel.z,
          special: c.special,
        })),
      }),
    }

    void this.enterTitle()
  }

  // ── Bus reactions main owns (scoring/stars/loaf subscribe themselves) ──────
  private wireBus(): void {
    // splat → decals, audio, honk, barks, popups, feel.
    this.bus.on('splat', (e) => {
      this.traffic.registerSplat(e.carId)

      const car = this.traffic.getCar(e.carId)
      if (car) this.splats.carSplat(car, e.localOffset, e.tier)

      // Audio. Jackpot cars get the dedicated sting (which already layers a
      // honk), so don't double up the honk on those.
      if (e.special === 'jackpot') {
        this.audio.jackpot()
      } else {
        this.audio.splat(e.tier)
        if (e.tier === 'HIT' || e.tier === 'BULLSEYE') this.audio.honk()
      }

      // Driver bark bubble from the car's position.
      const barkText = this.barks.onSplat(e)
      if (barkText && car) this.hud.bark(barkText, car.pos)

      // Feel: shake, hitstop, haptics — keyed to tier.
      this.applySplatFeel(e.tier)
    })

    // score → the gold banked-amount popup + a smaller white tag popup.
    this.bus.on('score', (e) => {
      this.hud.setScore(e.total)
      if (e.amount > 0) this.hud.popup(`+${e.amount}`, e.at, 'score')
      if (e.tag) this.hud.popup(e.tag, e.at, 'tag')
    })

    // combo → HUD readout + audio (ding on advance, womp on break).
    this.bus.on('combo', (e) => {
      this.hud.setCombo(e.count, e.multiplier)
      if (e.broke) this.audio.comboBreak()
      else this.audio.comboDing(e.multiplier)
    })

    // miss → road plip decal + the quiet drip sound.
    this.bus.on('miss', (e) => {
      this.splats.roadSplat(e.impact)
      this.audio.plip()
    })

    // dryfire → the empty-trigger thud (scoring breaks the combo itself).
    this.bus.on('dryfire', () => {
      this.audio.dryfire()
    })

    // drop → release whoosh + a short haptic tick.
    this.bus.on('drop', () => {
      this.audio.whoosh()
      vibrate(HAPTIC_DROP_MS)
    })

    // eat → gulp sound + a "+N FOOD" refuel popup at the bird, and refresh the
    // loaf meter immediately.
    this.bus.on('eat', (e) => {
      this.audio.gulp()
      this.hud.setLoaf(this.loaf.current, this.loaf.capacity)
      this.hud.popup(`+${e.refuel} ${e.label}`, this.bird.view.pos, 'refuel')
    })

    // star → chime, HUD stars, and a star popup at the bird.
    this.bus.on('star', (e) => {
      this.audio.star()
      this.hud.setStars(this.stars.earned)
      this.hud.popup(`★ ${e.label}`, this.bird.view.pos, 'tag')
    })
  }

  private applySplatFeel(tier: SplatTier): void {
    if (tier === 'BULLSEYE') {
      this.sceneRig.addShake(SHAKE_BULLSEYE_PX)
      // Bullseye hitstop stacks toward the cap so a rapid double-bullseye reads.
      this.hitstopMs = Math.min(HITSTOP_MAX_MS, this.hitstopMs + HITSTOP_BULLSEYE_MS)
      vibrate(HAPTIC_BULLSEYE)
    } else if (tier === 'HIT') {
      this.sceneRig.addShake(SHAKE_HIT_PX)
      vibrate(HAPTIC_HIT_MS)
    } else {
      // GRAZE: a whisper of shake, no hitstop, no haptic.
      this.sceneRig.addShake(SHAKE_HIT_PX * 0.4)
    }
  }

  private wireWindow(): void {
    const onResize = (): void => this.sceneRig.resize()
    window.addEventListener('resize', onResize)
    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', onResize)
      vv.addEventListener('scroll', onResize)
    }

    // Pause RAF integration while the tab is hidden; resume on return. Mobile
    // browsers re-suspend the AudioContext, so re-unlock on visible.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Fully stop the RAF loop while hidden (the documented "Pause RAF on
        // visibilitychange: hidden" contract — literally, not just early-return).
        this.paused = true
        if (this.rafId) {
          cancelAnimationFrame(this.rafId)
          this.rafId = 0
        }
      } else {
        this.paused = false
        // Avoid a huge dt spike after a long background; reset the clock.
        this.lastTs = performance.now()
        // Mobile browsers re-suspend the AudioContext while backgrounded. Re-arm
        // it on EVERY return (idempotent + cheap) so the results-screen UI taps
        // and the next run's first sounds aren't silent — not just while playing.
        this.audio.unlock()
        // Restart the loop if it was stopped.
        if (!this.rafId) this.rafId = requestAnimationFrame(this.frame)
      }
    })
  }

  // ── State transitions ──────────────────────────────────────────────────────

  private async enterTitle(): Promise<void> {
    this.state = 'title'
    this.controls.setEnabled(false)
    this.reticle.setVisible(false)
    this.hud.setVisible(false)
    this.results.hide()

    // show() resolves synchronously inside the tap gesture — unlock audio there.
    await this.title.show(this.best)
    this.audio.unlock()
    this.audio.uiTap()
    this.title.hide()

    this.startRun()
  }

  /** Begin a fresh run: reset every system, show the intro card, go live. */
  private startRun(): void {
    this.resetAll()

    this.runTime = 0
    this.introTime = 0
    this.hitstopMs = 0

    this.state = 'intro'
    // Hold the bird stationary in Z during the intro card so the run clock and
    // the `birdZ ≈ −FORWARD_SPEED × t` world-anchor invariant stay locked (the
    // bird is at z=0 exactly when the clock starts ticking). Lateral / band /
    // dive input still apply — input is live the whole intro.
    this.bird.forwardFrozen = true
    this.hud.setVisible(true)
    this.reticle.setVisible(true)
    this.controls.setEnabled(true) // input is live during the intro card

    // Seed the HUD so it isn't blank on the first frame.
    this.hud.setScore(0)
    this.hud.setTimer(LEVEL_DURATION_S)
    this.hud.setCombo(0, 1)
    this.hud.setStars(this.stars.earned)
    this.hud.setLoaf(this.loaf.current, this.loaf.capacity)
    this.hud.setWind(TURNPIKE.wind(0))
    this.hud.setEatPrompt(false)
    this.hud.showIntro(TURNPIKE.introCard, INTRO_SECONDS)
  }

  /** Reset every stateful system to a clean run (instant RETRY, no reload). */
  private resetAll(): void {
    this.bird.reset()
    this.traffic.reset()
    this.payloads.reset()
    this.splats.reset()
    this.scoring.reset()
    this.loaf.reset()
    this.stars.reset()
    this.hud.reset()
  }

  private enterResults(): void {
    this.state = 'results'
    this.controls.setEnabled(false)
    this.reticle.setVisible(false)
    this.hud.setEatPrompt(false)

    const summary = this.buildSummary()

    // Persist the new best before the screen renders the badge.
    if (summary.newBest) this.saveBest(summary.score)
    this.best = summary.best

    this.results.show(
      summary,
      () => this.onRetry(),
      () => void this.onShare(summary),
    )
  }

  private onRetry(): void {
    this.audio.unlock() // mobile may have re-suspended; safe to re-arm
    this.audio.uiTap()
    this.results.hide()
    // Instant restart at the intro card — no page reload (pillar).
    this.startRun()
  }

  private async onShare(summary: RunSummary): Promise<void> {
    // Guard against overlapping SHARE flows (double-tap, or RETRY landing while
    // a share sheet is still resolving) — ignore re-entrant calls.
    if (this.sharing) return
    this.sharing = true
    try {
      this.audio.uiTap()
      const canvas = buildSplatReport(summary)
      const file = await canvasToFile(canvas, 'splat-report.png')

      // Prefer native share with the file; fall back to a PNG download.
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean
      }
      if (
        file &&
        typeof nav.share === 'function' &&
        typeof nav.canShare === 'function' &&
        nav.canShare({ files: [file] })
      ) {
        try {
          await nav.share({
            files: [file],
            title: 'The Bad Birds — Splat Report',
            text: `I scored ${summary.score.toLocaleString('en-US')} on ${summary.levelTitle}.`,
          })
          return
        } catch {
          // User cancelled or share failed — fall through to download.
        }
      }
      downloadCanvas(canvas, 'splat-report.png')
    } finally {
      this.sharing = false
    }
  }

  // ── RunSummary assembly ────────────────────────────────────────────────────
  private buildSummary(): RunSummary {
    const stats = this.scoring.stats
    const score = this.scoring.score

    // loafEfficiencyPct = round(100 * scoredDrops / max(1, drops)).
    const loafEfficiencyPct = Math.round(
      (100 * stats.scoredDrops) / Math.max(1, stats.drops),
    )

    const newBest = score > this.best
    const best = newBest ? score : this.best

    const labels = TURNPIKE.stars
    return {
      ...stats,
      score,
      stars: this.stars.earned,
      starLabels: [labels[0].label, labels[1].label, labels[2].label],
      levelTitle: TURNPIKE.title,
      birdName: BIRD_NAME,
      loafEfficiencyPct,
      best,
      newBest,
    }
  }

  // ── Persistence ────────────────────────────────────────────────────────────
  private loadBest(): number {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_BEST)
      const n = raw ? parseInt(raw, 10) : 0
      return Number.isFinite(n) && n > 0 ? n : 0
    } catch {
      return 0
    }
  }

  private saveBest(score: number): void {
    try {
      localStorage.setItem(STORAGE_KEY_BEST, String(Math.round(score)))
    } catch {
      // Storage unavailable (private mode / quota) — best stays in-memory.
    }
  }

  // ── The RAF loop ───────────────────────────────────────────────────────────
  private readonly frame = (ts: number): void => {
    // When paused (tab hidden) the loop is cancelled by the visibility handler;
    // bail without rescheduling so it stays fully stopped until we return.
    if (this.paused) {
      this.rafId = 0
      return
    }
    this.rafId = requestAnimationFrame(this.frame)

    const rawDt = (ts - this.lastTs) / 1000
    this.lastTs = ts

    // Clamp dt so a stall can't break physics; guard against negative/NaN.
    let dt = rawDt
    if (!(dt > 0)) dt = 0
    if (dt > MAX_DT) dt = MAX_DT

    if (this.state === 'playing' || this.state === 'intro') {
      this.tickPlay(dt)
    }

    // Always render — even on title/results the scene is live behind overlays.
    this.sceneRig.updateCamera(this.bird.view, dt)
    this.sceneRig.update(dt, this.bird.view.pos.z)
    this.sceneRig.render()
  }

  /** One play tick. Hitstop pauses simulation but the caller still renders. */
  private tickPlay(dt: number): void {
    // Hitstop: freeze the simulation for its duration (still rendering). We do
    // NOT advance the run clock or read fresh input while frozen.
    if (this.hitstopMs > 0) {
      this.hitstopMs -= dt * 1000
      if (this.hitstopMs < 0) this.hitstopMs = 0
      // Still let the HUD breathe (popups/score count-up) so the freeze reads
      // as a punchy beat rather than a total stall.
      this.hud.update(dt, this.sceneRig.camera)
      return
    }

    const t = this.runTime

    // 1) Input → bird kinematics.
    const input = this.controls.frame()
    this.bird.update(dt, input)

    // 2) World.
    this.traffic.update(dt, this.bird.view.pos.z, t)

    // 3) Food economy + EAT prompt.
    this.loaf.update(dt, this.bird.view, t)
    this.hud.setEatPrompt(this.loaf.promptVisible, TURNPIKE.regionFoodName)

    // 4) DROP / EAT edges (event flow per ARCHITECTURE).
    const wind = TURNPIKE.wind(t)
    if (input.drop) this.handleDrop(wind)
    if (input.eat) this.loaf.tryEat() // emits 'eat' on success

    // 5) Payload integration → 'splat' / 'miss'.
    this.payloads.update(dt, this.traffic, wind)
    this.reticle.update(this.bird.view, wind)
    this.splats.update(dt, this.traffic)

    // 6) Systems tick.
    this.scoring.update(dt)
    this.barks.update(dt)

    // 7) HUD: authoritative read-outs, then project popups.
    this.hud.setScore(this.scoring.score)
    this.hud.setCombo(this.scoring.comboCount, this.scoring.multiplier)
    this.hud.setLoaf(this.loaf.current, this.loaf.capacity)
    this.hud.setWind(wind)

    // 8) Advance clocks AFTER simulating this frame. The intro card holds the
    //    run clock at 0 (timer shows full duration) while input stays live.
    if (this.state === 'intro') {
      this.hud.setTimer(LEVEL_DURATION_S)
      this.introTime += dt
      if (this.introTime >= INTRO_SECONDS) {
        // Card done: release the bird into forward flight. birdZ is still ~0
        // and runTime is still 0, so they advance together from here.
        this.bird.forwardFrozen = false
        this.state = 'playing'
      }
    } else {
      this.runTime += dt
      this.hud.setTimer(LEVEL_DURATION_S - this.runTime)
      if (this.runTime >= LEVEL_DURATION_S) {
        this.hud.update(dt, this.sceneRig.camera)
        this.enterResults()
        return
      }
    }

    // 9) Project/animate HUD popups (needs the camera).
    this.hud.update(dt, this.sceneRig.camera)
  }

  /** DROP press: gate on ready() + loaf; emit 'drop' (real) or 'dryfire'. */
  private handleDrop(wind: number): void {
    if (!this.payloads.ready()) return // fire-rate cap — ignore
    if (!this.loaf.trySpend()) {
      this.bus.emit('dryfire', {})
      return
    }
    // drop() emits 'drop' itself (whoosh + haptic via the bus handler).
    this.payloads.drop(this.bird.view, wind)
    // Reflect the spent loaf immediately.
    this.hud.setLoaf(this.loaf.current, this.loaf.capacity)
  }
}

// ── Free helpers ─────────────────────────────────────────────────────────────

/** Feature-checked haptics. number | number[] both accepted by vibrate(). */
function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern)
    } catch {
      // Some browsers throw if called outside a user gesture — ignore.
    }
  }
}

/** Canvas → File (PNG) for Web Share, or null if toBlob is unavailable. */
function canvasToFile(
  canvas: HTMLCanvasElement,
  name: string,
): Promise<File | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null)
      return
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(null)
        return
      }
      resolve(new File([blob], name, { type: 'image/png' }))
    }, 'image/png')
  })
}

/** Trigger a PNG download of the splat-report canvas. */
function downloadCanvas(canvas: HTMLCanvasElement, name: string): void {
  const finish = (url: string, revoke: boolean): void => {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    if (revoke) setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  if (typeof canvas.toBlob === 'function') {
    canvas.toBlob((blob) => {
      if (blob) finish(URL.createObjectURL(blob), true)
      else finish(canvas.toDataURL('image/png'), false)
    }, 'image/png')
  } else {
    finish(canvas.toDataURL('image/png'), false)
  }
}

// ── Boot once the DOM is ready (the script is a module, so DOM is parsed). ─────
function boot(): void {
  new Game()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot)
} else {
  boot()
}
