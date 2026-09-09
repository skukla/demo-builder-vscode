---
name: webview-visual-baseline
description: Prove a CSS or webview change is behaviour-preserving by fingerprinting every element's computed styles before and after. Use before ANY CSS refactor (ADR-018 / PL-21), or when a change must be shown to move exactly the elements it intended and nothing else.
---

# Webview visual snapshot — how to run it

The safety net PL-21 phase 4 is gated on, and the instrument that measured
ADR-018. Every claim in those documents came from here.

## What it does

Captures a **computed-style fingerprint** of all eight webview surfaces — every
element, keyed by structural path, with 23 computed properties — so a CSS change
can be proved behaviour-preserving by an empty diff, or shown to move exactly
the elements it was meant to.

Since 2026-09-08 it captures each surface at **two themes and three widths**
(PL-47), keyed `surface@theme@width`. That is 8 x 2 x 3 = 48 loads, so budget a
couple of minutes; pass a narrower matrix to `capture({ surfaces, themes, widths })`
while iterating on one surface.

**The theme axis is an IMPOSITION guard, not a light/dark regression check.** The
extension forces `vscode-dark` on every webview body and the owner confirmed that
is deliberate — one theme for every user. VS Code still supplies its own
`--vscode-*` variables from the user's real theme, and our CSS reads 13 of them,
so a light-theme user is where the imposed theme could leak. Verified on the
dashboard the day it was added: 68 app elements, byte-identical colours at both
themes. A diff between the two theme captures is what would show that slipping.

**420px is the load-bearing width.** Spectrum's Flex constrains at 450px, a bug
class a single-width capture cannot see at all. 900 is a normal editor column;
1280 is the historical baseline, kept so older fingerprints stay comparable.

**`auditContrast()` runs the one WCAG rule jsdom cannot.** The jest suite
(`tests/core/ui/accessibility.test.tsx`) checks every render but must disable
`color-contrast`, because jsdom has no paint. This runs the same rule in a real
browser against the real bundle. First run, 2026-09-08: dashboard, wizard and
sidebar all clean — 10, 14 and 8 passing checks, zero violations.

**READ THE PASS COUNT, NOT JUST THE VIOLATION COUNT.** Zero violations with zero
passes means nothing was inspected, not that everything is fine. The sidebar
reported exactly that on the first attempt, and the cause was a stale FIXTURE:
PL-19 moved its message envelope from `data` to `payload` and
`buildPushedMessages` still sent the old one, so the surface sat on its spinner in
the harness while working perfectly in a real window. That is the fixture rot
PL-47 predicted, and it appeared the same day as the change that caused it. Fixed;
the sidebar went from 11 elements and no text to 42 elements and 8 contrast
checks.

Not screenshots: exact string equality, no pixel tolerance, no font drift, and it
catches cascade and specificity changes, which is what this codebase's CSS
failures actually are.

## Interaction states — `capture-interactions.js` (added 2026-09-08, PL-21 phase 4)

The resting fingerprint cannot see a single one of the **147 rules** in our
stylesheets that carry an interaction selector — 68 `:hover`, 45 `:focus`, 19
`:focus-visible`, 8 `:disabled`, 5 `:active`. ADR-018's evidence bar for migrating
existing CSS names this explicitly, and says why it matters: interaction states are
"exactly where Spectrum's own rules concentrate", which is what the layer fix
changes.

**It runs through `browser_run_code`, not `browser_evaluate`**, and that is forced
rather than chosen: `:hover` is driven by the browser's own input state and there
is no DOM API to set it. Forcing it needs CDP (`CSS.forcePseudoState`), which is
driven from Playwright, outside the page. So this file takes `page`; `capture.js`
takes nothing.

Load it the same way each time — the Playwright context has no `fetch`, so read the
file through the PAGE:

```js
await page.goto(BASE + '/capture-interactions.js');
const code = await page.evaluate(() => document.body.innerText);
const mod = { exports: {} };
new Function('module','exports', code + '\nmodule.exports={captureInteractions,diffInteractions,assertForcingWorks};')(mod, mod.exports);
const before = await mod.exports.captureInteractions(page, { base: BASE });
mod.exports.assertForcingWorks(before);   // NEVER skip this
```

**Transitions are frozen before any state is forced (2026-09-09).** Forcing a
pseudo-class changes which rules match instantly, but a transitioned property takes
its duration to arrive — so `getComputedStyle` returns whatever value the animation
is at, and the fingerprint becomes a function of how long the previous `await` took.
Two runs of the SAME bundle disagreed about `sidebar|0`, and a correct
`.dashboard-*` move was reported as changing `dashboard|7` at focus and active: the
captured values were about 10% and 0% through a 200ms lift. `captureInteractions`
now injects `transition: none !important` after the surface has mounted, and two
runs of one build agree on all 168 cells. **A false positive is the failure mode
that makes an instrument worse than none**, because the response to it is to revert
correct work.

**Web Animations are pinned too, not only CSS ones (2026-09-09).** The CSS freeze
cannot reach an animation started through `element.animate()` — no stylesheet
declares it, so no `!important` outranks it. `capture.js` has always pinned those
through the harness's `window.__FREEZE__`; this did not, and one sidebar tile kept
drifting a colour channel or two between runs of the same build after the
transition freeze had removed every other disagreement. `__FREEZE__` is now called
at mount AND before every read, because forcing a state can start an animation.

**`assertForcingWorks` is the control and it is not optional.** If no element
responds to a forced state, either CDP never reached the page or the surface did
not mount — and a clean interaction diff would then mean nothing at all. It throws
rather than returning a verdict.

### Coverage, measured 2026-09-08

168 cells over 42 interactive elements, at dark/1280. Each element is captured at
rest, hover, focus and active.

| surface | interactive | responding to a forced state |
|---|---|---|
| dashboard | 9 | 14 |
| wizard | 8 | 5 |
| projectsList | 8 | 3 |
| sidebar | 6 | **0** |
| configure | 4 | 1 |
| integrations | 3 | 1 |
| aiOverview | 2 | 1 |
| dataInstaller | 2 | 1 |

**The sidebar's zero is a real gap, not a failure.** It has six interactive
elements and none changes under a forced hover, focus or active — so whatever
feedback its tiles give a user is invisible to this instrument. Anything the layer
fix does to sidebar interaction states will not show up here. Do not read a clean
sidebar row as evidence.

**`:disabled` and error states are still uncovered.** The fixtures render no
disabled control and no error state, so two of the four states ADR-018 asked for
are absent. Forcing works for them (`forcedPseudoClasses: ['disabled']`); what is
missing is a fixture that produces such an element to force it on.

## Files

| | |
|---|---|
| `harness.html` | loads one bundle standalone, stubs the VS Code API, serves fixtures |
| `build-fixtures.mjs` | generates `fixtures.json` from REAL artifacts |
| `capture.js` | the fingerprint + faithfulness control + diff, run in the browser |
| `capture-interactions.js` | hover/focus/active fingerprints, driven from Playwright over CDP |

The two writeups stayed in `.rptc/research/webview-visual-testing/` — that tier is
for findings, this one is for the instrument: `research.md` (how the approach was
proven) and `important-is-not-necessary.md` (the `!important` / cascade-layer
finding). ADR-018 cites both.

## Procedure

```bash
# 1. Build — CI does not, so the instrument must
npm run compile

# 2. Stage bundles, styles, harness and fixtures together
mkdir -p /tmp/vr && cp dist/webview/*-bundle.js /tmp/vr/
cp src/core/ui/styles/reset.css src/core/ui/styles/tokens.css /tmp/vr/
cp .claude/skills/webview-visual-baseline/harness.html /tmp/vr/h.html
# Only needed for auditContrast() — the WCAG rule jsdom cannot judge.
cp node_modules/axe-core/axe.min.js /tmp/vr/
node .claude/skills/webview-visual-baseline/build-fixtures.mjs /tmp/vr

# 3. Serve where the browser can reach it
cd /tmp/vr && python3 -m http.server 8899
```

Then drive a browser at `http://host.docker.internal:8899/h.html?b=dashboard`
(`host.docker.internal`, not `localhost` — the MCP browser is containerised) and
evaluate `capture.js`'s `capture()`.

**PROVE THE BROWSER REACHED *YOUR* SERVER FIRST.** On 2026-09-08 port 8899 was
already answered by an unrelated Fastify app from inside the container, so every
iframe got a JSON 404 — `#root` missing, no theme class, transparent background.
Read naively that is "the theme switch is inert", and the run was minutes from
being reported as a broken instrument. Drop a sentinel next to the harness and
fetch it through the browser before trusting anything:

```bash
echo "VR-SENTINEL-$RANDOM" > /tmp/vr/sentinel.txt
```

Navigate to `/sentinel.txt` and confirm the browser reads back the value you
wrote. A 404 page and a working page both render; only the sentinel tells them
apart.

To compare: capture, change CSS, `npm run compile`, re-copy the bundles, capture
again, `diff(before, after)`.

## The four things that make it trustworthy

Each was found by a control that failed first. Removing any one gives you an
instrument that reports clean while seeing nothing.

1. **The faithfulness control.** `assertHarnessFaithful()` throws unless the app
   mounted, a Spectrum variable resolves, and one of our own rules applies. An
   unmounted harness produces a clean-looking fingerprint of inherited defaults
   and a diff full of regressions that do not exist.

2. **Cache-bust the BUNDLE url**, not just the page. Without it the browser
   serves the previous build and the comparison is a build against itself. This
   reported "no change" for a change that was definitely present.

3. **Freeze animations via the Web Animations API**, not only CSS. The CSS rule
   in the harness is unlayered `!important`, and `.animate-pulse` is
   `!important` inside `@layer theme` — a layered `!important` wins. The
   instrument was bitten by the exact cascade rule ADR-018 exists to fix.

4. **Answer requests with the RIGHT envelope.** `WebviewClient` matches on
   `isResponse` + `responseToId`. An earlier harness used `type:'response'` +
   `requestId`, so **no request was ever answered** and every one timed out
   silently — surfaces still rendered from their init payloads, so it looked
   fine. A broken reply path presents as a slow surface.

## Clear localStorage before a session, and use two fixed keys

The harness serves from the same port every run, so every baseline any session ever
stored is still there under that origin. On 2026-09-09 the fourteenth accumulated
key tipped it over and the capture died with `QuotaExceededError: Setting the value
of 'm-rest' exceeded the quota` — which reads as a broken instrument, not a full
cupboard.

```js
await page.evaluate(() => localStorage.clear());
```

Then store under `vrBefore` and `vrBeforeInter` rather than a name per cycle. Two
keys that get overwritten cannot accumulate, and the next session inherits nothing
it has to reason about.

## Parse-compare the sheets before spending a browser run

A CSS edit that is "only comments" can still be invalid, and an invalid sheet does
not fail loudly — the browser drops the rules it cannot parse and everything else
renders. On 2026-09-09 a comment-relocation pass cut two block comments in half;
the orphaned tails became CSS, Chrome dropped `.dashboard-status-badges` and
`.dashboard-status-capabilities-link`, and 48 elements moved. Brace counts
balanced, `tsc` and the whole jest suite were green, and the file looked right in a
diff.

Parse both versions of every touched sheet and compare the rules, which takes
seconds and names the missing selector:

```js
const flatten = (css) => {
  const s = new CSSStyleSheet(); s.replaceSync(css);
  const out = []; const walk = (rules, layer) => { for (const r of rules) {
    if (r.cssRules) { walk(r.cssRules, r.name !== undefined ? `@layer ${r.name}` : layer); continue; }
    out.push((layer || '') + ' :: ' + (r.cssText || '').replace(/\s+/g, ' '));
  } }; walk(s.cssRules, ''); return out;
};
// A.filter(x => !B.includes(x)) must be empty, and B.filter(x => !A.includes(x)) too.
```

Serve `git show HEAD:<file>` and the working copy next to the harness as `.txt`
and read them through the page. This is a PRE-CHECK, not a replacement: it proves
the sheet still says the same thing, not that the cascade still resolves the same
way across sheets.

## Fixtures

`build-fixtures.mjs` reads shapes rather than inventing them (ADR-016 rule 3):

- the project from a REAL manifest on disk, plus the `path` and `status` the
  loader adds and the file does not store
- wizard steps from `src/features/project-creation/config/wizard-steps.json`
- the component registry from `components.json`, transformed keyed-object →
  array exactly as `ComponentRegistryManager.loadRegistry()` does
- init field lists from each command's `getInitialData()`
- pushed-message shapes from `src/types/webviewPayloads.ts`

Four shapes were invented first and each one broke something visibly — a
crashed surface, an empty root, a permanent loading state. That is the value of
the fixtures being generated from source rather than typed out.

**Two envelopes exist and they are not interchangeable.** The sidebar reads raw
`event.data` because it bypasses `WebviewClient` (ADR-017 §4 / PL-19), so its
messages carry `data`. Everything else goes through the client, which hands
`message.payload` to handlers. Using the wrong one crashes the surface.

## Coverage today

| surface | elements | |
|---|---|---|
| wizard | 105 | Create Demo Project, Demo Setup, project name |
| projectsList | 77 | Your Projects, 1 project, the card |
| dashboard | 72 | project heading, AI zone, actions |
| sidebar | 46 | AI, Chat, Prompts, Utilities, Tools |
| configure | 45 | Configure Project, the form |
| integrations | 43 | Integrations, count, empty state |
| dataInstaller | 37 | Data Installer, catalog |
| aiOverview | 30 | Prompt Library |
| **total** | **455** | 8/8 stable across consecutive runs |

Before fixtures this was 209 elements with four surfaces under 16 — and an
"IDENTICAL" verdict on a five-element surface is not evidence of anything, which
is what the ADR-018 audit found.

## Known gaps

- **The integrations surface renders differently on a session's FIRST capture.**
  Nine interactive elements once, three on every run after — reproducible on both
  sides of a change, so it is fixture state, not a regression. `diffInteractions`
  now refuses a surface whose element count moved rather than reporting the 36
  phantom differences that shift produces; a count mismatch means re-run, not read.
- **Three WIDTHS, one height.** The matrix varies width at 420/900/1280 and leaves
  the viewport height alone, so a `@media (max-height: ...)` rule is never
  exercised and an empty diff says nothing about it. The sidebar's short-panel
  breakpoint is the one that matters today; when you move or touch a
  height-conditional rule, read it directly at two heights instead of trusting the
  matrix (2026-09-09).
- **Default state only.** No hover, focus, disabled or error states — and those
  are where Spectrum's own rules concentrate.
- **Not confirmed in a real VS Code webview.** The harness supplies `--vscode-*`
  variables by hand; the real host supplies more.
- **23 properties, not all of them.** Extensible, and extending it is cheap —
  but a change invisible to all 23 passes.
- **Agent-driven.** Playwright is not a repo dependency (5 MB if wanted; the
  browsers are already cached locally). Recommended as a release-cut instrument
  rather than a CI gate — CI runs `npm ci --ignore-scripts` and never builds the
  bundles.
