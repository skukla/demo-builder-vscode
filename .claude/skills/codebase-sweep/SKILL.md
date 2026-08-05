---
name: codebase-sweep
description: Out-of-band periodic pass over the CODEBASE — run the duplication, extraction, cycle and dead-code scans together, triage their output against known-noise baselines, and propose evidence-backed cleanups for the user to accept or reject. Use at a release cut, after a large feature lands, or when asked to sweep / audit the codebase for duplication, drift, orphans or cycles. Sibling of `dream`, which does the same for instructions.
---

# codebase-sweep — second-order curation of the code

`dream` audits the INSTRUCTIONS given to the agent. This does the same job for the
CODE, and exists for the same reason: a session doing the work splits its budget
between the task and noticing, and it can only see what it touched. Cross-cutting
duplication is invisible from inside a feature.

It is also the answer to a specific failure. The scans below already existed and
already worked; nothing ran them. Every defect in the 2026-08-04/05 sessions was
found by the user. Drift and orphans now have hooks that fire automatically
(`doc-drift.sh`, `deletion-scan-router.sh`); duplication cannot, because deciding
whether two things SHOULD be one needs judgment. That judgment is what this pass
schedules.

## Hard rules

1. **Propose, never apply.** Write exactly one file — the proposal. Code changes
   happen only after the user accepts specific items.
2. **Every finding carries evidence and a verdict**: file:line, how many sites, and
   whether it is real or known noise. A scan hit is a candidate, never a verdict.
3. **Compare against the baselines below.** A count matching the baseline is NOT a
   finding. Only movement, or a group whose shape says "shared shell", is.
4. **Do not re-derive what the scan skills already say.** Each has its own triage
   section; read it rather than reasoning from raw output.

## When NOT to use
- A single feature you are actively building — that is `reuse-first` at write time.
- Instructions, memory, CLAUDE.md staleness — that is `dream`.
- "Can I delete this symbol?" — that is `dead-code-scan` directly.

## Procedure

Run all four, then triage. ~30s total.

```bash
bash .claude/skills/component-extraction-scan/scan-classnames.sh src   # UI markup
bash .claude/skills/code-duplication-scan/scan.sh src                  # logic (jscpd)
bash .claude/skills/circular-dependency-scan/scan.sh src               # cycles (madge)
bash .claude/skills/dead-code-scan/scan.sh src                         # orphans + doc drift
bash .claude/skills/architecture-duplication-scan/signals.sh src       # competing impls
```

### Baselines measured 2026-08-05 — a number at baseline is not news

| Scan | Baseline | What movement means |
|---|---|---|
| component-extraction | 9 groups | a NEW group, or one growing past 3 files |
| code-duplication (jscpd) | 61 clones, 0.65% lines | a jump, or any clone crossing a feature boundary |
| circular-dependency | 13 cycles | any new cycle; most existing ones are type-only |
| dead-code doc-drift | 0 | any hit is real — it is confirmed against `git log` |

Re-measure and update this table whenever the sweep runs; a stale baseline turns
every finding into noise.

### Reading the UI scan — shape beats count

The signal is not "N files share a class". It is **the same SET of files sharing
SEVERAL classes** — that is one shell rendered N times, not one utility reused.

Worked example (2026-08-05, real): `step-view`, `step-nav-area`, `step-nav` and
`commerce-body` each appeared in exactly `CommerceStep.tsx`, `IntegrationsStep.tsx`
and `StorefrontStep.tsx`. Four classes, one identical trio — a shared step shell
that was never extracted. Meanwhile `page-container-padded` spanned 5 unrelated
files and is simply a layout utility doing its job. Same scan, opposite verdicts.

Second signal: a class named after a component appearing in files that are NOT
that component (`choice-card-name` in two files plus `ChoiceCard.tsx`) — consumers
reimplementing its internals instead of using it.

### Triage rules

- **Cycles**: type-only cycles (`import type`) are harmless; a runtime cycle in the
  same feature usually wants one file split. Check which before proposing.
- **jscpd**: clones INSIDE one file or one test suite are usually fine. A clone
  spanning two features is the finding — that is the shape that drifts.
- **ts-prune**: entry points and DI/config-registered symbols report as unused. The
  `dead-code-scan` skill lists the false-positive classes; apply them.
- **Rule of Three**, with the standing override: if the same behaviour has already
  been FIXED separately on two surfaces, that is demonstrated drift and it extracts
  at two.

## Output

One file: `.rptc/research/codebase-sweep-<date>/sweep.md`.

```markdown
# Codebase sweep — <date>

## Movement since last sweep
| Scan | Last | Now | Verdict |

## Findings (evidence + sites + verdict)
### <title>
- Sites: file:line ×N
- Shape: <why this is one thing rendered N times, not N legitimate uses>
- Proposal: <extract to X / split Y / delete Z>
- Cost: <rough>

## Considered and rejected
### <candidate> — <why it is legitimate>

## Baselines to carry forward
<the updated table>
```

Rejected candidates are not filler: without them the next sweep re-litigates the
same nine groups from scratch.

## Verify
1. Every finding names real file:line pairs — open one and confirm before proposing.
2. Every scan's count is compared to the baseline, not reported raw.
3. The proposal file is the ONLY thing written. No code touched.
