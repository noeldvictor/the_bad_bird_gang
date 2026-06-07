// ─────────────────────────────────────────────────────────────────────────────
// GameAudio — 100% synthesized Web Audio. Zero asset files.
// Implements IAudio (src/types.ts). The splat is the marquee sound; it layers
// per GAME_DESIGN.md §8 "Audio Direction": wet 'fwap' impact, high 'splort'
// tail, surface tag (glass tink / tin tonk), and a reward marimba pip.
//
// Design rules honored here:
//  - Lazy AudioContext, created/resumed in unlock(); call-safe many times.
//  - One master GainNode for setMuted().
//  - Every public method is a no-op until the context exists and is running.
//  - No lingering nodes: every source stops itself; gains disconnect onended.
//  - No per-call buffer allocation in hot paths — a single 1s noise buffer is
//    built once and reused for every noise-based layer.
//  - Small random playbackRate/detune (±5%) so no two splats are identical.
// ─────────────────────────────────────────────────────────────────────────────
import type { IAudio, SplatTier } from '../types'

// AudioContext (with webkit fallback) is created lazily so construction never
// touches the audio subsystem before a user gesture.
type AudioCtor = typeof AudioContext

/** Detune/rate jitter helper: returns a multiplier within ±frac of 1. */
function jitter(frac: number): number {
  return 1 + (Math.random() * 2 - 1) * frac
}

/** Master loudness trim so the synth sits at a comfortable level. */
const MASTER_GAIN = 0.7
/** Splat tier loudness scaling: GRAZE < HIT < BULLSEYE. */
const SPLAT_TIER_GAIN: Record<SplatTier, number> = {
  GRAZE: 0.45,
  HIT: 0.85,
  BULLSEYE: 1.0,
}
/** Length of the reusable white-noise buffer, in seconds. */
const NOISE_SECONDS = 1

export class GameAudio implements IAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  /** Reusable 1s mono white-noise buffer (built once, on first unlock). */
  private noiseBuf: AudioBuffer | null = null
  private muted = false

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Create/resume the AudioContext. Safe to call repeatedly and from any
   * user gesture; only the first call builds anything. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor: AudioCtor | undefined =
        typeof AudioContext !== 'undefined'
          ? AudioContext
          : (
              globalThis as unknown as {
                webkitAudioContext?: AudioCtor
              }
            ).webkitAudioContext
      if (!Ctor) return // no Web Audio support — stay a silent no-op forever
      try {
        this.ctx = new Ctor()
      } catch {
        this.ctx = null
        return
      }
      const master = this.ctx.createGain()
      master.gain.value = this.muted ? 0 : MASTER_GAIN
      master.connect(this.ctx.destination)
      this.master = master
      this.noiseBuf = this.buildNoise(this.ctx)
    }
    // Browsers start contexts 'suspended' until a gesture resumes them.
    if (this.ctx.state === 'suspended') {
      // resume() returns a promise; ignore rejection (e.g. no gesture yet).
      void this.ctx.resume().catch(() => {})
    }
  }

  setMuted(m: boolean): void {
    this.muted = m
    if (this.master && this.ctx) {
      // Brief ramp avoids a click when toggling.
      const now = this.ctx.currentTime
      const g = this.master.gain
      g.cancelScheduledValues(now)
      g.setValueAtTime(g.value, now)
      g.linearRampToValueAtTime(m ? 0 : MASTER_GAIN, now + 0.02)
    }
  }

  // ── Public one-shots ─────────────────────────────────────────────────────────

  splat(tier: SplatTier): void {
    const ctx = this.live()
    if (!ctx) return
    const now = ctx.currentTime
    const lvl = SPLAT_TIER_GAIN[tier]

    // (1) Impact 'fwap' — ~80ms of lowpass-filtered noise, pitched low, quick
    //     exponential decay. The wet body of the joke.
    this.noiseBurst(now, {
      duration: 0.08,
      type: 'lowpass',
      freq: 420 * jitter(0.05),
      q: 0.7,
      rate: jitter(0.05),
      gain: 0.9 * lvl,
      attack: 0.004,
    })

    // (2) 'splort' tail ~80ms later — shorter, higher-passed noise blip that
    //     sells the spread.
    this.noiseBurst(now + 0.08, {
      duration: 0.05,
      type: 'highpass',
      freq: 1500 * jitter(0.05),
      q: 0.9,
      rate: jitter(0.05),
      gain: 0.55 * lvl,
      attack: 0.002,
    })

    // (3) Surface tag — keyed to material. GRAZE skips this (thinner).
    if (tier === 'BULLSEYE') {
      // Glassy 'tink' — high sine ping, fast decay.
      this.ping(now + 0.07, {
        type: 'sine',
        freq: 2050 * jitter(0.04),
        duration: 0.09,
        gain: 0.5 * lvl,
      })
    } else if (tier === 'HIT') {
      // Tin 'tonk' — low triangle thunk.
      this.ping(now + 0.07, {
        type: 'triangle',
        freq: 300 * jitter(0.04),
        duration: 0.1,
        gain: 0.55 * lvl,
      })
    }

    // (4) Reward pip — 2-note marimba-ish sine pips on EVERY scored hit
    //     (all tiers are scored). Quieter for GRAZE.
    const pipGain = tier === 'GRAZE' ? 0.18 : 0.3
    this.ping(now + 0.12, {
      type: 'sine',
      freq: 880 * jitter(0.02),
      duration: 0.06,
      gain: pipGain,
    })
    this.ping(now + 0.18, {
      type: 'sine',
      freq: 1320 * jitter(0.02),
      duration: 0.06,
      gain: pipGain,
    })
  }

  honk(): void {
    const ctx = this.live()
    if (!ctx) return
    const now = ctx.currentTime
    // Random pick of 3 two-tone car-horn voicings (slightly different intervals
    // / lengths) so repeated honks feel like different cars.
    const voicings: { lo: number; hi: number; dur: number }[] = [
      { lo: 370, hi: 466, dur: 0.18 }, // classic minor-third dual horn
      { lo: 349, hi: 440, dur: 0.2 }, // a touch lower / longer
      { lo: 392, hi: 494, dur: 0.16 }, // brighter, shorter beep
    ]
    const v = voicings[(Math.random() * voicings.length) | 0]
    // Two detuned square voices per tone for a richer, buzzier horn.
    this.tone(now, {
      type: 'square',
      freq: v.lo * jitter(0.01),
      duration: v.dur,
      gain: 0.22,
      attack: 0.006,
      release: 0.04,
    })
    this.tone(now, {
      type: 'square',
      freq: v.hi * jitter(0.01),
      duration: v.dur,
      gain: 0.2,
      attack: 0.006,
      release: 0.04,
    })
  }

  comboDing(step: number): void {
    const ctx = this.live()
    if (!ctx) return
    const now = ctx.currentTime
    // Rising pitch ladder: 660 × 1.12^step. step is the multiplier tier (1..5).
    const s = Math.max(0, step)
    const freq = 660 * Math.pow(1.12, s)
    this.ping(now, { type: 'sine', freq, duration: 0.12, gain: 0.4 })
  }

  comboBreak(): void {
    const ctx = this.live()
    if (!ctx) return
    const now = ctx.currentTime
    // Descending sawtooth womp 220 → 110 Hz over 250ms.
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(220, now)
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.25)
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(0.32, now + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25)
    this.chain(osc, g, now, 0.26)
  }

  dryfire(): void {
    const ctx = this.live()
    if (!ctx) return
    const now = ctx.currentTime
    // Soft low thud — gut-rumble 70Hz sine, 120ms exp decay.
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(85, now)
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.12)
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(0.4, now + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
    this.chain(osc, g, now, 0.14)
    // Tiny dry click on top (very short highpassed noise) — the empty trigger.
    this.noiseBurst(now, {
      duration: 0.015,
      type: 'highpass',
      freq: 2600,
      q: 0.7,
      rate: 1,
      gain: 0.12,
      attack: 0.001,
    })
  }

  gulp(): void {
    const ctx = this.live()
    if (!ctx) return
    const now = ctx.currentTime
    // Cartoon swallow — quick down-up pitch blip 300 → 150 → 500 Hz, ~180ms.
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(300, now)
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.08)
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.18)
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(0.4, now + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
    this.chain(osc, g, now, 0.2)
  }

  jackpot(): void {
    const ctx = this.live()
    if (!ctx) return
    const now = ctx.currentTime
    // Ascending 3-note sting (gold!) — bright triangle notes, ~major triad.
    const notes = [659.25, 830.61, 1046.5] // E5, G#5, C6
    for (let i = 0; i < notes.length; i++) {
      this.ping(now + i * 0.07, {
        type: 'triangle',
        freq: notes[i],
        duration: 0.14,
        gain: 0.34,
      })
    }
    // Layer a celebratory honk under it.
    this.honk()
  }

  star(): void {
    const ctx = this.live()
    if (!ctx) return
    const now = ctx.currentTime
    // Bright 2-note chime — sparkly sine, rising fifth.
    this.ping(now, { type: 'sine', freq: 1318.5, duration: 0.13, gain: 0.32 })
    this.ping(now + 0.08, {
      type: 'sine',
      freq: 1975.5,
      duration: 0.18,
      gain: 0.3,
    })
  }

  whoosh(): void {
    const ctx = this.live()
    if (!ctx) return
    const now = ctx.currentTime
    // Drop release — bandpassed noise swell ~200ms, falling center pitch
    // (doppler-ish). Single noise source through a swept bandpass + gain swell.
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    src.playbackRate.value = jitter(0.05)

    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 1.2
    bp.frequency.setValueAtTime(1800 * jitter(0.05), now)
    bp.frequency.exponentialRampToValueAtTime(450, now + 0.2)

    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(0.28, now + 0.06)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2)

    src.connect(bp)
    bp.connect(g)
    g.connect(this.master as GainNode)
    src.start(now)
    this.armStop(src, [bp, g], now, 0.22)
  }

  plip(): void {
    const ctx = this.live()
    if (!ctx) return
    const now = ctx.currentTime
    // Road miss — tiny single droplet pip, quiet. Fast high sine with a quick
    // downward bend for the "drip" feel.
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1400 * jitter(0.05), now)
    osc.frequency.exponentialRampToValueAtTime(700, now + 0.05)
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(0.14, now + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06)
    this.chain(osc, g, now, 0.07)
  }

  uiTap(): void {
    const ctx = this.live()
    if (!ctx) return
    const now = ctx.currentTime
    // 30ms tick — short, dry square blip.
    this.tone(now, {
      type: 'square',
      freq: 880,
      duration: 0.03,
      gain: 0.16,
      attack: 0.001,
      release: 0.012,
    })
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /** Returns the context iff it exists, is running, and master is wired —
   * otherwise null, so every public method degrades to a clean no-op. */
  private live(): AudioContext | null {
    const ctx = this.ctx
    if (!ctx || !this.master) return null
    if (ctx.state !== 'running') return null
    return ctx
  }

  /** Build a 1s mono white-noise buffer (reused by every noise layer). */
  private buildNoise(ctx: AudioContext): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * NOISE_SECONDS)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    return buf
  }

  /**
   * A filtered noise burst with an exponential-decay envelope. Reads from the
   * shared noise buffer at a random offset so successive bursts differ.
   */
  private noiseBurst(
    start: number,
    opt: {
      duration: number
      type: BiquadFilterType
      freq: number
      q: number
      rate: number
      gain: number
      attack: number
    },
  ): void {
    const ctx = this.ctx as AudioContext
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.playbackRate.value = opt.rate
    // Random start offset within the 1s buffer (leave room for the burst).
    const maxOff = NOISE_SECONDS - opt.duration * opt.rate - 0.01
    src.loop = false

    const filt = ctx.createBiquadFilter()
    filt.type = opt.type
    filt.frequency.value = opt.freq
    filt.Q.value = opt.q

    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, start)
    g.gain.exponentialRampToValueAtTime(opt.gain, start + opt.attack)
    g.gain.exponentialRampToValueAtTime(0.0001, start + opt.duration)

    src.connect(filt)
    filt.connect(g)
    g.connect(this.master as GainNode)

    const offset = maxOff > 0 ? Math.random() * maxOff : 0
    src.start(start, offset, opt.duration + 0.02)
    this.armStop(src, [filt, g], start, opt.duration + 0.03)
  }

  /**
   * A pure-tone "ping" with a percussive exp-decay envelope (marimba/chime/
   * tink/tonk). Frequency is constant for the body of the note.
   */
  private ping(
    start: number,
    opt: { type: OscillatorType; freq: number; duration: number; gain: number },
  ): void {
    const ctx = this.ctx as AudioContext
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = opt.type
    osc.frequency.setValueAtTime(opt.freq, start)
    g.gain.setValueAtTime(0.0001, start)
    g.gain.exponentialRampToValueAtTime(opt.gain, start + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, start + opt.duration)
    this.chain(osc, g, start, opt.duration + 0.02)
  }

  /**
   * A sustained tone with linear attack/release (horns, ticks). Flat body, soft
   * edges so there's no click.
   */
  private tone(
    start: number,
    opt: {
      type: OscillatorType
      freq: number
      duration: number
      gain: number
      attack: number
      release: number
    },
  ): void {
    const ctx = this.ctx as AudioContext
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = opt.type
    osc.frequency.setValueAtTime(opt.freq, start)
    const end = start + opt.duration
    g.gain.setValueAtTime(0.0001, start)
    g.gain.linearRampToValueAtTime(opt.gain, start + opt.attack)
    g.gain.setValueAtTime(opt.gain, Math.max(start + opt.attack, end - opt.release))
    g.gain.linearRampToValueAtTime(0.0001, end)
    this.chain(osc, g, start, opt.duration + 0.01)
  }

  /** Wire osc → gain → master, start at `start`, and schedule a clean stop. */
  private chain(osc: OscillatorNode, g: GainNode, start: number, stopAfter: number): void {
    osc.connect(g)
    g.connect(this.master as GainNode)
    this.armStop(osc, [g], start, stopAfter)
  }

  /**
   * Stop a source at start+stopAfter and disconnect its whole chain onended so
   * no node lingers. Works for OscillatorNode and AudioBufferSourceNode.
   */
  private armStop(
    src: OscillatorNode | AudioBufferSourceNode,
    tail: AudioNode[],
    start: number,
    stopAfter: number,
  ): void {
    // For oscillators that were not explicitly started elsewhere, start now.
    if (src instanceof OscillatorNode) src.start(start)
    src.stop(start + stopAfter)
    src.onended = () => {
      try {
        src.disconnect()
      } catch {
        /* already disconnected */
      }
      for (const n of tail) {
        try {
          n.disconnect()
        } catch {
          /* already disconnected */
        }
      }
    }
  }
}
