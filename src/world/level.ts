// ─────────────────────────────────────────────────────────────────────────────
// world/level.ts — TURNPIKE level definition (Ch1: Exit 9).
// Pure data + closed-form schedule functions. No scene side effects, no
// allocation concerns (these functions are called sparingly: density/wind once
// per frame at most, no per-frame allocation here). See ARCHITECTURE.md
// "Turnpike level intent" and GAME_DESIGN §4 (Ch1) / §6.
// ─────────────────────────────────────────────────────────────────────────────
import type {
  AltitudeBand,
  FoodSpawn,
  LevelDef,
  ScheduledCar,
  StarDef,
} from '../types'
import { LEVEL_DURATION_S } from '../constants'

// Lane indices (0..LANES-1, LANES=5): 0 = far left (−X), 4 = far right.
const LANE_LEFT_EDGE = 0
const LANE_LEFT = 1
const LANE_CENTER = 2
const LANE_RIGHT = 3

// ── Density ramp ──────────────────────────────────────────────────────────────
// 0.5 cars/s at t=0, linearly ramping to 1.2 cars/s by t=75s, then held.
const DENSITY_T0 = 0.5
const DENSITY_T1 = 1.2
const DENSITY_RAMP_END_S = 75

const density = (t: number): number => {
  if (t <= 0) return DENSITY_T0
  if (t >= DENSITY_RAMP_END_S) return DENSITY_T1
  const f = t / DENSITY_RAMP_END_S
  return DENSITY_T0 + (DENSITY_T1 - DENSITY_T0) * f
}

// ── Wind ──────────────────────────────────────────────────────────────────────
// 0 for t < 25s. After that, a smooth gust mix clamped to ±2.2 m/s², ramped in
// over a few seconds so it doesn't snap on. Telegraphed via the HUD arrow.
const WIND_START_S = 25
const WIND_RAMP_S = 4 // ramp the gust amplitude in over this many seconds
const WIND_CLAMP = 2.2 // ±m/s²

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

const wind = (t: number): number => {
  if (t < WIND_START_S) return 0
  const since = t - WIND_START_S
  const ramp = since < WIND_RAMP_S ? since / WIND_RAMP_S : 1
  const gust = 1.6 * Math.sin(t * 0.35) + 0.8 * Math.sin(t * 1.3)
  return clamp(gust * ramp, -WIND_CLAMP, WIND_CLAMP)
}

// ── Scheduled specials ────────────────────────────────────────────────────────
// Toll-tag minivans (sedan archetype + 'tolltag' special) — two shots at Star 3.
// Jackpot (sedan archetype + 'jackpot' special) — the freshly-washed black car.
// Speeds sit inside the sedan archetype range [6,8] so they read as traffic.
const scheduled: ScheduledCar[] = [
  // First toll-tag minivan: enters in a left-of-center lane, moderate pace.
  {
    t: 38,
    archetype: 'sedan',
    special: 'tolltag',
    lane: LANE_LEFT,
    speed: 7,
  },
  // Jackpot black luxury car: center lane, glides a touch slower so the player
  // has time to line up the screenshot drop.
  {
    t: 55,
    archetype: 'sedan',
    special: 'jackpot',
    lane: LANE_CENTER,
    speed: 6.5,
  },
  // Second toll-tag minivan: right-of-center lane — the redemption chance.
  {
    t: 64,
    archetype: 'sedan',
    special: 'tolltag',
    lane: LANE_RIGHT,
    speed: 7.5,
  },
]

// ── Food schedule ─────────────────────────────────────────────────────────────
// Fries roughly every 12s on/near the center lanes at MID (the firing line, so
// they're grabbable without leaving the kill zone). Bagels at ~30 & ~75.
// Pork roll (TAYLOR HAM) at ~48. Disco fries at ~58 LOW in an edge lane — the
// risk pickup. Fry lanes alternate around center so they're not metronomic.
const MID: AltitudeBand = 'MID'
const LOW: AltitudeBand = 'LOW'

const FRY_PERIOD_S = 12
// Start at t≈8 (not 6) so no fry lands on the t=30 bagel (fries → 8,20,32,44,56),
// and end before ~t60 so the firing-line fries don't pile onto the toll-plaza
// buffet window (plaza at t≈72; food is authored ~14s of lead ahead of arrival).
const FRY_FIRST_S = 8
const FRY_LAST_S = 57
const FRY_LANES = [LANE_CENTER, LANE_LEFT, LANE_CENTER, LANE_RIGHT] as const

const buildFood = (): FoodSpawn[] => {
  const out: FoodSpawn[] = []

  // Fries on/near the center lanes at MID, ~every 12s, staggered off the bagels
  // and ended before the toll-plaza buffet so the cluster isn't crowded.
  let fryIdx = 0
  for (let t = FRY_FIRST_S; t <= FRY_LAST_S; t += FRY_PERIOD_S) {
    const lane = FRY_LANES[fryIdx % FRY_LANES.length]
    out.push({ t, kind: 'fry', lane, band: MID })
    fryIdx++
  }

  // Bagels — the 2-loaf refuels — bookend the run.
  out.push({ t: 30, kind: 'bagel', lane: LANE_LEFT, band: MID })
  out.push({ t: 75, kind: 'bagel', lane: LANE_RIGHT, band: MID })

  // Pork roll (TAYLOR HAM, EGG & CHEESE) — the 3-loaf refuel mid-run.
  out.push({ t: 48, kind: 'porkroll', lane: LANE_CENTER, band: MID })

  // Disco fries — the 4-loaf jackpot refuel, LOW and off the firing line so the
  // player must dip into the danger band to grab it.
  out.push({ t: 58, kind: 'disco', lane: LANE_LEFT_EDGE, band: LOW })

  // Sort by time so the consumer can iterate forward without re-scanning.
  out.sort((a, b) => a.t - b.t)
  return out
}

// ── Stars ─────────────────────────────────────────────────────────────────────
const STARS: [StarDef, StarDef, StarDef] = [
  { id: 'splat5', label: 'Splat 5 cars' },
  { id: 'doubletap', label: 'Double-tap one car' },
  { id: 'tolltag', label: 'Tag the toll-tag minivan' },
]

// ── The level ─────────────────────────────────────────────────────────────────
export const TURNPIKE: LevelDef = {
  id: 'turnpike',
  title: 'Exit 9: The Turnpike',
  introCard: 'Welcome to the Turnpike. Exit 13A is a state of mind.',
  regionFoodName: 'TAYLOR HAM',
  durationSec: LEVEL_DURATION_S,
  density,
  scheduled,
  tollPlazaSec: 72,
  food: buildFood(),
  wind,
  stars: STARS,
}
