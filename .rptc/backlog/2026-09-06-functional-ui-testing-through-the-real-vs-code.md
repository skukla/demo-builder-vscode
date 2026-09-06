---
id: PL-46
kind: question
area: platform
needs: []
value: high
status: backlog
parent: PL-11
---

# Functional testing that drives the real VS Code, and where to stop

Asked 2026-09-06: can we automate creating a project by clicking through the UI, catching
errors and checking layout and styling?

Answer: yes, and three of the four layers already exist. This item is the decision about
the fourth, because the obvious version of it — click the wizard, make a project — creates
REAL Adobe Console projects, GitHub repositories and DA.live sites, which
[the repo's fifth non-negotiable](../../CLAUDE.md) forbids doing speculatively.

## What already exists

| Layer | Instrument | State |
|---|---|---|
| Component behaviour | `@testing-library/react` | heavily used; hardened all week by PL-22 |
| Decision coverage | Stryker mutation testing | PL-22; 89% of files at zero open gaps |
| Layout and styling | `webview-visual-baseline` | built, proven, gated ADR-018 and PL-21 |
| **Driving the real UI** | **nothing** | **the gap this item is about** |

**The styling half is already better than the usual answer.** `webview-visual-baseline`
fingerprints every element's computed styles across all eight surfaces — structural path
plus 23 properties, compared by exact string equality. No pixel tolerance, no font drift,
no screenshot flake, and it catches cascade and specificity changes, which is what CSS
breakage in this codebase actually is. Anyone proposing screenshot diffing should read it
first. What it does not do is prove the app WORKS; only that styling did not move.

## The gap, and the three standard ways to close it

**`@vscode/test-electron` — already a dependency (`^2.5.2`) and NEVER INVOKED.** No script
runs it; it appears only in `package.json`, an ADR, a README and an archived plan. It
launches a real VS Code with the extension loaded and asserts inside the extension host:
commands registered, activation completed, state persisted. Its limit is real — webviews
are isolated frames, so it cannot reach the React UI without help.

**`vscode-extension-tester` (Red Hat, Selenium) — the recommendation.** PURPOSE-BUILT for
VS Code extensions: it already understands the activity bar, side bar, notifications,
editors, the command palette and webview contents, and it manages downloading and launching
matching VS Code versions. Mature and widely used for this exact job.

**Playwright attached over the Electron debugging port.** VS Code is Electron, so Playwright
can attach and reach every frame, with better tooling — auto-waiting, trace viewer, real
debugging. But it knows nothing about VS Code: finding the right frame, knowing when the
window is ready, and driving editor chrome are all yours to write. And it is NOT VERIFIED
HERE — nobody has attached it to this extension.

**The first draft of this item got that comparison wrong** (2026-09-06), rating the two on
tooling quality and letting the unproven option read as the sophisticated choice. The right
axis is FIT: a tool that understands the application beats a better general-purpose tool
that does not, especially for a codebase one person maintains. Playwright's advantages —
trace viewer, auto-waiting — pay off across many tests; the setup cost dominates for a
handful of flows. This repo's instinct is the boring proven thing (Jest over newer runners,
esbuild over a bundler stack), and a bespoke CDP harness cuts against it.

Where Playwright genuinely wins is running the webviews standalone in a browser — which
`webview-visual-baseline` already does with its own harness, and which [[PL-47]] extends.
That is a different job from driving VS Code, and it is already solved.

## The constraint that shapes the design

Clicking the wizard through to a finished project creates real cloud resources. The
alternative of running against live cloud with teardown is slow, flaky, costs money and is
one failed cleanup away from orphaned resources in a real Adobe org.

**So: drive the real UI, fake the cloud boundary — not the other way round.** ADR-015 already
requires dependencies to arrive as parameters rather than be reached for, so the seams to
inject fake Adobe/GitHub/DA.live clients exist. The wizard, the handlers, the state writes
and the rendering all run for real; only the network edge is replaced. That keeps the test
honest about everything this repo actually owns.

## Recommended first step — NOT the click-through

Turn on `@vscode/test-electron` for ACTIVATION alone.

It is installed, unused, and activation is exactly where 2026-09-05 found the worst of it:
541 lines of `extension.ts` that no test had ever entered (it aborted at line 318 because
the workspace-trust flag was never set), and a `deactivate()` that threw on its first line
past four guards written for that very case. A test that launches VS Code, activates, and
asserts that commands registered and no error surfaced is roughly a day and covers the
riskiest path in the product.

Add UI driving on top only once that has earned its place.

## The question for the owner

1. Is a functional suite that stubs the cloud boundary worth having, given it will never
   catch a real Adobe/GitHub integration break? (The `mcp-live-probe` skill and the live
   journeys are what cover that, and they need a human.)
2. Any reason NOT to use `vscode-extension-tester`? It is the recommendation above; the
   Playwright alternative is recorded for completeness and would need proving first.
3. Should the activation step happen on its own merits regardless of the answer to 1 and 2?

## Its sibling

[[PL-47]] deepens the instrument that already exists — accessibility, theme variants and
widths against the standalone harness. The two are complements, not alternatives: PL-47
cannot prove a surface OPENS or that the extension sent the right payload, and this item
cannot cheaply reach the many states a fixture can express. The strongest argument for
having both is that a functional test is the only thing that could verify PL-47's fixtures
still match what the extension really sends.

Do PL-47 first. It is cheaper, it closes a stated-but-unenforced standard, and it does not
need this decision resolved.

## Shipped so far

- nothing; this is the decision, not the work.
