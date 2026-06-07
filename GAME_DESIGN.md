# THE BAD BIRDS: BIRDS OF NEW JERSEY
### Game Design Document — v1.0 (Final)

> A 90-second pick-up-and-poop arcade flyer. You are a bird with a grudge and a full tank, auto-flying over the Garden State, climbing the avian food chain from a pathetic American Goldfinch to the apex menace Canada Goose, splatting cars across every NJ landmark from the Turnpike to the Wildwood boardwalk.

**Platform:** Mobile-first Progressive Web App (Three.js, portrait, touch). Installable. 60fps on mid-range Android.
**Genre:** Semi-3D arcade flyer. Behind-the-bird, auto-forward, steer-and-DROP.
**Sessions:** 60–120s, high replay, built to be shown to a friend.
**Tagline:** *"Birds of New Jersey. They were here first. They're still mad."*

---

## Executive Summary (one page)

**The fantasy.** The bird flies itself forward over New Jersey traffic. You do everything else: steer laterally across a five-lane corridor, manage altitude across three bands, and time ballistic **DROPs** onto the cars below. The drop is a real projectile with forward-momentum inheritance — you lead the target. That single skill, landing a wet, readable splat on a windshield, is the whole game. Everything else is escalation and comedy.

**The loop (90 seconds).** Arm → spend → reload → climax → restart-hunger. You drop until your **Loaf Meter** (ammo) runs low, eat NJ food to refuel mid-line, build a **combo** of clean splats, line up the level's scheduled money shot, and bank your score into **Crumbs** — the soft currency you spend on a roster of unlockable birds, upgrades, and cosmetics. One tap to RETRY, one tap to share your **Splat Report**.

**The escalation engine.** The comedy is the food-chain climb. A Goldfinch splat is a sad little dot; a Canada Goose drop feels like a war crime with a laugh track. Same verb, dialed from 1 to 11. The humor loves New Jersey the way you love a friend who merges without signaling — affectionate, specific, never punching down, never settling the pork-roll-vs-Taylor-ham debate.

**The structure.** A nine-chapter Career Tour of real NJ landmarks. Nine chapters, nine single levels, 27 total stars. Every level reuses ONE shippable level engine (traffic-density curves, weighted spawn tables, scheduled jackpots, and at most two data-driven environmental modifiers: wind drift and a line-of-sight obstacle). Star gates derive from the 27-star total; the finale opens at 23/27, and the Canada Goose is the trophy for clearing everything.

**The growth thesis.** No accounts, no ads, no IAP at launch. Growth is the **Splat Report** — an auto-generated portrait share card people post unprompted — plus regional comedy that travels (r/newjersey, local news, the pork-roll non-decision as a press hook).

**The build discipline.** The tech is cost-aware for a solo dev (plus AI assistance): custom ballistics over a physics engine, instanced traffic, pooled decals, dPR capping, a true zero-backend launch. The MVP proves the verb before any chapter gimmick exists: **one gray-box level, one bird, the drop-and-splat loop, the splat sound, and the Splat Report.** If the drop isn't fun there, nothing downstream matters.

---

## Table of Contents

1. Vision & Design Pillars
2. Core Gameplay & Scoring
3. The Loaf Meter (Ammo Economy)
4. Career Mode — The Garden State Tour
5. Bird Roster & Progression
6. Targets, Traffic & Hazards
7. Controls, UX & Game Feel
8. Art, Audio & Writing Bible
9. Technical Architecture
10. Meta, Retention & Distribution
11. Build Plan — MVP Cutline & Roadmap
12. Canon Reference (numbers in one place)

---

## 1. Vision & Design Pillars

### Elevator Pitch

*The Bad Birds: Birds of New Jersey* is Crossy Road's thumb-friendly addictiveness wearing a Wawa hoodie. You auto-fly over the Garden State Parkway, and the only thing between you and a five-star review of someone's freshly-washed sedan is your aim. Climb the food chain from a twelve-gram Goldfinch to the apex Goose. Splat cars. Show your friends.

### Design Pillars

Four pillars, each with a one-line cut test. Fail the test, don't ship.

**1. ONE THUMB, ONE LAUGH.** Every core action — steer, climb/dive, DROP — is reachable with a single thumb in portrait, and the satisfying outcome lands within 0.5s of input.
> *Cut test: if a feature needs a second hand or a tutorial sentence longer than "drop poop on car," cut it.*

**2. THE SPLAT IS THE STAR.** Readability and juice on the DROP beat everything. The whole feedback loop — decal, driver reaction, punch-zoom, Crumbs tick — fires in under 400ms.
> *Cut test: if it doesn't make the splat juicier, funnier, or more readable, it's not core — it's backlog.*

**3. AFFECTIONATE, NEVER CRUEL.** Jersey is the beloved hometown we roast at Thanksgiving, not the target. Humor escalates in absurdity, never in meanness. Drivers are exasperated, never humiliated. **You can never hit a person.**
> *Cut test: if a joke punches DOWN at New Jersey, its people, or anyone real, cut it and write a better one.*

**4. 90 SECONDS, THEN "WATCH THIS."** Every run produces a moment worth showing a friend.
> *Cut test: if a system can't pay off inside one 90-second session, it belongs in meta-progression, not the level loop.*

### Target Players

- **The Commuter (primary).** Plays in 90-second bursts. Wants instant restart, zero friction, a high score to beat. Plays daily, shows coworkers.
- **The Jersey Native (heart).** Sends the boardwalk level to the family group chat captioned "this is so us." We write the flavor text FOR them.
- **The Completionist (depth).** Chasing all 3 stars, every bird, the Goose maxed. Our retention spine.
- **The Clipper (reach).** Records the absurd Goose run and posts it. We owe them readable, frame-perfect splats and a one-tap share hook.

### The Perfect 90 Seconds

A flawless run on **Chapter 4: Wahwah Parking Lot** as the Pigeon:

- **0:00–0:08 — Drop in.** Camera swoops behind the bird, traffic already rolling. No menu, no countdown longer than "GO." Loaf Meter starts at 2/3 full.
- **0:08–0:30 — First blood.** Steer over parked cars, dive to a tight aim cone, nail a clean roof HIT. Driver throws his hands up. Crumbs tick, screen punches. Star 1 (land 5 splats) ticks to 1/5.
- **0:30–0:55 — The combo build.** Loaf draining. Thread three cars — *splat-splat-splat* — the multiplier ribbon climbs. Tank hits low.
- **0:55–1:05 — Refuel on the line.** A soft pretzel drifts onto your firing line. You nudge a lane over and gulp it on the pass — no stop, no lost drop window — Loaf slams to full, "+REFUEL" tag pops.
- **1:05–1:20 — The money shot.** Loaded, you DIVE on the boss target: a guy detailing a spotless black coupe. Tight cone, full-tank BULLSEYE. He drops his microfiber towel in slow-mo. Star 2 (BULLSEYE the clean car) clears.
- **1:20–1:30 — Resolve.** Score rockets, Crumbs bank, "2 of 3 stars." One tap RETRY, one tap SHARE. You tap RETRY because Star 3 is *right there*.

Tension-release-tension, never a dead second. The breather is the *scheduled lull* the level author places — never a forced stall from an empty tank.

### Tone Guidelines

**The humor IS:** affectionate self-deprecation ("You can't make a left here. You have to want it."); escalating absurdity (Goldfinch dot → Goose catastrophe); the refused, *geographic* pork-roll debate; specific, lived-in detail ("the diner with the 14-page laminated menu," not "the diner").

**The humor IS NOT:** mean (drivers are inconvenienced, not degraded); gross-out for shock (it's a cartoon olive-cream splat with a cute *plip*, closer to a paint pellet than anything biological — we never say the word, the deadpan does the work); punching down (we roast traffic, taxes-as-a-vibe, jughandles, and aggressively clean cars — never people for being from here).

### Competitive References (what we steal)

- **Crossy Road** — instant restart, zero-friction one-tap loop, generous unlock drip, low-poly readability.
- **Tony Hawk's Pro Skater** — the 2-minute timed run with stacked objectives you replay to clear.
- **Untitled Goose Game** — affectionate menace; targets are flustered, never victims.
- **Subway Surfers / Temple Run** — auto-forward camera so the only skill expressed is the DROP.
- **Angry Birds** — the satisfying physics payoff and the shareable spectacle.

---

## 2. Core Gameplay & Scoring

The bird flies itself. You do everything else.

### The Flight Model

**Forward speed is locked** to the bird and not player-controlled — the Goldfinch cruises at 12 m/s, later birds run hotter (Pigeon 13, Gull 14, Goose 16, because nothing on God's green Turnpike slows a goose down). This is the contract: the player never thinks "go faster," only "go where" and "drop when."

**Lateral steering** is the primary input: thumb-drag moves the bird across a five-lane flight corridor (~16 m of usable side-to-side travel). Velocity-based with a snappy ease — full deflection reaches max strafe speed (7 m/s) in 0.18s, and the bird auto-levels its bank on release. Responsive go-kart, not drifting blimp. Soft invisible walls at the corridor edges nudge you back so you can't fly off into the Meadowlands and get lost.

**Three discrete altitude bands**, flipped with a swipe-up / swipe-down (~0.3s transition — discrete, not a free Y-axis, so aiming stays readable). The rule that makes altitude a *live decision every few seconds*: **you can never be safe AND maximally scoring in the same band.**

- **HIGH (~45 m) — "Cruising Altitude."** Safe from every ground hazard, and the only band wide enough to read the scheduled jackpot telegraph early and to **carpet a multi-car spread** (one drop's spray catches a cluster). You trade precision for area and foresight. HIGH is tactical setup, not just panic.
- **MID (~25 m) — "The Pocket."** The default workhorse. Lands **HITs** reliably and manages most of the run — but the windshield-dead-center **BULLSEYE money shot is not reliably available here.** Balanced, safe-ish, never maximal.
- **LOW (~10 m) — "Skimming."** Tight reticle, near-instant drop, the only band (with DIVE) that reliably lands BULLSEYEs and tags moving/tucked-in windshields. But you're in range of swatting drivers, garbage-truck arms, low billboards, and umbrellas. Clip a hazard and you're stunned (1.2s of no-drop wobble) and your combo is at risk.

Food and jackpots are tuned to spawn so the player is constantly trading: the cheap fries float near the line at MID; the rare **disco fries** and the highest-value clean-car BULLSEYEs sit LOW, where the risk lives.

**The DIVE** is the signature flex: a quick flick-down past LOW commits to a steep power-dive. The bird drops to ~6 m, the aim cone clamps to its tightest spread (~0.3 m), and any hit landed in the dive window gets a flat **1.5× Dive Bonus**. The catch: lateral steering authority is halved for the **0.6s dive + 0.5s climb-out**, and you can't dive again until you've returned to MID. Geese dive meanest.

### Drop Mechanics

The drop is a real projectile with **forward momentum inheritance** — the payload launches with the bird's current forward velocity, so you must lead the target. This is the skill ceiling of the whole game. Gravity is a single tuned constant, **G = 22 m/s²** (heavier than Earth so payloads feel *decisive, not floaty*), used identically everywhere. Drop fire rate is capped at one payload per 0.35s to prevent spray-and-pray.

Two aiming aids keep it learnable:
- **Ground reticle:** a ring projected onto the road at the *predicted impact point* (accounts for speed, altitude, gravity, wind). It tightens as you descend — HIGH ~3.5 m radius, MID ~1.5 m, LOW ~0.6 m, DIVE ~0.3 m.
- **Bird shadow:** where you ARE, versus the reticle's where-it'll-LAND.

**Splat tiers** by impact distance from target center:
- **GRAZE** (edge/near-miss): 50% points, thin streak decal, no driver reaction. **Saves a combo but does not advance the multiplier** — precision still pays.
- **HIT** (car body): 100% points, medium decal, driver honks. Advances the combo.
- **BULLSEYE** (windshield, driver's-side preferred): 200% points, big drippy hero decal, full driver freak-out. Advances the combo by 2. The money shot, and the game knows it.

### Scoring

Score = base × splat tier × active combo multiplier. Base points by target (all pre-multiplier):

| Target | Points |
|---|---|
| Commuter sedan | 100 |
| SUV (merges without signaling) | 150 |
| Jacked-up pickup | 200 |
| Garbage truck (hazard if you're LOW) | 250 |
| Bus | 250 |
| Jitney (Shore, weaves lanes) | 300 |
| Convertible, top down (open cockpit) | 300* |
| Jersey-plate luxury car | 400 |
| Food truck (points OR fuel — see §3) | 350 |
| **Golden / Jackpot target** (1 per level) | 1,000+ and a guaranteed combo extension |

\*The convertible is also a Jackpot-class telegraph at higher value when it appears as the scheduled hero (see §6).

**Combo system (the single canonical spec).** Consecutive HIT-or-better splats build a combo. **There is no hard timer** — you hold your combo across a quiet stretch; the pressure is to keep *landing* clean shots, not to fire blindly. The multiplier steps with combo count:

| Combo count | Multiplier |
|---|---|
| 2 | ×2 |
| 5 | ×3 |
| 9 | ×4 |
| 14 | ×5 (cap, "MAYHEM") |

BULLSEYEs count as 2 toward the counter, so chaining windshields ramps you fast. GRAZE saves the chain without advancing it.

**What breaks a combo:** a payload that lands on bare road (a true miss), getting stunned by a hazard, or running the Loaf Meter to empty and **dry-firing**. What does NOT break it: simply not dropping. A **3-second no-miss grace** forgives one whiffed drop per combo if your next drop connects, so a single bad lead-read doesn't nuke a 14-chain. This single mercy is the difference between rage-quit and one-more-run.

---

## 3. The Loaf Meter (Ammo Economy)

Capacity scales with the roster: **Goldfinch 6, Pigeon 8, Gull 10, Goose 14** (physics is physics; the Goldfinch is tiny). Each drop spends 1 loaf. Empty meter = dry-fire = no projectile, no points, and (if mid-combo) a broken combo. Run dry at the wrong moment and the whole boardwalk hears your combo die.

You reload by **eating NJ food** that drifts through the corridor or sits on stands you fly over. The doc formally refuses to settle the pork roll / Taylor ham debate — it refills the same either way and the announcer says whichever name the region uses (see §8):

| Food | Refuel | Where it spawns |
|---|---|---|
| Boardwalk fry (single) | +1 | on/near the firing line at MID |
| Bagel | +2 | near the line |
| Pork roll / Taylor ham, egg & cheese | +3 | mid-corridor |
| Disco fries (gravy + cheese) | +4, rare super-pickup | off-line, LOW band (the risk pickup) |

**Reloading is a continuous decision, never a forced stall.** Eating is **gulp-on-pass with no lockout** — topping up never costs you a drop window. The cheap, common food biases onto your firing line, so routine refuel is a tiny lateral nudge. The *detour* tension is reserved for the high-value disco fries, which sit off-line at LOW band: going for them means breaking a hot run, dropping into hazard range, and steering away from a juicy cluster. A dry-fire should feel like *your greed*, not the level's pacing.

**Ammo is a scheduled, countable resource** — like jackpots, food is authored per level, not a steady ambient float. Each level provides **~110–120% of the loaves a perfect 3-star run needs**, so over-firing GRAZEs genuinely punishes you and "do I top off or burn my last two loaves on that clean car and pray a bagel floats by?" is a real squeeze, not a fake one.

---

## 4. Career Mode — The Garden State Tour

**Canonical structure: 9 chapters = 9 single levels. 27 total stars** (3 per level). You always enter a chapter with your full unlocked roster. Chapters gate on **cumulative total Stars**, not on beating the prior level, so a stuck player can grind earlier chapters for the next unlock. Each level is 60–120s, has three Stars, and introduces exactly one wrinkle the previous one didn't.

**One reusable level engine.** Every level is built from the same kit — traffic-density curve, weighted spawn table, scheduled jackpots, and at most two data-driven environmental modifiers (**wind drift** and a **line-of-sight obstacle**). New "gimmicks" are parameters on that engine and changes to the player's *decision*, not bespoke systems. Heavier mechanics (multi-tier deck drops, active-defense AI) are a post-launch mechanic-expansion phase, not launch chapters (see §11).

### Star Gates (derived from the 27-star total)

| Chapter | Unlocks at (cumulative Stars) |
|---|---|
| Ch1 Turnpike | 0 (free) |
| Ch2 Pulaski Skyway | 2 |
| Ch3 Diner Lot | 5 |
| Ch4 Wahwah | 8 |
| Ch5 Lucy the Elephant | 11 |
| Ch6 Wildwood Boardwalk | 14 |
| Ch7 American Dream Mega-Mall | 17 |
| Ch8 MetLife / The Meadowlands Lot | 20 |
| Ch9 The Honking Finale | 23 |

The finale opens at 23/27, leaving real headroom. The Canada Goose unlocks only at a true **27/27 — clearing everything** (see §5).

### Chapter 1 — Exit 9: The Turnpike Tutorial
*"Welcome to the Turnpike. Exit 13A is a state of mind."*
**Reference:** the NJ Turnpike. **Wrinkle:** the onboarding lane — cars in three straight, evenly spaced lanes at fixed slow speed, pure timing practice for line-up-and-DROP. No wind, no obstacles, Loaf starts full so nobody fails by running dry. **3 Stars:** (1) splat 5 cars; (2) double-tap one car twice; (3) land a drop on a moving toll-tag minivan. **Setpiece:** the toll plaza — 8 stopped cars at a backed-up gantry, a free buffet for rapid drops.

### Chapter 2 — Pulaski Skyway: Riveted and Regretful
*"The Pulaski Skyway. Held together by rust and spite."*
**Reference:** the 1932 Pulaski Skyway, 3.502 miles of structural anxiety. **Wrinkle:** **vertical clearance** — the steel truss overhead is a line-of-sight obstacle forcing a narrow altitude band. Drop too HIGH and your loaf bounces off a girder (wasted ammo); fly too LOW and you clip structure (a stun). Teaches altitude management. **3 Stars:** clear with zero girder-bounces; splat 12 cars; nail the center-span money-shot car. **Setpiece:** a stalled tow truck under the trusses flushing a panicked cluster you can carpet from HIGH.

### Chapter 3 — The Diner Parking Lot, 3 A.M.
*"Diner parking lot. Open 24 hours. Closed in your heart."*
**Reference:** NJ's 24-hour diner culture. **Wrinkle:** **stationary targets + first real ammo economy.** Cars are parked, so aim is easy — the Loaf Meter is the puzzle. Eat disco fries off the dumpster to keep dropping. **3 Stars:** splat 10 parked cars on one reload; HIT the chrome-trim classic without missing; clear the lot before the neon flickers off (75s soft timer). **Setpiece:** a post-prom limo — a long stretch target worth a 5×-class chain if you walk drops front-to-back.

### Chapter 4 — Wahwah: Order 5 4 3 2 1
*"Wahwah. Eight bucks for a hoagie and a piece of you."*
**Reference:** Wahwah, NJ's sacred convenience-store cult (parody-renamed; see §8). **Wrinkle:** **crowd density** — a constant churn of cars circles the pumps and the to-go pickup; packed targets spike your combo. **3 Stars:** reach a ×4 combo; splat a car at the pump AND a car in the hoagie-pickup lane in one pass; full reload from a single dropped Stubbi. **Setpiece:** the gas-line standoff — two cars fighting over one pump, frozen, a guaranteed double-splat. (Flavor: the queue is "Goose-bait" — the apex you're climbing toward.)

### Chapter 5 — Lucy the Elephant: Margate's Big Girl
*"Six stories of tin. Zero stories of judgment."*
**Reference:** Lucy the Elephant, the 1882 six-story tin elephant in Margate. **Wrinkle:** **line-of-sight obstacle + blind drops.** You orbit Lucy; her six-story body occludes the tour-bus loop on her far side, so you bank around her — and the payoff drops are **blind**: you commit a drop you can't see land, reading audio-only feedback (the *fwap*, the honk) for bonus Crumbs. Teaches steering and committed reads under occlusion. **3 Stars:** splat 3 tour buses; land 2 blind drops in one run; BULLSEYE the open-top trolley. **Setpiece:** the wedding party — a reception spilling into the lot; the bride's white getaway car is a high-value, high-shame target worth bonus Crumbs.

### Chapter 6 — Wildwood Boardwalk: Seagull's Home Turf
*"You're not stealing fries. You're redistributing them."*
**Reference:** the Wildwood boardwalk — home of the yellow-and-blue Sightseer Tram Car, Morey's Piers, the doo-wop motels. **Wrinkle:** **wind gusts + moving food.** Ocean crosswind shoves your loaf mid-fall (a flat lateral accel on the ballistics), so you lead your drops; boardwalk fries are carried by walking tourists, so the ammo itself moves. The Gull bird shines here. **3 Stars:** splat the Sightseer Tram Car ("WATCH THE TRAM CAR PLEASE"); 15 splats in one run; reload from a moving fries-holder. **Setpiece:** the car-show on the closed boulevard — 12 gleaming show cars, owners watching, a target-rich gauntlet with a no-miss Star.

### Chapter 7 — American Dream: The Mall in a Swamp
*"Big Snow. It is 95 degrees outside."*
**Reference:** the American Dream mega-mall — the indoor ski slope in a swamp, twenty years in the making, infinite parking deck. **Wrinkle:** **occluding sightlines + density** (parameters on the same engine, not a new multi-tier physics system). Skylights and overpasses occlude targets, so mis-reading altitude means a drop lands behind cover and wastes a loaf — a real cost to a sloppy read. **3 Stars:** splat the valet stand; 20-car run without a true miss; reach a ×5 combo. **Setpiece:** the endless valet line — a snaking queue of idling cars; chaining the whole line triggers a "Still Finding the Parking" mega-bonus.

### Chapter 8 — The Meadowlands Lot: Tailgate Armageddon
*"Two New York teams. One New Jersey parking lot. Think about that."*
**Reference:** the MetLife / Meadowlands stadium parking sea (parody-renamed; see §8). **Wrinkle:** **density + interceptable drops** — the genuinely new verb. Tailgaters pop umbrellas and toss footballs that can **bat your payload mid-fall**; defenders track your reticle, so you must feint a drop or double-tap to slip one past. Demands evasive steering between drops. **3 Stars:** clear with zero intercepted loaves; splat 25 cars; nail the jumbo party bus. **Setpiece:** the tailgate boss — a custom RV with a deck grill and a defender on the roof; a three-phase drop to crack it open.

### Chapter 9 — The Honking Finale: Statewide Migration
*"One bird. Every exit. No regrets."*
**Reference:** a victory lap remixing prior locations. **Wrinkle:** a continuous medley swapping each chapter's modifier (clearance, wind, occlusion, interceptors) every ~20s. **3 Stars:** clear under 100s; reach ×5 combo; finish with no wasted loaves. **Setpiece:** the apex — a love letter to the whole state, with consequences.

> *Central Jersey easter egg:* one hidden intro card reads **"Central Jersey. (Citation needed.)"** and a reload tag can rarely glitch to "CENTRAL JERSEY DOES NOT—" before it's cut off.

---

## 5. Bird Roster & Progression

A 7-bird food-chain climb. Each bird is a distinct **flying feel**, differentiated at launch by **four stats only** — abilities are layered in post-launch behind retention data (see §11), so "distinct feel" is a tuning pass, not seven new systems on day one. Stats run **1–10** across **Speed** (forward scroll + steer responsiveness), **Capacity** (max loaves), **Splat Size** (decal radius + adjacent-car spray), and **Handling** (lateral correction). Stats below are Tier 0; upgrades push individual stats up to +3.

**No bird can ever be hard-blocked from a star objective.** Any bird-specific weakness is a time/risk cost (slower climb, heavier dive), never an "impossible" wall.

### The Roster

**1. American Goldfinch — STARTER (free)**
*The actual state bird. Twelve grams of pure New Jersey, and it knows it. Yellow, furious, deeply outmatched.*
Speed 4 / Capacity 3 / Splat 1 / Handling 7. **Passive — "State Pride":** +25% Crumbs on every level, so leveling other birds is never punished. Tiny splat — you will miss, a lot, hilariously.

**2. House Sparrow — 600 Crumbs (auto-unlocks after Ch1)**
*Lives in the Wahwah rafters. Unionized. Will not work past 2pm.*
Speed 5 / Capacity 4 / Splat 2 / Handling 6. The honest workhorse; smooths the wall after the Goldfinch.

**3. Rock Pigeon — 1,400 Crumbs (or clear Ch2 with 2 stars)**
*Sky rat. Aristocrat of the parking deck. Unbothered.*
Speed 5 / Capacity 6 / Splat 4 / Handling 5. First bird that makes "splat X cars in one pass" objectives trivial-fun.

**4. Herring Gull — 2,800 Crumbs (clear Ch6: Wildwood Boardwalk)**
*Boardwalk Legend. The big gray-and-white fry thief that actually dive-bombs your funnel cake and feels nothing.*
Speed 7 / Capacity 6 / Splat 5 / Handling 8. Built for the food-dense beach chapter — its home turf, earned the moment you finish it. The agility pick.

**5. Wild Turkey — 3,600 Crumbs (clear Ch5: Lucy the Elephant)**
*A 20-pound idiot named Tom who got his own crossing sign in Deptford. We are not making this up.*
Speed 3 / Capacity 9 / Splat 8 / Handling 3. The deliberate "tank" — climbs SLOWLY and dives heavily (it pays in reaction time, never lockout), but splats are enormous and never miss-spread. A joke that became a meta pick.

**6. Red-Tailed Hawk — 5,500 Crumbs (clear Ch6 with 3 stars)**
*Apex predator moonlighting as a vandal. Slumming it. Loves every minute.*
Speed 9 / Capacity 7 / Splat 6 / Handling 9. The skill-expression bird; high ceiling, fragile capacity by design.

**7. Canada Goose — ENDGAME — 9,000 Crumbs (must clear Ch8, AND requires 27/27 Stars)**
*The final boss of being outside in New Jersey. Honking war crime. Owns this turnpike now.*
Speed 6 / Capacity 10 / Splat 10 / Handling 6. The flex unlock. Heaviest loaf, widest splat radius, slow to earn on purpose — the trophy for completing the whole Tour. The state bird got you in the door; the Goose is why you stay.

### Bird Abilities (post-launch layer)

To keep "distinct feel" a stat tuning at launch, signature abilities ship one at a time after the core loop is validated: Sparrow's free every-5th-drop triple-spread, Pigeon's "Carpet Bomb," Hawk's "Dive Bomb," and the Goose's lingering-puddle auto-chain plus fleet-wide "HONK" freeze. Each is gated behind retention data, never bundled.

### Upgrade Tracks (post-launch meta)

Every bird has **4 stat tracks, 3 tiers each (+1 per tier)**. Costs scale by rarity bracket so upgrading the Goose is a genuine investment:

| Bracket | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Common (Goldfinch, Sparrow) | 150 | 300 | 600 |
| Uncommon (Pigeon, Gull, Turkey) | 300 | 600 | 1,200 |
| Rare (Hawk, Goose) | 500 | 1,000 | 2,000 |

Rule: **hit Tier 1 on all 4 stats before any stat unlocks Tier 2** — prevents one-stat min-maxing that breaks level tuning. The hard +3 cap means no bird becomes a do-everything: the Goose stays clumsy, the Hawk stays fragile on capacity.

### Cosmetics (visual only, Crumbs — post-launch)

No stat effect, ever. The show-your-friends layer.
- **Tiny Gold Chain** — 200 (mandatory on the Goldfinch)
- **Bucket Hat** — 250
- **Tracksuit** — 350 (velour; every bird looks headed to the diner)
- **Tiny Beach Cruiser Sunglasses** — 300
- **Foam #1 Finger** — 400 (Goose-only, insufferable)
- **Devils Jersey** — 500 (lights up red on a ×5 combo)
- **Pork Roll Costume** — 750 (the game still won't call it Taylor Ham; splat trail turns to little griddle marks)
- **Tom's Crossing Sign** — 400 (Wild Turkey only; a tiny "TURKEY XING")

### Progression Curve

A player **clearing levels at 2 stars** earns enough to unlock the next milestone bird without grinding; chasing 3 stars and replays funds upgrades and cosmetics. With "State Pride" +25%, early earning is front-loaded so the climb never stalls.

| Chapter | Crumbs (2★ avg) | Cumulative | Headline cost gated here |
|---|---|---|---|
| 1 Turnpike | 750 | 750 | Sparrow (600) — covered |
| 2 Pulaski Skyway | 1,100 | 1,850 | Pigeon (1,400) — covered |
| 3 Diner Lot | 1,400 | 3,250 | upgrades/cosmetics |
| 4 Wahwah | 1,800 | 5,050 | — |
| 5 Lucy the Elephant | 2,100 | 7,150 | Turkey (3,600) — covered |
| 6 Wildwood Boardwalk | 2,500 | 9,650 | Gull (2,800), Hawk (5,500) — covered |
| 7 American Dream | 2,900 | 12,550 | savings buffer |
| 8 Meadowlands Lot | 3,400 | 15,950 | Goose (9,000) — covered |

Each chapter's 2★ income clears its gated unlock with a surplus banked toward upgrades. A completionist (3★ + replays, ~1.7× income) can also max a favorite or two. The Goose deliberately costs more than a single chapter yields — and demands 27/27 — so it's the payoff for the whole run.

---

## 6. Targets, Traffic & Hazards

New Jersey traffic is the world's best-stocked target range. Cars spawn in lanes below the bird, scrolling toward camera. Every target has a base value, a splat multiplier, and a reaction.

### Standard Targets (the daily commute)

To match the renderer's instancing plan, launch ships **five instanced archetypes**: sedan, SUV, lifted pickup, box truck, bus. (Jitney and food truck are data variants of these silhouettes.)

| Target | Points | Weight | Notes |
|---|---|---|---|
| Commuter sedan | 100 | High | The bread. Beeps, drives on. |
| SUV | 150 | High | Bigger hitbox; tinted-window driver never reacts (deadpan = funny). |
| Lifted pickup | 200 | Medium | Tall bed = small top surface. Skill shot. Driver leans out to yell. |
| Box truck / bus | 250 | Low | Huge hitbox, blocks line-of-sight; roof is one big decal canvas. |
| Jitney | 300 | Low (Shore) | Fast, weaves lanes — rewards leading the drop. |
| Food truck | 350 | Low | **Points OR fuel, exclusive:** splatting it *destroys* the food, so you score the truck and burn the ammo source — or skip the points and grab the spilled NJ food for loaves. Pick one. |

**Spawn logic:** each level defines a traffic density (cars/sec) that ramps inside the level (calm open → rush-hour climax) and a weighted table. Jackpots and named targets are **scheduled, not random** — authored beats so every run has a guaranteed "oh here he comes" moment, with ±1.5s jitter so it never feels metronomic.

### Jackpot Targets (the reason you fly)

Telegraphed with a faint golden glint and a slight camera nudge — and easiest to spot early from the HIGH band. Rare, high-reward, built for the screenshot.

- **Convertible, top down** — 1,000. The only target where a drop lands *inside*. Spawns ~once per level.
- **Freshly-washed black luxury car** — 1,200. A glossy reflective shader the instant before impact, then a maximally visible decal on the cleanest possible surface. Maximum contrast, maximum comedy.
- **The guy in the lawn chair** — 1,500, driveway/lot only. **Not a pedestrian** (see the line below): a stationary, seated, consenting-to-the-bit lawn-chair guy with a cooler, a target the way a parked car is. Cracks a beer, points up, salutes you.

### Named Recurring Rivals (post-launch flavor)

Persistent characters tracked in a "Most Wanted" log, added once the core loop ships: **The Double-Parker** (shrugs — *what.*), **No-Blinker Guy** (juke-changes lanes mid-approach; ×2 if you tag him mid-change; the street cheers), **The Cell-Phone Roller** (drifts at 5 mph, never reacts — the void stares back).

### NPC Reactions — the comedy engine

At launch, one cheap universal reaction scales by splat quality: a **shader tint flash + a 2-frame hands-up icon billboard + a bark text bubble**. No door-opening, no driver-exits-car, no busload crowd anim — those are post-launch juice.

1. **Glancing hit:** tint flash, short honk SFX, one-word bubble.
2. **Solid hit:** hands-up icon, a louder bubble (*"AYYY!"*, *"On the LEASE?!"*).
3. **Dead-center / jackpot:** brighter flash, a victory-lap beat where that lane briefly freezes, the marquee bubble.

### Hazards & Anti-Bird Defenses

Hazards exist to **force dodge gameplay at LOW** — the place you must be to drop accurately. The core tension: precision demands you fly low; flying low is where everything tries to make you miss.

**Launch ships exactly one hazard: wind drift** — drifting bands that shove your lateral position, telegraphed by swirling leaves/litter. It's nearly free (a flat lateral accel already in the ballistics math) and it deepens the drop skill. Ride a gust for a trick-shot drift drop.

Post-launch hazard expansion (each is a new collision/telegraph/tuning loop, added deliberately): umbrellas that deny the target underneath (or splat the umbrella for a consolation 50); car washes that scrub your decals and gate altitude with a water curtain; scarecrow owls that stagger steering for 0.5s on the approach line.

**The Red-Tailed Hawk as a pressure agent (post-launch).** When the playable Hawk also appears in the world, it **claims a band rather than chasing you**: while it's on screen it patrols LOW, denying that band for ~8s, so you must score from MID/HIGH and your altitude decision is pressured — never your aim. Surviving the window is "Shook the Hawk." We never ship a homing pursuer that cancels the core verb or zeroes an in-progress combo.

### Pedestrians — THE LINE WE NEVER CROSS

**You cannot hit a person. Ever. There is no input, decal, or score path that lands a drop on a pedestrian.** A drop aimed at one is auto-nullified — it "misses" with a comedic *plip* on the pavement. This is absolute and consistent: there is no "bald-guy bonus head," no person-as-surface anywhere in the game.

Pedestrians power the **Warning Shot garnish**: a drop that ALSO lands on a legitimate car/ground target near a pedestrian triggers their flinch-and-duck for a flat **+40** — capped below a clean car HIT, with **no standalone multiplier and no chain**, so it can never out-earn the core target loop and players always chase windshields. The flinch is a garnish on a real hit, not a scoring strategy. You're a menace to *property and dignity*, never people. The grandma who shakes her umbrella at you is content, not collateral.

---

## 7. Controls, UX & Game Feel

### Primary Control Scheme: Touch-Drag Steer

**Committed: touch-drag is primary; tilt is a settings toggle.** Touch-drag survives the couch, the train, the passenger seat — anywhere with a gravity vector that isn't down. Tilt nausea kills 90-second sessions; one-handed thumb steering doesn't.

**Gesture grammar (one table, no ambiguity):**

| Input | Action |
|---|---|
| Drag in the Flight Zone (lower 55%) | Steer — left/right banks, up/down changes altitude band |
| Flick-down (>900 px/s) in the Flight Zone | Commit a DIVE |
| **DROP button** (bottom-right) | Drop a payload |
| Transient **EAT button** (appears on a food pass) | Gulp-reload |

The Flight Zone is reserved for **drag-steer and flick-dive ONLY** — a stray tap there does nothing, so steering can never cost you an accidental drop. Drop is exclusively the dedicated button.

- **Horizontal steer:** full screen-width drag = full lateral swing. Sensitivity default 1.0 (slider 0.6–1.6), dead zone 6px to kill resting jitter.
- **Altitude:** vertical drag selects the discrete band, dead zone 10px (bigger, so you don't lose altitude every time you breathe). Climb is slow (gravity is the bird's enemy); dive is fast.
- **Tilt mode (toggle):** device pitch/roll, ±18° = full deflection, dead zone ±2.5°, double-tap to Recenter. DROP and EAT stay as touch buttons. Labeled *"Tilt (for show-offs)."*

### The DROP Button & Handedness

DROP lives **bottom-right, 64px, 24px from each edge**, inside the natural thumb arc — positioned so the steering thumb reaches both the Flight Zone and the button without the button occluding the cars above. **Handedness toggle** mirrors it to bottom-left (Settings → "Lefty Loafing"). It's a big dumb circle that **fills like a meter as the Loaf reloads** and visibly **clogs/un-clogs**, so you read your ammo without looking up — empty button = no ammo.

**EAT** is contextual: flying through a food pickup's aura raises a **transient EAT prompt** at bottom-left (mirrored with handedness) for 1.2s. Tap to gulp (no lockout); miss the tap and you fly through. Eating is a *choice* you can pass up, which makes the food tactically yours to chase.

### Game Feel / Juice Inventory

Every event pays out across haptics, shake, and sound on a strict budget so the phone never feels like it's seizing.

| Event | Haptic | Screen shake | Extra |
|---|---|---|---|
| DROP released | light tick (10ms) | none | whoosh + falling-doppler |
| Splat on car (HIT) | medium (20ms) | 3px, 90ms | wet *splat*, decal stamps |
| **BULLSEYE** | double-buzz (15+25ms) | 6px, 140ms | **hit-stop 80ms**, FOV pinch |
| Combo +1 | rising tick per step | +1px/tier (cap 8px) | pitch-rising "ding" ladder |
| Miss (street/water) | none | none | sad plop, driver honks anyway |
| Loaf empty | one soft thud | none | gut-rumble SFX |

- **Screen-shake budget: hard cap 8px / 160ms.** Trauma decays linearly; concurrent events take the *max*, never the sum.
- **Hit-stop on BULLSEYE: 80ms full freeze**, then resume — the single most important feel beat. Combo BULLSEYEs stack to a max of 120ms.
- **Combo escalation** uses the canonical ladder (§2): brighter Crumb-pops, faster ding ladder, +2° camera roll and a warm color-grade push per tier. The combo counter pulses bottom-center.
- **Splat decal persistence:** decals stay on a car for its full on-screen life (up to 12/car before oldest fade); world (road) decals persist 6s then fade. Decals are pooled — no runtime allocation — to hold 60fps.
- **Level-ending jackpot slow-mo:** if the *final* drop of a level lands a BULLSEYE, time drops to 0.35× for 1.1s, the camera orbits 30° toward the splat, then snaps to results. Reserved strictly for the last drop — scarcity keeps it special.

### Camera Spec

Behind-the-bird third-person, portrait. Follow distance 4.2 units back, 1.6 up. Position lag 0.12s, rotation lag 0.08s (camera leads the bird's bank slightly so steering reads instantly). FOV default 62°; on DIVE it kicks to 70° over 0.15s (speed rush) and eases back over 0.3s, with a faint vignette + chromatic edge. Camera pitches down 8° during a dive so the cars fill frame.

### Onboarding — "Day 1: You're a Goldfinch in Hoboken"

A 60-second tutorial with zero text walls — it teaches by gating mechanics behind glowing in-world cues, scored normally so it never feels like school.

1. **0–12s — Steer:** narrow alley, glowing chevrons drift left/right. Hint: *"Drag to fly."*
2. **12–25s — Aim & Drop:** one lonely parked car with a glowing target ring; the DROP button throbs. First splat → big juice, *"NICE. That's a Honda problem now."*
3. **25–38s — Eat:** Loaf empties to force it; a fries pickup glows on the line. *"Refuel. Don't ask what kind of pork it is."*
4. **38–55s — Combo:** three cars in a tidy line, spaced for a natural ×3 chain; the combo counter introduces itself with a wink.
5. **55–60s — Jackpot:** one hero car, the first taste of jackpot slow-mo. Cut to Crumbs payout.

You're a tiny weak Goldfinch the whole time — the comedy *is* the tutorial. Skippable after first completion; steer/aim cues never return.

### HUD Layout (Portrait, Thumb-Reach Map)

```
┌─────────────────────────┐
│ SCORE 12,400   ⭐⭐☆   │  top: glanceable, never tapped
│ Crumbs: 318             │
│        [ HOBOKEN ]      │  level title fades after 3s
│                         │
│   ~~~ flight space ~~~  │  cars & decals live here
│                         │
│        COMBO x3         │  pulses bottom-center
│ ╔═════════════════════╗ │
│ ║   FLIGHT ZONE       ║ │  ← drag-steer / flick-dive only
│ ║ EAT?          ( 💩 )║ │  EAT left-transient | DROP right
│ ╚═════════════════════╝ │  both inside thumb arc
└─────────────────────────┘
```

Top third = read-only (score, stars, Crumbs). Bottom third = act-only (steer zone + DROP + contextual EAT). Nothing tappable sits in the middle, where the action — and your eyes — belong.

---

## 8. Art, Audio & Writing Bible

### Art Direction

Low-poly toon, fully 3D geometry with real depth and parallax, but every surface **flat-shaded** — no specular, no PBR, no normal maps. Lighting is a single baked directional key plus flat ambient fill, so it ships cheap and reads instantly. Silhouette is law: any gameplay-critical object (target, food, hazard) must be identifiable from its outline alone on a 6-inch screen at arm's length.

**Committed palette (6 keys, locked):**
- `#FF6B35` **Jersey Sunset Orange** — sky gradient top, hero accent, Loaf Meter fill
- `#FFB627` **Diner Marquee Gold** — UI highlights, stars, Crumbs icon
- `#2B2D42` **Turnpike Asphalt** — roads, shadow tone, UI base panels
- `#06A77D` **Goose Green** — apex bird, success states, foliage
- `#E0E0E2` **Diner Chrome** — car bodies default, chrome trim, text on dark
- `#9B5DE5` **Jersey Club Purple** — night skies, neon, combo flares

Rule: **max 4 of these 6 on screen at once** per chapter, so each level reads as its own postcard. Splats use a dedicated off-palette **`#C9D6A3` "olive-cream"** so the splat is always legible against any car color.

### VFX (priority order)
1. **Splat decal** — projected quad snapped to hood/roof on impact, 3 random variants, persists for the level so the player sees their crime accumulate.
2. **Splat burst** — radial particle pop (8–12 quads), olive-cream, gone in 250ms.
3. **Feather poof** — on bird hits/near-misses and level-clear; 6 flat feather quads tinted to the active bird.
4. **Score popup** — chunky billboarded gold number with bonus tags ("BULLSEYE," "MOVING TARGET," "SUNROOF — OPEN!"). Floats up 0.5m, fades in 600ms.
5. **Combo flare** — Jersey Club Purple ring on combo milestones.

Cap total live particles at **150** to hold 60fps on mid-range Android.

### Audio Direction

The splat is **THE single most important asset in the game** — funny on the 200th hear, never grating. It's built during the gray-box prototype because it's inseparable from whether the feedback loop feels good. Layered, mixed to ~400ms:
1. **Impact** — a wet low "fwap" (cabbage on tile), the body of the joke.
2. **Spread** — a short high "splort" tail 80ms later, sells the spread.
3. **Surface tag** — keyed to material on *objects only*: tin "tonk" on a car roof, glass "tink" on a windshield, a metal "tonk" on a cooler lid, a "sproing" on a pop-up canopy. Never on a person.
4. **Reward sting** — a tiny 2-note marimba pip ONLY on a scored hit, so the ear learns "that one counted."

**Launch audio scope:** the splat + one music loop + UI pips. Driver lines ship as **text bubbles only at launch** (free, readable on mute — how most mobile sessions run, and arguably funnier). Voice acting and per-chapter music are a post-launch pass.

**Music (per chapter, post-launch):** Turnpike — Jersey club, 130bpm, air-horn on combo milestones. Diner lot — late-night lounge, brushed snare, vibraphone. Boardwalk — wheezy carousel Wurlitzer over a skee-ball hum. Stadium lot — stomp-clap tailgate-rock, crowd roar swells. Stems duck under the splat so the gag always cuts through.

### Writing Bible

**The voice in 5 rules:**
1. Loves Jersey, never punches down. The joke is always *with* NJ, from the inside.
2. Specific beats generic. "Exit 13A," not "the highway." Real geography is the comedy. (And be *accurately* specific — wrong-but-confident is worse than vague.)
3. Short and dry. Most lines under 9 words; the deadpan does the lifting.
4. The game knows it's dumb. Lean in; never wink so hard it breaks.
5. Never settle the pork roll debate — and make the gag geographic.

**The pork-roll-vs-Taylor-ham gag (the signature bit).** The reload pickup is canonically labeled **"Pork Roll / Taylor Ham,"** slash always visible, both names equal. The bark is **geography-driven, not random**: North-Jersey levels say **TAYLOR HAM**, South-Jersey levels say **PORK ROLL** — the game "refuses to arbitrate" by simply mirroring local custom (commit to non-commitment by deferring to where you're standing — funnier and more authentic than a coin flip). The **Central Jersey** meta-joke runs alongside it: a hidden intro card "Central Jersey. (Citation needed.)" and a rare glitched tag "CENTRAL JERSEY DOES NOT—" that's cut off. The achievement **"Settle Down"** taunts you for collecting 100 without the game ever picking a side.

**Level intro cards:**
- "Welcome to the Turnpike. Exit 13A is a state of mind."
- "The Pulaski Skyway. Held together by rust and spite."
- "Diner parking lot. Open 24 hours. Closed in your heart."
- "Wahwah. Eight bucks for a hoagie and a piece of you."
- "Lucy the Elephant. Six stories of tin. Zero stories of judgment."
- "Wildwood. The fries are immortal. So is the tram car."
- "American Dream. Big Snow. It is 95 degrees outside."
- "The Meadowlands. Two New York teams. One New Jersey lot. Think about that."
- "Route 1. There is no left turn. There is only the jughandle."
- "Hoboken. You will not find parking. This is not a level you can win."
- "The Pine Barrens. Watch for the Devil. He hates a clean car."
- "Newark Airport. Long-term parking. Longer-term grudges."
- "Central Jersey. (Citation needed.)"

**Driver barks** (text bubbles, gated to one per 2.5s so they stay funny):
- "HEY. I just got this DETAILED." · "Madon'. On the LEASE?!" · "Of course. Of COURSE."
- "I'm calling my guy. I HAVE a guy." · "I just got off the Parkway for THIS?"
- "Kids, don't look up." · "We do NOT have time for this." · "There are wipes in the glovebox. There are always wipes."
- "Bro. BRO. Not the new lift." · "That's it, I'm beached." · "It's giving... seagull."
- "Forty years I park here. Forty years." · "Back in my day birds had RESPECT." · "This is why I take the Parkway."
- "You know how much that toll-tag replacement is?" · "I'm posting this in the town Facebook group."
- "I literally just left the car wash on 22." · "Sunroof was a MISTAKE." · "Welcome to Jersey, ya little—" (cut by splat SFX)

**Loading tips (hyper-local deadpan):**
- "You can't make a left here. You have to want it."
- "Yes, Central Jersey is real. No, we won't elaborate."
- "The car wash was a waste of money. We're sorry."
- "This bird has never paid a toll in its life."
- "It's not traffic. It's a lifestyle."

**Naming conventions:** birds get a species + an attitude descriptor on the unlock card — "American Goldfinch (Underestimated)," "Rock Pigeon (Unbothered)," "Herring Gull (Boardwalk Legend)," "Canada Goose (Wanted in 3 Counties)." Levels are the real landmark + a one-line slander. UI nouns stay in-world: ammo is the **Loaf Meter**, currency is **Crumbs**.

### Trademark / IP Cautions

**Do not ship real brand names or real people.** Parody-rename everything recognizable; keep the rhythm, change the word, and make sure there's a **joke in the new word** (legally distinct AND funny).
- **Wawa → "Wahwah"** (phonetic, reads instantly, sounds like a sad trombone). Keep it.
- **MetLife Stadium → "The Meadowlands Lot"** (a real, evocative place name, no trademark — far better than a flat letter-swap).
- **Wawa "Shorti" → "the Stubbi" / "the Half-a-Hoagie."**
- **Named real people are off-limits as targets, full stop** — including celebrity chefs. The reality-TV bakery van is a generic "cannoli van from a Hoboken bakery that is definitely not on TV (legally distinct)," never a named brand or person.
- Car brands appear as **silhouettes only**; if a name is needed it's a parody ("a leased German thing").
- No real team logos in the stadium lot — generic green/blue jersey blobs. No real diner names. GSP/Parkway referenced descriptively only.
- Sweep the whole doc for stray real names (sedan/coupe silhouettes are fine; named brands get parodied). The test: the joke survives the rename.

---

## 9. Technical Architecture

### Stack

Vite + TypeScript + Three.js (r160+). Vite for instant HMR and a clean Rollup build; TypeScript because timing-sensitive ballistics rot without types on vectors and the state machine; Three.js for real 3D depth (the drop is a Z-axis act of commitment) without a heavyweight engine. No React in the render loop — UI is plain DOM/CSS over the canvas. React's reconciler has no business between you and 60fps.

**Physics: no engine.** The entire game is one parabola and some overlap tests; we don't import Rapier or cannon-es to simulate two shapes.
- **The drop** is closed-form projectile motion. On release we capture bird position, forward velocity, and altitude, then integrate `p += v*dt; v.y -= G*dt` with the canonical **G = 22 m/s²** (heavier than Earth so payloads feel decisive). Wind is a flat lateral accel per level (Wildwood gusty; diner lot dead air).
- **Hit detection** is a swept-sphere (r ≈ 0.15m) vs. car AABB check, resolving earliest TOI. No broadphase tree: ≤1 payload in flight, ≤40 cars in a 1D scroll lane, range-culled by Z.
- **Bird steering** is kinematic, not dynamic. Lateral position is a damped spring toward the touch target; altitude is the clamped, discrete band. No rigid bodies, no solver, no WASM, no nondeterminism.

### Rendering Budget

Hard ceiling: **≤120 draw calls/frame, ≤200k triangles on screen.** Targets that hold 60fps on a Snapdragon 6-series / Mali mid-tier.

- **Traffic uses instanced meshes:** one `InstancedMesh` per archetype × ~40 instances = the whole road in ~5 draw calls. **Exactly five archetypes** (sedan, SUV, lifted pickup, box truck, bus), matching the design target roster in §6. Per-instance attributes carry color and a `splatMask` index.
- **Splat decals** are an instanced quad pool (cap 64 live, FIFO recycle), writing into a per-instance splat atlas slot — never new geometry. Reactions are a shader tint + a triggered 2-frame icon, not new meshes.
- **Texture atlases:** one 2048² for environment + cars, one 1024² for birds, one 512² for splats/food. Ships as **GLTF + Draco** (geometry) + **KTX2/Basis** (GPU-compressed textures, ~4× smaller in VRAM, critical for thermal headroom).
- **Poly budgets:** hero bird 4–6k tris, car archetype 2–3k, food pickup 300–600, landmark set-dressing batched ≤30k total/level. Skybox is a single cubemap.

### Mobile Specifics

- **Portrait lock** via manifest; on resize, fit canvas to `visualViewport` (handles the URL-bar dance) and recompute FOV.
- **dPR cap:** `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`. Dynamic-resolution fallback: if frame time exceeds 18ms for 30 consecutive frames, drop pixel ratio one step.
- **Thermal mitigation:** the dynamic-res scaler, a 60fps cap (no uncapped rendering cooking the SoC), pause RAF on `visibilitychange` hidden, cheap shaders (no real-time shadows — baked AO + a blob shadow decal).
- **Touch input:** single-thumb scheme via pointer events; `touch-action: none` to kill scroll/zoom; track `pointerId`. **DROP is the dedicated button only — there is no "tap anywhere = drop."**
- **Haptics:** `navigator.vibrate` on confirmed splat and 3-star clear, feature-checked (iOS Safari ignores it, fine).

### PWA

- **Manifest:** `display: standalone`, portrait, themed `#06A77D`, maskable icons, name "The Bad Birds: Birds of New Jersey."
- **Service worker (Workbox):** app shell (HTML/JS/CSS) cache-first for instant offline boot; level asset bundles stale-while-revalidate, precached for Level 1, lazy-cached on first play for later chapters. Playable on the Parkway with zero bars.
- **Install prompt:** capture `beforeinstallprompt`, suppress default, surface our own "Take The Bad Birds home" button *after* the player's first 3-star (earned, not nagged).
- **Save → IndexedDB** (`badbirds`, version-migrated): `profile { id, crumbs, taylorHamVsPorkRoll: 'unsettled', settings }`, `progress { levelId, stars, bestScore, attempts }`, `roster { birdId, unlocked, upgrades[] }`, `meta { schemaVersion, lastPlayed }`.

### Audio (tech)

**Web Audio API, not `<audio>` tags** — low-latency, overlapping, pitch-varied one-shots. Decode SFX into `AudioBuffer`s once, fire through pooled `AudioBufferSourceNode`s with slight random `playbackRate` (no two splats identical), route through a master `GainNode` for one-tap mute. Unlock the context on first touch.

### Backend & Determinism — honest scope

**The launch build truly has no backend.** Local high scores + the Splat Report share card ARE the social loop and need no server. Networked leaderboards are a post-launch phase, scoped honestly: a single Cloudflare Worker + KV for a **global Daily score board only** (one seed for spawn *layout*, compared on score — not a deterministic-replay competition, which sidesteps the cross-device determinism trap). Friend codes and per-level global boards come later only if retention justifies them. "Deterministic replay" is scoped to **single-device** (record inputs, replay locally) — we do not promise cross-device determinism.

### Deployment

**Cloudflare Pages.** Static `dist/` via Git integration; global CDN serves the atlas/Draco/KTX2 bundles; immutable-hashed filenames get long-cache headers; the service worker gets `no-cache`. Preview deployments per PR. No servers at launch.

---

## 10. Meta, Retention & Distribution

The job: bring people back without making it feel like a job. No energy timers, no lives, no "out of moves, want some?" guilt. The Bad Birds keeps people because pooping on a clean coupe is funny three days running, and because your friends are one slot above you on the board, smug.

### Virality: the Splat Report (the marquee feature — and it ships early)

The instant a run ends, we auto-generate a **Splat Report** — a portrait share card (1080×1920, rendered to canvas, one tap to share/save). It is the screenshot people post unprompted, and because it's the entire growth thesis, it's in the **MVP** (it's cheap: a canvas render of stats we already track). Deadpan stats:
- **Direct Hits: 14** · **Convertibles Ruined: 3** · **Longest Drop: 41m** · **Loaf Efficiency: 92%** · **Drivers Who Honked: 9**
- A rotating **verdict**: *"The Parkway will remember you."* / *"Audit the parking lot. It's gone."*
- Bird, level, score, global rank (once boards exist), and a short-link to install.

Branding is baked into the card edge, so a reposted screenshot is also an ad. Variants are build-time templated, so seasonal skins ("Shore summer," "Devils playoff red") cost nothing at runtime.

Second hook (post-launch): **Photo Mode** — after a bullseye, scrub the replay, swing the camera off the behind-the-bird rig to a cinematic angle, grab a still or 3-second clip. Where the 60fps Three.js renderer earns its keep.

### The Daily Route (post-launch)

Every day at 00:00 local, one cleared level is remixed: same geometry, reshuffled spawns, a weather modifier, and a fixed (often deliberately wrong) bird — "Today: Goldfinch on the Turnpike. Godspeed." A single seeded **score challenge** — everyone gets the same spawn *layout*, compared on score (not a deterministic replay). One scored attempt; keep playing for fun, only the first posts. Flat, generous rewards: completing pays 120 Crumbs, top 50% +60, top 10% +150 and a cosmetic shard. Miss it and you miss it — that scarcity is the hook.

### Streaks (post-launch)

A **Commute Streak** counts consecutive days you play any scored run. Front-loaded then escalating: Day 2: 50 · Day 3: 75 · Day 5: 150 · Day 7: 300 + "Week-One Wing Decal" · Day 14: 500 · Day 30: 1,200 + the "Local Legend" diner paper cap. One **Mulligan token** auto-protects a streak if you miss a single day, earned back every 14 days. We protect the streak, not extort it — no "pay to keep your streak."

### Leaderboards & identity (post-launch, no accounts)

Zero forced login. On first launch we mint an anonymous handle ("AngryFinch_4471") and a local IndexedDB profile; players can rename (profanity-filtered, NJ-flavored suggestions: "PorkRollOrDie," "ExitElevenSeven"). When boards ship, the backend is one thin Worker + KV; the device holds a signing secret so scores tie to a device without an email. Accept that a free global score board is trivially cheatable and **never gate rewards on rank**. Friend codes (a 6-char code like `WAWA-7K`, building a Friends filter — the seven people you know, not rank #44,209) come only if retention justifies them. Cross-device account sync is optional and never required to play.

### Monetization

**MVP ships with zero monetization. None.** No ads, no IAP, no paywalled birds. The full roster (through the Goose) and every level are reachable with Crumbs earned by playing. Nothing kills a "you gotta see this" share faster than an interstitial ad; we protect the first impression at all costs.

Considered post-launch, in priority order:
1. **Goose Pass — one-time $2.99 supporter unlock (recommended, ship first).** A goodwill tip jar: gold goose nameplate, an exclusive honk SFX pack, Photo Mode 4K export, 2× Crumb display flair. **Zero gameplay advantage.**
2. **Cosmetic Crumb packs** (real money, cosmetics only, no power, no loot boxes). Acceptable.
3. **Optional rewarded ad for a Crumb bonus** (watch one, +100, capped 3/day, opt-in, never gating progress). Tolerable, lower priority.
4. **Forced ads / energy / pay-to-unlock-birds.** Off the table permanently.

### Distribution

**PWA-only at launch** — installable, shareable by link, and the Splat Report spreads by URL, which the whole strategy rests on. Add-to-home-screen fires after the player's first 3-star. **Both store wrappers are deferred** to a single "if web traction justifies" phase: Google Play first (a Bubblewrap TWA, the cheaper one), iOS (a Capacitor shell) only if iOS players are demonstrably blocked. Don't pay the two-store tax before the game has users.

**Marketing — lean into the NJ love** (regional comedy that travels):
- Seed r/newjersey, r/njbirds, town Facebook groups with Splat Reports — never a "download" ask first; let the card do it.
- Pitch local news: *"The official bird of your morning commute"* (News 12 NJ, NJ.com, NJ 101.5 morning radio).
- The pork-roll / Taylor-ham non-decision is a press hook on its own.
- Tagline: **"Birds of New Jersey. They were here first. They're still mad."**

---

## 11. Build Plan — MVP Cutline & Roadmap

The tech is sized for one developer plus AI assistance. The discipline that makes that real: **prove the verb before building anything that depends on it.**

### MVP Cutline — first playable ships exactly this and nothing more

- **One level:** a gray-box New Jersey Turnpike. Scrolling instanced traffic (the 5 archetypes), scheduled food pickups (boardwalk fries), wind drift as the only modifier, the full 3-star objective on that one stage.
- **One bird:** the American Goldfinch. (Two birds tests *progression* before the verb is proven — backwards. The Pigeon comes the moment the Goldfinch loop is fun.)
- **Core loop only:** fly, steer, manage the Loaf Meter, line up, DROP, splat, score, RETRY. Local high score.
- **The splat sound,** built alongside the loop (inseparable from whether it feels good).
- **The Splat Report** share card — the only marketing channel we have, and cheap. Without it the slice proves the verb but can't validate the "show your friends" pillar the business case rests on.
- **No meta:** no Crumbs economy, no shop, no cosmetics, no chapter map, no networked anything, no bird abilities, no second hazard. One screen, one verb — instantly fun or we fix the verb.

**Build the single-band-drop prototype FIRST, in gray-box with zero art**, against the locked Canon numbers (§12). Only proceed if the drop feels good.

### Roadmap

1. **M1 — Vertical Slice (the MVP above).** Turnpike gray-box, Goldfinch, drop loop, splat sound, Splat Report. 60fps verified on a real mid-range Android. Ship to Cloudflare Pages internally. *Gate: is the drop fun? If no, iterate the verb; do not build content.*
2. **M2 — Meta & Economy.** Crumbs, IndexedDB saves, the Pigeon, the chapter map, install prompt + offline SW caching. Text-bubble driver reactions.
3. **M3 — Content & Roster.** Build out to the 9 chapters using the one reusable level engine + two modifiers (wind, line-of-sight obstacle); the Gull and Goose with distinct stat feel; full food variety; the pork-roll/Taylor-ham geographic gag; named rivals; bird abilities introduced one at a time behind retention data; the second-tier hazards and the band-claiming Hawk.
4. **M4 — Live & Launch.** Photo Mode, per-chapter music and voice (if it earns its keep), the Daily Route score challenge + streaks, the global Daily board (one Worker + KV), cosmetics, thermal/perf hardening, public PWA launch. Store wrappers only if web traction justifies. The Goose Pass tip jar ships here.

---

## 12. Canon Reference (numbers in one place)

Every other section derives from these. If a number appears elsewhere, it matches here.

| Concept | Canon value |
|---|---|
| Forward speed | Goldfinch 12 / Pigeon 13 / Gull 14 / Goose 16 m/s (locked, not player-controlled) |
| Lateral corridor | 5-lane, ~16 m usable; max strafe 7 m/s, reached in 0.18s |
| Altitude bands | 3 discrete (HIGH ~45m / MID ~25m / LOW ~10m), swipe to toggle, ~0.3s |
| Reticle spread | HIGH ~3.5m / MID ~1.5m / LOW ~0.6m / DIVE ~0.3m radius |
| Dive | flick-down commit; bird to ~6m; 1.5× bonus; 0.6s dive + 0.5s climb-out; half steering authority during; re-dive only after returning to MID |
| Gravity (payload) | **G = 22 m/s²** (everywhere) |
| Drop fire rate | 1 / 0.35s |
| Splat tiers | GRAZE 50% (saves combo, no advance) / HIT 100% (advance) / BULLSEYE 200% (advance by 2) |
| Combo ladder | ×2 @ 2 · ×3 @ 5 · ×4 @ 9 · ×5 @ 14 (cap, "MAYHEM"). No hard timer. 3s no-miss grace forgives one whiff. |
| Combo breaks | true miss · hazard stun · dry-fire. Not broken by simply not dropping. |
| Loaf capacity | Goldfinch 6 / Pigeon 8 / Gull 10 / Goose 14 |
| Food refuel | fry +1 / bagel +2 / pork-roll-or-Taylor-ham +3 / disco fries +4. Gulp-on-pass, no lockout. |
| Ammo supply | ~110–120% of a perfect 3-star run's loaves; food is scheduled, not ambient |
| Warning Shot | +40 flat, no chain, only when the drop also lands a real target near a pedestrian |
| Campaign | 9 chapters = 9 levels, 27 total stars; gates at 0/2/5/8/11/14/17/20/23; finale at 23/27 |
| Goose unlock | clear Ch8 AND 27/27 stars, 9,000 Crumbs |
| Bird unlocks | Sparrow after Ch1 (600) · Pigeon Ch2-2★ or 1,400 · Gull clear Ch6 (2,800) · Turkey clear Ch5 (3,600) · Hawk Ch6-3★ (5,500) · Goose 27/27 (9,000) |
| Render budget | ≤120 draw calls, ≤200k tris, 5 instanced car archetypes, 64-decal pool, ≤150 particles, 60fps cap, dPR ≤2 |
| Screen shake | hard cap 8px / 160ms; concurrent = max, not sum |
| Hit-stop | 80ms on BULLSEYE (stack to 120ms max) |
| Backend | none at launch; post-launch = one Worker + KV, global Daily score board only |

*Sources: Pulaski Skyway (Wikipedia); Lucy the Elephant (Wikipedia); Wildwood Sightseer Tram Car; NJ jughandle count; pork-roll/Taylor-ham regional split.*
