# ✅ COMPLETE — Decompose `daLiveContentOperations.ts` god-file

**Filed:** 2026-07-06 · **Completed:** 2026-07-07
**Skill:** `.claude/skills/decompose-god-file/` · SOP `.rptc/sop/god-file-decomposition.md`
**Pattern used:** Facade + Specialized Services (SOP Pattern A), leaf-first, TDD/gated per slice.

## Outcome

`src/features/eds/services/daLiveContentOperations.ts` went from **2,883 lines / ~50 methods in one
class** to a **528-line composition root** that constructs and wires six single-responsibility services
and delegates to them. Every slice was a behavior-preserving, independently-gated commit
(tsc + eslint + full `tests/features/eds` suite + `madge --circular`); the public API stayed stable, so
the ~15 consumers were never touched.

### The six extracted services (all `vscode`-free, all cycle-free)

| Service | Lines | Responsibility |
|---|---|---|
| `daLiveApiClient.ts` | 118 | IMS token + fetch-with-retry + HTTP→domain error mapping (leaf) |
| `daLiveContentHelpers.ts` | 85 | pure html/path helpers (`transformHtmlForDaLive`, `buildSourceUrl`, `resolveDaPath`) |
| `daLiveContentDiscovery.ts` | 92 | content-path enumeration (list-API walk + CDN-index read) |
| `daLiveSourceOperations.ts` | 312 | source CRUD (create/delete/list/exists, site-root + all-content delete) |
| `daLiveConfigOperations.ts` | 330 | config writes (site/data-sheet merge, block-library sheet) |
| `daLiveBlockLibraryOperations.ts` | 836 | block-library management (~14 methods; the fattest cluster) |
| `daLiveContentCopy.ts` | 1046 | content copy/overlay/enumeration orchestration |
| `daLiveContentOperations.ts` (facade) | 528 | **composition root** — wires the above + TokenProvider factories |

Dependency graph the facade owns:
`apiClient → sourceOps → { configOps, discoveryOps → copyOps } → blockLibOps`.

## Slice log (all on `develop`)

| Slice | Commit | What |
|---|---|---|
| 0 | `b7695441` | delete dead local-media methods |
| 1 | `0535ceba` | extract pure html/path helpers → `daLiveContentHelpers` |
| 2 | `87d0b972` | extract `DaLiveApiClient` (token + http) as shared client |
| 3 | `15d5967e` | extract `DaLiveSourceOperations` (source CRUD) |
| 4 | `d0225557` | extract `DaLiveConfigOperations` + delete dead `applyOrgConfig` |
| 5 | `55ff95d8` | extract `DaLiveContentDiscovery` (content-path enumeration) |
| 6a | `84a45faa` | delete dead `copyMediaFromContent` (superseded by Admin-API preview) |
| 6b | `2ae80e8d` | extract `DaLiveContentCopy` (content copy/overlay/enumeration) |
| 7 | `3840933f` | extract `DaLiveBlockLibraryOperations` (block-library cluster) |
| 8 | *(this record)* | decide the facade's fate; docs + final circular scan |

Dead code deleted along the way (no soft deprecation): local-media methods (slice 0), `applyOrgConfig`
(slice 4), `copyMediaFromContent` (slice 6a — zero callers; Admin API downloads images during preview).

## Slice 8 — the facade's fate: KEEP the composition-root facade (delegators retained)

The original filing (and the `structure-methodology` skill) flagged that a pure pass-through facade is a
shallow module and floated **dissolving** the delegators — multi-cluster consumers keep a slim facade,
single-cluster consumers reach the specific service directly. On reaching slice 8 that plan was
**considered and deliberately declined.** Decision rationale (so it is not re-proposed):

- **The decomposition's goal is already met.** The god-file is gone; six single-responsibility,
  independently-testable services exist. Dissolving delegators produces **zero** additional units — it
  only changes how callers spell their access.
- **The facade is not a shallow pass-through — it earns its keep.** It is the composition root: it hides
  a six-object construction graph behind `new DaLiveContentOperations(tp, logger)` and owns the three
  `TokenProvider` factories. Hiding real construction complexity behind a small interface is a *deep*
  module.
- **Every sub-service needs the wired `apiClient` stack**, so "reach the service directly" is not cheap:
  a single-cluster consumer would either re-wire 6 objects or need a new per-service factory. Dissolution
  therefore *relocates* wiring (into call sites or a multiplied factory surface) rather than removing
  indirection — a lateral move that reintroduces the parallel-construction duplication the decomposition
  removed.
- **The churn is lopsided.** Full dissolution / sub-service exposure is ~140 call sites across the suite
  plus nested-mock restructuring in the pipeline tests. That cost lands hardest on the **multi-cluster**
  consumers (`edsPipeline`, `edsContentSetup`) that most benefit from the unified flat surface, while its
  one upside (explicit coupling) helps only the few single-cluster consumers. Not worth real risk on the
  load-bearing copy path (the "silently-dropped content" bug class) for a cosmetic gain.

**Accepted end state:** the facade keeps its thin delegators and stands as the documented composition
root (header doc in `daLiveContentOperations.ts` names the role). The small ongoing cost — a new
delegator must be hand-added when a sub-service method needs surfacing to consumers — is accepted.
Revisit only if a consumer's coupling causes concrete pain (YAGNI).

## Notes / follow-ups (out of scope for this decomposition)

- **Pre-existing import cycle:** `catalogPrewarmService.ts ↔ edsPipeline.ts` (surfaced by the final
  `madge --circular src/features/eds/services/` scan). Neither is a daLive file; the decomposition
  commits never touched either. Not introduced here, but **fixed as a follow-up**: the shared
  `EdsPipelineProgressCallback` type was relocated to `./types` (re-exported from `edsPipeline` for
  API stability), so `catalogPrewarmService` no longer imports from `edsPipeline`. `madge` now reports
  the whole `eds/services/` tree cycle-free.
- `daLiveContentCopy.ts` (1046) and `daLiveBlockLibraryOperations.ts` (836) exceed the 400-line service
  threshold. Each is a single cohesive responsibility; further splitting (e.g. low-level copy vs. copy
  orchestration) is a possible future refinement, not required by this workstream.
