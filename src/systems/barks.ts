// ─────────────────────────────────────────────────────────────────────────────
// Barks — the driver speech-bubble line picker (GAME_DESIGN §8 bark list).
// Gated to at most one bark per BARK_GATE_S so they stay funny. GRAZE never
// barks. Special targets bias toward themed lines; otherwise we pick a fresh
// line avoiding the last 5 used. main.ts projects the returned string as a
// hud.bark() bubble.
// ─────────────────────────────────────────────────────────────────────────────
import { BARK_GATE_S } from '../constants'
import type { IBarks, SplatEvent } from '../types'

// Line flavor tags so special splats can bias toward the right line. Plain
// numeric-literal union (no const enum — keeps esbuild/isolatedModules happy).
type Tag = 0 | 1 | 2 | 3
const PLAIN: Tag = 0
const LOUD: Tag = 1 // good for a BULLSEYE freak-out
const CARWASH: Tag = 2 // freshly-detailed / car-wash lines → jackpot preference
const TOLLTAG: Tag = 3 // the toll-tag replacement line → tolltag preference

interface BarkLine {
  text: string
  tags: Tag[]
}

const LINES: ReadonlyArray<BarkLine> = [
  { text: 'HEY. I just got this DETAILED.', tags: [CARWASH, LOUD] },
  { text: "Madon'. On the LEASE?!", tags: [LOUD] },
  { text: 'Of course. Of COURSE.', tags: [PLAIN] },
  { text: 'I’m calling my guy. I HAVE a guy.', tags: [PLAIN] },
  { text: 'I just got off the Parkway for THIS?', tags: [LOUD] },
  { text: 'Kids, don’t look up.', tags: [PLAIN] },
  { text: 'We do NOT have time for this.', tags: [LOUD] },
  {
    text: 'There are wipes in the glovebox. There are always wipes.',
    tags: [PLAIN],
  },
  { text: 'Bro. BRO. Not the new lift.', tags: [LOUD] },
  { text: 'Forty years I park here. Forty years.', tags: [PLAIN] },
  { text: 'Back in my day birds had RESPECT.', tags: [LOUD] },
  { text: 'This is why I take the Parkway.', tags: [PLAIN] },
  { text: 'You know how much that toll-tag replacement is?', tags: [TOLLTAG] },
  { text: 'I’m posting this in the town Facebook group.', tags: [PLAIN] },
  { text: 'I literally just left the car wash on 22.', tags: [CARWASH] },
  { text: 'Sunroof was a MISTAKE.', tags: [PLAIN] },
  { text: 'Welcome to Jersey, ya little—', tags: [LOUD] },
]

const RECENT_MEMORY = 5

export class Barks implements IBarks {
  // Counts down to the next allowed bark; <= 0 means a bark may fire.
  private gateTimer = 0
  // Indices of the last few lines used, to avoid immediate repeats.
  private readonly recent: number[] = []

  onSplat(e: SplatEvent): string | null {
    // GRAZE never warrants a bark.
    if (e.tier === 'GRAZE') return null
    // Gated — too soon since the last bark.
    if (this.gateTimer > 0) return null

    const index = this.pick(e)
    if (index < 0) return null

    // Remember it, arm the gate, and return the line.
    this.recent.push(index)
    if (this.recent.length > RECENT_MEMORY) this.recent.shift()
    this.gateTimer = BARK_GATE_S
    return LINES[index].text
  }

  /** Choose a line index for this splat, biased by special/tier, avoiding the
   * last few used. Returns the chosen index (always >= 0). */
  private pick(e: SplatEvent): number {
    // Build the preferred tag pool, most specific first.
    let preferred: Tag | null = null
    if (e.special === 'jackpot') preferred = CARWASH
    else if (e.special === 'tolltag') preferred = TOLLTAG
    else if (e.tier === 'BULLSEYE') preferred = LOUD

    // First try: lines matching the preferred tag and not recently used.
    if (preferred !== null) {
      const fresh = this.collect((l) => l.tags.includes(preferred!), true)
      if (fresh.length) return this.choose(fresh)
      // Allow a repeat if every themed line is recent (small pool, e.g. tolltag).
      const themed = this.collect((l) => l.tags.includes(preferred!), false)
      if (themed.length) return this.choose(themed)
    }

    // General case: any non-recent line.
    const fresh = this.collect(() => true, true)
    if (fresh.length) return this.choose(fresh)

    // Everything is recent (memory bigger than non-recent pool) — pick any.
    return this.choose(this.collect(() => true, false))
  }

  /** Indices of lines passing `pred`. When `excludeRecent`, drop recently-used. */
  private collect(
    pred: (l: BarkLine) => boolean,
    excludeRecent: boolean,
  ): number[] {
    const out: number[] = []
    for (let i = 0; i < LINES.length; i++) {
      if (!pred(LINES[i])) continue
      if (excludeRecent && this.recent.includes(i)) continue
      out.push(i)
    }
    return out
  }

  /** Uniform-random pick from a non-empty candidate list. */
  private choose(candidates: number[]): number {
    return candidates[(Math.random() * candidates.length) | 0]
  }

  update(dt: number): void {
    if (this.gateTimer > 0) this.gateTimer -= dt
  }
}
