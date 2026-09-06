---
id: PL-46
kind: question
area: platform
needs: []
value: high
status: backlog
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

**`vscode-extension-tester` (Red Hat, Selenium).** The established tool for this exact job;
drives the real VS Code window INCLUDING webview contents. Mature, widely used, and
Selenium-shaped: slower and weaker tooling than the alternative.

**Playwright attached over the Electron debugging port.** VS Code is Electron, so Playwright
can attach and reach every frame. Far better tooling — auto-waiting, trace viewer, real
debugging. More assembly, and NOT VERIFIED HERE: nobody has attached it to this extension,
so treat it as promising rather than proven. Verify before planning around it.

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
2. If yes: Selenium-based `vscode-extension-tester` for maturity, or Playwright over CDP
   for tooling — accepting that the second needs proving first?
3. Should the activation step happen on its own merits regardless of the answer to 1 and 2?

## Shipped so far

- nothing; this is the decision, not the work.
