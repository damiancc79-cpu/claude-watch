# Calibre S‑1 — a skeletonised mechanical watch in three.js

A hand‑wound skeleton wristwatch, modelled and animated in the browser. Nothing
is imported: every wheel, bridge, jewel, screw and spring is generated from
code, in millimetres, from a real gear train.

```bash
python3 arcade/serve.py . 8931
```

then open <http://127.0.0.1:8931/watch/>. It needs a server — ES modules will
not load over `file://` — and three.js r169 comes from unpkg, so the first load
needs a network connection.

## What is modelled

**Going train** — mainspring barrel (openworked, with the coiled spring
visible), centre wheel, third wheel, fourth wheel carrying the small seconds,
escape wheel. Every wheel has cycloidal teeth, crossings cut between hub and
rim, and a chamfered edge; every pinion has 6–12 leaves.

**Escapement** — Swiss lever. Club‑tooth escape wheel, pallet fork with two ruby
stones and a guard pin, roller table with its impulse jewel, screwed balance
with 16 timing screws, flat hairspring, regulator index with curb pins, and the
stud the outer coil is pinned to.

**Keyless works** — winding stem and bevelled winding pinion at 3 o'clock, crown
wheel, ratchet wheel over the barrel arbour, click and click spring.

**Motion works** — cannon pinion, minute wheel, hour wheel, on the dial side.

**Plate and bars** — skeletonised mainplate with perlage, barrel bar, train bar,
centre cock, escape cock, pallet cock and balance cock, all with Côtes de
Genève, chamfered edges, blued screws, and ruby jewels — several in gold
chatons. Seventeen of them, which is what the bridge says.

**Case** — 36.6 mm polished steel with a waisted band, domed AR‑coated sapphire,
sapphire display back, fluted crown, tapered lugs, and a stitched alligator
strap with keeper and buckle.

## The train is real

Centre distances are the sum of the two meshing pitch radii, and the tooth
counts multiply out to a working watch:

| mesh | drives | ratio | result |
|---|---|---|---|
| barrel 80 t | centre pinion 10 | 8 | centre wheel 1 rev/hour |
| centre 60 t | third pinion 8 | 7.5 | third wheel 7.5 rev/hour |
| third 64 t | fourth pinion 8 | 8 | fourth wheel **1 rev/minute** |
| fourth 72 t | escape pinion 6 | 12 | escape wheel 12 rev/minute |

The escape wheel has 15 teeth and advances half a tooth per beat; at 6 beats per
second that is 12 rev/min, which closes the loop. The balance therefore runs at
3 Hz — 21 600 A/h — with a 275° amplitude.

## One function drives everything

`buildMovement().update(t)` takes watch time in seconds and returns the hand
angles. There is no per‑frame state and no integration, so the model is
seek‑safe: ask for t = 37 000 and you get exactly the configuration the watch
would be in.

The escapement is derived from the beat count rather than from a clock:

```js
const beats = t * 6;
const n = Math.floor(beats), f = beats - n;
const drop = smoothstep(0, 0.085, f);       // the fast unlock-to-drop
esc   = STEP * (n + drop);                  // half a tooth per beat
fork  = LOCK * (2 * drop - 1) * (n % 2 ? -1 : 1);
bal   = Math.sin(Math.PI * beats) * AMPLITUDE;
```

The fourth wheel hangs off the escape wheel through its 6‑leaf pinion, so the
seconds hand inherits the stepping and trembles by half a degree at each beat,
the way a real sweep does. The hands are read straight off the same wheels the
model turns, so they cannot disagree with the movement.

Above 1× the hands run fast while the escapement keeps real‑time phase — 10 800
oscillations a second would just alias into noise. The readout says so when it
is happening. **1/10×** slows everything together, and is the setting for
watching the fork unlock, impulse and drop.

## Controls

Six camera presets (the last three turn the watch over to the display back),
speed from 1/10× to an hour a second, an exploded‑view slider, a turntable, and
toggles for the case, crystal, dial, bridges and strap. **Labels** annotates
26 parts with leader lines that follow the watch as it moves. Drag to orbit,
scroll to zoom.

## Files

| file | what it holds |
|---|---|
| `src/shapes.js` | 2D primitives: gear‑tooth outlines, club teeth, crossings, bridge chains, corner filleting |
| `src/parts.js` | wheels, pinions, arbors, jewels, chatons, screws, the coiled‑spring class, the tapering sweep |
| `src/textures.js` | procedural perlage, Côtes de Genève, circular graining, leather, dial printing |
| `src/materials.js` | the material set — one place to change the look |
| `src/movement.js` | layout constants, the movement, and `update()` |
| `src/dial.js` | chapter ring, small‑seconds register, Breguet hands |
| `src/watchcase.js` | case profile, crystals, lugs, crown, strap |
| `src/labels.js` | the annotation overlay |
| `src/main.js` | scene, lighting, post‑processing, camera choreography, UI |

## Notes and limits

- **Millimetres are the unit.** Bump scales, bevels and texture repeats are all
  sized in mm; changing the scale means retuning them.
- **`extrude()` compensates for the bevel.** ExtrudeGeometry runs its bevels
  from `-bevelThickness` to `depth + bevelThickness`, so parts come out `2×`
  bevel thicker than asked. The wrapper subtracts it, and the z‑layout of the
  movement depends on that being true.
- **Lathe profiles are subdivided before sweeping.** LatheGeometry averages
  adjacent segment normals, so a flat face defined by two points gets curved
  normals and a screw head renders as a glass bead.
- **`setAnimationLoop` passes a timestamp to its callback** — the frame function
  is wrapped for that reason. Passing it directly fed the timestamp in as a
  delta and ran the watch forward by hours per frame.
- The AO pass is the most expensive thing in the frame. If the average frame
  time goes over 30 ms the renderer drops it, then the pixel ratio, and logs
  what it did.
- The mainspring does not visibly unwind (the barrel turns once per eight
  hours), the click does not ratchet, and winding the crown does nothing — the
  keyless works are modelled but not driven.
