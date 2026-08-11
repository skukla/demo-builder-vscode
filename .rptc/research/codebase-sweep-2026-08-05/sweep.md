# Codebase sweep — 2026-08-05

First run. Establishes the baselines; findings below are verified at file level, not
taken from scan output.

## Movement since last sweep

| Scan | Last | Now | Verdict |
|---|---|---|---|
| component-extraction | — | 9 groups | baseline |
| code-duplication (jscpd) | — | 61 clones, 0.65% of lines | baseline |
| circular-dependency | — | 13 cycles | baseline |
| dead-code doc-drift | — | 0 | clean (4 fixed earlier today) |

## Findings

### 1. Two steps share a shell — NOT extracting yet (verdict revised)

**Initial read was wrong; the diff corrected it.** Recorded in full because the next
sweep will surface this group again and should not redo the reasoning.

- **Scan said:** `step-view`, `step-nav-area`, `step-nav`, `commerce-body` appear in
  exactly `CommerceStep.tsx`, `IntegrationsStep.tsx`, `StorefrontStep.tsx` — three
  sites, four shared classes. Looks like one shell rendered three times.
- **Diff says:** two, not three. `IntegrationsStep` (`:239-258`) has **no**
  `VerticalStepList` (no sub-steps to list), carries extra `int-results` /
  `int-results--empty` classes on the anim div, and passes **no `key`** — it does not
  crossfade because it has nothing to crossfade between. A legitimate variant that
  shares class names, not a copy that drifted.
- **Drift claim retracted.** `step-view-anim` reaching `IntegrationsStep` through its
  own commits (`d4b2bc35`, `bff00a7b`) looked like the same behaviour implemented
  twice. It was Integrations building its own thing. Meanwhile the three real shell
  changes — `018ba72e`, `1016ed0b`, `30929207` — each touched Commerce AND Storefront
  **in one commit**. Kept in sync, never fixed separately.

**Neither bar is met:** Rule of Three wants three sites (there are two); the
demonstrated-drift override wants the same behaviour fixed SEPARATELY on two surfaces
(it was fixed jointly, three times).

**What is true:** Commerce and Storefront share an identical shell modulo label, list
props and key, and every shell change costs a lockstep two-file edit. Three such edits
have all landed correctly — evidence the arrangement is holding, not failing.

**Extract when either fires:**
- a third step gains the nav+view shell (Rule of Three), or
- one shell change lands on one file and misses the other (the override) — grep
  `step-view-anim` / `step-nav-area` across both and compare.

### 2. Two files reimplement `ChoiceCard`'s internals

- **Sites:** `commerceStepBodies.tsx:51-52`, `BlockLibrariesStepContent.tsx:35-36`.
- **Shape:** both render `choice-card-name` + `choice-card-description`, the internal
  class structure of `ChoiceCard.tsx`, and **neither imports `ChoiceCard`**.
- **Proposal:** use `ChoiceCard`, or extract its label pair if these need the markup
  without the card affordance.
- **Cost:** small.
- **Why it matters:** this is precisely the failure `reuse-first` exists to prevent,
  in the feature that owns the component. The router only fires on NEW files, so
  reimplementation inside an existing file stays invisible to it.

## Considered and rejected

### `page-container-padded` (5 files)
A layout utility doing its job across unrelated surfaces (AI, dashboard, integrations,
projects). Spread across many files with no other shared classes is the signature of
correct reuse, not duplication.

### `status-text` (4 files), `icon-label` (4 files)
Same reasoning — single shared classes across otherwise-unrelated components.

### `choice-card-*` reimplementation (finding 2)
Two sites, no drift history — the label pair has never been fixed separately. Tidier
to use `ChoiceCard`, but tidiness at two sites is the speculative extraction Rule of
Three exists to prevent, and both call sites may deliberately want the labels without
the card's click affordance. Revisit at a third site.

### 13 circular dependencies
Not triaged this pass. Most look intra-feature and are likely type-only. Requires
checking `import type` vs runtime per cycle before any of it is a finding — deliberately
deferred rather than reported as 13 problems.

### 61 jscpd clones (0.65%)
At 0.65% of lines this is background noise for a codebase this size. Worth revisiting
only if a clone crosses a feature boundary — that is the shape that drifts.

## Baselines to carry forward

component-extraction 9 · jscpd 61 clones / 0.65% · cycles 13 · doc-drift 0
