# Codebase sweep — 2026-08-24

Run at the `v1.0.0-beta.142` release cut, on `develop@54cbd2c06`. Proposes only;
nothing here was applied.

## Movement since the last sweep (2026-08-11)

| Scan | Last | Now | Verdict |
|---|---|---|---|
| component-extraction | 4 groups | **3 groups** | Improved. No group crosses 3 files with a shared SHAPE; see rejected. |
| code-duplication (jscpd) | 64 clones · 0.70% lines | **72 clones · 0.62% lines** | Mixed — count up 8, density down. One clone crosses a module boundary (finding 2); the rest are same-file/same-suite. |
| circular-dependency | 13 cycles | **0 cycles** | Resolved. The beta.141 structural wave (feature cycles 15 → 1) closed the remainder. |
| dead-code doc-drift | 0 | **1 real** (+1 false positive) | Finding 1. Baseline says any hit is real; one of the two survived inspection. |
| boundary casts | 40 (6 `as never`, 34 `as unknown as`, 0 `as any`) | **31 (1 `as never`, 30 `as unknown as`, 0 `as any`)** | Improved. Still zero `as any`. The `as never` cluster in AddIntegrationFlowAdapter is gone. |

Two baselines moved decisively in the right direction (cycles to zero, casts 40 → 31)
and neither needs action. The only new finding is the doc-drift hit.

## Findings

### 1. `error-handling.md` points at a component that no longer exists

- Site: `docs/architecture/error-handling.md:459`
- Names `src/features/authentication/ui/steps/components/AuthErrorState.tsx` under
  "**Components (accept code prop)**" — a list of files to change when applying the
  error-code pattern.
- Evidence: `grep -rc 'AuthErrorState' src/` → **0 files**. Positive control on the
  same grep (`refreshHomeAgentsMd`) → 4 files, so the search works.
- Shape: not stale prose — an instruction naming a file a reader is told to edit.
  It fails on contact, and CLAUDE.md's rule is that a comment describing another
  module is a claim, not documentation.
- Proposal: delete the bullet, or repoint it at whatever replaced the component.
  Confirm which by reading the surrounding list before editing.
- Cost: minutes.

### 2. The webview protocol correlates responses twice — once per side

- Sites: `src/core/communication/webviewCommunicationManager.ts:335-347` and
  `src/core/ui/utils/WebviewClient.ts:107-119` (20 lines, 141 tokens, jscpd).
- Opened both. The bodies are identical apart from indentation: same
  `pendingRequests` lookup, same `clearTimeout` → `delete` → `reject(new Error(...))`
  or `resolve(payload)`.
- Shape: this is ONE protocol's request/response correlation implemented on both
  ends, not two features that happen to look alike. Nothing makes the two agree.
  If either side starts carrying, say, an error code or a cancellation reason, the
  other silently keeps the old behaviour — and the symptom would be a webview
  request that never resolves, which this repo has already paid for once
  (`webview-command-handler` exists partly for that failure).
- Complication worth stating: the two live in different bundles (Node CJS extension
  host vs browser IIFE webview). A shared module under `core/` is still importable
  by both — esbuild bundles each entry separately — so this is extractable, but it
  is not a trivial move and the shared unit must stay free of `vscode` imports.
- Proposal: extract the correlation half into one `core/communication` helper that
  takes the pending-request map and a message, and have both sides call it. Keep
  transport (postMessage vs webview.postMessage) on each side.
- Cost: small-to-moderate. The risk is in the bundling constraint, not the logic.

## Considered and rejected

### `page-container-padded` (5 files) — legitimate layout utility
Spans `FullScreenSurface`, `AiOverviewScreen`, `DashboardStatusHeader`,
`OrgContextNotice`, `DataInstallerScreen` — five unrelated surfaces sharing ONE
class. That is a utility doing its job. The extraction signal is the same SET of
files sharing SEVERAL classes; this is the opposite shape. Same verdict as the
2026-08-05 sweep, recorded again so it is not re-litigated.

### `status-text` (4 files) / `icon-label` (4 files) — same reasoning
Each is a single shared class across files with no other classes in common.
`status-text` spans two core feedback components plus two EDS service cards;
`icon-label` spans dashboard and sidebar. No shared shell underneath either.

### `summarizeSelectedAppBuilderComponents` doc-drift hit — false positive
`reviewPredicates.ts:41` names the symbol inside a comment that exists precisely to
record that it was DELETED (2026-08-23) after living two months with no production
caller. Accurate history, which the scan itself classifies correctly for 75 other
mentions and mis-flagged for this one. Leave it — the comment is doing useful work.

### 62 remaining jscpd clones — same-file or same-suite
Only the pair in finding 2 crosses a module boundary. Per the triage rule, clones
inside one file or one suite are usually fine and are not proposed.

### 31 boundary casts — all previously triaged, all with homes
Zero `as any`. The single `as never` is the documented Spectrum shim in
`CardActionsMenu`. The `as unknown as` population is the already-resolved
bundled-JSON cluster (check-backed by the two contract suites in `tests/templates/`)
plus local DOM/stream shims. Nothing new appeared; this is movement reporting, not
re-triage.

## Baselines to carry forward

| Scan | Baseline (2026-08-24) |
|---|---|
| component-extraction | 3 groups |
| code-duplication (jscpd) | 72 clones · 0.62% lines · 1 cross-module |
| circular-dependency | 0 cycles |
| dead-code doc-drift | 1 open (`error-handling.md:459`) |
| boundary casts | 31 — 1 `as never`, 30 `as unknown as`, 0 `as any` |

A cycle count of zero is the one to watch: it is the first time this repo has hit it,
and the next sweep should treat ANY cycle as a regression rather than as movement.
