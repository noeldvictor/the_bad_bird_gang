// ─────────────────────────────────────────────────────────────────────────────
// Results — the post-run screen (GAME_DESIGN.md §7 resolve beat, §10 Splat
// Report). Builds its children inside #results-screen. show() wires RETRY and
// SHARE to the integrator's callbacks; the screen is rebuilt-in-place each show
// so a RETRY → new run → results cycle never leaks listeners.
// ─────────────────────────────────────────────────────────────────────────────
import type { IResults, RunSummary } from '../types'

// Verdict rotates by score band — deadpan, escalating (writing bible §8).
const VERDICTS: ReadonlyArray<readonly [number, string]> = [
  [0, 'The Goldfinch tried. The Goldfinch is twelve grams.'],
  [1500, 'Exit 9 has seen things.'],
  [4000, 'Audit the parking lot. It’s gone.'],
  [8000, 'The Parkway will remember you.'],
  [14000, 'They’re renaming a rest stop after you. Out of fear.'],
]

function verdictFor(score: number): string {
  let pick = VERDICTS[0][1]
  for (const [floor, text] of VERDICTS) {
    if (score >= floor) pick = text
  }
  return pick
}

export class Results implements IResults {
  private readonly root: HTMLElement
  private readonly titleEl: HTMLElement
  private readonly scoreEl: HTMLElement
  private readonly badgeEl: HTMLElement
  private readonly starsRow: HTMLElement
  private readonly statsBox: HTMLElement
  private readonly verdictEl: HTMLElement
  private readonly retryBtn: HTMLButtonElement
  private readonly shareBtn: HTMLButtonElement

  /** Current bound handlers, detached/rebound on every show(). */
  private onRetryHandler: (() => void) | null = null
  private onShareHandler: (() => void) | null = null

  constructor() {
    const root = document.getElementById('results-screen')
    if (!root) throw new Error('Results: missing #results-screen in DOM')
    this.root = root
    this.root.innerHTML = ''

    this.titleEl = document.createElement('div')
    this.titleEl.className = 'screen-title'
    this.titleEl.textContent = 'RUN COMPLETE'

    this.scoreEl = document.createElement('div')
    this.scoreEl.style.fontSize = '52px'
    this.scoreEl.style.fontWeight = '900'
    this.scoreEl.style.color = 'var(--gold)'
    this.scoreEl.style.lineHeight = '1'
    this.scoreEl.style.fontVariantNumeric = 'tabular-nums'
    this.scoreEl.textContent = '0'

    this.badgeEl = document.createElement('div')
    this.badgeEl.textContent = 'NEW BEST!'
    this.badgeEl.style.fontSize = '15px'
    this.badgeEl.style.fontWeight = '900'
    this.badgeEl.style.letterSpacing = '2px'
    this.badgeEl.style.color = 'var(--asphalt)'
    this.badgeEl.style.background = 'var(--sunset)'
    this.badgeEl.style.padding = '3px 12px'
    this.badgeEl.style.borderRadius = '999px'
    this.badgeEl.classList.add('hidden')

    this.starsRow = document.createElement('div')
    this.starsRow.style.display = 'flex'
    this.starsRow.style.flexDirection = 'column'
    this.starsRow.style.gap = '4px'
    this.starsRow.style.width = 'min(320px, 80vw)'
    this.starsRow.style.margin = '6px 0'

    this.statsBox = document.createElement('div')
    this.statsBox.style.display = 'flex'
    this.statsBox.style.flexDirection = 'column'
    this.statsBox.style.gap = '5px'
    this.statsBox.style.width = 'min(320px, 80vw)'

    this.verdictEl = document.createElement('div')
    this.verdictEl.className = 'screen-sub'
    this.verdictEl.style.marginTop = '4px'
    this.verdictEl.style.maxWidth = 'min(320px, 84vw)'

    this.retryBtn = document.createElement('button')
    this.retryBtn.type = 'button'
    this.retryBtn.className = 'big-btn'
    this.retryBtn.textContent = 'RETRY'

    this.shareBtn = document.createElement('button')
    this.shareBtn.type = 'button'
    this.shareBtn.className = 'big-btn secondary'
    this.shareBtn.textContent = 'SHARE SPLAT REPORT'

    this.root.append(
      this.titleEl,
      this.scoreEl,
      this.badgeEl,
      this.starsRow,
      this.statsBox,
      this.verdictEl,
      this.retryBtn,
      this.shareBtn,
    )
  }

  show(summary: RunSummary, onRetry: () => void, onShare: () => void): void {
    this.scoreEl.textContent = summary.score.toLocaleString('en-US')
    this.badgeEl.classList.toggle('hidden', !summary.newBest)

    this.renderStars(summary)
    this.renderStats(summary)
    this.verdictEl.textContent = verdictFor(summary.score)

    this.bindButtons(onRetry, onShare)
    this.root.classList.remove('hidden')
  }

  hide(): void {
    this.root.classList.add('hidden')
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private renderStars(summary: RunSummary): void {
    this.starsRow.innerHTML = ''
    for (let i = 0; i < 3; i++) {
      const earned = summary.stars[i]
      const row = document.createElement('div')
      row.style.display = 'flex'
      row.style.alignItems = 'center'
      row.style.gap = '8px'
      row.style.fontSize = '14px'
      row.style.fontWeight = '700'

      const star = document.createElement('span')
      star.textContent = earned ? '★' : '☆'
      star.style.fontSize = '20px'
      star.style.color = earned ? 'var(--gold)' : '#555'

      const label = document.createElement('span')
      label.textContent = summary.starLabels[i]
      label.style.color = earned ? 'var(--chrome)' : '#777'
      if (!earned) label.style.opacity = '0.8'

      row.append(star, label)
      this.starsRow.appendChild(row)
    }
  }

  private renderStats(summary: RunSummary): void {
    this.statsBox.innerHTML = ''
    const rows: Array<[string, string]> = [
      ['Direct Hits', String(summary.hits)],
      ['Bullseyes', String(summary.bullseyes)],
      ['Longest Drop', `${Math.round(summary.longestDropM)}m`],
      ['Loaf Efficiency', `${Math.round(summary.loafEfficiencyPct)}%`],
      ['Drivers Honked', String(summary.honks)],
      ['Best Combo', `x${summary.bestCombo}`],
    ]
    for (const [label, value] of rows) {
      const line = document.createElement('div')
      line.className = 'stat-line'
      const l = document.createElement('span')
      l.textContent = label
      const v = document.createElement('span')
      v.className = 'stat-value'
      v.textContent = value
      line.append(l, v)
      this.statsBox.appendChild(line)
    }
  }

  private bindButtons(onRetry: () => void, onShare: () => void): void {
    if (this.onRetryHandler) this.retryBtn.removeEventListener('click', this.onRetryHandler)
    if (this.onShareHandler) this.shareBtn.removeEventListener('click', this.onShareHandler)

    this.onRetryHandler = () => onRetry()
    this.onShareHandler = () => onShare()

    this.retryBtn.addEventListener('click', this.onRetryHandler)
    this.shareBtn.addEventListener('click', this.onShareHandler)
  }
}
