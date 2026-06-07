# The Bad Birds — M1 Prototype Architecture

Gray-box vertical slice per `GAME_DESIGN.md` §11: **one level (Exit 9: the
Turnpike), one bird (American Goldfinch), the drop-and-splat loop, the splat
sound, the Splat Report.** Vite + TypeScript + Three.js, mobile portrait,
60fps on mid-range Android. No physics engine, no external assets — every
mesh is a flat-shaded primitive, every sound is synthesized in Web Audio.

## Ground rules (all modules)

- **Contracts live in `src/types.ts`** — implement interfaces EXACTLY
  (`export class X implements IX`). `src/main.ts` (integrator-owned) is the
  only place concrete classes meet.
- **Numbers live in `src/constants.ts`** (Canon §12). Never inline a tuning
  literal that exists there.
- Imports limited to `three`, `./types`, `./constants`, `./events` (relative
  paths as appropriate) + the DOM ids assigned to your module below.
- **No per-frame allocation in hot paths.** Reuse scratch `Vector3`s, pool
  meshes/DOM nodes. `MeshLambertMaterial`/`MeshBasicMaterial` only — no PBR,
  no shadows (blob shadows are fine).
- Strict TS must pass. No TODOs, no stubs — fully working code.
- Do NOT edit shared files (`types.ts`, `constants.ts`, `events.ts`,
  `index.html`, `styles.css`) and do NOT run tsc/npm/vite — other modules are
  being written in parallel; the integrator compiles. If a contract seems
  wrong, implement the closest sane behavior and flag it in your notes.

## Coordinate system

- **Forward = −Z** (bird z decreases all run). **+X right, +Y up.** Ground
  plane y=0.
- 5 lanes along X, centers from `laneX(i)`; soft walls at ±`CORRIDOR_HALF_X`.
- Cars drive −Z slower than the bird (bird overtakes from behind); payloads
  inherit bird velocity, so the player must **lead** the drop.
- The bird starts at `(0, BAND_ALTITUDE.MID, 0)`, t=0. At second `t` of a run
  the bird is near `z = −FORWARD_SPEED × t` (exactly that, since forward
  speed is locked).

## Files & ownership

| Agent | Files | Implements |
|---|---|---|
| render | `src/render/scene.ts` | `SceneRig implements ISceneRig` — renderer/camera/lights, recycling road + guardrails + lane dashes, gray-box Jersey scenery (overpasses, sound walls, distant skyline silhouettes, sunset-gradient sky), toll plaza gantry, follow-cam, screen shake |
| bird | `src/bird/bird.ts`, `src/bird/controls.ts` | `Bird implements IBird` (kinematics: damped-spring lateral, discrete band transitions, dive state machine, soft walls, flapping gray-box goldfinch + blob shadow), `Controls implements IControls` (pointer drag/flick in `#flight-zone`, `#drop-btn`, `#eat-btn`, keyboard fallback) |
| world | `src/world/level.ts`, `src/world/traffic.ts` | `TURNPIKE: LevelDef`, `Traffic implements ITraffic` — one `InstancedMesh` per archetype (≤ MAX_CARS instances each), weighted ambient spawns w/ density ramp, scheduled specials (toll-tag minivan ×2, black-luxury jackpot w/ gold glint sprite), toll plaza stopped cars, lane-keeping, no-overlap spawn checks |
| payload | `src/payload/ballistics.ts`, `src/payload/splat.ts` | `Payloads implements IPayloads` + `Reticle implements IReticle` (closed-form prediction ring), `Splats implements ISplats` (pooled car-following decals + fading road plips) |
| systems | `src/systems/scoring.ts`, `src/systems/loaf.ts`, `src/systems/stars.ts`, `src/systems/barks.ts` | `Scoring implements IScoring` (combo ladder + grace, subscribes to bus, emits `combo`/`score`), `Loaf implements ILoaf` (food meshes + EAT aura), `Stars implements IStars` (emits `star`), `Barks implements IBarks` (line picker, 2.5s gate) |
| ui | `src/ui/hud.ts`, `src/ui/title.ts`, `src/ui/results.ts`, `src/ui/splatReport.ts` | `Hud implements IHud`, `Title implements ITitle`, `Results implements IResults`, `buildSplatReport(s: RunSummary): HTMLCanvasElement` |
| audio | `src/audio/audio.ts` | `GameAudio implements IAudio` — all synthesized (no files): layered splat (wet fwap + splort tail + surface tonk + reward pip), two-tone honk, rising combo dings, dry-fire thud, gulp, jackpot sting, star, whoosh, plip |
| integrator | `src/main.ts` (+ cross-module fixes) | Game state machine + wiring (below) |

## DOM ownership (ids from `index.html`)

- **controls**: `#flight-zone` (drag-steer / flick-dive ONLY — a stray tap
  does nothing), `#drop-btn`, `#eat-btn` (reads taps; visibility is HUD's).
- **hud**: `#hud`, `#hud-score`, `#hud-stars`, `#hud-timer`, `#hud-wind`,
  `#intro-card`, `#popups` (creates `.popup-score`/`.popup-bark` children),
  `#combo`, `#drop-fill` (loaf meter = button fill height %; toggle `.empty`
  on `#drop-btn`), `#eat-area` (show/hide).
- **title**: `#title-screen` (builds its own children).
- **results**: `#results-screen` (builds its own children; RETRY + SHARE
  buttons).
- **scene**: `#game` canvas.

## Event flow (bus = `EventBus` from `src/events.ts`)

```
DROP pressed (controls → main):
  if !payloads.ready()      → ignore
  else if !loaf.trySpend()  → bus 'dryfire'   (scoring breaks combo; audio thud)
  else payloads.drop(bird, wind)  → bus 'drop' (audio whoosh; haptic 10ms)

payloads.update() hit  → bus 'splat'  (payload computes tier from impact pos:
                          windshield zone → BULLSEYE, AABB top → HIT,
                          within GRAZE_MARGIN outside → GRAZE)
payloads.update() road → bus 'miss'

main on 'splat':
  traffic.registerSplat(id)
  splats.carSplat(car, localOffset, tier)
  audio.splat(tier); tier ≥ HIT → audio.honk()
  hud.popup(score tag); barks.onSplat() → hud.bark()
  feel: shake (SHAKE_HIT_PX / SHAKE_BULLSEYE_PX), hitstop 80ms on BULLSEYE,
        navigator.vibrate per constants
scoring subscribes 'splat'/'miss'/'dryfire'/'drop' itself → emits 'combo','score'
stars subscribes 'splat' → emits 'star' (main: audio.star + hud.setStars + popup)
loaf.tryEat() on EAT → bus 'eat' (audio.gulp; hud popup "+3 TAYLOR HAM")
```

Scoring rules: `amount = basePoints × TIER_MULT[tier] × multiplier ×
(dive ? DIVE_SCORE_BONUS : 1)`, rounded. BULLSEYE advances combo by
`BULLSEYE_COMBO_ADVANCE`; GRAZE saves but doesn't advance; true miss/dryfire
break (one whiff forgiven per combo if the next drop connects within
`COMBO_GRACE_S` — see GAME_DESIGN §2).

## main.ts loop (order matters)

```
states: title → intro (card, ~2.5s, input live) → playing → results
fixed dt clamp (max 1/20s), hitstop pauses updates but still renders:

input = controls.frame()
bird.update(dt, input)
traffic.update(dt, bird.pos.z, t)
loaf.update(dt, bird.view, t)           // + EAT prompt → hud.setEatPrompt
handle drop/eat input                    // event flow above
payloads.update(dt, traffic, wind(t))
reticle.update(bird.view, wind(t))
splats.update(dt, traffic)
scoring.update(dt); barks.update(dt)
hud: score/timer/combo/loaf/wind + hud.update(dt, camera)
sceneRig.updateCamera(bird.view, dt); sceneRig.update(dt, bird.pos.z)
sceneRig.render()

t ≥ LEVEL_DURATION_S → results: build RunSummary (scoring.stats + stars +
loafEfficiency = scoredDrops/drops, best from localStorage STORAGE_KEY_BEST),
results.show(summary, onRetry → reset all systems + restart, onShare →
buildSplatReport → navigator.share(file) fallback download PNG)
```

RETRY uses each system's `reset()` — full state restored without a page
reload (pillar: instant restart).

## Turnpike level intent (world agent — see GAME_DESIGN §4 Ch1)

90s. Density ramps ~0.5 → ~1.2 cars/s by 75s. Wind 0 for the first 25s, then
gentle gusts (±~2 m/s², smooth sine mix — telegraphed via HUD arrow).
Scheduled: toll-tag minivan (sedan archetype, teal + roof tag box) at t≈38
and t≈64 (two chances at Star 3); black-luxury jackpot at t≈55 with golden
glint; toll plaza at t≈72 (8 stopped cars across the lanes + gantry —
`placeTollPlaza(−FORWARD_SPEED × 72)` is called by main). Food: fries on the
firing line every ~12s, bagels ~t30/t75, "TAYLOR HAM, EGG & CHEESE" at t≈48,
disco fries LOW and off-line at t≈58. Supply ≈ 110–120% of a perfect run.
Stars: `splat5` "Splat 5 cars", `doubletap` "Double-tap one car",
`tolltag` "Tag the toll-tag minivan".

## Performance budget

≤120 draw calls, ≤200k tris, 64-decal pool, ≤150 particles, dPR ≤ 2,
60fps cap. `touch-action: none` everywhere interactive. Pause RAF on
`visibilitychange: hidden`.
