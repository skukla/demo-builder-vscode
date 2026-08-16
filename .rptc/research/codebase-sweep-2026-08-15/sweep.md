# Codebase sweep — 2026-08-15

Run at the `v1.0.0-beta.130` release cut, 20 commits after `.129`.

## Movement since last sweep

| Scan | Last (2026-08-11) | Now | Verdict |
|---|---|---|---|
| component-extraction | 4 groups | 4 groups | at baseline — no news |
| code-duplication (jscpd) | 64 clones · 0.70% | 65 clones · 0.68% | at baseline; density fell slightly |
| circular-dependency | 13 cycles | 14 cycles | **+1, unattributable — see finding 2** |
| dead-code doc-drift | 0 | 0 | clean |

Today's release work adds nothing to any of these. Control: grepping all 14 cycles
for `publishKeyRegistrar|publishKeyRenewalSweep|siteConfigRegistrar|configServiceProbe`
returns **0**, so the new `siteConfigRegistrar → publishKeyRegistrar` edge is acyclic.

## Findings

### 1. The dashboard page shell is three files sharing two classes

- Sites: `page-container-padded` AND `page-header-section` both appear in exactly
  `features/dashboard/ui/components/DashboardStatusHeader.tsx`,
  `features/dashboard/ui/integrationsSurface/IntegrationsScreen.tsx`,
  `features/projects-dashboard/ui/ProjectsDashboard.tsx`.
- Shape: this is the pattern the extraction skill names as the real signal — the
  same SET of files sharing SEVERAL classes, which reads as one shell rendered
  three times rather than one utility reused. It is masked by the group COUNT
  sitting at baseline, because the two groups are counted separately.
- Caveat before acting: `page-container-padded` also appears in two unrelated
  files (`AiOverviewScreen`, `OrgContextNotice`), so it is doing double duty as a
  genuine layout utility. Only the header+container PAIRING is the candidate.
- Proposal: read the three files together and decide whether a `PageShell`
  (padded container + header section) exists. Do not extract on the scan alone.
- Cost: small if real; the risk is extracting a shell that only two of the three
  actually want.

### 2. Cycle count moved 13 → 14 and cannot be attributed

- The baseline table records a COUNT, not the LIST, so a +1 four days later cannot
  be traced to a commit without re-deriving both sets.
- Ruled out: today's work (control above), and
  `core/state/appBuilderComponentMigration.ts > core/state/projectFileLoader.ts`,
  which looked like the odd one out — a core/state pair among otherwise
  same-feature handler pairs — but is `import type` only (harmless per triage) and
  dates to `65c40b04`, 2026-06-21, well before the baseline.
- Proposal: **record the cycle LIST in the baseline table, not just the count.**
  A count that can move without being attributable is a metric that cannot be
  acted on, which is how this one arrived.
- Cost: none — it is a change to what this file carries forward.

## Considered and rejected

### `page-container-padded` alone (5 files) — legitimate layout utility
Spans `AiOverviewScreen`, `DashboardStatusHeader`, `OrgContextNotice`,
`IntegrationsScreen`, `ProjectsDashboard` — five unrelated surfaces. Rejected at
the 2026-08-05 sweep for the same reason and the reasoning still holds: a padding
utility used widely is a utility doing its job.

### `status-text` (4 files) — same
`StatusCard`, `OrgContextNotice`, `DaLiveServiceCard`, `GitHubServiceCard`. Four
files, ONE class. No shared second class, so no shell shape.

### `icon-label` (4 files) — same
`ActionGrid`, `DashboardTile`, `AiZone`, `UtilityBar`. Spans dashboard AND sidebar;
one class only.

### jscpd at 65 clones — no cross-feature clone
Density fell (0.70% → 0.68%) while the file count grew. The clones surfaced in the
tail are intra-file or type-shape repeats (`webview.ts` ↔ `usePrerequisiteState.ts`),
not the cross-feature shape that drifts.

### The `Mirrors …` signal list (26 hits) — not triaged this pass
`architecture-duplication-scan` is a guided REVIEW, not a detector: each line claims
two things agree and must be opened to confirm. Twenty-six of those is its own
session, and doing it badly is worse than not doing it. Flagged, not attempted.

## Baselines to carry forward

| Scan | Baseline (2026-08-15) |
|---|---|
| component-extraction | 4 groups — `page-container-padded` 5, `status-text` 4, `icon-label` 4, `page-header-section` 3 |
| code-duplication (jscpd) | 65 clones · 0.68% lines · 965 files |
| circular-dependency | 14 cycles — **list them here next time** |
| dead-code doc-drift | 0 |
