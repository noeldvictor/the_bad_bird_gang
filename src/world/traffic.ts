// ─────────────────────────────────────────────────────────────────────────────
// world/traffic.ts — Traffic implements ITraffic.
//
// One InstancedMesh per archetype (≤ MAX_CARS instances each, count managed,
// per-instance color via instanceColor). Specials (toll-tag minivan, jackpot
// black-luxury car) get distinct instance colors plus a pooled marker mesh that
// follows the car. Weighted ambient spawns ramp with level.density(t); scheduled
// specials enter at their authored second; a one-time toll-plaza cluster of
// stopped cars appears just before the plaza z.
//
// Coordinate system (ARCHITECTURE.md): forward is −Z, +X right, +Y up, ground
// y=0. Cars drive −Z slower than the bird; the bird overtakes from behind.
//
// Performance: nothing in the per-frame hot path allocates. Cars live in a fixed
// pool of ActiveCar slots (reused), ids increment monotonically so they are
// never reused within a run. Instance matrices/colors are packed each frame from
// the alive list (≤ MAX_CARS, trivially cheap), no GC churn.
// ─────────────────────────────────────────────────────────────────────────────
import {
  BoxGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  type Scene,
  Vector3,
} from 'three'
import type {
  ActiveCar,
  CarArchetype,
  CarSpecial,
  ITraffic,
  LevelDef,
} from '../types'
import {
  ARCHETYPES,
  DESPAWN_BEHIND_M,
  FORWARD_SPEED,
  laneX,
  LANES,
  MAX_CARS,
  PALETTE,
  SPAWN_AHEAD_M,
  SPECIAL_POINTS,
  WINDSHIELD_HALF_X_FRAC,
  WINDSHIELD_HALF_Z_FRAC,
  WINDSHIELD_Z_OFFSET_FRAC,
} from '../constants'

// ── Tuning local to traffic (gray-box only; not player-facing canon) ──────────
const ARCHETYPE_LIST: CarArchetype[] = [
  'sedan',
  'suv',
  'pickup',
  'boxtruck',
  'bus',
]
/** archetype → index into ARCHETYPE_LIST / parallel arrays (O(1), no Map). */
const ARCHETYPE_INDEX: Record<CarArchetype, number> = {
  sedan: 0,
  suv: 1,
  pickup: 2,
  boxtruck: 3,
  bus: 4,
}

/** Minimum free gap (along z, center-to-center) required to drop a car into a
 * lane near another car. */
const MIN_LANE_GAP_M = 12
/** Spawn-rejection retries before giving up on an ambient car this tick. */
const SPAWN_TRIES = 3
/** Scheduled cars enter at exactly z = birdZ − SPAWN_AHEAD_M; if that overlaps a
 * lane neighbour we nudge them further ahead by this much per step. */
const SCHEDULE_NUDGE_M = 14
/** Run-start corridor seed: one ambient car every SEED_SPACING_M (±jitter) from
 * SEED_NEAREST_M ahead of the bird out to SPAWN_AHEAD_M (~13 cars). Nearest seed
 * sits just past a MID-band drop's landing point so the first reticle pass has
 * something under it. */
const SEED_NEAREST_M = 18
const SEED_SPACING_M = 12
const SEED_JITTER_M = 6

// Special instance colors — chosen to read distinctly against ambient bodies.
const TOLLTAG_COLOR = 0x16c0a8 // teal-ish minivan
const JACKPOT_COLOR = 0x0a0a0c // glossy near-black luxury

// Shared 'none' literal so the union value lives in exactly one place.
const SPECIAL_NONE: CarSpecial = 'none'

// Toll plaza: 8 stopped cars in two rows just before the plaza z.
const TOLL_PLAZA_CARS = 8
const TOLL_PLAZA_ROW_GAP_M = 9 // z spacing between the two rows
const TOLL_PLAZA_AHEAD_M = 6 // first row sits this far before the plaza z

// Jackpot glint sprite pulse.
const GLINT_PULSE_HZ = 2.2
const GLINT_BASE_SCALE = 1.1
const GLINT_PULSE_SCALE = 0.5
const GLINT_FLOAT_Y = 2.2 // above the car roof
const GLINT_SIZE = 1.4 // plane edge length (m)

// Toll-tag roof marker box (white).
const ROOF_BOX_SIZE = new Vector3(0.5, 0.4, 0.5)

// ── Module-level scratch (no per-frame allocation) ────────────────────────────
const _mat = new Matrix4()
const _pos = new Vector3()
const _quat = new Quaternion()
const _scl = new Vector3(1, 1, 1)
const _col = new Color()
// Per-archetype write cursors for instance packing (parallel to ARCHETYPE_LIST),
// reused each frame so packInstances allocates nothing.
const _counts = new Int32Array(5)

interface CarSlot extends ActiveCar {
  /** True when this slot holds a live car. Mirrors `alive` but kept explicit
   * for pool bookkeeping. */
  used: boolean
  /** Cached instance color for the archetype mesh (set at spawn). */
  colorHex: number
  /** Marker mesh following this car (roof box for tolltag, glint plane for
   * jackpot), or null for plain cars. */
  marker: Mesh | null
}

export class Traffic implements ITraffic {
  private readonly scene: Scene
  private readonly level: LevelDef

  // One InstancedMesh per archetype, indexed parallel to ARCHETYPE_LIST.
  private readonly meshList: InstancedMesh[] = []

  // Fixed pool of car slots, reused across spawns.
  private readonly pool: CarSlot[] = []
  // Live cars, maintained incrementally (no per-frame allocation).
  private readonly live: CarSlot[] = []

  // Marker pools.
  private readonly roofBoxes: Mesh[] = []
  private readonly glints: Mesh[] = []
  private readonly roofGeom: BoxGeometry
  private readonly roofMat: MeshLambertMaterial
  private readonly glintGeom: PlaneGeometry
  private readonly glintMat: MeshBasicMaterial

  // Run state.
  private nextId = 1
  private spawnAccum = 0
  /** One-time corridor seed fired on the first update of a run. */
  private seeded = false
  private scheduleCursor = 0 // index into time-sorted scheduled[]
  private tollPlacedZ = Number.POSITIVE_INFINITY // sentinel: not yet placed
  // Z extent of the placed toll-plaza cluster [front .. back] (both +Z of plaza,
  // so frontZ < backZ numerically). Used to keep ambient cars from spawning into
  // the stopped cluster and interpenetrating / overtaking it.
  private tollFrontZ = Number.POSITIVE_INFINITY
  private tollBackZ = Number.NEGATIVE_INFINITY
  private glintClock = 0
  // Per-instance colors only change when the live set changes (spawn / despawn
  // shifts instance indices). Matrices still repack every frame; colors are
  // re-uploaded only when this flag is set, avoiding a full color-buffer upload
  // on all 5 meshes every frame.
  private colorsDirty = true

  // Time-sorted view of the scheduled specials (built once).
  private readonly schedule: LevelDef['scheduled']

  constructor(scene: Scene, level: LevelDef) {
    this.scene = scene
    this.level = level
    this.schedule = [...level.scheduled].sort((a, b) => a.t - b.t)

    // Build one instanced mesh per archetype.
    for (const arch of ARCHETYPE_LIST) {
      const def = ARCHETYPES[arch]
      const [w, h, l] = def.size
      // Gray-box body: a single box per archetype (acceptable gray-box). Pivot
      // at the box center so pos == AABB center (pos.y == half.y on the road).
      const geom = new BoxGeometry(w, h, l)
      const matl = new MeshLambertMaterial({ vertexColors: false })
      const inst = new InstancedMesh(geom, matl, MAX_CARS)
      inst.count = 0
      inst.instanceMatrix.setUsage(DynamicDrawUsage)
      // Allocate instanceColor up front (one Color per instance).
      const baseColor = new Color(def.colors[0] ?? 0xffffff)
      for (let i = 0; i < MAX_CARS; i++) inst.setColorAt(i, baseColor)
      if (inst.instanceColor) inst.instanceColor.setUsage(DynamicDrawUsage)
      inst.frustumCulled = false // cars span a long corridor; keep simple
      this.scene.add(inst)
      this.meshList[ARCHETYPE_INDEX[arch]] = inst
    }

    // Build the car slot pool.
    for (let i = 0; i < MAX_CARS; i++) {
      this.pool.push(this.makeSlot())
    }

    // Marker geometry/materials (shared; instances pooled).
    this.roofGeom = new BoxGeometry(
      ROOF_BOX_SIZE.x,
      ROOF_BOX_SIZE.y,
      ROOF_BOX_SIZE.z,
    )
    this.roofMat = new MeshLambertMaterial({ color: PALETTE.dinerChrome })
    this.glintGeom = new PlaneGeometry(GLINT_SIZE, GLINT_SIZE)
    this.glintMat = new MeshBasicMaterial({
      color: PALETTE.marqueeGold,
      transparent: true,
      opacity: 0.85,
      side: DoubleSide,
      depthWrite: false,
    })
  }

  // ── ITraffic.cars (incrementally maintained live list) ──────────────────────
  get cars(): ReadonlyArray<ActiveCar> {
    return this.live
  }

  // ── Slot construction / pooling ─────────────────────────────────────────────
  private makeSlot(): CarSlot {
    return {
      id: 0,
      archetype: 'sedan',
      special: 'none',
      pos: new Vector3(),
      vel: new Vector3(),
      half: new Vector3(),
      windshield: { zOffset: 0, halfX: 0, halfZ: 0 },
      points: 0,
      splatCount: 0,
      alive: false,
      used: false,
      colorHex: 0xffffff,
      marker: null,
    }
  }

  private acquireSlot(): CarSlot | null {
    for (const s of this.pool) if (!s.used) return s
    return null
  }

  // ── Marker pooling ──────────────────────────────────────────────────────────
  private acquireRoofBox(): Mesh {
    for (const m of this.roofBoxes) {
      if (!m.visible) {
        m.visible = true
        return m
      }
    }
    const m = new Mesh(this.roofGeom, this.roofMat)
    m.frustumCulled = false
    this.scene.add(m)
    this.roofBoxes.push(m)
    return m
  }

  private acquireGlint(): Mesh {
    for (const m of this.glints) {
      if (!m.visible) {
        m.visible = true
        return m
      }
    }
    const m = new Mesh(this.glintGeom, this.glintMat.clone())
    m.frustumCulled = false
    this.scene.add(m)
    this.glints.push(m)
    return m
  }

  private releaseMarker(slot: CarSlot): void {
    if (slot.marker) {
      slot.marker.visible = false
      slot.marker = null
    }
  }

  // ── Spawning ────────────────────────────────────────────────────────────────
  private archetypeByWeight(): CarArchetype {
    let total = 0
    for (const a of ARCHETYPE_LIST) total += ARCHETYPES[a].weight
    let r = Math.random() * total
    for (const a of ARCHETYPE_LIST) {
      r -= ARCHETYPES[a].weight
      if (r <= 0) return a
    }
    return 'sedan'
  }

  /** True if a car in `lane` is within `gap` meters (z) of `z`. */
  private laneOccupied(lane: number, z: number, gap: number): boolean {
    const lx = laneX(lane)
    for (const c of this.live) {
      // Same lane if x matches that lane's center (within half a lane).
      if (Math.abs(c.pos.x - lx) > 0.5) continue
      if (Math.abs(c.pos.z - z) < gap) return true
    }
    return false
  }

  /** Configure a slot's geometry-derived fields for an archetype + special. */
  private configureSlot(
    slot: CarSlot,
    arch: CarArchetype,
    special: CarSpecial,
    lane: number,
    z: number,
    speed: number,
  ): void {
    const def = ARCHETYPES[arch]
    const [w, h, l] = def.size
    slot.id = this.nextId++
    slot.archetype = arch
    slot.special = special
    slot.half.set(w / 2, h / 2, l / 2)
    // Contract: pos.y == half.y while on the road (box bottom rests at y=0).
    slot.pos.set(laneX(lane), h / 2, z)
    slot.vel.set(0, 0, -speed) // drive toward −Z
    slot.windshield.zOffset = WINDSHIELD_Z_OFFSET_FRAC * l
    slot.windshield.halfX = WINDSHIELD_HALF_X_FRAC * w
    slot.windshield.halfZ = WINDSHIELD_HALF_Z_FRAC * l
    slot.points =
      special === 'tolltag'
        ? SPECIAL_POINTS.tolltag
        : special === 'jackpot'
          ? SPECIAL_POINTS.jackpot
          : def.points
    slot.splatCount = 0
    slot.alive = true
    slot.used = true

    // Instance color.
    if (special === 'tolltag') slot.colorHex = TOLLTAG_COLOR
    else if (special === 'jackpot') slot.colorHex = JACKPOT_COLOR
    else {
      const choices = def.colors
      slot.colorHex = choices[(Math.random() * choices.length) | 0] ?? 0xffffff
    }

    // Attach a follower marker for specials.
    this.releaseMarker(slot)
    if (special === 'tolltag') slot.marker = this.acquireRoofBox()
    else if (special === 'jackpot') slot.marker = this.acquireGlint()
  }

  private spawnCar(
    arch: CarArchetype,
    special: CarSpecial,
    lane: number,
    z: number,
    speed: number,
  ): CarSlot | null {
    const slot = this.acquireSlot()
    if (!slot) return null
    this.configureSlot(slot, arch, special, lane, z, speed)
    this.live.push(slot)
    this.colorsDirty = true // live set changed → instance colors need a re-pack
    return slot
  }

  /** Ambient weighted spawn at the ahead-edge of the corridor. */
  private spawnAmbient(birdZ: number): void {
    this.spawnAmbientAt(birdZ - SPAWN_AHEAD_M)
  }

  /** Populate the corridor at run start so the very first drops have targets —
   * "traffic already rolling," first blood by 0:08 (GAME_DESIGN §1). Without
   * this, edge-spawned cars need ~25s to close into payload range and the
   * opening third of the run is empty road. */
  private seedCorridor(birdZ: number): void {
    for (
      let z = birdZ - SEED_NEAREST_M;
      z > birdZ - SPAWN_AHEAD_M;
      z -= SEED_SPACING_M
    ) {
      this.spawnAmbientAt(z + (Math.random() - 0.5) * SEED_JITTER_M)
    }
  }

  /** Weighted ambient spawn at an arbitrary z with no-overlap lane rejection. */
  private spawnAmbientAt(z: number): void {
    const arch = this.archetypeByWeight()
    const def = ARCHETYPES[arch]
    // Keep ambient traffic out of the stopped toll-plaza cluster's z-band (cars
    // would otherwise spawn into it and interpenetrate / overtake the stopped
    // cars in the same lane). The cluster spans every lane, so reject outright.
    if (
      Number.isFinite(this.tollFrontZ) &&
      z > this.tollFrontZ - MIN_LANE_GAP_M &&
      z < this.tollBackZ + MIN_LANE_GAP_M
    ) {
      return
    }
    const [smin, smax] = def.speed
    const speed = smin + Math.random() * (smax - smin)
    for (let attempt = 0; attempt < SPAWN_TRIES; attempt++) {
      const lane = (Math.random() * LANES) | 0
      if (!this.laneOccupied(lane, z, MIN_LANE_GAP_M)) {
        this.spawnCar(arch, SPECIAL_NONE, lane, z, speed)
        return
      }
    }
    // Gave up after SPAWN_TRIES — skip this spawn (keeps density honest enough).
  }

  /** Scheduled special: spawn in its authored lane regardless, nudging z to
   * avoid stacking directly on a lane neighbour. */
  private spawnScheduled(birdZ: number, idx: number): void {
    const s = this.schedule[idx]
    let z = birdZ - SPAWN_AHEAD_M
    for (let i = 0; i < 6 && this.laneOccupied(s.lane, z, MIN_LANE_GAP_M); i++) {
      z -= SCHEDULE_NUDGE_M
    }
    this.spawnCar(s.archetype, s.special, s.lane, z, s.speed)
  }

  // ── Toll plaza ──────────────────────────────────────────────────────────────
  /** Place 8 stopped cars in a two-row cluster just before the plaza z. Idempotent
   * (only fires once per run). Main also calls sceneRig.placeTollPlaza for the
   * gantry; the stopped cars are our job. */
  private maybePlaceTollPlaza(birdZ: number): void {
    if (Number.isFinite(this.tollPlacedZ)) return // already placed
    const plazaZ = -FORWARD_SPEED * this.level.tollPlazaSec
    // Only place once the plaza is within spawn range ahead of the bird.
    if (birdZ - plazaZ > SPAWN_AHEAD_M) return // plaza still too far ahead
    this.tollPlacedZ = plazaZ

    // Two rows of 4, lanes 0..3 in the front row, then a second row staggered
    // one lane over and TOLL_PLAZA_ROW_GAP_M further back. All stopped (vel 0),
    // mixed archetypes for silhouette variety.
    const frontZ = plazaZ + TOLL_PLAZA_AHEAD_M // a touch before the gantry (+Z)
    const backZ = frontZ + TOLL_PLAZA_ROW_GAP_M
    // Record the cluster's z-band so spawnAmbient can keep ambient cars out of
    // it (the stopped cars never move; a faster ambient car spawned into the
    // band would drive −Z straight into one).
    this.tollFrontZ = frontZ
    this.tollBackZ = backZ
    const archByCol: CarArchetype[] = ['sedan', 'suv', 'pickup', 'boxtruck']
    let placed = 0
    for (let row = 0; row < 2 && placed < TOLL_PLAZA_CARS; row++) {
      const rowZ = row === 0 ? frontZ : backZ
      for (let lane = 0; lane < LANES && placed < TOLL_PLAZA_CARS; lane++) {
        // Front row fills lanes 0..3, back row fills lanes 1..4, so the cluster
        // staggers and leaves a thread the bird could thread (or carpet).
        if (row === 0 && lane > 3) continue
        if (row === 1 && lane < 1) continue
        const arch = archByCol[(lane + row) % archByCol.length]
        const slot = this.spawnCar(arch, SPECIAL_NONE, lane, rowZ, 0)
        if (slot) placed++
      }
    }
  }

  // ── Update ──────────────────────────────────────────────────────────────────
  update(dt: number, birdZ: number, t: number): void {
    this.glintClock += dt

    // 0) One-time corridor seed at run start.
    if (!this.seeded) {
      this.seeded = true
      this.seedCorridor(birdZ)
    }

    // 1) Scheduled specials whose time has arrived.
    while (
      this.scheduleCursor < this.schedule.length &&
      t >= this.schedule[this.scheduleCursor].t
    ) {
      this.spawnScheduled(birdZ, this.scheduleCursor)
      this.scheduleCursor++
    }

    // 2) Toll-plaza cluster (once, when in range).
    this.maybePlaceTollPlaza(birdZ)

    // 3) Ambient spawning via density accumulator.
    this.spawnAccum += this.level.density(t) * dt
    // Cap the catch-up so a long frame can't dump a wall of cars at once, but
    // KEEP any leftover fraction (don't discard it) so a transient frame-time
    // spike doesn't permanently erase the scheduled density — the budget below
    // already bounds spawns per frame.
    let budget = 4
    while (this.spawnAccum >= 1 && budget-- > 0) {
      this.spawnAccum -= 1
      this.spawnAmbient(birdZ)
    }

    // 4) Advance cars; despawn behind the bird. Compact the live list in place.
    const despawnZ = birdZ + DESPAWN_BEHIND_M
    let w = 0
    for (let r = 0; r < this.live.length; r++) {
      const c = this.live[r]
      // Integrate (cars never change lanes in MVP, so x is fixed).
      c.pos.z += c.vel.z * dt
      if (c.pos.z > despawnZ) {
        // Behind the bird — retire.
        c.alive = false
        c.used = false
        this.releaseMarker(c)
        this.colorsDirty = true // live set shrank → indices shift, re-pack colors
        continue // drop from live (do not copy forward)
      }
      // Keep: follow markers to the car.
      this.followMarker(c)
      this.live[w++] = c
    }
    // Trim the tail without reallocating the array.
    this.live.length = w

    // 5) Pack instance matrices/colors for each archetype mesh.
    this.packInstances()
  }

  private followMarker(c: CarSlot): void {
    const m = c.marker
    if (!m) return
    if (c.special === 'tolltag') {
      // Roof box rides on top of the cabin, slightly toward the windshield.
      m.position.set(
        c.pos.x,
        c.pos.y + c.half.y + ROOF_BOX_SIZE.y / 2,
        c.pos.z + c.windshield.zOffset,
      )
    } else if (c.special === 'jackpot') {
      // Glint floats above the roof; its pulse (scale + opacity) is applied in
      // animateGlints() after positions settle.
      m.position.set(c.pos.x, c.pos.y + c.half.y + GLINT_FLOAT_Y, c.pos.z)
    }
  }

  /** Pulse the jackpot glint planes (scale + opacity sine). The plane lies in
   * the XY plane (faces +Z); the follow-cam sits behind the bird at +Z looking
   * −Z, so the quad already reads head-on under this fixed-yaw camera — no
   * per-frame billboard math needed. Pooled, so allocation-free. */
  private animateGlints(): void {
    const phase = 0.5 + 0.5 * Math.sin(this.glintClock * GLINT_PULSE_HZ * Math.PI * 2)
    const pulse = GLINT_BASE_SCALE + GLINT_PULSE_SCALE * phase
    const op = 0.6 + 0.4 * phase
    for (const c of this.live) {
      if (c.special !== 'jackpot' || !c.marker) continue
      const m = c.marker
      m.scale.setScalar(pulse)
      ;(m.material as MeshBasicMaterial).opacity = op
    }
  }

  /** Write alive cars into their archetype InstancedMeshes. No allocation.
   * Matrices repack every frame; per-instance colors only when the live set
   * changed (colorsDirty), since color is assigned once at spawn. */
  private packInstances(): void {
    // Reset per-archetype write cursors (Int32Array reused across frames).
    _counts.fill(0)
    const writeColors = this.colorsDirty

    for (const c of this.live) {
      const ai = ARCHETYPE_INDEX[c.archetype]
      const inst = this.meshList[ai]
      const idx = _counts[ai]
      if (idx >= MAX_CARS) continue // safety: never exceed capacity
      _pos.copy(c.pos)
      _mat.compose(_pos, _quat, _scl) // identity rotation/scale (no lane yaw)
      inst.setMatrixAt(idx, _mat)
      if (writeColors) {
        _col.setHex(c.colorHex)
        inst.setColorAt(idx, _col)
      }
      _counts[ai] = idx + 1
    }

    for (let i = 0; i < ARCHETYPE_LIST.length; i++) {
      const inst = this.meshList[i]
      inst.count = _counts[i]
      inst.instanceMatrix.needsUpdate = true
      if (writeColors && inst.instanceColor) inst.instanceColor.needsUpdate = true
    }
    this.colorsDirty = false

    // Animate special markers after positions are settled.
    this.animateGlints()
  }

  // ── ITraffic queries / mutations ────────────────────────────────────────────
  getCar(id: number): ActiveCar | undefined {
    for (const c of this.live) if (c.id === id) return c
    return undefined
  }

  registerSplat(id: number): void {
    for (const c of this.live) {
      if (c.id === id) {
        c.splatCount++
        return
      }
    }
  }

  // ── Reset (RETRY: full state restored, no reload) ───────────────────────────
  reset(): void {
    // Retire every live car back to the pool.
    for (const c of this.live) {
      c.alive = false
      c.used = false
      this.releaseMarker(c)
    }
    this.live.length = 0

    // Hide marker pools.
    for (const m of this.roofBoxes) m.visible = false
    for (const m of this.glints) m.visible = false

    // Clear instance meshes.
    for (const inst of this.meshList) {
      inst.count = 0
      inst.instanceMatrix.needsUpdate = true
    }

    // Restore run state.
    this.spawnAccum = 0
    this.seeded = false
    this.scheduleCursor = 0
    this.tollPlacedZ = Number.POSITIVE_INFINITY
    this.tollFrontZ = Number.POSITIVE_INFINITY
    this.tollBackZ = Number.NEGATIVE_INFINITY
    this.glintClock = 0
    this.colorsDirty = true
    // nextId intentionally keeps climbing across resets within the page session
    // so a stale id from a prior run can never collide with a fresh car. (ids
    // are "never reused within a run"; monotonic across runs is strictly safer.)
  }

  /** Dispose GPU resources (full teardown only — not called on RETRY). */
  dispose(): void {
    for (const inst of this.meshList) {
      this.scene.remove(inst)
      inst.geometry.dispose()
      ;(inst.material as MeshLambertMaterial).dispose()
      inst.dispose()
    }
    for (const m of this.roofBoxes) this.scene.remove(m)
    for (const m of this.glints) {
      this.scene.remove(m)
      ;(m.material as MeshBasicMaterial).dispose()
    }
    this.roofGeom.dispose()
    this.roofMat.dispose()
    this.glintGeom.dispose()
    this.glintMat.dispose()
  }
}
