// ─────────────────────────────────────────────────────────────────────────────
// Controls — player intent. Pointer drag/flick in #flight-zone, DROP/EAT
// buttons, plus a keyboard fallback for desktop dev. Produces one InputFrame
// per tick; edge flags are true for exactly the frame they fired and cleared on
// read by frame().
//
//   • #flight-zone (lower 55%): horizontal drag accumulates steerPx (6px dead
//     zone on the first move of a gesture). Vertical swipe with velocity
//     > SWIPE_VEL_THRESH px/s (and > VERT_DEAD px) fires bandChange ±1 once per
//     gesture (up = +1, down = -1). A fast down-flick > FLICK_VEL_THRESH px/s
//     fires BOTH bandChange = -1 AND dive = true and lets the bird resolve it.
//   • #drop-btn pointerdown → drop edge.  #eat-btn pointerdown → eat edge.
//   • Keyboard: arrows/WASD steer + band, X/Shift dive, Space drop, E eat.
// ─────────────────────────────────────────────────────────────────────────────
import type { IControls, InputFrame } from '../types'

/** Rendered viewport width in CSS px — visualViewport when available (iOS
 * URL-bar collapse keeps it accurate under the thumb), else window.innerWidth. */
function currentViewportWidth(): number {
  const vv = window.visualViewport
  return vv ? vv.width : window.innerWidth
}

// Gesture tuning (CSS px and px/s).
const HORIZ_DEAD_PX = 6 // dead zone before horizontal steering engages
const VERT_DEAD_PX = 10 // dead zone before a vertical swipe counts
const SWIPE_VEL_THRESH = 600 // px/s vertical → bandChange ±1
const FLICK_VEL_THRESH = 900 // px/s downward → dive (bird resolves dive/descend)
// Velocity estimate blend: newest instantaneous sample weight (0..1). High so a
// fast flick registers on its peak frame; the 10px dead zone gates noise.
const VEL_BLEND = 0.7

interface PointerState {
  id: number
  lastX: number
  lastY: number
  // Whether the horizontal dead zone has been crossed this gesture.
  horizActive: boolean
  // Accumulated unsigned travel since gesture start (for dead-zone crossing).
  totalDx: number
  totalDy: number
  // Whether this gesture has already fired its one band change.
  bandFired: boolean
  // Recent vertical velocity estimate (px/s, +down) for swipe/flick detection.
  vy: number
  // Timestamp (ms) of the previous move sample.
  lastT: number
}

export class Controls implements IControls {
  private readonly flightZone: HTMLElement
  private readonly dropBtn: HTMLElement
  private readonly eatBtn: HTMLElement

  private enabled = true

  // Accumulators / edges that frame() reports then clears.
  private steerPx = 0
  private bandChange: -1 | 0 | 1 = 0
  private dive = false
  private drop = false
  private eat = false

  // Keyboard axis (held), persists across frames until key up.
  private keyLeft = false
  private keyRight = false

  private viewportWidth = currentViewportWidth()

  // Single tracked pointer in the flight zone.
  private pointer: PointerState | null = null

  // Bound handlers (kept for teardown symmetry, though main never tears down).
  private readonly onResize = (): void => {
    // Prefer visualViewport width so steer normalization (steerPx / width)
    // matches the actually-rendered width under the thumb — on iOS innerWidth
    // and visualViewport diverge during the URL-bar collapse.
    this.viewportWidth = currentViewportWidth()
  }
  private readonly onPointerDown: (e: PointerEvent) => void
  private readonly onPointerMove: (e: PointerEvent) => void
  private readonly onPointerUp: (e: PointerEvent) => void
  private readonly onDropDown: (e: PointerEvent) => void
  private readonly onEatDown: (e: PointerEvent) => void
  private readonly onKeyDown: (e: KeyboardEvent) => void
  private readonly onKeyUp: (e: KeyboardEvent) => void

  private static requireEl(id: string): HTMLElement {
    const el = document.getElementById(id)
    if (el === null) {
      throw new Error(`Controls: missing required element #${id}`)
    }
    return el
  }

  constructor() {
    this.flightZone = Controls.requireEl('flight-zone')
    this.dropBtn = Controls.requireEl('drop-btn')
    this.eatBtn = Controls.requireEl('eat-btn')

    this.onPointerDown = (e) => this.handlePointerDown(e)
    this.onPointerMove = (e) => this.handlePointerMove(e)
    this.onPointerUp = (e) => this.handlePointerUp(e)
    this.onDropDown = (e) => this.handleDropDown(e)
    this.onEatDown = (e) => this.handleEatDown(e)
    this.onKeyDown = (e) => this.handleKeyDown(e)
    this.onKeyUp = (e) => this.handleKeyUp(e)

    this.flightZone.addEventListener('pointerdown', this.onPointerDown)
    this.flightZone.addEventListener('pointermove', this.onPointerMove)
    this.flightZone.addEventListener('pointerup', this.onPointerUp)
    this.flightZone.addEventListener('pointercancel', this.onPointerUp)

    this.dropBtn.addEventListener('pointerdown', this.onDropDown)
    this.eatBtn.addEventListener('pointerdown', this.onEatDown)

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('resize', this.onResize)
    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', this.onResize)
      vv.addEventListener('scroll', this.onResize)
    }
  }

  // ── Flight-zone pointer (steer + swipe + flick) ───────────────────────────
  private handlePointerDown(e: PointerEvent): void {
    if (!this.enabled) return
    // Track exactly one pointer; ignore extra fingers.
    if (this.pointer !== null) return
    e.preventDefault()
    try {
      this.flightZone.setPointerCapture(e.pointerId)
    } catch {
      // setPointerCapture can throw if the pointer is already gone; ignore.
    }
    this.pointer = {
      id: e.pointerId,
      lastX: e.clientX,
      lastY: e.clientY,
      horizActive: false,
      totalDx: 0,
      totalDy: 0,
      bandFired: false,
      vy: 0,
      lastT: e.timeStamp,
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.enabled) return
    const p = this.pointer
    if (p === null || e.pointerId !== p.id) return
    e.preventDefault()

    const dx = e.clientX - p.lastX
    const dy = e.clientY - p.lastY
    p.lastX = e.clientX
    p.lastY = e.clientY
    p.totalDx += dx
    p.totalDy += dy

    // Vertical velocity estimate (+down). Weight the latest instantaneous
    // sample heavily so a genuine fast flick crosses threshold on its peak
    // frame, while light smoothing rejects single-pixel jitter. The 10px
    // vertical dead zone below is the real noise gate.
    const dtMs = e.timeStamp - p.lastT
    p.lastT = e.timeStamp
    if (dtMs > 0) {
      const instVy = (dy / dtMs) * 1000 // px/s, +down
      p.vy = p.vy * (1 - VEL_BLEND) + instVy * VEL_BLEND
    }

    // Horizontal steering: engage only after crossing the 6px dead zone, then
    // accumulate raw deltas (the dead-zone travel itself is discarded).
    if (!p.horizActive) {
      if (Math.abs(p.totalDx) >= HORIZ_DEAD_PX) {
        p.horizActive = true
        // Discard the dead-zone slack so steering starts from the threshold.
      }
    } else {
      this.steerPx += dx
    }

    // Vertical band change: one per gesture, requires crossing the vertical
    // dead zone AND a swipe velocity. Up (dy<0) climbs, down (dy>0) descends.
    if (!p.bandFired && Math.abs(p.totalDy) >= VERT_DEAD_PX) {
      const speed = Math.abs(p.vy)
      if (speed >= SWIPE_VEL_THRESH) {
        if (p.vy < 0) {
          // Swipe up → climb.
          this.bandChange = 1
          p.bandFired = true
        } else {
          // Swipe / flick down → descend. A hard flick also arms a dive; the
          // bird decides whether LOW+armed dives or it simply descends.
          this.bandChange = -1
          if (p.vy >= FLICK_VEL_THRESH) this.dive = true
          p.bandFired = true
        }
      }
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    const p = this.pointer
    if (p === null || e.pointerId !== p.id) return
    try {
      this.flightZone.releasePointerCapture(e.pointerId)
    } catch {
      // Already released; ignore.
    }
    this.pointer = null
  }

  // ── DROP / EAT buttons ────────────────────────────────────────────────────
  private handleDropDown(e: PointerEvent): void {
    // Always prevent default so the button never scrolls; honor enabled state.
    e.preventDefault()
    if (!this.enabled) return
    // Capture the pointer so a touch that lands on DROP then slides keeps its
    // move/up routed here — it can't fall through to the flight-zone beneath and
    // be reinterpreted as a steer gesture, or stick the button's active state.
    Controls.capturePointer(e)
    this.drop = true
  }

  private handleEatDown(e: PointerEvent): void {
    e.preventDefault()
    if (!this.enabled) return
    Controls.capturePointer(e)
    this.eat = true
  }

  /** Pointer-capture a button press onto its own element (best effort). */
  private static capturePointer(e: PointerEvent): void {
    const el = e.currentTarget as HTMLElement | null
    if (!el) return
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      // setPointerCapture can throw if the pointer is already gone; ignore.
    }
  }

  // ── Keyboard fallback (desktop dev) ───────────────────────────────────────
  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.keyLeft = true
        break
      case 'ArrowRight':
      case 'KeyD':
        this.keyRight = true
        break
      case 'ArrowUp':
      case 'KeyW':
        if (!e.repeat) this.bandChange = 1
        break
      case 'ArrowDown':
      case 'KeyS':
        if (!e.repeat) this.bandChange = -1
        break
      case 'KeyX':
      case 'ShiftLeft':
        if (!e.repeat) this.dive = true
        break
      case 'Space':
        if (!e.repeat) this.drop = true
        // Stop the page from scrolling on Space.
        e.preventDefault()
        break
      case 'KeyE':
        if (!e.repeat) this.eat = true
        break
      default:
        return
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.keyLeft = false
        break
      case 'ArrowRight':
      case 'KeyD':
        this.keyRight = false
        break
      default:
        break
    }
  }

  // ── IControls ─────────────────────────────────────────────────────────────
  frame(): InputFrame {
    const steerAxis = this.keyLeft === this.keyRight ? 0 : this.keyRight ? 1 : -1
    const out: InputFrame = {
      steerPx: this.steerPx,
      steerAxis,
      bandChange: this.bandChange,
      dive: this.dive,
      drop: this.drop,
      eat: this.eat,
      viewportWidth: this.viewportWidth,
    }
    // Clear accumulator + edges (held axis keys persist via keyLeft/keyRight).
    this.steerPx = 0
    this.bandChange = 0
    this.dive = false
    this.drop = false
    this.eat = false
    return out
  }

  setEnabled(v: boolean): void {
    this.enabled = v
    if (!v) {
      // Drop all in-flight state so re-enabling starts clean.
      if (this.pointer !== null) {
        try {
          this.flightZone.releasePointerCapture(this.pointer.id)
        } catch {
          // ignore
        }
        this.pointer = null
      }
      this.steerPx = 0
      this.bandChange = 0
      this.dive = false
      this.drop = false
      this.eat = false
      this.keyLeft = false
      this.keyRight = false
    }
  }
}
