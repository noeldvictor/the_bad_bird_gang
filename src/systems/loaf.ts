// ─────────────────────────────────────────────────────────────────────────────
// Loaf — the ammo economy + gray-box NJ food pickups (GAME_DESIGN §3).
// Owns: the meter (current/capacity), spawning scheduled food from level.food,
// the EAT aura/prompt, gulp-on-pass with no lockout, and the little fly-to-bird
// consume animation. Emits 'eat' on a successful gulp; main.ts plays audio +
// the "+N TAYLOR HAM" popup.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three'
import {
  BAND_ALTITUDE,
  DESPAWN_BEHIND_M,
  EAT_AHEAD_M,
  EAT_LATERAL_RADIUS,
  EAT_PROMPT_S,
  FOOD_REFUEL,
  FORWARD_SPEED,
  laneX,
  LOAF_CAPACITY,
  PALETTE,
  SPAWN_AHEAD_M,
} from '../constants'
import type { EventBus } from '../events'
import type { BirdView, FoodKind, FoodSpawn, ILoaf, LevelDef } from '../types'

// Vertical close-in is a touch more generous than lateral (the bird and food
// rarely share an exact altitude during a band transition).
const EAT_VERTICAL_RADIUS = EAT_LATERAL_RADIUS * 1.5
// Consume animation: fly the mesh into the bird over this many seconds.
const CONSUME_S = 0.15
// Gentle idle motion.
const BOB_AMP = 0.45 // m
const BOB_SPEED = 2.2 // rad/s
const SPIN_SPEED = 0.9 // rad/s

interface Pickup {
  spawn: FoodSpawn
  group: THREE.Group
  /** World resting position (bob is applied on top of this y). */
  baseX: number
  baseY: number
  baseZ: number
  spawned: boolean
  consumed: boolean
  /** Phase offset so pickups don't bob in lockstep. */
  phase: number
  /** Lingering arm window: stays armable for a short tail after closest pass. */
  armTail: number
  /** Consume animation progress in seconds, or -1 when not consuming. */
  consumeT: number
}

// Module-level scratch — no per-frame allocation in the hot path.
const _scratchTarget = new THREE.Vector3()

export class Loaf implements ILoaf {
  readonly capacity = LOAF_CAPACITY
  private _current = LOAF_CAPACITY
  private _promptVisible = false

  private readonly pickups: Pickup[] = []
  /** The currently-armed pickup eligible for tryEat(), or null. */
  private armed: Pickup | null = null

  constructor(
    private readonly scene: THREE.Scene,
    private readonly level: LevelDef,
    private readonly bus: EventBus,
  ) {
    this.buildSchedule()
  }

  get current(): number {
    return this._current
  }

  get promptVisible(): boolean {
    return this._promptVisible
  }

  trySpend(): boolean {
    if (this._current <= 0) return false
    this._current -= 1
    return true
  }

  // ── Schedule / meshes ────────────────────────────────────────────────────────

  private buildSchedule(): void {
    for (const spawn of this.level.food) {
      const group = this.buildMesh(spawn.kind)
      group.visible = false
      this.scene.add(group)
      this.pickups.push({
        spawn,
        group,
        baseX: laneX(spawn.lane),
        baseY: BAND_ALTITUDE[spawn.band],
        baseZ: -FORWARD_SPEED * spawn.t,
        spawned: false,
        consumed: false,
        phase: spawn.t * 1.7,
        armTail: 0,
        consumeT: -1,
      })
    }
  }

  /** Gray-box mesh per food kind — flat-shaded primitives, PALETTE-ish colors,
   * no textures. Silhouette carries the read. */
  private buildMesh(kind: FoodKind): THREE.Group {
    const g = new THREE.Group()
    const gold = 0xffb627 // marquee gold (fries)
    const bread = 0xd9b27a // bagel/roll bread tone
    const meat = 0xb5503a // pork-roll / taylor-ham
    const cheese = 0xf2c14e // egg & cheese
    const gravy = 0x6b4a2f // disco-fries brown gravy

    switch (kind) {
      case 'fry':
        this.addFryCluster(g, gold)
        break
      case 'bagel': {
        const torus = new THREE.Mesh(
          new THREE.TorusGeometry(0.55, 0.24, 8, 16),
          new THREE.MeshLambertMaterial({ color: bread }),
        )
        torus.rotation.x = Math.PI / 2
        g.add(torus)
        break
      }
      case 'porkroll': {
        // Layered sandwich: bottom bun, meat, cheese, top bun.
        const layers: Array<[number, number]> = [
          [0.0, bread],
          [0.22, meat],
          [0.4, cheese],
          [0.62, bread],
        ]
        for (const [y, color] of layers) {
          const h = color === bread ? 0.16 : 0.12
          const slab = new THREE.Mesh(
            new THREE.BoxGeometry(0.95, h, 0.95),
            new THREE.MeshLambertMaterial({ color }),
          )
          slab.position.y = y
          g.add(slab)
        }
        break
      }
      case 'disco': {
        // Fry box plus a brown gravy blob on top — the LOW-band risk pickup.
        this.addFryCluster(g, gold)
        const blob = new THREE.Mesh(
          new THREE.SphereGeometry(0.42, 10, 8),
          new THREE.MeshLambertMaterial({ color: gravy }),
        )
        blob.scale.y = 0.6
        blob.position.y = 0.5
        g.add(blob)
        break
      }
    }
    return g
  }

  /** A small clustered box of fries (shared by fry + disco). */
  private addFryCluster(g: THREE.Group, color: number): void {
    const mat = new THREE.MeshLambertMaterial({ color })
    // Carton.
    const carton = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.5, 0.6),
      new THREE.MeshLambertMaterial({ color: PALETTE.sunsetOrange }),
    )
    carton.position.y = -0.05
    g.add(carton)
    // A few fry sticks poking out.
    const offsets: Array<[number, number]> = [
      [-0.14, -0.12],
      [0.0, 0.1],
      [0.15, -0.05],
      [-0.05, 0.16],
    ]
    for (const [ox, oz] of offsets) {
      const stick = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), mat)
      stick.position.set(ox, 0.35, oz)
      g.add(stick)
    }
  }

  // ── Per-frame update ─────────────────────────────────────────────────────────

  update(dt: number, bird: BirdView, t: number): void {
    const birdZ = bird.pos.z
    let bestArm: Pickup | null = null
    let bestAhead = Infinity

    for (const p of this.pickups) {
      if (p.consumed) continue

      // Spawn: reveal when the bird gets within SPAWN_AHEAD_M of the food's z.
      if (!p.spawned) {
        // food is ahead (more negative z) when distAhead > 0.
        const distAhead = birdZ - p.baseZ
        if (distAhead <= SPAWN_AHEAD_M) {
          p.spawned = true
          p.group.visible = true
        } else {
          continue
        }
      }

      // Consume animation in flight: lerp the resting position toward the bird,
      // shrinking as it goes, then retire. No per-frame allocation.
      if (p.consumeT >= 0) {
        p.consumeT += dt
        const k = Math.min(1, p.consumeT / CONSUME_S)
        _scratchTarget.set(p.baseX, p.baseY, p.baseZ)
        p.group.position.lerpVectors(_scratchTarget, bird.pos, k)
        p.group.scale.setScalar(Math.max(0.001, 1 - k))
        if (k >= 1) this.retire(p)
        continue
      }

      // Idle float: gentle bob + spin around the resting position.
      const bob = Math.sin(t * BOB_SPEED + p.phase) * BOB_AMP
      p.group.position.set(p.baseX, p.baseY + bob, p.baseZ)
      p.group.rotation.y += SPIN_SPEED * dt

      // Despawn once well behind the bird (recycle the slot for the run).
      if (birdZ - p.baseZ < -DESPAWN_BEHIND_M) {
        this.retire(p)
        continue
      }

      // Decay any lingering arm-tail from a previous frame.
      if (p.armTail > 0) p.armTail -= dt

      // Arming test: close in x and y, and within EAT_AHEAD_M ahead.
      const dx = Math.abs(bird.pos.x - p.baseX)
      const dy = Math.abs(bird.pos.y - (p.baseY + bob))
      const distAhead = birdZ - p.baseZ // > 0 while the food is ahead.
      const laterallyClose = dx < EAT_LATERAL_RADIUS && dy < EAT_VERTICAL_RADIUS
      const inFront = distAhead > 0 && distAhead < EAT_AHEAD_M
      if (laterallyClose && inFront) {
        // Refresh the tail so the tap window is fair after the closest pass.
        p.armTail = EAT_PROMPT_S
      }

      // A pickup is armable if its tail is still open AND the bird hasn't blown
      // far past it (the food may have just slipped behind during the tail).
      if (p.armTail > 0 && distAhead > -DESPAWN_BEHIND_M) {
        // Prefer the nearest-ahead pickup so the prompt tracks the real target.
        const rank = distAhead >= 0 ? distAhead : EAT_AHEAD_M - distAhead
        if (rank < bestAhead) {
          bestAhead = rank
          bestArm = p
        }
      }
    }

    this.armed = bestArm
    this._promptVisible = bestArm !== null
  }

  /** Hide + retire a pickup (consumed or drifted past). */
  private retire(p: Pickup): void {
    p.consumed = true
    p.group.visible = false
    if (this.armed === p) {
      this.armed = null
      this._promptVisible = false
    }
  }

  // ── EAT ──────────────────────────────────────────────────────────────────────

  tryEat(): boolean {
    const p = this.armed
    if (!p || p.consumeT >= 0 || p.consumed) return false

    const kind = p.spawn.kind
    const refuel = FOOD_REFUEL[kind]
    this._current = Math.min(this.capacity, this._current + refuel)

    // Kick off the fly-to-bird animation; the slot retires when it lands.
    p.consumeT = 0
    this.armed = null
    this._promptVisible = false

    this.bus.emit('eat', { kind, refuel, label: this.labelFor(kind) })
    return true
  }

  /** The reload tag: porkroll mirrors the region food name; others speak their
   * own kind name. */
  private labelFor(kind: FoodKind): string {
    switch (kind) {
      case 'porkroll':
        return `${this.level.regionFoodName}, EGG & CHEESE`
      case 'fry':
        return 'FRIES'
      case 'bagel':
        return 'BAGEL'
      case 'disco':
        return 'DISCO FRIES'
    }
  }

  // ── Reset ────────────────────────────────────────────────────────────────────

  reset(): void {
    this._current = this.capacity
    this._promptVisible = false
    this.armed = null
    for (const p of this.pickups) {
      p.spawned = false
      p.consumed = false
      p.armTail = 0
      p.consumeT = -1
      p.group.visible = false
      p.group.position.set(p.baseX, p.baseY, p.baseZ)
      p.group.scale.setScalar(1)
      p.group.rotation.set(0, 0, 0)
    }
  }
}
