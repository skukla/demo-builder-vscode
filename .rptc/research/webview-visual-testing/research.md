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

## Who can run it, and what each option costs

**CORRECTION 2026-08-29.** An earlier version of this document said "no browser
driver is installed", which was wrong in the way that mattered: **we do have
Playwright** — the entire verification above was run through it. What is absent
is a *repo-level dependency*, which is a different and much smaller gap. The
three options are genuinely different and the wrong one was nearly recommended.

| Route | Available now | Who can run it | Cost |
|---|---|---|---|
| **Agent-driven via MCP** | **Yes — this is what ran every result above** | an agent | **zero** |
| **Repo dependency** | no | anyone, any npm script, eventually CI | `playwright` is 5 MB unpacked; browsers already cached |
| **CI** | no | CI | the above, plus a build step |

Facts behind that table:

- `playwright` is **not** in this repo's dependencies and not in `node_modules`;
  a jest test here cannot `require('playwright')` today.
- It is **not** installed globally either.
- But **the browsers are already on this machine** — `~/Library/Caches/ms-playwright`
  holds 1.7 GB including `chromium-1200`, `chromium-1217` and the MCP Chrome
  builds. The "~100 MB download" cost cited earlier is already paid here, though
  a fresh CI runner would still pay it.
- The npm package itself is **5 MB unpacked** (v1.62.1). Adding it is cheap.
- CI additionally runs `npm ci --ignore-scripts` specifically to skip
  `npm run compile`, so `dist/webview/*-bundle.js` does not exist there. Any
  CI-run visual check needs an explicit build step regardless of driver.

### The MCP route has one real constraint

The MCP browser runs **in a container**. `localhost:878` was unreachable from it;
`host.docker.internal:878` worked. So the harness must be served over HTTP on an
address the container can reach — a `python3 -m http.server` in the bundle
directory is enough, and is what the spike used. Not a blocker, but it is why the
instrument cannot simply open a `file://` path.

### Recommendation, revised

**Start with the agent-driven route, because it works today at zero cost** and
matches how this repo already runs its periodic instruments — `codebase-sweep`,
`dream`, `eds:drift` are all invoked deliberately by an agent at a release cut,
not by CI.

Add the 5 MB repo dependency when a human or a script needs to run it without an
agent. Consider CI last, and only if the instrument has earned it — the build
step is the awkward part there, not the driver.

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

---

# The baseline / change / re-snapshot / compare workflow — PROVEN

**Owner's proposal, 2026-08-29:** *"capture each and every webview as a baseline
snapshot, try our CSS architecture on it, take another snapshot, and then compare
the two. Definition of done for each factor should be that it returns back to the
baseline exactly."*

**It works, demonstrated end to end.** The full cycle was run against all eight
surfaces:

| Step | Result |
|---|---|
| 1. Capture baseline | 8 hashes recorded |
| 2. Rebuild, no source change | **8/8 match** |
| 3. Plant a CSS change | **3 surfaces DETECTED** — exactly the ones rendering the affected element; the other 5 correctly unchanged |
| 4. Revert the change | **8/8 back to baseline exactly** |

That last row is the owner's definition of done, and it held.

## What a snapshot is

A **full-tree computed-style fingerprint**, not a screenshot. Walk every element
from `body`, key it by structural path (`/0/2/1/…`) plus tag name, and record 16
computed properties: color, background-color, font-size, font-weight, padding,
margin, display, position, width, height, border, flex-direction, align-items,
justify-content, opacity, text-align. Hash the result.

Sizes are modest — dashboard 72 elements, integrations 46, dataInstaller 36,
projectsList 22, sidebar 15, wizard 8, configure/aiOverview 5 each. The small
ones are surfaces whose fixtures are not built yet, not surfaces that fail.

Hashes are for reporting; the stored artifact should be the full line list, so a
diff can name the element and property that moved rather than only saying
"changed".

## Three things that must be right, all found the hard way

### 1. Freeze animations, or the snapshot is not reproducible

The first full-tree comparison came back 71/72 identical. The one difference was
the dashboard's pulsing `.status-dot`, caught mid-animation: opacity `0.736531`
vs `0.766540`.

The harness now injects:

    *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
    }

After that, five surfaces captured twice were **byte-identical, zero diffs**.
Animation was the only nondeterminism in the entire corpus.

### 2. Cache-bust the BUNDLE url, not just the page

The first planted-change control reported "no change" on all eight surfaces —
for a change that was verifiably in the built bundle. The harness cache-busted
its own URL but loaded `./<name>-bundle.js` with no query, so the browser served
the previously-fetched bundle and **the comparison was a build against itself**.

Without that control, the earlier "identical across a rebuild" result would have
been recorded as proof of stability. It was true, but for the wrong reason.

### 3. THE BIG ONE — `!important` inside a layer beats `!important` outside it

After fixing the cache, the control STILL did not fire. The planted rule was
present in the loaded stylesheets, with `!important`, and the element still
computed the old value.

Cause: **CSS cascade layers reverse precedence for `!important` declarations.**
For normal declarations, unlayered wins over layered. For `!important`, the order
inverts — a layered `!important` beats an unlayered one.

`custom-spectrum.css` wraps its rules in `@layer theme`, and
`.page-container-padded` sets `padding-left: … !important` at line 626. A rule
appended at the END of that same file, outside the layer, loses **even with
`!important`**.

This is load-bearing for the whole CSS effort:

- "Append an override at the bottom of `custom-spectrum.css`" — the obvious
  move — **does not override anything inside `@layer theme`**, importantly or
  otherwise. It is a strong candidate for the owner's "things we never could make
  render properly".
- It also caveats the fix made earlier the same day: `.text-orange-*` and
  `.text-red-500` were appended unlayered and DO apply — but only because no
  competing rule exists. Had one existed in the layer, the fix would have
  silently done nothing. (Verified working: `text-orange-600` computes
  `rgb(232,116,0)` in the dashboard bundle.)
- Any refactor moving rules between layered and unlayered contexts changes
  outcomes in a direction most people's CSS intuition gets backwards.

The control only fired once it modified the EXISTING layered rule. That is the
correct shape for a control here: change something that can actually win.

## The workflow, as it should be run

1. **Build.** `npm run compile` — CI does not do this, so the instrument must.
2. **Serve** the bundle directory over HTTP (`python3 -m http.server`), reachable
   at `host.docker.internal` if driven through the containerised MCP browser.
3. **Capture** each of the eight surfaces into a fingerprint file, cache-busting
   the bundle URL. Commit these as the baseline.
4. **Assert the harness is faithful** before trusting anything — a known
   Spectrum variable resolves, a known rule of ours applies. Abort if not.
5. **Change** the CSS.
6. **Rebuild, re-capture, diff.** Empty diff = the refactor is behaviour-
   preserving. Non-empty = it names the element and property that moved.

## Honest limits

- **Only what the 16 properties capture.** A change invisible to all of them —
  a different `z-index`, a `box-shadow`, a `transform` — passes. The list is
  extensible; it is a choice, not a boundary.
- **Only the states the fixtures produce.** Four surfaces currently render near-
  empty, so their baselines are thin. Hover, focus, error and modal states are
  not captured at all yet.
- **Not a pixel check.** Two different rules producing the same computed values
  are indistinguishable, which is usually what you want and occasionally is not.
- **The animation freeze hides animation regressions** by construction.
