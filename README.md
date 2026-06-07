# The Bad Birds: Birds of New Jersey

> They were here first. They're still mad.

A semi-3D arcade flyer where you poop on cars across New Jersey. Climb the
food chain from a twelve-gram American Goldfinch to the apex menace: the
Canada Goose. Mobile-first PWA built with Three.js.

**Design:** [`GAME_DESIGN.md`](GAME_DESIGN.md) — full game design document
(v1.0). **Code contracts:** [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Status: M1 gray-box prototype

One level (**Exit 9: The Turnpike**), one bird (the Goldfinch), the full
drop-and-splat loop: ballistic drops (G = 22 m/s²) with momentum inheritance,
three altitude bands + dive, combo ladder, the Loaf Meter ammo economy with
NJ food reloads, 3-star objectives, driver barks, synthesized splat audio,
and the shareable Splat Report.

## Run it

```bash
npm install
npm run dev        # LAN-exposed — open the URL on your phone for touch play
```

| Input | Touch | Desktop |
|---|---|---|
| Steer | drag in the lower screen | ← → / A D |
| Altitude band | swipe up/down | ↑ ↓ / W S |
| Dive (at LOW) | fast flick down | X / Shift |
| Drop | 💩 button | Space |
| Eat | EAT button | E |

## Verify

```bash
npm run build              # typecheck + production build
npx vite preview &         # serve dist on :4173
node scripts/smoke.mjs     # headless playtest: aims real drops, checks
                           # score/stars/results/retry-reset, fails on errors
```
