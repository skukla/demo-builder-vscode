# Visual regression testing for these webviews — verified end to end

**Question, asked by the owner 2026-08-29:** *"Is such a visual regression
strategy even possible for us?"* — then, once the first spike said yes: *"Can you
do all of the CSS verification so we have a clean path when we get there?"*

**Answer: yes, and every open question is now closed.** All eight surfaces render
outside VS Code, the Spectrum theme resolves in all of them, the signal is
stable across runs, and the approach demonstrably detects the exact class of bug
we care about. What follows is the recipe, the traps, and the one real cost.

`harness.html` in this directory is the working article.

## The recipe

A static page with:

1. a `<div id="root">`
2. VS Code's `--vscode-*` theme variables supplied by hand (the host normally
   injects them; ~16 are enough)
3. a stubbed `acquireVsCodeApi`
4. a `<script>` tag loading `dist/webview/<name>-bundle.js`
5. `reset.css` and `tokens.css` copied alongside — these two are fetched by URL
   rather than bundled, and 404 otherwise

The protocol is small and lives in `WebviewClient.ts`: the app posts
`__webview_ready__`, the host replies `__handshake_complete__`, then an `init`
message. Everything after is ordinary request/response, so states are set by
choosing what the stub answers.

### TRAP 1 — the handshake reply must not be immediate

Replying on `setTimeout(..., 0)` does not work. The client registers its
`message` listener during the same `initialize()` that sends ready, and a 0ms
reply lands in that gap: the app posts ready, hears nothing, and sits on its
loading state forever. **30ms works reliably.**

This cost the first spike an hour and produced a wrong intermediate conclusion —
six of eight surfaces looked like they "could not mount", when in fact none of
them had been answered.

## Result: all eight surfaces mount

Measured with each bundle in its own iframe, 2s settle:

| bundle | mounts | theme resolves | first rendered text |
|---|---|---|---|
| wizard | yes | `#e87400` | "Configuration Error / Wizard configuration not loaded" |
| dashboard | yes | `#e87400` | "Demo Project / AI / VERIFYING / View AI Capabilities" |
| configure | yes | `#e87400` | (empty — needs richer init) |
| sidebar | yes | `#e87400` | (empty — needs richer init) |
| projectsList | yes | `#e87400` | "Loading projects…" |
| aiOverview | yes | `#e87400` | (empty — needs richer init) |
| integrations | yes | `#e87400` | "Integrations / 1 integration / Add integration" |
| dataInstaller | yes | `#e87400` | "Data Installer / Browse and install…" |

**The sidebar was expected to be the holdout** — it acquires the VS Code API
itself rather than going through the shared client (ADR-017 §4, PL-19). It
mounts anyway, because the harness stubs the global `acquireVsCodeApi` that both
paths use. Good news for PL-19: the convergence can be verified here.

Four surfaces render an empty root with the trivial init payload used here. That
is a *fixture* gap, not a capability gap — they need a realistic `init` and
canned request answers, which the harness already supports.

### TRAP 2 — the theme scope only exists once the app has mounted

The first spike probed `.text-orange-600` and got inherited grey, which reads as
"the utility is broken". It is not.
`--spectrum-global-color-orange-600` is defined in all eight bundles but scoped
to Spectrum's theme selector, which the Provider applies **when it renders**. An
un-mounted app has no theme scope, so every Spectrum-variable rule resolves to
nothing.

Two consequences, and the second is the important one:

- probes must be appended INSIDE the themed subtree (find the element on which
  the variable resolves, and use it as the parent)
- **a harness that fails to mount reports a screenful of false regressions.**
  Any implementation must assert it is faithful before trusting a single value,
  and abort rather than report when that assertion fails.

## Result: it detects the bug class we care about

Probed inside the dashboard bundle's themed subtree, after today's CSS fixes:

    text-orange-600        rgb(232, 116, 0)     real orange
    text-orange-700        rgb(249, 137, 23)    real orange
    text-red-500           rgb(238, 67, 49)     real red
    zzz-not-a-real-class   rgb(235, 235, 235)   inherited  <- negative control

A defined class produces a distinct value; an undefined one inherits. That is a
clean, machine-checkable signal, and it is exactly the failure that shipped three
times today (`.text-orange-*` reachable only from EDS's sheet, `.number-badge`
only from `wizard.css`, `.text-red-500` only where `VerifiedField` was mounted).

Worth stating plainly: **these same probes returned inherited grey against the
pre-fix bundle.** The instrument distinguishes the broken state from the fixed
one, which is the whole requirement.

## Result: the signal is stable

Two consecutive runs of a 6-value fingerprint over the dashboard (colours,
backgrounds, padding, font-size, display, plus two probes): **identical, 6/6**.
No flake, no tolerance needed.

    .page-container-padded    rgb(235,235,235) | rgba(0,0,0,0) | 4px 32px | 14px | flex
    .dashboard-action-button  rgb(235,235,235) | rgba(0,0,0,0) | 12px     | 14px | flex
    .page-header-section      rgb(235,235,235) | rgba(0,0,0,0) | 4px 32px | 14px | flex

Timing: ~2s per surface, and that is dominated by a fixed `wait(2000)`. A
readiness signal instead of a sleep would cut it substantially. Eight surfaces
sequentially is ~16s today; in parallel, far less.

This is why **computed-style assertions beat screenshot diffing here**: exact
string equality, no pixel tolerance, no font-rendering drift, and it already
catches the failures this codebase actually has.

## The one real cost: CI

- **No browser driver is installed.** Neither Playwright nor Puppeteer is a
  dependency, direct or transitive. Adding one means a package plus a browser
  download (~100MB, cacheable).
- **CI does not build the webviews.** `.github/workflows/ci.yml` runs
  `npm ci --ignore-scripts` precisely to skip `npm run compile`, because tsc,
  eslint and jest do not need build output. A visual check DOES — it needs
  `dist/webview/*-bundle.js`. So CI would need an explicit build step (seconds
  with esbuild) in addition to the driver.

**Recommendation: do not put this in CI first.** Make it a release-cut
instrument, like `codebase-sweep` and `npm run eds:drift` — run deliberately,
before a cut or before touching CSS. That gets the safety net with none of the
CI cost, and CI can follow later if it earns its place.

## What this makes safe

PL-21's phase 4 (refactor) was gated on phase 1 producing a safety net. It does.
Specifically, before-and-after fingerprints across all eight surfaces would catch:

- a class that stops resolving (moved sheet, deleted rule, bundle no longer
  loads it)
- a cascade change from moving a rule between `@layer theme` and unlayered —
  the trap hit once already today
- a specificity change from removing an `!important`, which is what makes the
  1,957 of them frightening to touch

It would NOT catch: pure layout shifts that leave computed values unchanged, or
anything in the four surfaces still rendering empty until their fixtures are
built.

## Status of the phase-1 open questions

| Question | Answer |
|---|---|
| Do all eight surfaces mount? | **Yes**, all eight |
| Is the sidebar a holdout? | **No** — it mounts too |
| Reproduce the Provider's theme scope? | **Not needed** — mounting the real entry produces it |
| Stability? | **Identical across runs**, 6/6 values |
| Cost? | ~2s/surface, mostly a removable sleep |
| CI? | Needs a driver + a build step; **recommend a release-cut instrument instead** |

Phase 1 is verified. The remaining work is building the instrument, not
discovering whether one is possible.
