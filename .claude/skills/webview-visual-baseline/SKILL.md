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

Not screenshots: exact string equality, no pixel tolerance, no font drift, and it
catches cascade and specificity changes, which is what this codebase's CSS
failures actually are.

## Files

| | |
|---|---|
| `harness.html` | loads one bundle standalone, stubs the VS Code API, serves fixtures |
| `build-fixtures.mjs` | generates `fixtures.json` from REAL artifacts |
| `capture.js` | the fingerprint + faithfulness control + diff, run in the browser |

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
node .claude/skills/webview-visual-baseline/build-fixtures.mjs /tmp/vr

# 3. Serve where the browser can reach it
cd /tmp/vr && python3 -m http.server 8899
```

Then drive a browser at `http://host.docker.internal:8899/h.html?b=dashboard`
(`host.docker.internal`, not `localhost` — the MCP browser is containerised) and
evaluate `capture.js`'s `capture()`.

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
