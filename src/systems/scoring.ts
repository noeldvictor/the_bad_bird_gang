// ─────────────────────────────────────────────────────────────────────────────
// Scoring — combo ladder + 3s no-miss grace, GAME_DESIGN §2 (canon).
// Subscribes to the bus ('drop' / 'splat' / 'miss' / 'dryfire'), banks score,
// and re-emits 'combo' and 'score'. main.ts owns audio/HUD reactions.
// ─────────────────────────────────────────────────────────────────────────────
import {
  BULLSEYE_COMBO_ADVANCE,
  COMBO_GRACE_S,
  COMBO_LADDER,
  DIVE_SCORE_BONUS,
  TIER_MULT,
} from '../constants'
import type { EventBus } from '../events'
import type { IScoring, RunStats, SplatEvent } from '../types'

/** Fresh, fully-zeroed stats block (one source of truth for reset()). */
function emptyStats(): RunStats {
  return {
    drops: 0,
    scoredDrops: 0,
    hits: 0,
    bullseyes: 0,
    grazes: 0,
    honks: 0,
    longestDropM: 0,
    jackpots: 0,
    bestCombo: 0,
  }
}

/** Multiplier for a given combo count from the canon ladder (1 below step 1,
 * 5 at the cap). */
function multiplierFor(comboCount: number): number {
  let mult = 1
  for (const [count, m] of COMBO_LADDER) {
    if (comboCount >= count) mult = m
    else break
  }
  return mult
}

export class Scoring implements IScoring {
  private _score = 0
  private _comboCount = 0
  private _multiplier = 1
  private _stats: RunStats = emptyStats()

  // Grace state: a single whiff is forgiven PER COMBO if the next drop connects
  // within COMBO_GRACE_S. While a whiff is pending the combo is NOT yet broken.
  // `whiffUsed` latches once the one forgiveness has been spent and only clears
  // when the combo breaks (breakCombo)/reset — so a second whiff in the SAME
  // combo breaks it, even if a connect happened in between (canon §2/§12: one
  // whiff forgiven per combo, not one between any two connects).
  private whiffPending = false
  private whiffUsed = false
  private graceTimer = 0

  constructor(private readonly bus: EventBus) {
    bus.on('drop', () => this.onDrop())
    bus.on('splat', (e) => this.onSplat(e))
    bus.on('miss', () => this.onMiss())
    bus.on('dryfire', () => this.onDryfire())
  }

  get score(): number {
    return this._score
  }
  get comboCount(): number {
    return this._comboCount
  }
  get multiplier(): number {
    return this._multiplier
  }
  get stats(): RunStats {
    return this._stats
  }

  // ── Bus handlers ────────────────────────────────────────────────────────────

  private onDrop(): void {
    // A real payload left the bird. Counts toward the drops denominator that
    // loaf-efficiency (scoredDrops / drops) divides by.
    this._stats.drops++
  }

  private onSplat(e: SplatEvent): void {
    const s = this._stats
    s.scoredDrops++

    // Tier counters.
    if (e.tier === 'GRAZE') {
      s.grazes++
    } else {
      // HIT or BULLSEYE both count as a "hit"; a BULLSEYE is also a bullseye.
      s.hits++
      if (e.tier === 'BULLSEYE') s.bullseyes++
      // Every non-GRAZE splat makes the driver honk.
      s.honks++
    }

    if (e.special === 'jackpot') s.jackpots++
    if (e.dropDistanceM > s.longestDropM) s.longestDropM = e.dropDistanceM

    // A connecting splat closes a pending grace window (the whiff was forgiven).
    // `whiffUsed` stays latched so the next whiff in this same combo is NOT
    // forgiven a second time — one whiff per combo.
    if (this.whiffPending) {
      this.whiffPending = false
      this.graceTimer = 0
    }

    // Combo advance. GRAZE saves the chain but does not advance the multiplier.
    const prevCount = this._comboCount
    const prevMult = this._multiplier
    if (e.tier === 'HIT') {
      this._comboCount += 1
    } else if (e.tier === 'BULLSEYE') {
      this._comboCount += BULLSEYE_COMBO_ADVANCE
    }
    this._multiplier = multiplierFor(this._comboCount)
    if (this._comboCount > s.bestCombo) s.bestCombo = this._comboCount

    // Score: base × tier × combo multiplier × dive bonus, rounded.
    const amount = Math.round(
      e.basePoints *
        TIER_MULT[e.tier] *
        this._multiplier *
        (e.dive ? DIVE_SCORE_BONUS : 1),
    )
    this._score += amount

    // Pick the single most exciting tag applicable.
    let tag = ''
    if (e.special === 'jackpot') tag = 'JACKPOT!'
    else if (e.tier === 'BULLSEYE') tag = 'BULLSEYE!'
    else if (e.dive) tag = 'DIVE 1.5x'

    this.bus.emit('score', {
      amount,
      total: this._score,
      tag,
      at: e.impact,
    })

    // Notify on any change to the combo count or multiplier.
    if (this._comboCount !== prevCount || this._multiplier !== prevMult) {
      this.bus.emit('combo', {
        count: this._comboCount,
        multiplier: this._multiplier,
        broke: false,
      })
    }
  }

  private onMiss(): void {
    // A true miss landed on bare road.
    if (this._comboCount === 0) {
      // No combo to protect — nothing happens.
      return
    }
    if (!this.whiffPending && !this.whiffUsed) {
      // First whiff of this combo: spend the one forgiveness, open the grace
      // window, combo NOT yet broken.
      this.whiffPending = true
      this.whiffUsed = true
      this.graceTimer = COMBO_GRACE_S
      return
    }
    // A second whiff in this combo (one already forgiven or still pending):
    // the combo breaks now.
    this.breakCombo()
  }

  private onDryfire(): void {
    // Dry-fire launches nothing (no 'drop' was emitted, so drops did not tick),
    // and it breaks the combo immediately with no grace.
    if (this._comboCount === 0 && this._multiplier === 1 && !this.whiffPending) {
      return
    }
    this.breakCombo()
  }

  /** Reset combo state to zero and announce the break. The per-combo whiff
   * forgiveness resets here so the next combo starts with its one grace. */
  private breakCombo(): void {
    this.whiffPending = false
    this.whiffUsed = false
    this.graceTimer = 0
    this._comboCount = 0
    this._multiplier = 1
    this.bus.emit('combo', { count: 0, multiplier: 1, broke: true })
  }

  // ── Tick / reset ─────────────────────────────────────────────────────────────

  update(dt: number): void {
    if (!this.whiffPending) return
    this.graceTimer -= dt
    if (this.graceTimer <= 0) {
      // The grace window expired without a connecting drop — combo breaks.
      this.breakCombo()
    }
  }

  reset(): void {
    this._score = 0
    this._comboCount = 0
    this._multiplier = 1
    this._stats = emptyStats()
    this.whiffPending = false
    this.whiffUsed = false
    this.graceTimer = 0
  }
}
