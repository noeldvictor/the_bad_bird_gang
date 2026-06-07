// ─────────────────────────────────────────────────────────────────────────────
// Title — the cold-open screen (GAME_DESIGN.md §1 tone, §8 writing bible).
// Builds its children inside #title-screen. show(best) resolves the instant the
// player taps TAP TO FLY — that gesture is what the integrator uses to unlock
// the AudioContext, so the resolve happens synchronously inside the listener.
// ─────────────────────────────────────────────────────────────────────────────
import type { ITitle } from '../types'

const TAGLINE = "They were here first. They're still mad."
const CHAPTER_LINE = 'Exit 9: The Turnpike'
const DESKTOP_HINT = 'Desktop: ← → steer · ↑ ↓ band · Space drop · E eat'

export class Title implements ITitle {
  private readonly root: HTMLElement
  private readonly bestEl: HTMLElement
  private readonly btn: HTMLButtonElement
  /** Cleanup for the live one-time tap listener (set during show()). */
  private detach: (() => void) | null = null

  constructor() {
    const root = document.getElementById('title-screen')
    if (!root) throw new Error('Title: missing #title-screen in DOM')
    this.root = root
    this.root.innerHTML = ''

    // Goldfinch icon (the public/icon.svg — fine as an <img> on a DOM screen;
    // it's only canvas draws that can't use it before load, which is the Splat
    // Report's concern, not ours).
    const icon = document.createElement('img')
    icon.src = './icon.svg'
    icon.alt = ''
    icon.width = 96
    icon.height = 96
    icon.style.width = '96px'
    icon.style.height = '96px'
    icon.style.borderRadius = '20px'
    icon.style.marginBottom = '4px'
    icon.setAttribute('draggable', 'false')

    const title = document.createElement('div')
    title.className = 'screen-title'
    title.textContent = 'THE BAD BIRDS'

    const sub = document.createElement('div')
    sub.className = 'screen-sub'
    sub.textContent = 'Birds of New Jersey'

    const tagline = document.createElement('div')
    tagline.className = 'screen-sub'
    tagline.textContent = TAGLINE

    // Best-score line — populated/shown in show() when best > 0.
    this.bestEl = document.createElement('div')
    this.bestEl.className = 'screen-sub'
    this.bestEl.style.color = 'var(--gold)'
    this.bestEl.style.fontStyle = 'normal'
    this.bestEl.style.fontWeight = '800'
    this.bestEl.style.opacity = '1'
    this.bestEl.classList.add('hidden')

    const chapter = document.createElement('div')
    chapter.className = 'screen-sub'
    chapter.style.marginTop = '6px'
    chapter.style.textTransform = 'uppercase'
    chapter.style.letterSpacing = '2px'
    chapter.style.fontStyle = 'normal'
    chapter.style.fontWeight = '700'
    chapter.textContent = CHAPTER_LINE

    this.btn = document.createElement('button')
    this.btn.type = 'button'
    this.btn.className = 'big-btn'
    this.btn.textContent = 'TAP TO FLY'

    const hint = document.createElement('div')
    hint.className = 'screen-sub'
    hint.style.marginTop = '8px'
    hint.style.fontSize = '11px'
    hint.style.fontStyle = 'normal'
    hint.style.opacity = '0.5'
    hint.textContent = DESKTOP_HINT

    this.root.append(icon, title, sub, tagline, this.bestEl, chapter, this.btn, hint)
  }

  show(best: number): Promise<void> {
    this.root.classList.remove('hidden')

    if (best > 0) {
      this.bestEl.textContent = `BEST  ${best.toLocaleString('en-US')}`
      this.bestEl.classList.remove('hidden')
    } else {
      this.bestEl.classList.add('hidden')
    }

    return new Promise<void>((resolve) => {
      let done = false
      const onStart = (e: Event) => {
        if (done) return
        done = true
        e.preventDefault()
        this.teardownListener()
        // Resolve synchronously inside the gesture so the integrator can unlock
        // audio on this same user-activation tick.
        resolve()
      }
      // pointerdown fires earliest within the gesture; keyboard Enter/Space as a
      // desktop fallback so the title is reachable without a touchscreen.
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') onStart(e)
      }
      this.btn.addEventListener('pointerdown', onStart)
      this.btn.addEventListener('keydown', onKey)
      this.detach = () => {
        this.btn.removeEventListener('pointerdown', onStart)
        this.btn.removeEventListener('keydown', onKey)
      }
    })
  }

  hide(): void {
    this.teardownListener()
    this.root.classList.add('hidden')
  }

  private teardownListener(): void {
    if (this.detach) {
      this.detach()
      this.detach = null
    }
  }
}
