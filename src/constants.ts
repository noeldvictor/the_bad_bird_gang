// ─────────────────────────────────────────────────────────────────────────────
// CANON CONSTANTS — derived from GAME_DESIGN.md §12 "Canon Reference".
// Every module uses THESE, never inline literals. If a number needs to change,
// it changes here.
// ─────────────────────────────────────────────────────────────────────────────
import type { AltitudeBand, CarArchetype, FoodKind, SplatTier } from './types'

// ── World axes ──────────────────────────────────────────────────────────────
// Forward is -Z (bird z decreases over the run). +X is right. +Y is up.
// Ground plane is y = 0. Cars drive in the same direction (-Z), slower than
// the bird, so the bird overtakes from behind and must LEAD its drops.

export const LANES = 5
export const LANE_WIDTH = 3.2 // m
export const CORRIDOR_HALF_X = (LANES * LANE_WIDTH) / 2 // 8 m — soft walls here
/** Center x of lane i (0..4). */
export const laneX = (i: number): number => (i - (LANES - 1) / 2) * LANE_WIDTH

// ── Bird (American Goldfinch — the only MVP bird) ───────────────────────────
export const BIRD_NAME = 'American Goldfinch (Underestimated)'
export const FORWARD_SPEED = 12 // m/s, locked, never player-controlled
export const MAX_STRAFE = 7 // m/s lateral cap
export const STRAFE_RESPONSE_S = 0.18 // 0 → full strafe speed in this time
export const BAND_LIST: AltitudeBand[] = ['LOW', 'MID', 'HIGH'] // index 0..2
export const BAND_ALTITUDE: Record<AltitudeBand, number> = {
  LOW: 10,
  MID: 25,
  HIGH: 45,
}
export const BAND_TRANSITION_S = 0.3
export const START_BAND: AltitudeBand = 'MID'

// Scatter radius of a drop (uniform disc around the predicted impact point).
export const SPREAD_RADIUS: Record<AltitudeBand, number> = {
  HIGH: 3.5,
  MID: 1.5,
  LOW: 0.6,
}
export const SPREAD_RADIUS_DIVE = 0.3

// DIVE — flick-down at LOW commits; re-arm only after returning to MID.
export const DIVE_ALTITUDE = 6 // m
export const DIVE_HOLD_S = 0.6
export const DIVE_CLIMB_S = 0.5
export const DIVE_SCORE_BONUS = 1.5 // flat multiplier on hits in the window
export const DIVE_STEER_FACTOR = 0.5 // steering authority during dive

// ── Payload ballistics ──────────────────────────────────────────────────────
export const GRAVITY = 22 // m/s² — heavier than Earth: decisive, not floaty
export const DROP_COOLDOWN_S = 0.35 // fire-rate cap
export const PAYLOAD_RADIUS = 0.15 // m, swept sphere
export const GRAZE_MARGIN = 0.5 // m outside the car AABB that still GRAZEs

// Windshield (BULLSEYE zone) as fractions of the car footprint. The car
// drives toward -Z, so the windshield sits toward -Z from center.
export const WINDSHIELD_Z_OFFSET_FRAC = -0.18 // × car length
export const WINDSHIELD_HALF_Z_FRAC = 0.1 // × car length
export const WINDSHIELD_HALF_X_FRAC = 0.42 // × car width

// ── Scoring ─────────────────────────────────────────────────────────────────
export const TIER_MULT: Record<SplatTier, number> = {
  GRAZE: 0.5,
  HIT: 1,
  BULLSEYE: 2,
}
/** [comboCount, multiplier] steps; below first step multiplier = 1. */
export const COMBO_LADDER: ReadonlyArray<readonly [number, number]> = [
  [2, 2],
  [5, 3],
  [9, 4],
  [14, 5], // cap — "MAYHEM"
]
export const COMBO_CAP_NAME = 'MAYHEM'
export const BULLSEYE_COMBO_ADVANCE = 2 // BULLSEYE counts as 2 toward combo
export const COMBO_GRACE_S = 3 // one whiff forgiven if next drop connects in 3s

// ── Loaf Meter (ammo) ───────────────────────────────────────────────────────
export const LOAF_CAPACITY = 6 // Goldfinch
export const FOOD_REFUEL: Record<FoodKind, number> = {
  fry: 1,
  bagel: 2,
  porkroll: 3, // labeled by region — TAYLOR HAM on the Turnpike (North Jersey)
  disco: 4, // disco fries — the LOW-band risk pickup
}
export const EAT_PROMPT_S = 1.2 // transient EAT window
export const EAT_LATERAL_RADIUS = 2.6 // m, x/y closeness to arm the prompt
export const EAT_AHEAD_M = 16 // food within this far ahead can arm the prompt

// ── Camera (behind-the-bird, portrait) ──────────────────────────────────────
export const CAM_BACK = 4.2 // units behind the bird (+Z)
export const CAM_UP = 1.6 // units above the bird
export const CAM_FOV = 62
export const CAM_FOV_DIVE = 70
export const CAM_FOV_DIVE_IN_S = 0.15
export const CAM_FOV_DIVE_OUT_S = 0.3
export const CAM_POS_LAG_S = 0.12
export const CAM_ROT_LAG_S = 0.08
export const CAM_DIVE_PITCH_DEG = 8
// Starting look-target tuning: look at a point LOOK_AHEAD_M ahead of the
// bird, dropped to bird.altitude × LOOK_DOWN_FRAC, so higher bands pitch the
// camera further down and the road stays framed. Scene agent may tune.
export const CAM_LOOK_AHEAD_M = 22
export const CAM_LOOK_DOWN_FRAC = 0.42

// ── Game feel ───────────────────────────────────────────────────────────────
export const HITSTOP_BULLSEYE_MS = 80
export const HITSTOP_MAX_MS = 120
export const SHAKE_HIT_PX = 3
export const SHAKE_BULLSEYE_PX = 6
export const SHAKE_MAX_PX = 8
export const SHAKE_DECAY_S = 0.16
export const HAPTIC_DROP_MS = 10
export const HAPTIC_HIT_MS = 20
export const HAPTIC_BULLSEYE: number[] = [15, 30, 25]
export const BARK_GATE_S = 2.5 // at most one driver bark per this interval

// ── Level / run ─────────────────────────────────────────────────────────────
export const LEVEL_DURATION_S = 90
export const SPAWN_AHEAD_M = 170 // spawn cars/food this far ahead of the bird
export const DESPAWN_BEHIND_M = 30 // recycle once this far behind
export const MAX_CARS = 40

// ── Car archetypes (the 5 instanced meshes) ─────────────────────────────────
export interface ArchetypeDef {
  /** [width(x), height(y), length(z)] in meters */
  size: [number, number, number]
  points: number
  /** ambient spawn weight (specials are scheduled, not weighted) */
  weight: number
  /** [min, max] m/s along -Z */
  speed: [number, number]
  /** body color choices (hex) */
  colors: number[]
}
export const ARCHETYPES: Record<CarArchetype, ArchetypeDef> = {
  sedan: {
    size: [1.9, 1.4, 4.6],
    points: 100,
    weight: 0.38,
    speed: [6, 8],
    colors: [0xb8b8bc, 0x6e7b8b, 0x8b2e2e, 0x3a4a6b, 0x222226],
  },
  suv: {
    size: [2.0, 1.8, 4.8],
    points: 150,
    weight: 0.27,
    speed: [6, 8],
    colors: [0x1d1f24, 0x4a4d55, 0x5b6b4a, 0x7a2d2d],
  },
  pickup: {
    size: [2.0, 1.9, 5.4],
    points: 200,
    weight: 0.15,
    speed: [6, 9],
    colors: [0x244a7a, 0x7a1f1f, 0x2c2c30],
  },
  boxtruck: {
    size: [2.3, 2.8, 6.5],
    points: 250,
    weight: 0.12,
    speed: [5, 7],
    colors: [0xd9d4c8, 0x9a8f7a],
  },
  bus: {
    size: [2.5, 3.0, 11.0],
    points: 250,
    weight: 0.08,
    speed: [5, 6],
    colors: [0xcfd2d6], // NJ-transit-ish gray; no real livery
  },
}
export const SPECIAL_POINTS = {
  tolltag: 300, // the moving toll-tag minivan (Star 3 target)
  jackpot: 1200, // freshly-washed black luxury car, golden glint
} as const

// ── Render budget ───────────────────────────────────────────────────────────
export const DPR_CAP = 2
export const DECAL_POOL_SIZE = 64
export const MAX_PARTICLES = 150
export const ROAD_DECAL_FADE_S = 6

// ── Palette (GAME_DESIGN.md §8, locked) ─────────────────────────────────────
export const PALETTE = {
  sunsetOrange: 0xff6b35,
  marqueeGold: 0xffb627,
  asphalt: 0x2b2d42,
  gooseGreen: 0x06a77d,
  dinerChrome: 0xe0e0e2,
  clubPurple: 0x9b5de5,
  splat: 0xc9d6a3, // off-palette on purpose: legible on any car color
} as const
export const PALETTE_CSS = {
  sunsetOrange: '#FF6B35',
  marqueeGold: '#FFB627',
  asphalt: '#2B2D42',
  gooseGreen: '#06A77D',
  dinerChrome: '#E0E0E2',
  clubPurple: '#9B5DE5',
  splat: '#C9D6A3',
} as const

// ── Persistence ─────────────────────────────────────────────────────────────
export const STORAGE_KEY_BEST = 'badbirds.best.turnpike'
