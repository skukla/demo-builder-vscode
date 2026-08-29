# ADR-017: Webview architecture — one channel per bundle, props below, styles inside the bundle

**Status:** Accepted (owner-ratified 2026-08-29)
**Scope:** the WEBVIEW side only — `**/ui/**` and `*.tsx`. The extension host is **ADR-015**.
**Enforced by:** `tests/sop/webview-architecture-rules.test.ts` (§5's hook rule)
and `tests/sop/stylesheet-bundles.test.ts` (§6), both build-failing, over
one reasoned exemption ledger

## Context

This extension is two programs. Only one of them was written down.

ADR-015 describes how the extension host acquires dependencies: fetch at the
boundary, inject below, wire in the root. It was applied to all 896 source files,
including the 291 that run in a browser with no `vscode` API, no service locator,
and a different composition root per bundle.

The gap was not theoretical. Frontend rules were being invented and enforced
**under ADR-015's name**, in a document that mentions React zero times. Measured
2026-08-29, before this ADR existed:

- one of ADR-015's six checks was a pure React rule (hook literals), with five
  files on its exemption ledger — all five webview files
- `WebviewClient.ts` sat on the construction ledger with **no lawful
  alternative**: it cannot be built in `extension.ts` (different bundle, different
  runtime) and ADR-015 named no webview construction site. It was listed as debt
  nobody could discharge
- there is **no React context anywhere in the frontend** (`createContext`: zero
  occurrences), so the assumption that webview dependencies arrive "as props and
  context" was half aspiration

The damage was small and specific — six ledger entries — but the shape of it was
the problem: rules with no home do not stay coherent, and nobody looks for a
React rule in a document about service locators.

## Decision

### 1. The composition root is the bundle entry

Each of the eight entries in `WEBVIEW_ENTRIES` (`esbuild.config.js`) is a
composition root, and the only one its bundle has. It owns mounting, the
init-data cast, and which stylesheets the bundle loads.

Anything webview-side that must be built is built there and passed down. This is
the frontend's `extension.ts`, and there are eight of them because there are
eight programs.

### 2. Dependencies arrive as props

Not context. There is none today, and introducing one to mirror the host side
would be architecture for its own sake — the mechanism has to earn its place.

If a case arises where prop-threading is genuinely unworkable, adding a context
is a change to this ADR, not a local decision.

### 3. The message channel is a RATIFIED singleton

`webviewClient` (`src/core/ui/utils/WebviewClient.ts`) is a module-level
singleton, imported directly by the code that needs it — 41 files today. This is
**allowed, deliberately**, and it is the one place this ADR diverges from
ADR-015's instincts.

The reason is a runtime constraint, not convenience: `acquireVsCodeApi()` can be
called only once per webview. A second acquisition throws. So there is exactly
one channel per bundle, it cannot be varied, and injecting it would be ceremony
around a value with one possible binding.

> **Verify before extending this reasoning.** The once-only constraint is VS
> Code's, and it is documented in VS Code's webview API docs rather than
> anywhere in this repo. It is load-bearing for this section. If it turns out to
> be wrong, section 3 needs re-deciding — not quietly working around.

This discharges `WebviewClient`'s construction-ledger row by **ruling on it**.
It is no longer listed as debt, because it is no longer debt.

**What ratifying it obliges us to do:** name one canonical way to fake it in
tests. 92 suites mock this module across two import paths — 66 mock
`@/core/ui/utils/WebviewClient`, 26 mock `@/core/ui/utils/vscode-api`. Both work
only because `vscode-api` re-exports the same instance (`vscode-api.ts:12`).
Nothing states that and nothing enforces it, which is the kind of subtlety that
reads as a broken mock when it breaks. See ADR-016 § Fixtures and fakes.

### 4. One channel per bundle — not two

Seven entries reach the host through `webviewClient`. `src/features/sidebar/ui/index.tsx`
calls `acquireVsCodeApi()` itself and hand-rolls its own `sendMessage`.

That is not merely inconsistent. The sidebar bundle does not currently import
`WebviewClient`, so it acquires once and works. The moment anyone imports a
shared hook into the sidebar — every one of them reaches the client — the bundle
acquires twice and throws. It is a latent crash sitting behind an ordinary
refactor.

The sidebar converges on the shared client. Tracked separately, because it is a
behaviour change rather than a documentation one.

### 5. Hooks are the webview's service layer

Data-fetching hooks (`useVSCodeRequest` and the per-feature wrappers built on
it) are where the message channel is touched. Components take props.

This is the honest frontend analogue of ADR-015's "logic never fetches": the
channel has one lawful home per concern, and a component that talks to the host
directly is doing a hook's job.

**The hook-literal rule belongs here**, moved from ADR-015 with its five
exemptions: a custom hook whose `useEffect` depends on a prop must not be called
with an inline `[]` or `{}`. A fresh literal is a new reference every render, so
the effect re-runs forever. Use a module-level constant.

### 6. A stylesheet belongs to its bundle's graph

**This is the rule that made a separate ADR necessary rather than a section
somewhere.** It is the styling corollary of section 1: eight entries, eight
graphs.

A feature stylesheet reaches a bundle only through a side-effect `import`
somewhere in *that entry's* graph. So a class can be styled in one surface and
simply absent in the next — and the element renders raw, with **no error
anywhere**: no compile failure, no console warning, no failing test.

Incident, 2026-07-31: `DestinationStage` used `.service-action-link`, defined in
EDS's `connect-services.css`. That sheet reaches the wizard bundle only because
`StorefrontStep.tsx` imports it. On the integrations surface the class did not
exist and the "Change" button rendered as a raw grey box. Its styling in the
wizard had been working by accident.

So, before reusing a component across surfaces, confirm every class it needs
lives in a sheet the TARGET bundle loads. `custom-spectrum.css`, `index.css` and
`vscode-theme.css` are imported by every entry; anything under
`src/features/*/ui/styles/` is not.

**Enforced** by `tests/sop/stylesheet-bundles.test.ts` since 2026-08-29
(PL-18). It builds each entry with the real esbuild config — the same
`WEBVIEW_ENTRIES` and the same alias plugin, so the check cannot drift from the
build — reads the graph esbuild emits, and flags any class a component uses that
no stylesheet in that bundle defines. ~1.2s for all eight.

Its first run found **8 sites across 3 classes**, all fixed in the same commit
rather than ledgered: `.text-orange-500`/`.text-orange-600` moved out of EDS's
feature sheet into `custom-spectrum.css`, and `.number-badge` out of
`wizard.css` (which only 4 of 8 entries import) — each keeping its original
layer, because moving a rule between `@layer theme` and unlayered changes the
cascade and that would be a different bug from the one being fixed.

Two limits, stated because a clean result should not imply more than it means:

- **123 class lists cannot be read statically** (was 151). These are template
  literals whose class list is assembled at runtime. Note the number counts
  SITES PER BUNDLE, not files — a shared component in five bundles contributes
  five, so the distinct count is far smaller. Of the 36 distinct sites found,
  23 were `className={someProp}` pass-throughs whose real class is checked at
  the CALL site and were never blind spots; 10 of the remainder were converted
  to `cn()` calls, which the check reads. What is left is one genuinely dynamic
  case (`InlineNotice` builds `inline-notice--${tone}`) plus two helper calls.
  The ceiling ratchets downward.
- **A class defined in NO stylesheet is a SEPARATE rule**, `classesDefinedNowhere`,
  enforced beside this one against its own ledger. It is a different defect with
  a different fix — the rule was never written, or the markup is dead — and only
  a person can say which. 19 remain, seeded so the set cannot grow; the triage is
  PL-20. Two were fixed on sight because they were visible bugs: `.text-orange-700`
  on warning text and `.text-red-500` on an error icon, both rendering with no
  colour at all.

**One thing the check had to learn, and it is a smell worth naming.** Four
components define classes inside inline `<style>` blocks (TimelineNav,
ConfigurationSummary, VerifiedField, WizardContainer — 12 classes). Those classes
exist only while the defining component is MOUNTED. `.text-red-500` was one of
them and `AdobeAuthStep` depended on it, so the error icon was red only when
VerifiedField happened to be on screen. That is a stranger dependency than the
one §6 was written for, and the scanner now counts style-block classes as defined
within their own bundle so it does not report them as missing.

## What is NOT architecture

Everything else in `.claude/skills/spectrum-webview-ui` stays a skill: the Flex
450px cap, dimension-token mismatches, `DialogContainer type="fullscreen"`,
Menu/Section child typing, dashboard notice conventions, `box-sizing`.

The line, and it is worth stating because it is the question this ADR was asked:

> **A rule is architecture if breaking it breaks a boundary — where code may
> live, or what may depend on what. It is style if breaking it produces a
> wrong-looking result.**

The practical test is what a violation costs. An architecture violation fails
silently, somewhere else, and is found by a user. A style violation announces
itself on screen to whoever is looking at it.

Every rule above except the stylesheet one announces itself immediately. They are
expensive to rediscover, which is why the skill exists — but a skill is the right
home, because it loads when someone is doing the work rather than when someone is
deciding where code goes.

**The alternative line, rejected:** "architecture is whatever we enforce with a
check." It is tempting because it makes the document actionable, but it produces
a worse split — it would pull in the inline-styles SOP, which has a check and is
plainly about styling, and push OUT section 6, which has no check today. The
correct response to "our most architectural rule is unenforced" is to write the
check, not to reclassify the rule.

## Consequences

- ADR-015 no longer judges 291 webview files by rules that never considered them.
- The hook rule has a home where someone would look for it.
- `WebviewClient` leaves the construction ledger — decided, not deferred.
- Every section is now enforced except §§1–2 and §5's prop rule, which are
  design rules rather than mechanical ones. §6 gained its check on the day this
  ADR shipped, and the check paid for itself immediately: 3 real cross-bundle
  dependencies, all shipped, none visible to any other tool.

## Rejected alternatives

**Add the webview entries to ADR-015's allowed construction sites.** This was the
first recommendation in PL-17 and it was superseded. It fixes `WebviewClient` and
leaves the hook rule still homeless — treating the symptom while the cause (one
document claiming two runtimes) stays in place.

**Thread the message client through props from each entry.** Consistent with
ADR-015 and wrong here: it would add a prop to most of the component tree to vary
something that cannot vary, and 92 test suites already fake it at the module
level successfully. Rejected on section 3's constraint.

**Introduce a React context for the client.** Same objection, plus it would be
the first context in the codebase, introduced to satisfy a symmetry rather than a
need.
