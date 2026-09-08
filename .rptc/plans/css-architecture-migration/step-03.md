# Step 3 — flip the cascade, one sheet at a time

The step where the 762 elements arrive. **Gated on step 2**, because until the god
file is split there is no way to flip anything smaller than all eight surfaces at
once, which is what failed on 2026-09-08.

**This is a design review, not a bug hunt.** The changes are mostly our own CSS
finally applying. The question per element is "is this better?", and only the owner
can answer it.

## What the flip is

ADR-018 §1, already written and verified to work:

```js
const LAYER_ORDER = '@layer vendor, reset, theme, overrides;\n';
const isVendor = (p) => p.includes(`${path.sep}node_modules${path.sep}`);
// in cssInjectionPlugin's onLoad:
const css = LAYER_ORDER + (isVendor(args.path) ? `@layer vendor {\n${raw}\n}` : raw);
```

Measured working on 2026-09-08: 25 order statements and 21 vendor wrappers in the
dashboard bundle. The implementation is not the hard part and does not need
re-deriving — it is in the reverted commit's message and in ADR-018 §1.

The order statement is prepended to EVERY sheet on purpose: layer precedence is
fixed by the first declaration the browser sees, sheets arrive in whatever order
the bundle graph produces, and re-declaring an existing order is free.

## Scoping it to one surface

Once step 2 lands, a feature sheet reaches one bundle. Two mechanisms, in
preference order:

1. **Per-entry esbuild builds.** Today all eight entries build in one context, so
   `onLoad` cannot know the destination bundle. Splitting into eight contexts makes
   `isVendor` gateable per entry. Costs build time; esbuild is fast enough that this
   is likely negligible, and it should be measured rather than assumed.
2. **Wrap at the sheet, not the plugin.** Simply do not wrap our feature sheet in
   `@layer theme`, leaving it unlayered so it beats Spectrum with no vendor layer at
   all. Same cascade outcome for that sheet, no build change. The catch is that
   vendor stays unlayered too, so this does not satisfy PL-33's convention and is a
   staging tactic rather than the destination.

**Decide between these with a measurement, not a preference.** Time eight esbuild
contexts before choosing; if the cost is small, mechanism 1 is the real thing and
mechanism 2 is a detour.

## Order: cheapest to review first

From the 2026-09-08 measurement, elements moved per surface under the global flip:

| surface | moved | review size |
|---|---|---|
| dataInstaller | 24 | ~10 minutes |
| aiOverview | 42 | small |
| configure | 78 | an hour |
| integrations | 84 | an hour |
| wizard | 96 | an hour |
| dashboard | 180 | an afternoon |
| projectsList | 270 | the big one |
| sidebar | 6 | see the caveat |

Start at dataInstaller. It is small enough to review completely, and reviewing it
completely is what calibrates whether the rest is worth doing at all.

**The sidebar's 6 is not good news.** Its six interactive elements do not respond
to any forced pseudo-state, so hover/focus/active there are invisible to the
instrument (`capture-interactions.js`, coverage table). A low number on the sidebar
means the net cannot see it, not that little changed.

## What review means

For each moved element the diff names the property and both values. The owner
decides one of:

- **intent applying** — our rule now wins, and it should. Accept; this is the point.
- **regression** — Spectrum's value was better, or ours is stale. Fix OUR rule, do
  not re-add `!important`.
- **don't care** — sub-pixel, or an element nobody sees. Accept in bulk.

Most of the 762 are expected to be the first and third. `line-height` alone is 528
of the property changes and `height`/`width` another 516, largely sub-pixel
reflow. `font-weight` at 138 is the population most likely to contain real
decisions.

**Confirm in the Extension Development Host before accepting a surface.** The
harness supplies theme variables by hand; the last evidence-bar condition ADR-018
set is a real VS Code window, and it is the only check that catches a harness
artifact.

## Done when

- `vendorLayerBundles` reaches 8
- every surface's diff reviewed and accepted by the owner, per surface
- each accepted surface's fingerprint committed as the new baseline WITH the
  reason — never accepted to make a red cycle go green
- PL-33's "vendor CSS sits in the lowest cascade layer" becomes enforceable, and
  its enforcer is written in the same change that makes it true
