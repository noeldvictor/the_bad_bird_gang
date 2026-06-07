// ─────────────────────────────────────────────────────────────────────────────
// SceneRig — renderer, follow-camera, lights, recycling gray-box Jersey scenery.
// Owns the #game canvas. Everything is a flat-shaded primitive (Lambert/Basic),
// PALETTE-only, pooled, recycled as the bird advances (forward = -Z). No shadow
// maps, no textures, no per-frame allocation in the hot path.
// ─────────────────────────────────────────────────────────────────────────────
import {
  AmbientLight,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  Color,
  DirectionalLight,
  Fog,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { BirdView, ISceneRig } from '../types'
import {
  CAM_BACK,
  CAM_DIVE_PITCH_DEG,
  CAM_FOV,
  CAM_FOV_DIVE,
  CAM_FOV_DIVE_IN_S,
  CAM_FOV_DIVE_OUT_S,
  CAM_LOOK_AHEAD_M,
  CAM_LOOK_DOWN_FRAC,
  CAM_POS_LAG_S,
  CAM_ROT_LAG_S,
  CAM_UP,
  CORRIDOR_HALF_X,
  DPR_CAP,
  LANE_WIDTH,
  LANES,
  laneX,
  PALETTE,
  SHAKE_DECAY_S,
  SHAKE_MAX_PX,
} from '../constants'

// ── Tuning local to scenery (visual only — none of these are gameplay canon) ──
const ROAD_SEG_LEN = 60 // m, length of one recycled road segment along Z
const ROAD_SEG_COUNT = 6 // pool size — leapfrogs ahead of the bird
const ROAD_HALF_W = CORRIDOR_HALF_X + 4 // a little shoulder beyond the corridor
const DASH_LEN = 3 // m, lane-dash stripe length
const DASH_GAP = 5 // m, gap between dashes
const DASH_PER_SEG = Math.floor(ROAD_SEG_LEN / (DASH_LEN + DASH_GAP))
const GUARDRAIL_H = 0.7
const GUARDRAIL_Y = 0.45
const SOUND_WALL_H = 4.2
const SOUND_WALL_GAP = 18 // distance between sound-wall slabs along Z
const SOUND_WALL_X = ROAD_HALF_W + 2.4
const OVERPASS_EVERY_SEGS = 3 // an overpass arch every Nth segment boundary
const SKYLINE_DIST = 150 // how far out the distant silhouettes sit (+X / -X)
const FOG_NEAR = 80
const FOG_FAR = 220

// Sky: Jersey-sunset orange at the horizon fading to asphalt-dark zenith.
const SKY_RADIUS = 600
const HORIZON_GLOW_RADIUS = 6
const ZENITH_COLOR = 0x1a1b2e // dark asphalt-ish zenith (between asphalt & night)

// ── Module-level scratch — never allocate in update/updateCamera hot paths ────
const _desiredPos = new Vector3()
const _lookTarget = new Vector3()
const _shakeOffset = new Vector3()
const _camRight = new Vector3()
const _camUp = new Vector3()
const _WORLD_UP = new Vector3(0, 1, 0)

/** One leapfrogging road segment: the asphalt slab plus all its set-dressing,
 * parented under a single group so we recycle by moving one transform. */
interface RoadSegment {
  group: Group
}

export class SceneRig implements ISceneRig {
  readonly scene: Scene
  readonly camera: PerspectiveCamera
  readonly renderer: WebGLRenderer

  // Camera follow state (smoothed across frames).
  private readonly camPos = new Vector3()
  private readonly camLook = new Vector3()
  private camInitialized = false

  // Dive FOV + pitch easing (0 = neutral, 1 = full dive).
  private diveT = 0

  // Screen shake. `shakePeak` is the clamped peak amplitude of the current
  // impulse; the live amplitude scales with `shakeTimer / SHAKE_DECAY_S`.
  private shakePeak = 0
  private shakeTimer = 0

  // Road recycling.
  private readonly segments: RoadSegment[] = []
  private segSpan = 0 // total z length covered by the pool

  // Shared scenery geometry/materials (created once, reused across segments).
  private readonly mats: {
    asphalt: MeshLambertMaterial
    dash: MeshBasicMaterial
    rail: MeshLambertMaterial
    railPost: MeshLambertMaterial
    wall: MeshLambertMaterial
    overpass: MeshLambertMaterial
    skyline: MeshBasicMaterial
    waterTowerBowl: MeshLambertMaterial
    waterTowerLeg: MeshLambertMaterial
    booth: MeshLambertMaterial
    gantry: MeshLambertMaterial
  }

  // Toll plaza (placed on demand, single instance reused).
  private tollPlaza: Group | null = null

  // Resize coalescing: resize() only flags; the GL reallocation (setSize +
  // setPixelRatio + projection) runs at most once per frame in update(), and
  // is skipped entirely when w/h/dpr are unchanged. This kills the hitching
  // during the iOS URL-bar dance, which fires resize/scroll in rapid bursts.
  private resizePending = true
  private appliedW = 0
  private appliedH = 0
  private appliedDpr = 0

  constructor() {
    const canvas = document.getElementById('game') as HTMLCanvasElement | null
    if (!canvas) throw new Error('SceneRig: #game canvas not found')

    // ── Renderer ──────────────────────────────────────────────────────────
    // MSAA is a real fill-rate cost; at dPR ≥ 2 the high-density buffer already
    // hides most aliasing on mid-range Android, so disable AA there and keep it
    // only on low-density (≤1.x) displays.
    const wantAA = (window.devicePixelRatio || 1) < 2
    this.renderer = new WebGLRenderer({ canvas, antialias: wantAA })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP))
    this.renderer.shadowMap.enabled = false // explicit: no real-time shadows
    this.renderer.setClearColor(ZENITH_COLOR, 1)

    // ── Scene + sky + fog ─────────────────────────────────────────────────
    this.scene = new Scene()
    this.scene.background = new Color(ZENITH_COLOR)
    // Fog fades scenery into the sunset horizon so the recycle pop is hidden.
    this.scene.fog = new Fog(PALETTE.sunsetOrange, FOG_NEAR, FOG_FAR)
    this.buildSky()

    // ── Lighting: one directional key + flat ambient (flat-shaded look) ───
    const key = new DirectionalLight(0xfff0e0, 1.05)
    key.position.set(-0.5, 1.0, 0.6) // low warm sunset key from the left
    this.scene.add(key)
    const ambient = new AmbientLight(0x9fb0c8, 0.85)
    this.scene.add(ambient)

    // ── Camera ────────────────────────────────────────────────────────────
    this.camera = new PerspectiveCamera(CAM_FOV, this.aspect(), 0.5, 1000)
    this.scene.add(this.camera)

    // ── Shared scenery materials ─────────────────────────────────────────
    this.mats = {
      asphalt: new MeshLambertMaterial({ color: PALETTE.asphalt }),
      dash: new MeshBasicMaterial({ color: PALETTE.marqueeGold }),
      rail: new MeshLambertMaterial({ color: PALETTE.dinerChrome }),
      railPost: new MeshLambertMaterial({ color: 0x55585f }),
      wall: new MeshLambertMaterial({ color: 0x3a3c52 }),
      overpass: new MeshLambertMaterial({ color: 0x4a4d60 }),
      skyline: new MeshBasicMaterial({ color: 0x2a2540, fog: false }),
      waterTowerBowl: new MeshLambertMaterial({ color: 0x6b6e7a }),
      waterTowerLeg: new MeshLambertMaterial({ color: 0x55585f }),
      booth: new MeshLambertMaterial({ color: PALETTE.dinerChrome }),
      gantry: new MeshLambertMaterial({ color: 0x53565f }),
    }

    // ── Distant static skyline silhouettes (do not recycle) ──────────────
    this.buildSkyline()

    // ── Road pool ─────────────────────────────────────────────────────────
    this.buildRoadPool()

    // Initial sizing (apply immediately so the first frame is correct).
    this.applyResize()
  }

  // ───────────────────────────────────────────────────────────────────────
  // Sky: big inverted sphere, vertex-tinted sunset→zenith, plus a horizon glow.
  // ───────────────────────────────────────────────────────────────────────
  private buildSky(): void {
    const geo = new SphereGeometry(SKY_RADIUS, 24, 16)
    const top = new Color(ZENITH_COLOR)
    const bottom = new Color(PALETTE.sunsetOrange)
    const mid = new Color(PALETTE.clubPurple) // purple band between orange & dark
    const pos = geo.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const c = new Color()
    for (let i = 0; i < pos.count; i++) {
      // y from -R..R → t 0 (horizon/below) .. 1 (zenith).
      const t = (pos.getY(i) / SKY_RADIUS) * 0.5 + 0.5
      if (t < 0.5) {
        c.copy(bottom).lerp(mid, Math.max(0, t) / 0.5)
      } else {
        c.copy(mid).lerp(top, (t - 0.5) / 0.5)
      }
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3))
    const mat = new MeshBasicMaterial({
      vertexColors: true,
      side: BackSide,
      fog: false,
      depthWrite: false,
    })
    const sky = new Mesh(geo, mat)
    sky.renderOrder = -1
    this.scene.add(sky)

    // Warm horizon glow disc sitting low on the forward horizon.
    const glowGeo = new SphereGeometry(HORIZON_GLOW_RADIUS, 16, 12)
    const glowMat = new MeshBasicMaterial({
      color: PALETTE.sunsetOrange,
      fog: false,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    })
    const glow = new Mesh(glowGeo, glowMat)
    glow.scale.set(28, 6, 1)
    glow.position.set(0, 2, -SKY_RADIUS * 0.6)
    glow.renderOrder = -1
    this.scene.add(glow)
  }

  // ───────────────────────────────────────────────────────────────────────
  // Distant gray-box skyline silhouettes on both flanks + a couple water towers.
  // Static (parented to camera-ish far field); fog disabled so they read as a
  // hazy horizon band. They sit far out in +X / -X and span the whole run in Z
  // by being very long, so we never need to recycle them.
  // ───────────────────────────────────────────────────────────────────────
  private buildSkyline(): void {
    const group = new Group()
    const rng = mulberry32(0x5eed)
    for (const side of [-1, 1] as const) {
      for (let i = 0; i < 14; i++) {
        const h = 8 + rng() * 30
        const w = 4 + rng() * 8
        const box = new Mesh(new BoxGeometry(w, h, w), this.mats.skyline)
        box.position.set(
          side * (SKYLINE_DIST + rng() * 40),
          h / 2,
          -(i * 70 + rng() * 40),
        )
        group.add(box)
      }
      // One water tower per side, parodically Jersey.
      const tower = this.buildWaterTower()
      tower.position.set(side * (SKYLINE_DIST * 0.7), 0, -(rng() * 300 + 120))
      group.add(tower)
    }
    this.scene.add(group)
  }

  private buildWaterTower(): Group {
    const g = new Group()
    const legH = 16
    const bowl = new Mesh(
      new SphereGeometry(6, 12, 10),
      this.mats.waterTowerBowl,
    )
    bowl.scale.set(1, 0.7, 1)
    bowl.position.y = legH + 3
    g.add(bowl)
    const roof = new Mesh(new BoxGeometry(8, 2, 8), this.mats.waterTowerBowl)
    roof.position.y = legH + 7
    g.add(roof)
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const leg = new Mesh(
          new BoxGeometry(0.6, legH, 0.6),
          this.mats.waterTowerLeg,
        )
        leg.position.set(sx * 3, legH / 2, sz * 3)
        g.add(leg)
      }
    }
    return g
  }

  // ───────────────────────────────────────────────────────────────────────
  // Road pool: ROAD_SEG_COUNT segments, each a full slab + dashes + rails +
  // sound walls + the occasional overpass arch. Recycled by leapfrogging.
  // Forward = -Z, so "ahead" is more negative z.
  // ───────────────────────────────────────────────────────────────────────
  private buildRoadPool(): void {
    this.segSpan = ROAD_SEG_LEN * ROAD_SEG_COUNT
    for (let i = 0; i < ROAD_SEG_COUNT; i++) {
      const group = this.buildRoadSegment(i)
      // Lay them out heading forward (-Z): segment i is centered at
      // -(i*LEN + LEN/2), so segment i spans [-(i+1)*LEN, -i*LEN].
      group.position.z = -(i * ROAD_SEG_LEN) - ROAD_SEG_LEN / 2
      this.scene.add(group)
      this.segments.push({ group })
    }
  }

  /** Build one road segment centered on local z=0, spanning ±ROAD_SEG_LEN/2. */
  private buildRoadSegment(index: number): Group {
    const g = new Group()
    const half = ROAD_SEG_LEN / 2

    // Asphalt slab.
    const slab = new Mesh(
      new PlaneGeometry(ROAD_HALF_W * 2, ROAD_SEG_LEN),
      this.mats.asphalt,
    )
    slab.rotation.x = -Math.PI / 2
    slab.position.y = 0
    g.add(slab)

    // Lane-dash stripes between the LANES lanes (4 interior lane lines).
    const dashGeo = new BoxGeometry(0.18, 0.02, DASH_LEN)
    for (let line = 1; line < LANES; line++) {
      const x = (laneX(line - 1) + laneX(line)) / 2
      for (let d = 0; d < DASH_PER_SEG; d++) {
        const dash = new Mesh(dashGeo, this.mats.dash)
        const z = -half + (DASH_LEN + DASH_GAP) * d + DASH_LEN / 2
        dash.position.set(x, 0.011, z)
        g.add(dash)
      }
    }

    // Guardrails both sides (a continuous rail beam + posts).
    for (const side of [-1, 1] as const) {
      const railX = side * (CORRIDOR_HALF_X + 1.2)
      const beam = new Mesh(
        new BoxGeometry(0.12, GUARDRAIL_H * 0.45, ROAD_SEG_LEN),
        this.mats.rail,
      )
      beam.position.set(railX, GUARDRAIL_Y, 0)
      g.add(beam)
      const postGeo = new BoxGeometry(0.18, GUARDRAIL_Y + 0.1, 0.18)
      const posts = Math.floor(ROAD_SEG_LEN / 8)
      for (let p = 0; p <= posts; p++) {
        const post = new Mesh(postGeo, this.mats.railPost)
        post.position.set(railX, (GUARDRAIL_Y + 0.1) / 2, -half + p * 8)
        g.add(post)
      }
    }

    // Sound-wall slabs on both flanks.
    const wallGeo = new BoxGeometry(0.4, SOUND_WALL_H, SOUND_WALL_GAP * 0.92)
    for (const side of [-1, 1] as const) {
      const walls = Math.floor(ROAD_SEG_LEN / SOUND_WALL_GAP)
      for (let w = 0; w < walls; w++) {
        const wall = new Mesh(wallGeo, this.mats.wall)
        const z = -half + SOUND_WALL_GAP * w + SOUND_WALL_GAP / 2
        wall.position.set(side * SOUND_WALL_X, SOUND_WALL_H / 2, z)
        g.add(wall)
      }
    }

    // Occasional overpass arch spanning the road near this segment's far edge.
    if (index % OVERPASS_EVERY_SEGS === 0) {
      const overpass = this.buildOverpass()
      overpass.position.set(0, 0, -half + 6)
      g.add(overpass)
    }

    return g
  }

  /** A simple gray-box overpass: two abutment piers + a deck beam over the road. */
  private buildOverpass(): Group {
    const g = new Group()
    const deckY = 8.5
    const span = ROAD_HALF_W * 2 + 6
    const deck = new Mesh(
      new BoxGeometry(span, 1.4, 5),
      this.mats.overpass,
    )
    deck.position.y = deckY
    g.add(deck)
    // Parapet lip.
    const parapet = new Mesh(new BoxGeometry(span, 0.8, 0.4), this.mats.overpass)
    parapet.position.set(0, deckY + 1.0, -2.5)
    g.add(parapet)
    for (const side of [-1, 1] as const) {
      const pier = new Mesh(
        new BoxGeometry(2, deckY, 4),
        this.mats.overpass,
      )
      pier.position.set(side * (ROAD_HALF_W + 1.5), deckY / 2, 0)
      g.add(pier)
    }
    return g
  }

  // ───────────────────────────────────────────────────────────────────────
  // Toll plaza gantry across all lanes at world z. Visual only — the stopped
  // cars are traffic's job. Posts + beam + booth boxes + dangling sign panels.
  // ───────────────────────────────────────────────────────────────────────
  placeTollPlaza(z: number): void {
    if (!this.tollPlaza) {
      this.tollPlaza = this.buildTollPlaza()
      this.scene.add(this.tollPlaza)
    }
    this.tollPlaza.position.z = z
    this.tollPlaza.visible = true
  }

  private buildTollPlaza(): Group {
    const g = new Group()
    const span = ROAD_HALF_W * 2 + 2
    const beamY = 6.5

    // Cross beam (the gantry) over all lanes.
    const beam = new Mesh(new BoxGeometry(span, 0.7, 0.7), this.mats.gantry)
    beam.position.y = beamY
    g.add(beam)

    // Two end posts.
    for (const side of [-1, 1] as const) {
      const post = new Mesh(
        new BoxGeometry(0.5, beamY, 0.5),
        this.mats.gantry,
      )
      post.position.set(side * (ROAD_HALF_W + 0.6), beamY / 2, 0)
      g.add(post)
    }

    // Booth boxes between the lanes + a hanging E-Z-tag-ish sign per lane.
    const signMat = new MeshBasicMaterial({ color: PALETTE.marqueeGold })
    for (let i = 0; i < LANES; i++) {
      const x = laneX(i)
      // Lane sign panel hanging off the beam.
      const sign = new Mesh(new BoxGeometry(LANE_WIDTH * 0.7, 1.1, 0.12), signMat)
      sign.position.set(x, beamY - 1.2, 0.1)
      g.add(sign)
      // Booth between lanes (skip the far edges where the posts live).
      if (i < LANES - 1) {
        const bx = (laneX(i) + laneX(i + 1)) / 2
        const booth = new Mesh(new BoxGeometry(0.8, 2.4, 2.2), this.mats.booth)
        booth.position.set(bx, 1.2, 0)
        g.add(booth)
        const roof = new Mesh(
          new BoxGeometry(1.4, 0.25, 2.8),
          this.mats.gantry,
        )
        roof.position.set(bx, 2.5, 0)
        g.add(roof)
      }
    }
    return g
  }

  // ───────────────────────────────────────────────────────────────────────
  // Follow camera. pos lags toward bird+(0,CAM_UP,CAM_BACK); look lags toward
  // a point CAM_LOOK_AHEAD_M ahead (-Z) dropped to altitude×CAM_LOOK_DOWN_FRAC,
  // so higher bands pitch the camera further down. Dive adds pitch + FOV kick.
  // ───────────────────────────────────────────────────────────────────────
  updateCamera(bird: BirdView, dt: number): void {
    const bpos = bird.pos

    // Desired camera position: behind (+Z) and above the bird.
    _desiredPos.set(bpos.x, bpos.y + CAM_UP, bpos.z + CAM_BACK)

    // Desired look target: ahead of the bird in -Z, dropped toward the ground
    // by the band-aware fraction so the road frames in the lower 2/3.
    const lookY = bpos.y * CAM_LOOK_DOWN_FRAC
    _lookTarget.set(bpos.x, lookY, bpos.z - CAM_LOOK_AHEAD_M)

    if (!this.camInitialized) {
      this.camPos.copy(_desiredPos)
      this.camLook.copy(_lookTarget)
      this.camInitialized = true
    } else {
      // Critically-damped exponential smoothing toward the targets.
      this.camPos.lerp(_desiredPos, smoothing(CAM_POS_LAG_S, dt))
      this.camLook.lerp(_lookTarget, smoothing(CAM_ROT_LAG_S, dt))
    }

    // Dive easing: rise toward 1 over CAM_FOV_DIVE_IN_S while diving, fall
    // toward 0 over CAM_FOV_DIVE_OUT_S otherwise.
    if (bird.diving) {
      this.diveT = approach(this.diveT, 1, dt / Math.max(CAM_FOV_DIVE_IN_S, 1e-4))
    } else {
      this.diveT = approach(this.diveT, 0, dt / Math.max(CAM_FOV_DIVE_OUT_S, 1e-4))
    }

    // FOV kick.
    const fov = CAM_FOV + (CAM_FOV_DIVE - CAM_FOV) * this.diveT
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }

    // Apply smoothed transform.
    this.camera.position.copy(this.camPos)
    this.camera.up.copy(_WORLD_UP)
    this.camera.lookAt(this.camLook)

    // Extra down-pitch during a dive (rotate about the camera's local X axis).
    if (this.diveT > 1e-3) {
      const extra = (CAM_DIVE_PITCH_DEG * Math.PI) / 180 * this.diveT
      this.camera.rotateX(-extra)
    }

    // Screen shake: small random offset in the camera's local plane. Live
    // amplitude = peak × remaining-time fraction (linear settle).
    if (this.shakeTimer > 0 && this.shakePeak > 0) {
      const amp = this.shakePeak * (this.shakeTimer / SHAKE_DECAY_S)
      // Map px → world units using FOV + a nominal viewport-height reference,
      // then jitter the camera in its own right/up basis so it reads as shake.
      const k =
        (amp / Math.max(window.innerHeight, 1)) *
        2 *
        Math.tan((this.camera.fov * Math.PI) / 360) *
        Math.max(CAM_BACK + CAM_UP, 1)
      // Derive the camera's right/up axes from its current orientation (set by
      // lookAt/rotateX above) — no stale matrix dependency.
      _camRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion)
      _camUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion)
      _shakeOffset
        .copy(_camRight)
        .multiplyScalar((Math.random() * 2 - 1) * k)
        .addScaledVector(_camUp, (Math.random() * 2 - 1) * k)
      this.camera.position.add(_shakeOffset)
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // addShake: clamp to SHAKE_MAX_PX; concurrent takes the MAX, not the sum;
  // refresh the decay window so the new impulse plays out fully.
  //
  // Canon note: GAME_DESIGN §12 specifies a single shake decay/cap of 160ms
  // (SHAKE_DECAY_S), which is the authoritative number used here for every
  // impulse. §7's per-event feel table lists shorter nominal HIT (90ms) /
  // BULLSEYE (140ms) rumbles, but those per-tier durations are not exposed in
  // constants.ts (the canon source), so they are intentionally simplified to
  // the one §12 decay value rather than inlined here. Peak amplitude is still
  // per-tier (SHAKE_HIT_PX / SHAKE_BULLSEYE_PX), so HIT vs BULLSEYE still read
  // distinctly.
  // ───────────────────────────────────────────────────────────────────────
  addShake(px: number): void {
    const clamped = Math.min(Math.abs(px), SHAKE_MAX_PX)
    if (clamped <= 0) return
    // Concurrent shakes take the MAX, not the sum. A new impulse that is at
    // least as strong as what's currently playing refreshes the decay window;
    // a weaker one only raises the floor and lets the bigger one finish.
    if (clamped >= this.currentShake()) this.shakeTimer = SHAKE_DECAY_S
    this.shakePeak = Math.max(this.shakePeak, clamped)
  }

  /** Live shake amplitude right now (peak scaled by remaining-time fraction). */
  private currentShake(): number {
    if (this.shakeTimer <= 0) return 0
    return this.shakePeak * (this.shakeTimer / SHAKE_DECAY_S)
  }

  // ───────────────────────────────────────────────────────────────────────
  // Recycle road/scenery around birdZ; decay shake. (Camera updated separately
  // by updateCamera so the look/lag math runs against the bird view.)
  // ───────────────────────────────────────────────────────────────────────
  update(dt: number, birdZ: number): void {
    // Apply any coalesced resize once, before we render this frame.
    if (this.resizePending) this.applyResize()

    // Shake decay: just advance the timer; live amplitude is derived from the
    // remaining-time fraction in updateCamera, so the jitter settles to zero.
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt
      if (this.shakeTimer <= 0) {
        this.shakeTimer = 0
        this.shakePeak = 0
      }
    }

    // Road recycle: keep segments straddling the bird. The pool covers segSpan
    // of z; we want roughly one segment behind the bird and the rest ahead.
    // Forward is -Z, so "ahead" = more negative. Leapfrog any segment that has
    // fallen too far BEHIND (its center z > birdZ + ROAD_SEG_LEN) to the far
    // forward end of the pool.
    const behindEdge = birdZ + ROAD_SEG_LEN // allow ~1 seg behind for the cam
    for (const seg of this.segments) {
      while (seg.group.position.z > behindEdge) {
        seg.group.position.z -= this.segSpan
      }
      // Also handle teleports/resets where the bird jumps far forward of the
      // pool: pull segments forward until they straddle again.
      while (seg.group.position.z < birdZ - this.segSpan + ROAD_SEG_LEN) {
        seg.group.position.z += this.segSpan
      }
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  // ───────────────────────────────────────────────────────────────────────
  // Resize: coalesced. Public resize() only flags; the GL reallocation runs at
  // most once per frame in update() and is a no-op when nothing changed. This
  // avoids hitching during the iOS URL-bar dance (rapid resize/scroll bursts).
  // ───────────────────────────────────────────────────────────────────────
  resize(): void {
    this.resizePending = true
  }

  /** Fit to visualViewport when available (URL-bar dance), cap dPR, recompute
   * aspect (vertical FOV constant; aspect updates framing). Skips the expensive
   * setSize/setPixelRatio/projection work when w/h/dpr are unchanged. */
  private applyResize(): void {
    this.resizePending = false
    const vv = window.visualViewport
    const w = Math.max(1, Math.floor(vv ? vv.width : window.innerWidth))
    const h = Math.max(1, Math.floor(vv ? vv.height : window.innerHeight))
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)
    if (w === this.appliedW && h === this.appliedH && dpr === this.appliedDpr) {
      return // nothing changed — don't reallocate the drawing buffer
    }
    this.appliedW = w
    this.appliedH = h
    this.appliedDpr = dpr
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private aspect(): number {
    const vv = window.visualViewport
    const w = vv ? vv.width : window.innerWidth
    const h = vv ? vv.height : window.innerHeight
    return Math.max(1, w) / Math.max(1, h)
  }
}

// ── Small math helpers (module-scope, no allocation) ─────────────────────────

/** Frame-rate-independent smoothing factor for `a.lerp(b, factor)` such that
 * the value covers ~63% of the remaining gap every `tau` seconds. */
function smoothing(tau: number, dt: number): number {
  if (tau <= 1e-5) return 1
  return 1 - Math.exp(-dt / tau)
}

/** Move `cur` toward `target` by up to `step` (clamped). */
function approach(cur: number, target: number, step: number): number {
  if (cur < target) return Math.min(cur + step, target)
  if (cur > target) return Math.max(cur - step, target)
  return target
}

/** Tiny deterministic PRNG for set-dressing placement (no per-frame use). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
