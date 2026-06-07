// ─────────────────────────────────────────────────────────────────────────────
// payload/ballistics.ts — Payloads + Reticle (closed-form projectile + swept-
// sphere collision). Forward is -Z, +X right, +Y up, ground y=0.
//
// Physics is closed-form / kinematic per GAME_DESIGN §9: on release we capture
// the bird's position + velocity, integrate `v.y -= G*dt; v.x += wind*dt;
// p += v*dt`, and resolve hits with a swept-sphere vs car-AABB test (earliest
// TOI). No engine, no broadphase — ≤1..8 payloads, range-culled by Z.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three'

import {
  GRAVITY,
  DROP_COOLDOWN_S,
  PAYLOAD_RADIUS,
  GRAZE_MARGIN,
  PALETTE,
} from '../constants'
import type { EventBus } from '../events'
import type {
  BirdView,
  IPayloads,
  IReticle,
  ITraffic,
  ActiveCar,
  SplatTier,
} from '../types'

// ── Tuning local to this module (visual only; physics numbers come from
// constants.ts). ────────────────────────────────────────────────────────────
const POOL_SIZE = 8
/** Only test cars whose centre is within this |dz| of the payload. */
const CULL_DZ = 15
/** A drop that never finds a car is recycled once it falls this far below
 * the road, so stray payloads can't live forever. */
const FLOOR_KILL_Y = -2

// ── Module-level scratch (no per-frame allocation in hot paths) ──────────────
const _prev = new THREE.Vector3()
const _curr = new THREE.Vector3()
const _impact = new THREE.Vector3()
const _local = new THREE.Vector3()
const _scatter = new THREE.Vector3()
/** Payload segment start shifted into the car's reference frame for the sweep
 * (accounts for the car's own intra-frame displacement). */
const _sweepStart = new THREE.Vector3()

interface PayloadSlot {
  mesh: THREE.Mesh
  vel: THREE.Vector3
  /** World position where this payload left the bird (for dropDistanceM). */
  origin: THREE.Vector3
  /** Dive bonus window was active at release. */
  dive: boolean
  active: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Payloads
// ─────────────────────────────────────────────────────────────────────────────
export class Payloads implements IPayloads {
  private readonly scene: THREE.Scene
  private readonly bus: EventBus
  private readonly pool: PayloadSlot[] = []
  /** Seconds until the fire-rate cap clears (0 = ready). */
  private cooldown = 0

  constructor(scene: THREE.Scene, bus: EventBus) {
    this.scene = scene
    this.bus = bus

    const geo = new THREE.SphereGeometry(PAYLOAD_RADIUS, 8, 6)
    const mat = new THREE.MeshLambertMaterial({ color: PALETTE.splat })
    for (let i = 0; i < POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(geo, mat)
      mesh.visible = false
      mesh.frustumCulled = false
      scene.add(mesh)
      this.pool.push({
        mesh,
        vel: new THREE.Vector3(),
        origin: new THREE.Vector3(),
        dive: false,
        active: false,
      })
    }
  }

  ready(): boolean {
    return this.cooldown <= 0
  }

  drop(bird: BirdView, _wind: number): void {
    if (this.cooldown > 0) return
    const slot = this.acquire()
    if (!slot) return
    this.cooldown = DROP_COOLDOWN_S

    // Spawn at the bird, inheriting its velocity (forward momentum → lead).
    slot.mesh.position.copy(bird.pos)
    slot.origin.copy(bird.pos)
    slot.vel.copy(bird.vel)
    slot.dive = bird.diving

    // Scatter: pick a uniform random point in a disc of radius spreadRadius,
    // then convert that ground deviation into a velocity offset by dividing
    // by the closed-form time-to-ground t0 = sqrt(2*y/G). This makes the
    // IMPACT (not the launch) deviate by that disc.
    const y = Math.max(bird.pos.y, 0.0001)
    const t0 = Math.sqrt((2 * y) / GRAVITY)
    if (t0 > 0 && bird.spreadRadius > 0) {
      // sqrt(u) gives a uniform distribution over the disc area.
      const r = bird.spreadRadius * Math.sqrt(Math.random())
      const a = Math.random() * Math.PI * 2
      _scatter.set((Math.cos(a) * r) / t0, 0, (Math.sin(a) * r) / t0)
      slot.vel.x += _scatter.x
      slot.vel.z += _scatter.z
    }

    slot.active = true
    slot.mesh.visible = true

    // Clone: the event payload outlives this slot's `origin` (reused on the
    // next drop), and a consumer may retain it. Cheap — once per cooldown.
    this.bus.emit('drop', { from: slot.origin.clone() })
  }

  update(dt: number, traffic: ITraffic, wind: number): void {
    if (this.cooldown > 0) {
      this.cooldown -= dt
      if (this.cooldown < 0) this.cooldown = 0
    }

    for (const slot of this.pool) {
      if (!slot.active) continue
      this.integrate(slot, dt, traffic, wind)
    }
  }

  reset(): void {
    this.cooldown = 0
    for (const slot of this.pool) {
      slot.active = false
      slot.mesh.visible = false
      slot.vel.set(0, 0, 0)
    }
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private acquire(): PayloadSlot | undefined {
    for (const slot of this.pool) if (!slot.active) return slot
    // Pool exhausted (>8 in flight is impossible given DROP_COOLDOWN_S, but
    // be safe): recycle the slot already lowest to the ground.
    let lowest: PayloadSlot | undefined
    for (const slot of this.pool) {
      if (!lowest || slot.mesh.position.y < lowest.mesh.position.y) lowest = slot
    }
    return lowest
  }

  private integrate(
    slot: PayloadSlot,
    dt: number,
    traffic: ITraffic,
    wind: number,
  ): void {
    _prev.copy(slot.mesh.position)

    // Closed-form Euler step: v.y -= G*dt; v.x += wind*dt; p += v*dt.
    slot.vel.y -= GRAVITY * dt
    slot.vel.x += wind * dt
    _curr.set(
      _prev.x + slot.vel.x * dt,
      _prev.y + slot.vel.y * dt,
      _prev.z + slot.vel.z * dt,
    )

    // ── Swept-sphere vs car AABBs (earliest TOI wins) ───────────────────────
    // Sweep in each car's reference frame: the car moved car.vel*dt during this
    // step too (traffic.update ran before us, so car.pos is already end-of-frame).
    // Testing the payload's RELATIVE segment — start shifted by +car.vel*dt —
    // against the car's end AABB accounts for that displacement, so a payload
    // that should clip the trailing edge can't tunnel between frames at low fps
    // (both bird and cars move −Z, which otherwise shrinks the closing speed).
    let bestT = Infinity
    let bestCar: ActiveCar | undefined
    for (const car of traffic.cars) {
      if (!car.alive) continue
      if (Math.abs(car.pos.z - _prev.z) > CULL_DZ) continue
      _sweepStart.set(
        _prev.x + car.vel.x * dt,
        _prev.y + car.vel.y * dt,
        _prev.z + car.vel.z * dt,
      )
      const t = sweptSphereAABB(_sweepStart, _curr, car, PAYLOAD_RADIUS)
      if (t >= 0 && t < bestT) {
        bestT = t
        bestCar = car
      }
    }

    if (bestCar) {
      // Impact point along the swept segment.
      _impact.lerpVectors(_prev, _curr, bestT)
      this.resolveCarHit(slot, bestCar, _impact)
      this.recycle(slot)
      return
    }

    // No car hit this step. Did we reach the ground?
    if (_curr.y <= 0) {
      this.resolveGround(slot, traffic, _prev, _curr)
      this.recycle(slot)
      return
    }

    // Still airborne — commit the step.
    slot.mesh.position.copy(_curr)

    // Safety net: a payload that somehow tunnels far below the road.
    if (slot.mesh.position.y < FLOOR_KILL_Y) {
      this.bus.emit('miss', { impact: slot.mesh.position.clone() })
      this.recycle(slot)
    }
  }

  private resolveCarHit(
    slot: PayloadSlot,
    car: ActiveCar,
    impact: THREE.Vector3,
  ): void {
    // localOffset = impact relative to the car centre at this frame.
    _local.copy(impact).sub(car.pos)
    const tier = classifyCarHit(car, _local)
    this.emitSplat(slot, car, impact, _local, tier)
  }

  private resolveGround(
    slot: PayloadSlot,
    traffic: ITraffic,
    prev: THREE.Vector3,
    curr: THREE.Vector3,
  ): void {
    // Solve where y crosses 0 along prev→curr so the ground impact x/z is
    // accurate (rather than using the overshot `curr`).
    const dy = curr.y - prev.y
    const tg = dy !== 0 ? prev.y / (prev.y - curr.y) : 0
    _impact.lerpVectors(prev, curr, clamp01(tg))
    _impact.y = 0

    // GRAZE: ground impact within GRAZE_MARGIN (horizontally) of a car AABB.
    let grazeCar: ActiveCar | undefined
    let bestDist = Infinity
    for (const car of traffic.cars) {
      if (!car.alive) continue
      if (Math.abs(car.pos.z - _impact.z) > CULL_DZ) continue
      const dx = Math.max(
        0,
        Math.abs(_impact.x - car.pos.x) - car.half.x,
      )
      const dz = Math.max(
        0,
        Math.abs(_impact.z - car.pos.z) - car.half.z,
      )
      const d = Math.hypot(dx, dz)
      if (d <= GRAZE_MARGIN && d < bestDist) {
        bestDist = d
        grazeCar = car
      }
    }

    if (grazeCar) {
      _local.copy(_impact).sub(grazeCar.pos)
      this.emitSplat(slot, grazeCar, _impact, _local, 'GRAZE')
    } else {
      this.bus.emit('miss', { impact: _impact.clone() })
    }
  }

  private emitSplat(
    slot: PayloadSlot,
    car: ActiveCar,
    impact: THREE.Vector3,
    local: THREE.Vector3,
    tier: SplatTier,
  ): void {
    const dropDistanceM = slot.origin.distanceTo(impact)
    this.bus.emit('splat', {
      tier,
      carId: car.id,
      archetype: car.archetype,
      special: car.special,
      impact: impact.clone(),
      localOffset: local.clone(),
      dive: slot.dive,
      dropDistanceM,
      basePoints: car.points,
    })
  }

  private recycle(slot: PayloadSlot): void {
    slot.active = false
    slot.mesh.visible = false
    slot.vel.set(0, 0, 0)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reticle — closed-form predicted impact ring on the road.
// ─────────────────────────────────────────────────────────────────────────────
export class Reticle implements IReticle {
  /** Predicted impact point on the road (reused each frame). */
  readonly impact = new THREE.Vector3()

  private readonly mesh: THREE.Mesh
  private readonly baseRadius: number
  private pulse = 0

  constructor(scene: THREE.Scene) {
    // A thin flat ring lying on the road. Inner/outer chosen so scaling by
    // spreadRadius keeps a legible band.
    this.baseRadius = 1
    const geo = new THREE.RingGeometry(0.82, 1, 40)
    geo.rotateX(-Math.PI / 2) // lie flat on the XZ plane, facing +Y
    const mat = new THREE.MeshBasicMaterial({
      color: PALETTE.marqueeGold,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.position.y = 0.03
    this.mesh.renderOrder = 2
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
  }

  update(bird: BirdView, wind: number): void {
    // Closed-form impact: t0 = sqrt(2*y/G); the payload inherits bird.vel and
    // the lateral wind accel, so:
    //   x = bx + vx*t0 + 0.5*wind*t0²
    //   z = bz + vz*t0
    const y = Math.max(bird.pos.y, 0.0001)
    const t0 = Math.sqrt((2 * y) / GRAVITY)
    this.impact.set(
      bird.pos.x + bird.vel.x * t0 + 0.5 * wind * t0 * t0,
      0,
      bird.pos.z + bird.vel.z * t0,
    )

    this.mesh.position.x = this.impact.x
    this.mesh.position.z = this.impact.z

    // Ring radius tracks the scatter disc; a gentle pulse to read as "live".
    this.pulse += 0.12
    const breathe = 1 + Math.sin(this.pulse) * 0.04
    const s = (bird.spreadRadius / this.baseRadius) * breathe
    this.mesh.scale.set(s, 1, s)
  }

  setVisible(v: boolean): void {
    this.mesh.visible = v
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Free helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * Swept-sphere (radius r) vs axis-aligned box, returned as the parametric
 * time-of-impact along segment a→b in [0,1], or -1 for no hit in the step.
 *
 * Equivalent to a ray (a→b) vs the AABB expanded by r on every axis (the
 * Minkowski sum of the box and the sphere). For the gray-box prototype the
 * rounded corners of a true swept sphere are unnecessary — the slab test on
 * the expanded box is the standard, allocation-free approach.
 */
function sweptSphereAABB(
  a: THREE.Vector3,
  b: THREE.Vector3,
  car: ActiveCar,
  r: number,
): number {
  const minX = car.pos.x - car.half.x - r
  const maxX = car.pos.x + car.half.x + r
  const minY = car.pos.y - car.half.y - r
  const maxY = car.pos.y + car.half.y + r
  const minZ = car.pos.z - car.half.z - r
  const maxZ = car.pos.z + car.half.z + r

  const dx = b.x - a.x
  const dy = b.y - a.y
  const dz = b.z - a.z

  let tmin = 0
  let tmax = 1

  // X slab
  if (Math.abs(dx) < 1e-9) {
    if (a.x < minX || a.x > maxX) return -1
  } else {
    const inv = 1 / dx
    let t1 = (minX - a.x) * inv
    let t2 = (maxX - a.x) * inv
    if (t1 > t2) {
      const tmp = t1
      t1 = t2
      t2 = tmp
    }
    if (t1 > tmin) tmin = t1
    if (t2 < tmax) tmax = t2
    if (tmin > tmax) return -1
  }

  // Y slab
  if (Math.abs(dy) < 1e-9) {
    if (a.y < minY || a.y > maxY) return -1
  } else {
    const inv = 1 / dy
    let t1 = (minY - a.y) * inv
    let t2 = (maxY - a.y) * inv
    if (t1 > t2) {
      const tmp = t1
      t1 = t2
      t2 = tmp
    }
    if (t1 > tmin) tmin = t1
    if (t2 < tmax) tmax = t2
    if (tmin > tmax) return -1
  }

  // Z slab
  if (Math.abs(dz) < 1e-9) {
    if (a.z < minZ || a.z > maxZ) return -1
  } else {
    const inv = 1 / dz
    let t1 = (minZ - a.z) * inv
    let t2 = (maxZ - a.z) * inv
    if (t1 > t2) {
      const tmp = t1
      t1 = t2
      t2 = tmp
    }
    if (t1 > tmin) tmin = t1
    if (t2 < tmax) tmax = t2
    if (tmin > tmax) return -1
  }

  return tmin
}

/**
 * Classify a confirmed car hit into BULLSEYE / HIT given the impact point
 * local to the car centre.
 *
 * - BULLSEYE: the impact is on (or very near) the TOP face AND inside the
 *   windshield zone (|x| ≤ winHalfX and |z − zOffset| ≤ winHalfZ).
 * - HIT: anywhere else on the box (top outside the windshield, or any side).
 *
 * GRAZE is decided separately (ground-margin) by the caller.
 */
function classifyCarHit(car: ActiveCar, local: THREE.Vector3): SplatTier {
  // "On the top face" = local y near the AABB top (+half.y). Allow the swept
  // sphere's radius as slack so a sphere grazing the roof still counts.
  const topY = car.half.y
  const onTop = local.y >= topY - PAYLOAD_RADIUS * 2

  if (onTop) {
    const w = car.windshield
    // The windshield zone is symmetric in X (|x| ≤ halfX): a passenger-side
    // windshield hit scores the same BULLSEYE as a driver's-side one. Canon's
    // "driver's-side preferred" (§2) is flavor for the gray-box (the driver
    // freak-out comedy), not a mechanical sub-bonus — the symmetric zone is
    // intentional here, not a bug.
    const inWindshield =
      Math.abs(local.x) <= w.halfX && Math.abs(local.z - w.zOffset) <= w.halfZ
    if (inWindshield) return 'BULLSEYE'
  }
  return 'HIT'
}
