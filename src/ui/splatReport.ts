// ─────────────────────────────────────────────────────────────────────────────
// buildSplatReport — the 1080×1920 portrait share card (GAME_DESIGN.md §10).
// Pure 2D canvas, PALETTE_CSS colors, zero external images (icon.svg can't be
// drawn reliably before load, so the goldfinch is drawn as vector shapes that
// match icon.svg's vibe). The caller handles Web Share / PNG download.
// ─────────────────────────────────────────────────────────────────────────────
import type { RunSummary } from '../types'
import { PALETTE_CSS } from '../constants'

const W = 1080
const H = 1920

// Verdict rotates by score band — deadpan, matches the Results screen feel.
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

export function buildSplatReport(s: RunSummary): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas // degraded: blank card rather than a thrown error

  drawBackground(ctx)
  drawGoldfinch(ctx, W / 2, 250, 1)
  drawHeader(ctx, s)
  drawScore(ctx, s)
  drawStars(ctx, s)
  drawStats(ctx, s)
  drawVerdict(ctx, s)
  drawFooter(ctx)

  return canvas
}

// ── Background: asphalt with a sunset gradient band up top ─────────────────────

function drawBackground(ctx: CanvasRenderingContext2D): void {
  // Base asphalt.
  ctx.fillStyle = PALETTE_CSS.asphalt
  ctx.fillRect(0, 0, W, H)

  // Sunset gradient band (top third) — orange → gold → asphalt.
  const band = ctx.createLinearGradient(0, 0, 0, 720)
  band.addColorStop(0, '#1d1f30')
  band.addColorStop(0.35, PALETTE_CSS.sunsetOrange)
  band.addColorStop(0.62, PALETTE_CSS.marqueeGold)
  band.addColorStop(1, PALETTE_CSS.asphalt)
  ctx.fillStyle = band
  ctx.fillRect(0, 0, W, 720)

  // A faint skyline silhouette along the band's base for Jersey texture.
  ctx.fillStyle = 'rgba(29, 31, 48, 0.55)'
  const baseY = 700
  let x = 0
  let seed = 7
  while (x < W) {
    const rnd = (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    const bw = 40 + rnd * 70
    const bh = 60 + rnd * 180
    ctx.fillRect(x, baseY - bh, bw - 6, bh + 40)
    x += bw
  }

  // Off-palette splat speckles scattered like the player's crimes.
  ctx.fillStyle = PALETTE_CSS.splat
  let sp = 99
  for (let i = 0; i < 14; i++) {
    const r1 = (sp = (sp * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    const r2 = (sp = (sp * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    const r3 = (sp = (sp * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    const px = r1 * W
    const py = 760 + r2 * (H - 980)
    const pr = 6 + r3 * 16
    ctx.globalAlpha = 0.12
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

// ── Vector goldfinch (matches public/icon.svg) ─────────────────────────────────

function drawGoldfinch(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number): void {
  const gold = PALETTE_CSS.marqueeGold
  const dark = PALETTE_CSS.asphalt
  const orange = PALETTE_CSS.sunsetOrange
  const splat = PALETTE_CSS.splat

  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(scale, scale)

  // Body.
  ctx.fillStyle = gold
  ellipse(ctx, 0, 34, 140, 118)

  // Wing (dark) angled back.
  ctx.save()
  ctx.translate(-40, 50)
  ctx.rotate((-24 * Math.PI) / 180)
  ctx.fillStyle = dark
  ellipse(ctx, 0, 0, 78, 48)
  ctx.globalAlpha = 0.25
  ctx.fillStyle = orange
  ellipse(ctx, 0, 0, 62, 34)
  ctx.globalAlpha = 1
  ctx.restore()

  // Tail (dark triangle).
  ctx.fillStyle = dark
  tri(ctx, -136, 74, -220, 116, -196, 44)

  // Head cap (dark).
  ctx.fillStyle = dark
  ctx.beginPath()
  ctx.moveTo(44, -76)
  ctx.quadraticCurveTo(74, -110, 116, -76)
  ctx.lineTo(96, -52)
  ctx.quadraticCurveTo(70, -70, 46, -54)
  ctx.closePath()
  ctx.fill()

  // Head (gold).
  ctx.fillStyle = gold
  circle(ctx, 74, -34, 62)

  // Black face mask.
  ctx.fillStyle = dark
  ctx.beginPath()
  ctx.moveTo(34, -80)
  ctx.quadraticCurveTo(74, -106, 116, -76)
  ctx.lineTo(96, -50)
  ctx.quadraticCurveTo(70, -64, 46, -54)
  ctx.closePath()
  ctx.fill()

  // Furious eye.
  ctx.fillStyle = dark
  circle(ctx, 90, -38, 11)
  ctx.strokeStyle = dark
  ctx.lineWidth = 10
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(68, -58)
  ctx.lineTo(106, -46)
  ctx.stroke()

  // Beak.
  ctx.fillStyle = orange
  tri(ctx, 128, -32, 176, -18, 128, -4)

  // The payload — two olive-cream blobs.
  ctx.fillStyle = splat
  circle(ctx, 0, 192, 16)
  circle(ctx, 30, 208, 9)

  ctx.restore()
}

// ── Text blocks ────────────────────────────────────────────────────────────────

function drawHeader(ctx: CanvasRenderingContext2D, s: RunSummary): void {
  ctx.textAlign = 'center'

  // SPLAT REPORT — chunky title.
  ctx.fillStyle = PALETTE_CSS.asphalt
  ctx.font = '900 116px ' + SANS
  // Soft drop for legibility on the gradient.
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 8
  ctx.shadowOffsetY = 4
  ctx.fillText('SPLAT REPORT', W / 2, 560)
  ctx.restore()

  // Level + bird name.
  ctx.fillStyle = PALETTE_CSS.dinerChrome
  ctx.font = '700 40px ' + SANS
  ctx.fillText(s.levelTitle.toUpperCase(), W / 2, 640)
  ctx.fillStyle = PALETTE_CSS.marqueeGold
  ctx.font = 'italic 700 34px ' + SANS
  ctx.fillText(s.birdName, W / 2, 690)
}

function drawScore(ctx: CanvasRenderingContext2D, s: RunSummary): void {
  ctx.textAlign = 'center'

  ctx.fillStyle = PALETTE_CSS.dinerChrome
  ctx.font = '700 36px ' + SANS
  ctx.globalAlpha = 0.7
  ctx.fillText('FINAL SCORE', W / 2, 800)
  ctx.globalAlpha = 1

  ctx.fillStyle = PALETTE_CSS.marqueeGold
  ctx.font = '900 168px ' + SANS
  ctx.fillText(s.score.toLocaleString('en-US'), W / 2, 950)

  if (s.newBest) {
    ctx.save()
    ctx.fillStyle = PALETTE_CSS.sunsetOrange
    ctx.font = '900 38px ' + SANS
    ctx.fillText('— NEW BEST —', W / 2, 1010)
    ctx.restore()
  }
}

function drawStars(ctx: CanvasRenderingContext2D, s: RunSummary): void {
  const y = 1090
  const gap = 110
  const startX = W / 2 - gap
  for (let i = 0; i < 3; i++) {
    const earned = s.stars[i]
    drawStar(ctx, startX + i * gap, y, 44, earned)
  }
}

function drawStats(ctx: CanvasRenderingContext2D, s: RunSummary): void {
  const rows: Array<[string, string]> = [
    ['Direct Hits', String(s.hits)],
    ['Bullseyes', String(s.bullseyes)],
    ['Longest Drop', `${Math.round(s.longestDropM)} m`],
    ['Loaf Efficiency', `${Math.round(s.loafEfficiencyPct)}%`],
    ['Drivers Who Honked', String(s.honks)],
    ['Best Combo', `x${s.bestCombo}`],
  ]

  const left = 120
  const right = W - 120
  let y = 1240
  const rowH = 86

  ctx.font = '600 44px ' + SANS
  for (let i = 0; i < rows.length; i++) {
    const [label, value] = rows[i]

    // Alternating faint row backing for the receipt feel.
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(224, 224, 226, 0.05)'
      ctx.fillRect(left - 24, y - 54, right - left + 48, rowH)
    }

    ctx.textAlign = 'left'
    ctx.fillStyle = PALETTE_CSS.dinerChrome
    ctx.fillText(label, left, y)

    ctx.textAlign = 'right'
    ctx.fillStyle = PALETTE_CSS.marqueeGold
    ctx.font = '800 44px ' + SANS
    ctx.fillText(value, right, y)
    ctx.font = '600 44px ' + SANS

    y += rowH
  }
}

function drawVerdict(ctx: CanvasRenderingContext2D, s: RunSummary): void {
  const text = verdictFor(s.score)
  const y = 1820
  ctx.textAlign = 'center'
  ctx.fillStyle = PALETTE_CSS.clubPurple
  ctx.font = 'italic 800 42px ' + SANS

  // Wrap to fit.
  const lines = wrap(ctx, `“${text}”`, W - 160)
  const lh = 54
  let yy = y - ((lines.length - 1) * lh) / 2
  for (const line of lines) {
    ctx.fillText(line, W / 2, yy)
    yy += lh
  }
}

function drawFooter(ctx: CanvasRenderingContext2D): void {
  ctx.textAlign = 'center'

  // Gold edge brand bar — a reposted screenshot is also an ad.
  ctx.fillStyle = PALETTE_CSS.marqueeGold
  ctx.fillRect(0, H - 96, W, 96)

  ctx.fillStyle = PALETTE_CSS.asphalt
  ctx.font = '900 30px ' + SANS
  ctx.fillText('THE BAD BIRDS · BIRDS OF NEW JERSEY', W / 2, H - 56)
  ctx.font = 'italic 600 24px ' + SANS
  ctx.fillText('they were here first. they’re still mad.', W / 2, H - 22)
}

// ── Primitives ─────────────────────────────────────────────────────────────────

const SANS =
  '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

function tri(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineTo(x3, y3)
  ctx.closePath()
  ctx.fill()
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  earned: boolean,
): void {
  const spikes = 5
  const inner = r * 0.42
  ctx.beginPath()
  for (let i = 0; i < spikes * 2; i++) {
    const rad = i % 2 === 0 ? r : inner
    const a = (Math.PI / spikes) * i - Math.PI / 2
    const px = cx + Math.cos(a) * rad
    const py = cy + Math.sin(a) * rad
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  if (earned) {
    ctx.fillStyle = PALETTE_CSS.marqueeGold
    ctx.fill()
  } else {
    ctx.fillStyle = 'rgba(224,224,226,0.10)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(224,224,226,0.30)'
    ctx.lineWidth = 4
    ctx.stroke()
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}
