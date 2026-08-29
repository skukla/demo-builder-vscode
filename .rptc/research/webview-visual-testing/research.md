# Is visual regression testing possible for these webviews?

**Question, asked by the owner 2026-08-29:** *"Is such a visual regression
strategy even possible for us?"* — raised against PL-21, whose phase 1 assumed
the answer was probably yes.

**Answer: yes, demonstrated, not theorised.** A webview bundle renders in a plain
browser with no VS Code involved, its CSS applies, and computed styles are
readable. But the spike also found the trap that would have made a naive attempt
worse than useless, and that finding matters more than the yes.

## What was actually run

`harness.html` in this directory: a static page with a root div, a stubbed
`acquireVsCodeApi`, VS Code's `--vscode-*` theme variables hand-supplied, and a
`<script>` tag loading `dist/webview/dataInstaller-bundle.js`. Served over plain
HTTP, driven with Playwright.

## Result 1 — the bundle runs standalone

The Data Installer surface mounted and rendered:

    Data Installer
    Browse and install Adobe Commerce sample-data datapacks
    Catalog   Activity
    Loading datapacks...

It then issued real requests (`find-datapacks`, `get-datapack-import-target`),
which the harness answered with canned success. So the app is drivable: states
can be set up by choosing what the stub replies.

The protocol needed is small and fully documented in `WebviewClient.ts`: the app
posts `__webview_ready__`, the host replies `__handshake_complete__`, then an
`init` message. Everything after that is ordinary request/response.

## Result 2 — the CSS pipeline works outside VS Code

    style tags injected:  35
    CSS rules loaded:     1,392

`cssInjectionPlugin` turns every imported stylesheet into a `<style>` tag inside
the bundle, so the CSS travels with the JS and needs no VS Code resource URIs.

Our own rules resolve. `.page-container-padded` computed to `padding: 0px 32px`,
which is the rule from `custom-spectrum.css` — the cascade is real, not a
fallback.

Two stylesheets (`reset.css`, `tokens.css`) are fetched by URL rather than
bundled and 404'd until copied next to the harness. Minor, but it means the
harness has a small manifest of its own.

## Result 3 — THE TRAP, and the reason this needs care

Probing `.text-orange-600` returned inherited grey, not orange. First reading:
the utility is broken. That reading was **wrong**, and the check that settled it
is the point of this document.

Grepping the built bundles:

    --spectrum-global-color-orange-600: var(--spectrum-orange-800)

present in all eight. The variable IS defined — but scoped to Spectrum's theme
selector, which the harness never reproduced because the probe elements were
appended outside the Provider's themed subtree. No element on the page resolved
the variable at all.

So a naive harness **silently under-styles**. Every Spectrum-variable-based rule
resolves to nothing, and a diff taken against it would report a screenful of
regressions that do not exist in the product — or worse, a "fix" would be made to
satisfy the harness and break the real thing. That is precisely the mechanism
behind "we could never make certain things render properly": a feedback signal
that looks authoritative and is not.

**Consequence for any implementation:** the harness itself needs a positive
control before any diff is trusted — assert that a known Spectrum variable
resolves and that a known rule of ours applies. If the control fails, the harness
is lying and the run must abort rather than report.

## What this makes available

**Computed-style assertions, today, cheaply.** Playwright can read resolved
values, so "this element's colour is the negative semantic colour", "this
container is 960px wide", "this badge has a background" are all checkable. That
is a far steadier target than pixel diffing and would have caught all three CSS
bugs found on 2026-08-29.

**Screenshot diffing, probably, with work.** Not attempted. Font rendering,
async loading and animation all produce false diffs; the fake-timer and
`prefers-reduced-motion` techniques used elsewhere in the suite would need
porting. Recommend computed-style assertions FIRST and screenshots only if they
prove necessary — the cheaper mechanism covers the failures we actually have.

## What was not established

- Whether all eight surfaces mount as readily as this one. Only `dataInstaller`
  was tried. The sidebar is the likeliest problem, since it acquires the VS Code
  API itself (ADR-017 §4, PL-19).
- Whether the Provider's theme scope can be reproduced in a static harness, or
  whether the harness must render the real entry inside a real `Provider`. The
  latter is more faithful and probably the right answer.
- Stability across runs. Nothing was diffed twice.
- Whether this belongs in CI or stays a local instrument. Playwright is not
  currently a dependency.

## Recommendation

PL-21 phase 1 is viable and should proceed, with its first deliverable narrowed:
**a computed-style harness with its own positive control**, over one surface,
proving it can detect a class that stops applying. Screenshot diffing is a
separate, later question.

The harness in this directory is a starting point, not a finished instrument. It
is kept because reproducing the protocol handshake took the longest and is now
written down.
