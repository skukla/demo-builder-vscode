# Codebase sweep — 2026-08-11 (second pass, at the `.128` cut)

Second sweep the same day. The first ran at the `.127` cut; this one covers the 27 commits
since, which added four source files under `features/eds/` and one generated skill template.

**Verdict: no movement on any scan. Nothing to propose.** That is the finding — a session
that added four files to one feature introduced zero new duplication, cycles, or drift.

## Movement since last sweep

| Scan | 2026-08-05 | 2026-08-11 (`.127`) | Now (`.128`) | Verdict |
|---|---|---|---|---|
| component-extraction | 9 groups | 4 groups | **4 groups** | flat — same four, same files |
| code-duplication (jscpd) | 61 / 0.65% | 64 / 0.70% | **64 / 0.69%** | flat |
| circular-dependency | 13 | 13 | **13** | flat — no new cycle |
| dead-code doc-drift | 0 | 0 | **0** | flat (59 historically-framed mentions are accurate history) |

## Findings

None.

The four component-extraction groups are unchanged in both count and membership:
`page-container-padded` (5), `status-text` (4), `icon-label` (4), `page-header-section` (3).
Per the shape rule, none is a shared shell — no single SET of files shares several classes.
`page-container-padded` was explicitly rejected at the `.127` sweep as a base-plus-modifier
idiom, and that verdict still holds.

## What this session added, and why it moved nothing

| File | Why it did not add duplication |
|---|---|
| `eds/services/accsDiscoveryConfig.ts` | Created BY removing a copy — the discovery-service selection was inline in `edsHandlers`, now shared with `storeStructureReader`. `handleDiscoverStoreStructure`'s tests passed unchanged, which is the proof it is behaviour-preserving. |
| `eds/services/storeStructureReader.ts` | New behaviour (project-scoped store read); reuses `discoverStoreStructure` rather than reimplementing transport. |
| `eds/services/servedStorefrontConfig.ts` | New behaviour (read the CDN-served config); reuses `aemLiveBaseUrl` from `storefrontProbe`. Cycle-checked at the time — none. |
| `eds/handlers/storeStructureHandler.ts` | Thin handler mirroring `refreshBlockLibraryHandler`, the established shape for agent-facing headless entries. |

`errorFormatters.ts` grew a push-protection path; `isRulesetRejection` is shared with
`storefrontSyncService` specifically so the ruleset patterns exist once rather than twice —
a duplication avoided at write time rather than found here.

## Considered and rejected

### The `Mirrors …` comment family (14 sites, `signals.sh`)
Unchanged from prior sweeps. Each is a doc comment asserting two things agree — the
handler-shape mirrors in `authentication/handlers`, the `DataResult` shape mirror in
`app-builder/services/types.ts`. They describe an intentional house pattern, not a competing
implementation. Re-litigating them every sweep is the cost the "considered and rejected"
section exists to avoid. **Revisit only if one of the mirrored pairs is fixed on one side.**

### `patchReportHelper.ts:139` — flagged as an abandonment marker
False positive. The word "obsolete" appears in a user-facing message about obsolete
**patches**, not about the code. Same verdict as prior sweeps.

### `ProgressUnifier.ts` internal clones
Still same-file, still fine per triage. Carried forward from the `.127` sweep unchanged.

## Baselines to carry forward

| Scan | Baseline |
|---|---|
| component-extraction | 4 groups (`page-container-padded` 5, `status-text` 4, `icon-label` 4, `page-header-section` 3) |
| code-duplication (jscpd) | 64 clones, 0.69% lines |
| circular-dependency | 13 cycles |
| dead-code doc-drift | 0 real (59 historically-framed) |

Unchanged from the `.127` measurement, so the table is carried rather than rewritten.
