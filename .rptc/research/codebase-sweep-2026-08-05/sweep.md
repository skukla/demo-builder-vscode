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

### 1. Three wizard steps render one un-extracted shell

- **Sites:** `CommerceStep.tsx` (315 lines), `IntegrationsStep.tsx` (303),
  `StorefrontStep.tsx` (280) — all under `features/project-creation/ui/steps/`.
- **Shape:** four classes — `step-view`, `step-nav-area`, `step-nav`, `commerce-body`
  — appear in exactly these three files and nowhere else. Not one utility reused
  three times; one shell rendered three times. The structure matches too
  (`step-nav` > `step-nav-area`, then `step-view`, e.g. `IntegrationsStep.tsx:240-243`).
- **Corroboration:** `commerce-body` is used by all three despite naming only one —
  a class that outlived the component it was named for is the tell that this was
  copied, not designed.
- **Proposal:** extract a `StepShell` (nav label + view area) into
  `project-creation/ui/steps/`, leaving each step to supply only its body.
- **Cost:** medium. Three call sites, one new component, existing CSS unchanged.
- **Caveat:** confirm the three genuinely share behaviour and not just markup. If
  the nav areas differ in interaction, extract the VIEW half only.

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

### 13 circular dependencies
Not triaged this pass. Most look intra-feature and are likely type-only. Requires
checking `import type` vs runtime per cycle before any of it is a finding — deliberately
deferred rather than reported as 13 problems.

### 61 jscpd clones (0.65%)
At 0.65% of lines this is background noise for a codebase this size. Worth revisiting
only if a clone crosses a feature boundary — that is the shape that drifts.

## Baselines to carry forward

component-extraction 9 · jscpd 61 clones / 0.65% · cycles 13 · doc-drift 0
