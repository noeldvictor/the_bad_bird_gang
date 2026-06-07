// ─────────────────────────────────────────────────────────────────────────────
// Stars — the three Ch1 objectives (GAME_DESIGN §4 Turnpike):
//   splat5    "Splat 5 cars"          — 5 distinct HIT-or-better splats
//   doubletap "Double-tap one car"    — any single car splatted twice
//   tolltag   "Tag the toll-tag minivan" — a splat on a tolltag special
// Subscribes to 'splat', emits 'star' once per objective. main.ts handles the
// audio.star + hud.setStars + popup reactions.
// ─────────────────────────────────────────────────────────────────────────────
import type { EventBus } from '../events'
import type { IStars, LevelDef, SplatEvent, StarDef } from '../types'

const SPLAT5_TARGET = 5
const DOUBLETAP_TARGET = 2

export class Stars implements IStars {
  private readonly defs: [StarDef, StarDef, StarDef]
  private readonly _earned: [boolean, boolean, boolean] = [false, false, false]

  // splat5: count distinct cars that have taken a HIT-or-better splat.
  private readonly splat5Cars = new Set<number>()
  // doubletap: per-car HIT-or-better splat count, and the running best.
  private readonly doubleTapCounts = new Map<number, number>()
  private doubleTapBest = 0
  // tolltag: whether a tolltag car has been tagged.
  private tollTagged = false

  constructor(level: LevelDef, bus: EventBus) {
    this.defs = level.stars
    bus.on('splat', (e) => this.onSplat(e, bus))
  }

  get earned(): [boolean, boolean, boolean] {
    return this._earned
  }

  get progressText(): [string, string, string] {
    return [
      this.textFor(0),
      this.textFor(1),
      this.textFor(2),
    ]
  }

  private onSplat(e: SplatEvent, bus: EventBus): void {
    // GRAZEs never count toward a star objective — HIT or better only.
    if (e.tier === 'GRAZE') return

    // Update each objective's tracking. The objective an index serves is read
    // from the level's StarDef id, so the indices always line up with the HUD.
    this.splat5Cars.add(e.carId)

    const prev = this.doubleTapCounts.get(e.carId) ?? 0
    const next = prev + 1
    this.doubleTapCounts.set(e.carId, next)
    if (next > this.doubleTapBest) this.doubleTapBest = next

    if (e.special === 'tolltag') this.tollTagged = true

    // Award any objective whose condition is now met (each fires once).
    for (let i = 0; i < this.defs.length; i++) {
      if (this._earned[i]) continue
      if (this.isMet(this.defs[i].id)) {
        this._earned[i] = true
        bus.emit('star', { index: i as 0 | 1 | 2, label: this.defs[i].label })
      }
    }
  }

  private isMet(id: StarDef['id']): boolean {
    switch (id) {
      case 'splat5':
        return this.splat5Cars.size >= SPLAT5_TARGET
      case 'doubletap':
        return this.doubleTapBest >= DOUBLETAP_TARGET
      case 'tolltag':
        return this.tollTagged
    }
  }

  private textFor(i: number): string {
    const def = this.defs[i]
    switch (def.id) {
      case 'splat5':
        return `Splat 5 cars — ${Math.min(this.splat5Cars.size, SPLAT5_TARGET)}/${SPLAT5_TARGET}`
      case 'doubletap':
        return `Double-tap one car — best ${Math.min(this.doubleTapBest, DOUBLETAP_TARGET)}/${DOUBLETAP_TARGET}`
      case 'tolltag':
        return `Tag the toll-tag minivan — ${this.tollTagged ? '✓' : '✗'}/✓`
    }
  }

  reset(): void {
    this._earned[0] = false
    this._earned[1] = false
    this._earned[2] = false
    this.splat5Cars.clear()
    this.doubleTapCounts.clear()
    this.doubleTapBest = 0
    this.tollTagged = false
  }
}
