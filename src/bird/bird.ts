// ─────────────────────────────────────────────────────────────────────────────
// Bird — kinematic American Goldfinch. No physics engine.
//   • Forward: pos.z -= FORWARD_SPEED * dt, always.
//   • Lateral: position-control damped spring toward targetX, clamped to
//     MAX_STRAFE, soft walls at ±CORRIDOR_HALF_X. Model banks with lateral vel.
//   • Altitude: discrete bands, smooth-stepped over BAND_TRANSITION_S.
//   • Dive: flick-down at LOW (when armed) eases to DIVE_ALTITUDE, holds, then
//     climbs back to LOW. Re-arms only after returning to MID/HIGH.
//   • Gray-box flat-shaded goldfinch + blob shadow, added to scene in ctor.
// ─────────────────────────────────────────────────────────────────────────────
import {
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Scene,
  Vector3,
} from 'three'
import type { AltitudeBand, BirdView, IBird, InputFrame } from '../types'
import {
  BAND_ALTITUDE,
  BAND_LIST,
  BAND_TRANSITION_S,
  CORRIDOR_HALF_X,
  DIVE_ALTITUDE,
  DIVE_CLIMB_S,
  DIVE_HOLD_S,
  DIVE_STEER_FACTOR,
  FORWARD_SPEED,
  MAX_STRAFE,
  PALETTE,
  SPREAD_RADIUS,
  SPREAD_RADIUS_DIVE,
  START_BAND,
  STRAFE_RESPONSE_S,
} from '../constants'

// Dive phases. 'none' = not diving (normal band flight).
//   descend — the steep ~6m plunge over DIVE_HOLD_S (the committed dive window).
//   climb   — the slow rise back to LOW over DIVE_CLIMB_S (no bonus; spread
//             relaxes back toward the LOW band).
// Canon (GAME_DESIGN §2): 0.6s dive + 0.5s climb-out = a 1.1s window, no bottom
// hold/dwell.
type DivePhase = 'none' | 'descend' | 'climb'

// Wing flap tuning (purely cosmetic).
const FLAP_BASE_HZ = 5.5
const FLAP_FAST_HZ = 11 // during climb / dive descent
const FLAP_AMPLITUDE = 0.9 // radians
const BANK_PER_MS = 0.16 // radians of roll per m/s lateral velocity
const BANK_MAX = 0.7 // radians
const BANK_LERP_HZ = 12 // how fast visible roll chases target roll
const PITCH_PER_VY = 0.04 // radians of pitch per m/s vertical velocity
const PITCH_MAX = 0.5

// Blob shadow: scale grows with altitude (bigger + softer when high), opacity
// fades when high. Tuned across the band range.
const SHADOW_Y = 0.02
const SHADOW_BASE_SCALE = 1.0
const SHADOW_SCALE_PER_M = 0.05
const SHADOW_OPACITY_NEAR = 0.42
const SHADOW_OPACITY_FAR = 0.12
const SHADOW_FADE_REF_M = BAND_ALTITUDE.HIGH

function smoothstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t
  return c * c * (3 - 2 * c)
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

/** Mutable concrete BirdView; exposed through the readonly IBird.view. */
class BirdViewState implements BirdView {
  readonly pos = new Vector3()
  readonly vel = new Vector3()
  band: AltitudeBand = START_BAND
  diving = false
  spreadRadius = SPREAD_RADIUS[START_BAND]
}

export class Bird implements IBird {
  readonly object: Object3D
  private readonly viewState = new BirdViewState()
  get view(): BirdView {
    return this.viewState
  }

  /** When true, forward (−Z) travel is suspended but lateral/band/dive input
   * still apply. main holds the bird at z=0 during the intro card so the run
   * clock and the `birdZ ≈ −FORWARD_SPEED × t` world-anchor invariant stay
   * locked (ARCHITECTURE "Coordinate system"). Not part of IBird — only the
   * integrator (which holds the concrete Bird) toggles it. */
  forwardFrozen = false

  // ── Lateral state ──
  private targetX = 0
  private x = 0
  private lateralVel = 0

  // ── Altitude band state ──
  private bandIndex: number = BAND_LIST.indexOf(START_BAND)
  // Smooth band transition: y eases from yFrom → yTo over BAND_TRANSITION_S.
  private bandFromY: number = BAND_ALTITUDE[START_BAND]
  private bandToY: number = BAND_ALTITUDE[START_BAND]
  private bandTransT = 1 // 0..1 progress; 1 = settled
  private y: number = BAND_ALTITUDE[START_BAND]
  private prevY: number = BAND_ALTITUDE[START_BAND]
  /** Vertical velocity (m/s), recomputed each frame in updateAltitude. */
  private cachedVy = 0

  // ── Dive state ──
  private divePhase: DivePhase = 'none'
  private diveArmed = true
  private diveTimer = 0
  private diveFromY = 0 // y at the moment a dive sub-phase started

  // ── Cosmetic ──
  private flapPhase = 0
  private rollVis = 0
  private readonly wingL: Object3D
  private readonly wingR: Object3D
  private readonly bodyGroup: Group
  private readonly shadow: Mesh
  private readonly shadowMat: MeshBasicMaterial

  constructor(scene: Scene) {
    const root = new Group()
    this.object = root

    // ── Goldfinch body group (everything that banks/pitches together) ──
    const body = new Group()
    this.bodyGroup = body

    const goldMat = new MeshLambertMaterial({ color: PALETTE.marqueeGold })
    const blackMat = new MeshLambertMaterial({ color: 0x18181c })
    const orangeMat = new MeshLambertMaterial({ color: PALETTE.sunsetOrange })

    // Body: small yellow box (longer along Z, the travel axis).
    const bodyMesh = new Mesh(new BoxGeometry(0.55, 0.45, 0.9), goldMat)
    body.add(bodyMesh)

    // Black cap box on the front-top of the head.
    const cap = new Mesh(new BoxGeometry(0.42, 0.18, 0.4), blackMat)
    cap.position.set(0, 0.28, -0.32)
    body.add(cap)

    // Tiny angry eyebrow box (one slanted black bar over the eyes).
    const brow = new Mesh(new BoxGeometry(0.46, 0.07, 0.1), blackMat)
    brow.position.set(0, 0.18, -0.5)
    brow.rotation.z = 0.15
    body.add(brow)

    // Orange beak cone pointing forward (-Z).
    const beak = new Mesh(new ConeGeometry(0.12, 0.34, 6), orangeMat)
    beak.position.set(0, 0.06, -0.62)
    beak.rotation.x = -Math.PI / 2 // tip toward -Z
    body.add(beak)

    // Black tail box at the back (+Z).
    const tail = new Mesh(new BoxGeometry(0.3, 0.1, 0.4), blackMat)
    tail.position.set(0, 0.02, 0.6)
    body.add(tail)

    // Two wing boxes on pivots so they flap around the body's Z axis.
    const wingGeo = new BoxGeometry(0.7, 0.08, 0.5)
    this.wingL = new Group()
    this.wingL.position.set(-0.2, 0.1, 0)
    const wingLMesh = new Mesh(wingGeo, goldMat)
    wingLMesh.position.set(-0.4, 0, 0) // offset out from the pivot
    this.wingL.add(wingLMesh)
    body.add(this.wingL)

    this.wingR = new Group()
    this.wingR.position.set(0.2, 0.1, 0)
    const wingRMesh = new Mesh(wingGeo, goldMat)
    wingRMesh.position.set(0.4, 0, 0)
    this.wingR.add(wingRMesh)
    body.add(this.wingR)

    root.add(body)

    // ── Blob shadow (separate; lives on the ground plane, never banks) ──
    this.shadowMat = new MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: SHADOW_OPACITY_NEAR,
      depthWrite: false,
    })
    const shadowGeo = new CircleGeometry(0.6, 16)
    this.shadow = new Mesh(shadowGeo, this.shadowMat)
    this.shadow.rotation.x = -Math.PI / 2 // flat on the ground
    root.add(this.shadow)

    this.syncTransform()
    scene.add(root)
  }

  update(dt: number, input: InputFrame): void {
    // Clamp dt defensively (main also clamps); avoids spring blowups.
    const d = dt > 0.1 ? 0.1 : dt < 0 ? 0 : dt

    this.updateBand(input)
    this.updateDive(input)
    this.updateLateral(d, input)
    this.updateAltitude(d)
    this.updateForward(d)
    this.publishView()
    this.animate(d)
    this.syncTransform()
  }

  // ── Altitude band stepping (discrete) ─────────────────────────────────────
  private updateBand(input: InputFrame): void {
    // Band changes are ignored while a dive is in progress — the dive owns Y.
    if (this.divePhase !== 'none') return
    if (input.bandChange === 0) return
    const next = this.bandIndex + input.bandChange
    if (next < 0 || next >= BAND_LIST.length) return
    if (next === this.bandIndex) return
    this.bandIndex = next
    // Begin a smooth transition from current y to the new band altitude.
    this.bandFromY = this.y
    this.bandToY = BAND_ALTITUDE[BAND_LIST[next]]
    this.bandTransT = 0
    // Re-arm the dive once we've left LOW for MID/HIGH.
    if (next >= 1 && !this.diveArmed) this.diveArmed = true
  }

  // ── Dive state machine ────────────────────────────────────────────────────
  private updateDive(input: InputFrame): void {
    if (this.divePhase === 'none') {
      // Only trigger a true dive at LOW, settled, and armed.
      const atLow = BAND_LIST[this.bandIndex] === 'LOW'
      if (input.dive && atLow && this.diveArmed && this.bandTransT >= 1) {
        this.divePhase = 'descend'
        this.diveTimer = 0
        this.diveFromY = this.y
        this.diveArmed = false // disarm immediately on commit
        // Cancel any lingering band transition (we own Y now).
        this.bandTransT = 1
      }
    }
  }

  // ── Lateral position-control (damped spring) ──────────────────────────────
  private updateLateral(dt: number, input: InputFrame): void {
    const diveActive = this.divePhase !== 'none'
    const authority = diveActive ? DIVE_STEER_FACTOR : 1

    // Pointer drag: position-control — move targetX by a fraction of corridor.
    const corridorWidth = CORRIDOR_HALF_X * 2
    const vw = input.viewportWidth > 0 ? input.viewportWidth : 1
    const dragDx = (input.steerPx / vw) * corridorWidth * authority
    this.targetX += dragDx

    // Keyboard axis: velocity-style — adds MAX_STRAFE * axis to targetX.
    if (input.steerAxis !== 0) {
      this.targetX += MAX_STRAFE * input.steerAxis * authority * dt
    }

    // Soft walls: clamp targetX to ±CORRIDOR_HALF_X. The damped spring below
    // supplies the "gentle pushback" — the bird eases back into the corridor
    // rather than snapping, so it never visibly escapes into the Meadowlands.
    if (this.targetX > CORRIDOR_HALF_X) this.targetX = CORRIDOR_HALF_X
    else if (this.targetX < -CORRIDOR_HALF_X) this.targetX = -CORRIDOR_HALF_X

    // Damped spring toward targetX: reaches full strafe speed in ~response time.
    // Critically-damped style: vel chases (target-x) with a time constant.
    const tau = STRAFE_RESPONSE_S
    const prevX = this.x
    // Exponential approach of x → targetX over tau (frame-rate independent).
    const k = 1 - Math.exp(-dt / tau)
    let newX = this.x + (this.targetX - this.x) * k
    // Clamp lateral speed to MAX_STRAFE.
    const maxStep = MAX_STRAFE * dt
    const step = newX - prevX
    if (step > maxStep) newX = prevX + maxStep
    else if (step < -maxStep) newX = prevX - maxStep
    this.x = newX
    this.lateralVel = dt > 0 ? (this.x - prevX) / dt : 0
  }

  // ── Altitude integration (band smooth-step + dive easing) ─────────────────
  private updateAltitude(dt: number): void {
    this.prevY = this.y
    if (this.divePhase !== 'none') {
      this.updateDiveAltitude(dt)
    } else if (this.bandTransT < 1) {
      // Normal band transition smooth-step.
      this.bandTransT += dt / BAND_TRANSITION_S
      if (this.bandTransT > 1) this.bandTransT = 1
      const s = smoothstep(this.bandTransT)
      this.y = this.bandFromY + (this.bandToY - this.bandFromY) * s
    } else {
      this.y = this.bandToY
    }
    // Cache this frame's vertical velocity so publishView/animate agree.
    this.cachedVy = dt > 0 ? (this.y - this.prevY) / dt : 0
  }

  private updateDiveAltitude(dt: number): void {
    this.diveTimer += dt
    const lowY = BAND_ALTITUDE.LOW
    switch (this.divePhase) {
      case 'descend': {
        // The committed dive: ease y from start → DIVE_ALTITUDE over the canon
        // 0.6s dive window (DIVE_HOLD_S). Reaching the bottom goes STRAIGHT to
        // the climb-out — no bottom dwell (canon is 0.6s dive + 0.5s climb-out).
        const dur = DIVE_HOLD_S
        const t = dur > 0 ? this.diveTimer / dur : 1
        const s = smoothstep(t)
        this.y = this.diveFromY + (DIVE_ALTITUDE - this.diveFromY) * s
        if (t >= 1) {
          this.y = DIVE_ALTITUDE
          this.divePhase = 'climb'
          this.diveTimer = 0
          this.diveFromY = DIVE_ALTITUDE
        }
        break
      }
      case 'climb': {
        const t = DIVE_CLIMB_S > 0 ? this.diveTimer / DIVE_CLIMB_S : 1
        const s = smoothstep(t)
        this.y = this.diveFromY + (lowY - this.diveFromY) * s
        if (t >= 1) {
          this.y = lowY
          this.divePhase = 'none'
          // Back at LOW, settled; band state already points at LOW. Y owned by
          // band logic again. Dive re-arms only when we climb to MID/HIGH.
          this.bandFromY = lowY
          this.bandToY = lowY
          this.bandTransT = 1
        }
        break
      }
      case 'none':
        break
    }
  }

  private updateForward(dt: number): void {
    // Forward travel is locked at FORWARD_SPEED, except while main holds the
    // bird stationary during the intro card (so z stays 0 == run clock 0).
    if (this.forwardFrozen) return
    this.viewState.pos.z -= FORWARD_SPEED * dt
  }

  // ── Publish the BirdView consumed by camera / reticle / ballistics ────────
  private publishView(): void {
    const v = this.viewState
    v.pos.x = this.x
    v.pos.y = this.y
    // z already advanced in updateForward.

    // Forward velocity matches actual travel: 0 while frozen (intro hold), so
    // the reticle prediction and any payload lead agree with the bird's real
    // motion during the card.
    v.vel.set(this.lateralVel, this.cachedVy, this.forwardFrozen ? 0 : -FORWARD_SPEED)

    // The dive BONUS window (tight spread + 1.5× + FOV kick) is the committed
    // steep plunge only — the 'descend' phase. During the slow 'climb' back to
    // LOW the reward relaxes: spread blends from SPREAD_RADIUS_DIVE back toward
    // the LOW band so a drop released high in the climb-out doesn't read as a
    // pinpoint dive shot (CANON: the 1.5× rewards committing to the ~6m dive,
    // not the climb-out).
    const diving = this.divePhase === 'descend'
    v.diving = diving
    v.band = BAND_LIST[this.bandIndex]

    if (diving) {
      v.spreadRadius = SPREAD_RADIUS_DIVE
    } else if (this.divePhase === 'climb') {
      // Blend the scatter back from the dive's pinpoint toward LOW over the
      // climb-out so aim difficulty tracks the rising altitude.
      const t = DIVE_CLIMB_S > 0 ? clamp01(this.diveTimer / DIVE_CLIMB_S) : 1
      const s = smoothstep(t)
      v.spreadRadius =
        SPREAD_RADIUS_DIVE + (SPREAD_RADIUS.LOW - SPREAD_RADIUS_DIVE) * s
    } else if (this.bandTransT < 1) {
      // Blend spread across a band transition (optional but nicer for aiming).
      const fromBand = this.nearestBandForY(this.bandFromY)
      const toBand = BAND_LIST[this.bandIndex]
      const s = smoothstep(this.bandTransT)
      v.spreadRadius =
        SPREAD_RADIUS[fromBand] +
        (SPREAD_RADIUS[toBand] - SPREAD_RADIUS[fromBand]) * s
    } else {
      v.spreadRadius = SPREAD_RADIUS[BAND_LIST[this.bandIndex]]
    }
  }

  private nearestBandForY(y: number): AltitudeBand {
    let best: AltitudeBand = BAND_LIST[0]
    let bestD = Infinity
    for (const b of BAND_LIST) {
      const d = Math.abs(BAND_ALTITUDE[b] - y)
      if (d < bestD) {
        bestD = d
        best = b
      }
    }
    return best
  }

  // ── Cosmetic animation: flap, bank, pitch, blob shadow ────────────────────
  private animate(dt: number): void {
    // cachedVy was computed in updateAltitude (current-frame y delta).
    // Faster flap while climbing (gaining altitude) or diving down hard.
    const climbing = this.cachedVy > 0.5 || this.divePhase === 'descend'
    const flapHz = climbing ? FLAP_FAST_HZ : FLAP_BASE_HZ
    this.flapPhase += dt * flapHz * Math.PI * 2
    if (this.flapPhase > Math.PI * 4) this.flapPhase -= Math.PI * 4
    const flap = Math.sin(this.flapPhase) * FLAP_AMPLITUDE
    this.wingL.rotation.z = flap
    this.wingR.rotation.z = -flap

    // Bank with lateral velocity (roll toward the direction of travel).
    let targetRoll = -this.lateralVel * BANK_PER_MS
    if (targetRoll > BANK_MAX) targetRoll = BANK_MAX
    else if (targetRoll < -BANK_MAX) targetRoll = -BANK_MAX
    const rk = 1 - Math.exp(-dt * BANK_LERP_HZ)
    this.rollVis += (targetRoll - this.rollVis) * rk
    this.bodyGroup.rotation.z = this.rollVis

    // Pitch with vertical velocity (nose down on descent, up on climb).
    let pitch = this.cachedVy * PITCH_PER_VY
    if (pitch > PITCH_MAX) pitch = PITCH_MAX
    else if (pitch < -PITCH_MAX) pitch = -PITCH_MAX
    this.bodyGroup.rotation.x = -pitch
  }

  private syncTransform(): void {
    // Root follows the bird position; body bob is purely visual via bodyGroup.
    this.object.position.set(this.x, this.y, this.viewState.pos.z)

    // Blob shadow projects straight down to the ground plane. It is a child of
    // the root, so counter the root's Y to sit at SHADOW_Y world height.
    const altitude = this.y
    this.shadow.position.set(0, SHADOW_Y - altitude, 0)
    const scale =
      SHADOW_BASE_SCALE + Math.max(0, altitude) * SHADOW_SCALE_PER_M
    this.shadow.scale.set(scale, scale, 1)
    // Counter the body's roll/pitch are not applied to root, so the shadow
    // stays flat automatically. Fade opacity with altitude.
    const fade = Math.min(1, Math.max(0, altitude / SHADOW_FADE_REF_M))
    this.shadowMat.opacity =
      SHADOW_OPACITY_NEAR + (SHADOW_OPACITY_FAR - SHADOW_OPACITY_NEAR) * fade
  }

  reset(): void {
    this.targetX = 0
    this.x = 0
    this.lateralVel = 0
    this.rollVis = 0

    this.bandIndex = BAND_LIST.indexOf(START_BAND)
    this.bandFromY = BAND_ALTITUDE[START_BAND]
    this.bandToY = BAND_ALTITUDE[START_BAND]
    this.bandTransT = 1
    this.y = BAND_ALTITUDE[START_BAND]
    this.prevY = BAND_ALTITUDE[START_BAND]
    this.cachedVy = 0

    this.divePhase = 'none'
    this.diveArmed = true
    this.diveTimer = 0
    this.diveFromY = 0

    this.forwardFrozen = false
    this.flapPhase = 0

    const v = this.viewState
    v.pos.set(0, BAND_ALTITUDE[START_BAND], 0)
    v.vel.set(0, 0, -FORWARD_SPEED)
    v.band = START_BAND
    v.diving = false
    v.spreadRadius = SPREAD_RADIUS[START_BAND]

    this.bodyGroup.rotation.set(0, 0, 0)
    this.syncTransform()
  }
}
