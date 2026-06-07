// ─────────────────────────────────────────────────────────────────────────────
// SHARED CONTRACTS — every module implements interfaces from this file
// EXACTLY. main.ts is the only place concrete classes meet. Modules may import
// only from 'three', './types', './constants', './events' (plus their own DOM
// ids as assigned in ARCHITECTURE.md).
// ─────────────────────────────────────────────────────────────────────────────
import type {
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'

export type AltitudeBand = 'LOW' | 'MID' | 'HIGH'
export type SplatTier = 'GRAZE' | 'HIT' | 'BULLSEYE'
export type CarArchetype = 'sedan' | 'suv' | 'pickup' | 'boxtruck' | 'bus'
export type CarSpecial = 'none' | 'tolltag' | 'jackpot'
export type FoodKind = 'fry' | 'bagel' | 'porkroll' | 'disco'

// ── Input ───────────────────────────────────────────────────────────────────

/** One frame of player intent. Edge-triggered flags are true for exactly the
 * frame they fired; Controls.frame() clears them on read. */
export interface InputFrame {
  /** Horizontal drag delta accumulated since last frame, in CSS px (already
   * dead-zoned). Position-control: bird target x moves by
   * (steerPx / viewportWidth) × corridor width. */
  steerPx: number
  /** Keyboard axis −1..1 (0 when not using keyboard). Adds velocity-style
   * steering at MAX_STRAFE × axis. */
  steerAxis: number
  /** +1 = climb one band (toward HIGH), −1 = descend, 0 = none. Edge. */
  bandChange: -1 | 0 | 1
  /** Flick-down past LOW / dive key. Edge. */
  dive: boolean
  /** DROP button. Edge. */
  drop: boolean
  /** EAT button / key. Edge. */
  eat: boolean
  /** CSS px width of the viewport (for steer normalization). */
  viewportWidth: number
}

export interface IControls {
  /** Read this frame's input and clear edge-triggered flags. Call exactly
   * once per tick. */
  frame(): InputFrame
  /** Enable/disable all input (disabled on title/results). */
  setEnabled(v: boolean): void
}

// ── Bird ────────────────────────────────────────────────────────────────────

/** Read-only view of the bird consumed by camera, reticle and ballistics. */
export interface BirdView {
  /** World position. Mutated in place each frame — do not retain copies. */
  readonly pos: Vector3
  /** World velocity (forward −Z plus lateral). */
  readonly vel: Vector3
  readonly band: AltitudeBand
  /** True while the dive bonus window is active. */
  readonly diving: boolean
  /** Current scatter radius: SPREAD_RADIUS[band], or SPREAD_RADIUS_DIVE
   * while diving (blended during band transitions is fine). */
  readonly spreadRadius: number
}

export interface IBird {
  readonly view: BirdView
  /** Gray-box goldfinch added to the scene by the Bird itself. */
  readonly object: Object3D
  update(dt: number, input: InputFrame): void
  /** Back to start: x=0, z=0, MID band, dive re-armed. */
  reset(): void
}

// ── Traffic / level ─────────────────────────────────────────────────────────

export interface ActiveCar {
  /** Stable id while the car is alive; ids are never reused within a run. */
  id: number
  archetype: CarArchetype
  special: CarSpecial
  /** Center of the car AABB (pos.y == half.y while on the road). */
  pos: Vector3
  vel: Vector3
  /** AABB half-extents (x: width/2, y: height/2, z: length/2). */
  half: Vector3
  /** Windshield (BULLSEYE) zone on the top surface, local to pos:
   * |x| ≤ halfX and |z − zOffset| ≤ halfZ. */
  windshield: { zOffset: number; halfX: number; halfZ: number }
  /** Base points (archetype points, or SPECIAL_POINTS for specials). */
  points: number
  /** Splats landed on this car this run (for the double-tap star). */
  splatCount: number
  alive: boolean
}

export interface ScheduledCar {
  /** Run-time second at which this special enters, SPAWN_AHEAD_M ahead. */
  t: number
  archetype: CarArchetype
  special: CarSpecial
  lane: number // 0..LANES-1
  speed: number // m/s along −Z
}

export interface FoodSpawn {
  /** The bird reaches z = −FORWARD_SPEED × t at second t; the pickup floats
   * there, at the altitude of `band`, in lane `lane`. */
  t: number
  kind: FoodKind
  lane: number
  band: AltitudeBand
}

export interface StarDef {
  /** Star logic ids implemented by stars.ts: 'splat5' | 'doubletap' | 'tolltag' */
  id: 'splat5' | 'doubletap' | 'tolltag'
  label: string
}

export interface LevelDef {
  id: string
  title: string
  introCard: string
  /** Regional food name for the reload tag — 'TAYLOR HAM' up north. */
  regionFoodName: string
  durationSec: number
  /** Ambient spawns per second at run-time t (ramps up). */
  density: (t: number) => number
  scheduled: ScheduledCar[]
  /** Bird reaches the toll plaza (8 stopped cars + gantry) at this second. */
  tollPlazaSec: number
  food: FoodSpawn[]
  /** Lateral wind acceleration on payloads (m/s², +X) at run-time t. */
  wind: (t: number) => number
  stars: [StarDef, StarDef, StarDef]
}

export interface ITraffic {
  /** Live cars; treat as read-only outside traffic.ts. Includes only
   * alive cars. */
  readonly cars: ReadonlyArray<ActiveCar>
  update(dt: number, birdZ: number, t: number): void
  getCar(id: number): ActiveCar | undefined
  /** Increment a car's splatCount (called by main on splat events). */
  registerSplat(id: number): void
  reset(): void
}

// ── Payloads / reticle / splats ─────────────────────────────────────────────

export interface IPayloads {
  /** False while the DROP_COOLDOWN_S fire-rate cap is active. */
  ready(): boolean
  /** Spawn one payload from the bird (inherits velocity + scatter). Caller
   * has already spent a loaf. Emits 'drop'. */
  drop(bird: BirdView, wind: number): void
  /** Integrate payloads, swept-sphere vs car AABBs (earliest TOI), emit
   * 'splat' / 'miss'. */
  update(dt: number, traffic: ITraffic, wind: number): void
  reset(): void
}

export interface IReticle {
  /** Closed-form predicted impact ring on the road (accounts for bird
   * velocity, altitude, gravity, wind). Ring radius = bird.spreadRadius. */
  update(bird: BirdView, wind: number): void
  /** Predicted impact point (valid after update). */
  readonly impact: Vector3
  setVisible(v: boolean): void
}

export interface ISplats {
  /** Stamp a decal that follows the car (pooled, DECAL_POOL_SIZE cap, FIFO). */
  carSplat(car: ActiveCar, localOffset: Vector3, tier: SplatTier): void
  /** Road plip on a miss; fades over ROAD_DECAL_FADE_S. */
  roadSplat(at: Vector3): void
  update(dt: number, traffic: ITraffic): void
  reset(): void
}

// ── Game systems ────────────────────────────────────────────────────────────

export interface RunStats {
  drops: number
  scoredDrops: number
  hits: number // HIT + BULLSEYE count
  bullseyes: number
  grazes: number
  honks: number
  longestDropM: number
  jackpots: number
  bestCombo: number
}

export interface IScoring {
  readonly score: number
  readonly comboCount: number
  readonly multiplier: number
  readonly stats: RunStats
  /** Advances the 3s grace timer. */
  update(dt: number): void
  reset(): void
}

export interface ILoaf {
  readonly current: number
  readonly capacity: number
  /** Spend 1 loaf; false (and nothing spent) when empty. */
  trySpend(): boolean
  /** Spawn scheduled food, manage the EAT aura/prompt, animate pickups. */
  update(dt: number, bird: BirdView, t: number): void
  /** Player pressed EAT: gulp the armed pickup. True if something was eaten
   * (emits 'eat'). */
  tryEat(): boolean
  /** EAT prompt currently armed (HUD shows the transient button). */
  readonly promptVisible: boolean
  reset(): void
}

export interface IStars {
  readonly earned: [boolean, boolean, boolean]
  /** e.g. "Splat 5 cars — 3/5" for the results screen. */
  readonly progressText: [string, string, string]
  reset(): void
}

export interface IBarks {
  /** Pick a driver bark for this splat, or null when gated (BARK_GATE_S) or
   * not warranted (GRAZE never barks). */
  onSplat(e: SplatEvent): string | null
  update(dt: number): void
}

// ── Rendering ───────────────────────────────────────────────────────────────

export interface ISceneRig {
  readonly scene: Scene
  readonly camera: PerspectiveCamera
  readonly renderer: WebGLRenderer
  /** Follow-cam: lag, band-aware down-pitch, dive FOV kick. */
  updateCamera(bird: BirdView, dt: number): void
  /** Add screen shake (px, clamped to SHAKE_MAX_PX; concurrent = max not sum). */
  addShake(px: number): void
  /** Build the toll plaza gantry/booths at world z (visual only — the
   * stopped cars are traffic's job). */
  placeTollPlaza(z: number): void
  /** Recycle road/scenery segments around birdZ; decay shake. */
  update(dt: number, birdZ: number): void
  render(): void
  resize(): void
}

// ── Audio ───────────────────────────────────────────────────────────────────

export interface IAudio {
  /** Create/resume the AudioContext. Call from a user gesture. */
  unlock(): void
  splat(tier: SplatTier): void
  honk(): void
  /** Rising pitch ladder; step = current multiplier tier (1..5). */
  comboDing(step: number): void
  comboBreak(): void
  dryfire(): void
  gulp(): void
  jackpot(): void
  star(): void
  whoosh(): void // drop release
  plip(): void // road miss
  uiTap(): void
  setMuted(m: boolean): void
}

// ── UI ──────────────────────────────────────────────────────────────────────

export interface IHud {
  setScore(n: number): void
  setTimer(secLeft: number): void
  setCombo(count: number, multiplier: number): void
  setLoaf(current: number, capacity: number): void
  setStars(earned: [boolean, boolean, boolean]): void
  /** Wind indicator; accel in m/s² (+X). Hide when ~0. */
  setWind(accel: number): void
  setEatPrompt(visible: boolean, label?: string): void
  /** Floating text projected from a world position. */
  popup(text: string, world: Vector3, kind: 'score' | 'tag' | 'refuel'): void
  /** Driver speech bubble projected from the car's position. */
  bark(text: string, world: Vector3): void
  showIntro(text: string, seconds: number): void
  /** Reproject/animate popups; needs the camera. */
  update(dt: number, camera: PerspectiveCamera): void
  setVisible(v: boolean): void
  reset(): void
}

export interface RunSummary extends RunStats {
  score: number
  stars: [boolean, boolean, boolean]
  starLabels: [string, string, string]
  levelTitle: string
  birdName: string
  loafEfficiencyPct: number
  best: number
  newBest: boolean
}

export interface ITitle {
  /** Resolves when the player starts (also unlocks audio via the gesture). */
  show(best: number): Promise<void>
  hide(): void
}

export interface IResults {
  show(summary: RunSummary, onRetry: () => void, onShare: () => void): void
  hide(): void
}

// ui/splatReport.ts:
//   export function buildSplatReport(s: RunSummary): HTMLCanvasElement
//   1080×1920 portrait share card. Caller handles Web Share / download.

// ── Events ──────────────────────────────────────────────────────────────────

export interface SplatEvent {
  tier: SplatTier
  carId: number
  archetype: CarArchetype
  special: CarSpecial
  /** World impact point. */
  impact: Vector3
  /** Impact relative to the car center at impact time (decal anchor). */
  localOffset: Vector3
  /** Dive bonus window was active for this payload's drop. */
  dive: boolean
  /** Meters the payload traveled drop → impact. */
  dropDistanceM: number
  basePoints: number
}

export interface EventMap {
  /** A payload left the bird. */
  drop: { from: Vector3 }
  splat: SplatEvent
  /** Payload hit bare road. */
  miss: { impact: Vector3 }
  /** DROP pressed with an empty Loaf Meter. */
  dryfire: Record<string, never>
  eat: { kind: FoodKind; refuel: number; label: string }
  /** Combo state changed. broke=true on a reset to 0. */
  combo: { count: number; multiplier: number; broke: boolean }
  /** Points banked (post-multiplier). tag e.g. "BULLSEYE", "DIVE 1.5×". */
  score: { amount: number; total: number; tag: string; at: Vector3 }
  star: { index: 0 | 1 | 2; label: string }
}
