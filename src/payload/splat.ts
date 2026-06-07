// ─────────────────────────────────────────────────────────────────────────────
// payload/splat.ts — Splats: pooled car-following decals, fading road plips,
// and a one-shot olive-cream particle burst on each car splat.
//
// Forward is -Z, +X right, +Y up, ground y=0. Everything is a flat-shaded
// primitive (MeshBasicMaterial) drawn with polygonOffset to avoid z-fighting
// against car/road surfaces. Nothing allocates in the hot path: the decal,
// road-plip and particle pools are built once and recycled FIFO.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three'

import {
  DECAL_POOL_SIZE,
  MAX_PARTICLES,
  ROAD_DECAL_FADE_S,
  PALETTE,
} from '../constants'
import type { Vector3 as TVector3 } from 'three'
import type { ActiveCar, ISplats, ITraffic, SplatTier } from '../types'

// ── Local tuning (visual only) ──────────────────────────────────────────────
const ROAD_DECAL_POOL_SIZE = 16
/** Lift decals slightly off the surface so they never z-fight even with
 * polygonOffset on weak GPUs. */
const SURFACE_LIFT = 0.02
/** Base circle radius the per-decal scale multiplies. */
const DECAL_BASE_RADIUS = 0.5

/** Per-tier base size and droplet count for the car decal cluster. */
const TIER_SIZE: Record<SplatTier, number> = {
  GRAZE: 0.7,
  HIT: 1.2,
  BULLSEYE: 1.9,
}
const TIER_DROPLETS: Record<SplatTier, number> = {
  GRAZE: 0,
  HIT: 0,
  BULLSEYE: 3,
}

// ── Particle burst tuning ───────────────────────────────────────────────────
const BURST_COUNT = 10 // quads per car splat (≤ MAX_PARTICLES total)
const PARTICLE_LIFE_S = 0.25
const PARTICLE_SIZE = 0.12
const PARTICLE_GRAVITY = 14
const PARTICLE_SPEED = 3.2
/** Olive / cream burst colors. */
const OLIVE = 0x8a9a5b
const CREAM = 0xeae3c8

// ── Module-level scratch (no per-frame allocation) ──────────────────────────
const _up = new THREE.Vector3(0, 1, 0)
const _normal = new THREE.Vector3()
const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
// Particle instancing scratch.
const _pmat = new THREE.Matrix4()
const _pscale = new THREE.Vector3()
const _pcolor = new THREE.Color()
const _IDENT_QUAT = new THREE.Quaternion()
const _HIDDEN_SCALE = new THREE.Vector3(0, 0, 0)
const _HIDDEN_POS = new THREE.Vector3(0, -10000, 0)

// A single droplet entry within a car decal (main blob + optional droplets).
interface DecalSlot {
  /** Group holding the main circle + droplet circles; we move the group. */
  group: THREE.Group
  main: THREE.Mesh
  droplets: THREE.Mesh[]
  carId: number
  /** Impact offset relative to the car centre at splat time. */
  localOffset: THREE.Vector3
  /** True when the hit was on the car's top surface (lay flat); false = side. */
  onTop: boolean
  /** Which side normal the decal faces when onTop is false. */
  sideNormal: THREE.Vector3
  topY: number
  active: boolean
}

interface RoadSlot {
  mesh: THREE.Mesh
  mat: THREE.MeshBasicMaterial
  age: number
  active: boolean
}

interface ParticleSlot {
  /** Index into the shared particle InstancedMesh. */
  index: number
  pos: THREE.Vector3
  vel: THREE.Vector3
  scale: number
  age: number
  active: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Splats
// ─────────────────────────────────────────────────────────────────────────────
export class Splats implements ISplats {
  private readonly scene: THREE.Scene

  private readonly decals: DecalSlot[] = []
  private decalCursor = 0 // FIFO write head

  private readonly roadPlips: RoadSlot[] = []
  private roadCursor = 0

  private readonly particles: ParticleSlot[] = []
  private particleCursor = 0
  private activeParticles = 0
  /** All particles render from one InstancedMesh — at most ONE draw call for the
   * whole burst, so the MAX_PARTICLES cap can't blow the draw-call budget. */
  private readonly particleMesh: THREE.InstancedMesh
  private particleDirty = false

  // Shared geometry/materials (built once).
  private readonly circleGeo: THREE.CircleGeometry
  private readonly dropletGeo: THREE.CircleGeometry
  private readonly decalMat: THREE.MeshBasicMaterial
  private readonly roadGeo: THREE.CircleGeometry
  private readonly particleGeo: THREE.PlaneGeometry
  private readonly particleMat: THREE.MeshBasicMaterial

  constructor(scene: THREE.Scene) {
    this.scene = scene

    // Flat circle facing +Y (lies on a horizontal surface by default). For
    // side hits we reorient the whole group.
    this.circleGeo = new THREE.CircleGeometry(DECAL_BASE_RADIUS, 16)
    this.circleGeo.rotateX(-Math.PI / 2)
    this.dropletGeo = new THREE.CircleGeometry(DECAL_BASE_RADIUS * 0.4, 12)
    this.dropletGeo.rotateX(-Math.PI / 2)

    this.decalMat = new THREE.MeshBasicMaterial({
      color: PALETTE.splat,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    })

    // ── Car decals ──────────────────────────────────────────────────────────
    for (let i = 0; i < DECAL_POOL_SIZE; i++) {
      const group = new THREE.Group()
      group.visible = false
      const main = new THREE.Mesh(this.circleGeo, this.decalMat)
      main.frustumCulled = false
      main.renderOrder = 3
      group.add(main)
      const droplets: THREE.Mesh[] = []
      for (let d = 0; d < 3; d++) {
        const dm = new THREE.Mesh(this.dropletGeo, this.decalMat)
        dm.visible = false
        dm.frustumCulled = false
        dm.renderOrder = 3
        group.add(dm)
        droplets.push(dm)
      }
      scene.add(group)
      this.decals.push({
        group,
        main,
        droplets,
        carId: -1,
        localOffset: new THREE.Vector3(),
        onTop: true,
        sideNormal: new THREE.Vector3(0, 1, 0),
        topY: 0,
        active: false,
      })
    }

    // ── Road plips (each needs its own fading material) ──────────────────────
    this.roadGeo = new THREE.CircleGeometry(DECAL_BASE_RADIUS * 0.6, 12)
    this.roadGeo.rotateX(-Math.PI / 2)
    for (let i = 0; i < ROAD_DECAL_POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: PALETTE.splat,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(this.roadGeo, mat)
      mesh.visible = false
      mesh.frustumCulled = false
      mesh.renderOrder = 2
      mesh.position.y = SURFACE_LIFT
      scene.add(mesh)
      this.roadPlips.push({ mesh, mat, age: 0, active: false })
    }

    // ── Particle burst pool (one InstancedMesh → ≤ 1 draw call) ──────────────
    this.particleGeo = new THREE.PlaneGeometry(PARTICLE_SIZE, PARTICLE_SIZE)
    this.particleMat = new THREE.MeshBasicMaterial({
      // Per-instance olive/cream tint via instanceColor; base white so the
      // instance color shows through unmodulated.
      color: 0xffffff,
      vertexColors: false,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.particleMesh = new THREE.InstancedMesh(
      this.particleGeo,
      this.particleMat,
      MAX_PARTICLES,
    )
    this.particleMesh.frustumCulled = false
    this.particleMesh.renderOrder = 4
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // Seed colors (alternating olive/cream) once; they never change per slot.
    for (let i = 0; i < MAX_PARTICLES; i++) {
      _pcolor.setHex(i % 2 === 0 ? OLIVE : CREAM)
      this.particleMesh.setColorAt(i, _pcolor)
      // Start every instance hidden (zero scale, parked off-screen).
      _pmat.compose(_HIDDEN_POS, _IDENT_QUAT, _HIDDEN_SCALE)
      this.particleMesh.setMatrixAt(i, _pmat)
      this.particles.push({
        index: i,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        scale: 1,
        age: 0,
        active: false,
      })
    }
    this.particleMesh.instanceMatrix.needsUpdate = true
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true
    }
    scene.add(this.particleMesh)
  }

  // ── Public API ───────────────────────────────────────────────────────────

  carSplat(car: ActiveCar, localOffset: TVector3, tier: SplatTier): void {
    const slot = this.acquireDecal()

    slot.carId = car.id
    slot.localOffset.set(localOffset.x, localOffset.y, localOffset.z)
    slot.topY = car.half.y
    slot.active = true
    slot.group.visible = true

    // Decide top vs side from the local offset's y. A hit at/near the AABB
    // top lies flat; anything notably below the top is a side hit and the
    // decal stands vertically against that side.
    const onTop = localOffset.y >= car.half.y - 0.25
    slot.onTop = onTop
    if (onTop) {
      slot.sideNormal.copy(_up)
    } else {
      // Pick the dominant horizontal axis as the side the splat clings to.
      if (Math.abs(localOffset.x) >= Math.abs(localOffset.z)) {
        slot.sideNormal.set(Math.sign(localOffset.x) || 1, 0, 0)
      } else {
        slot.sideNormal.set(0, 0, Math.sign(localOffset.z) || 1)
      }
    }

    // Size + droplets by tier.
    const base = TIER_SIZE[tier]
    if (tier === 'GRAZE') {
      // Streaky: stretched along the car's travel axis (Z).
      slot.main.scale.set(base * 0.6, 1, base * 1.8)
    } else {
      slot.main.scale.set(base, 1, base)
    }

    const dropCount = TIER_DROPLETS[tier]
    for (let i = 0; i < slot.droplets.length; i++) {
      const d = slot.droplets[i]
      if (i < dropCount) {
        const a = (i / dropCount) * Math.PI * 2 + Math.random()
        const r = base * (0.7 + Math.random() * 0.5)
        // Offsets in the decal's local plane (x/z while flat).
        d.position.set(Math.cos(a) * r, 0, Math.sin(a) * r)
        const ds = 0.6 + Math.random() * 0.7
        d.scale.set(ds, 1, ds)
        d.visible = true
      } else {
        d.visible = false
      }
    }

    // Snap into place immediately (also done every update()).
    this.placeDecal(slot, car)

    // One-shot olive-cream burst at the impact point.
    _pos.copy(car.pos).add(slot.localOffset)
    this.burst(_pos)
  }

  roadSplat(at: TVector3): void {
    const slot = this.roadPlips[this.roadCursor]
    this.roadCursor = (this.roadCursor + 1) % this.roadPlips.length
    slot.mesh.position.set(at.x, SURFACE_LIFT, at.z)
    const s = 0.7 + Math.random() * 0.6
    slot.mesh.scale.set(s, 1, s)
    slot.mesh.rotation.y = Math.random() * Math.PI
    slot.mat.opacity = 0.8
    slot.age = 0
    slot.active = true
    slot.mesh.visible = true
  }

  update(dt: number, traffic: ITraffic): void {
    // Car decals follow their car; hide if the car died or was recycled.
    for (const slot of this.decals) {
      if (!slot.active) continue
      const car = traffic.getCar(slot.carId)
      if (!car || !car.alive) {
        slot.active = false
        slot.group.visible = false
        continue
      }
      this.placeDecal(slot, car)
    }

    // Road plips fade out then recycle.
    for (const slot of this.roadPlips) {
      if (!slot.active) continue
      slot.age += dt
      const k = slot.age / ROAD_DECAL_FADE_S
      if (k >= 1) {
        slot.active = false
        slot.mesh.visible = false
        continue
      }
      slot.mat.opacity = 0.8 * (1 - k)
    }

    // Particle burst integration (writes into the shared InstancedMesh).
    if (this.activeParticles > 0) {
      for (const p of this.particles) {
        if (!p.active) continue
        p.age += dt
        if (p.age >= PARTICLE_LIFE_S) {
          p.active = false
          this.activeParticles--
          // Park the dead instance (zero scale) so it stops rendering.
          _pmat.compose(_HIDDEN_POS, _IDENT_QUAT, _HIDDEN_SCALE)
          this.particleMesh.setMatrixAt(p.index, _pmat)
          this.particleDirty = true
          continue
        }
        p.vel.y -= PARTICLE_GRAVITY * dt
        p.pos.x += p.vel.x * dt
        p.pos.y += p.vel.y * dt
        p.pos.z += p.vel.z * dt
        const k = 1 - p.age / PARTICLE_LIFE_S
        p.scale = 0.6 + k * 0.6
        _pscale.set(p.scale, p.scale, p.scale)
        _pmat.compose(p.pos, _IDENT_QUAT, _pscale)
        this.particleMesh.setMatrixAt(p.index, _pmat)
        this.particleDirty = true
      }
    }
    if (this.particleDirty) {
      this.particleMesh.instanceMatrix.needsUpdate = true
      this.particleDirty = false
    }
  }

  reset(): void {
    for (const slot of this.decals) {
      slot.active = false
      slot.group.visible = false
      slot.carId = -1
    }
    this.decalCursor = 0
    for (const slot of this.roadPlips) {
      slot.active = false
      slot.mesh.visible = false
      slot.age = 0
    }
    this.roadCursor = 0
    for (const p of this.particles) {
      p.active = false
      p.age = 0
      // Park the instance off-screen at zero scale.
      _pmat.compose(_HIDDEN_POS, _IDENT_QUAT, _HIDDEN_SCALE)
      this.particleMesh.setMatrixAt(p.index, _pmat)
    }
    this.particleMesh.instanceMatrix.needsUpdate = true
    this.particleDirty = false
    this.particleCursor = 0
    this.activeParticles = 0
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /** Pick a decal slot: prefer a free (inactive) slot scanning from the FIFO
   * cursor, so a still-active decal following a live car is never yanked while
   * the pool has room. Only when every slot is in use do we steal the oldest
   * via the FIFO cursor (genuine pool exhaustion — DECAL_POOL_SIZE in flight).
   * Mirrors Payloads.acquire(). */
  private acquireDecal(): DecalSlot {
    const n = this.decals.length
    for (let scan = 0; scan < n; scan++) {
      const idx = (this.decalCursor + scan) % n
      if (!this.decals[idx].active) {
        this.decalCursor = (idx + 1) % n
        return this.decals[idx]
      }
    }
    // Pool full: steal the slot at the cursor (oldest in FIFO order).
    const slot = this.decals[this.decalCursor]
    this.decalCursor = (this.decalCursor + 1) % n
    return slot
  }

  /** Snap a car decal to follow its car each frame. */
  private placeDecal(slot: DecalSlot, car: ActiveCar): void {
    if (slot.onTop) {
      // Sit on the top surface: keep localOffset x/z, force y to the car top
      // plus a small lift. Lie flat (group has identity rotation; the geometry
      // already faces +Y).
      slot.group.position.set(
        car.pos.x + slot.localOffset.x,
        car.pos.y + slot.topY + SURFACE_LIFT,
        car.pos.z + slot.localOffset.z,
      )
      slot.group.quaternion.identity()
    } else {
      // Side hit: stand the decal vertically against the dominant side. Clamp
      // the anchor to that face so it clings flush, then orient the group so
      // its +Y (geometry normal) points along the side normal.
      _normal.copy(slot.sideNormal)
      _pos.copy(car.pos)
      if (Math.abs(_normal.x) > 0.5) {
        _pos.x += _normal.x * (car.half.x + SURFACE_LIFT)
        _pos.y += slot.localOffset.y
        _pos.z += slot.localOffset.z
      } else {
        _pos.z += _normal.z * (car.half.z + SURFACE_LIFT)
        _pos.y += slot.localOffset.y
        _pos.x += slot.localOffset.x
      }
      slot.group.position.copy(_pos)
      _quat.setFromUnitVectors(_up, _normal)
      slot.group.quaternion.copy(_quat)
    }
  }

  /** Spawn a small olive-cream quad burst at a world point. */
  private burst(at: THREE.Vector3): void {
    for (let i = 0; i < BURST_COUNT; i++) {
      if (this.activeParticles >= MAX_PARTICLES) break
      // Find a free slot, scanning from the cursor (FIFO-ish).
      let p: ParticleSlot | undefined
      for (let scan = 0; scan < this.particles.length; scan++) {
        const idx = (this.particleCursor + scan) % this.particles.length
        if (!this.particles[idx].active) {
          p = this.particles[idx]
          this.particleCursor = (idx + 1) % this.particles.length
          break
        }
      }
      if (!p) break

      p.pos.copy(at)
      // Hemisphere-ish upward scatter.
      const a = Math.random() * Math.PI * 2
      const up = 0.5 + Math.random() * 0.9
      const horiz = Math.random() * 0.9
      const speed = PARTICLE_SPEED * (0.6 + Math.random() * 0.6)
      p.vel.set(
        Math.cos(a) * horiz * speed,
        up * speed,
        Math.sin(a) * horiz * speed,
      )
      p.age = 0
      p.scale = 1
      p.active = true
      _pscale.set(1, 1, 1)
      _pmat.compose(p.pos, _IDENT_QUAT, _pscale)
      this.particleMesh.setMatrixAt(p.index, _pmat)
      this.particleDirty = true
      this.activeParticles++
    }
  }
}
