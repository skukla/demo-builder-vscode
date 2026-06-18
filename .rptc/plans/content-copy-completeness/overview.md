# Plan — Content-copy completeness (fix `/customer/nav` + close the bug class)

**Created:** 2026-06-18 · **Scope chosen by PM:** full comprehensive program (all four layers).
**Research:** `.rptc/research/content-copy-completeness/research.md` +
`.rptc/research/b2b-account-features-missing/research.md` +
`.rptc/research/b2b-pdp-404-gap/findings.md`.

## Goal

Ship the B2B account-menu fix **as the first consumer of a structural fix** that ends the
"silently-dropped content" bug class: the content-copy pipeline reproduces a storefront via
index + four scattered hardcoded backfill lists, with no reference-following and no post-copy
completeness check, so runtime-referenced-but-unindexed documents (e.g. `/customer/nav`) are
silently dropped.

## Outcomes

1. **B2B account page shows its B2B features** — `/customer/nav` (and any sibling fragment) is
   copied from canonical for the `b2b` and `citisignal-b2b` packages.
2. **The class is closed on the copy side** — referenced docs are discovered by following
   references, not by hand-maintained lists.
3. **Future regressions are loud, not silent** — a post-copy audit names anything referenced but
   not copied.
4. **One source of truth** for known runtime surfaces, shared by create + reset.
5. **A per-package smoke** that would have caught both confirmed instances (`/customer/nav`, PDP).

## Design principles (hold the line)

- **No fork.** All content is pulled live from the public CDN (`.plain.html`); we store no page
  HTML. Upholds ADR-006 thin-layer.
- **Regex/string parsing, not a new HTML-parser dep.** Match the codebase (`transformHtmlForDaLive`,
  `pdp404HandlerPublisher` parse with string ops). Keep heuristics narrow + well-tested.
- **Additive + idempotent.** Discovery dedups against already-copied paths; safe to re-run on reset.
- **TDD.** Every step: RED (tests first) → GREEN → REFACTOR. Mirror existing
  `tests/features/eds/services/daLiveContentOperations-*.test.ts` patterns (mock `fetch`).

## Key files (confirmed)

- `src/features/eds/services/daLiveContentOperations.ts` — `copyContentFromSource`
  (`:1815`), `copySingleFile` (`:425`), `enumerateAndFilterContentPaths` (`:1755`), the three
  backfill lists (`:1843/1858/1875`), `processHtmlContent` (`:384`), `buildSourceUrl` (`:349`).
- `src/features/eds/services/patchReportHelper.ts` — `createPatchReport`, `addContentResult`,
  `reportUnapplied` (audit hangs here).
- `src/features/eds/services/edsResetRepoHelper.ts` — `placeholderPaths` (`:48`); reset wiring.
- `src/features/eds/services/edsResetService.ts` — reset orchestration + `reportUnapplied`.
- `src/features/eds/services/edsPipeline.ts` — `indexUrl` construction (`:254`), copy invocation.
- `src/features/project-creation/config/demo-packages.json` — packages for the smoke harness.

## Steps

| Step | Layer | Title | Ships |
|---|---|---|---|
| 01 | 1 | Reference-following discovery in content copy | **`/customer/nav` fix** |
| 02 | 1 | Robust auth-page acquisition (`.plain.html`, copy-then-stub) | account shell reliably copied |
| 03 | 2 | Post-copy completeness audit (dangling-reference report) | loud failures |
| 04 | 3 | Consolidate the four backfill lists into one inventory | create/reset parity |
| 05 | 4 | Per-package create+audit smoke (incl. PDP coverage) | regression net |
| 06 | — | Reset self-heal wiring + revisit selector-race patch | stale storefronts repair |

Steps 01–02 deliver the user-visible fix; 03–06 close the class. Land in order; 01+02 are
independently shippable if we need the fix out first.

## Pre-work — live verification (egress-blocked in this env; do before/within Step 01)

Browser-probe each affected package's source site (we did this for `b2b`):
1. Confirm `/customer/account.plain.html` references `/customer/nav` (✅ done for `b2b`); repeat for
   `citisignal-b2b`'s source (`accs-citisignal`) — does its account page reference a nav fragment,
   and does that fragment carry the B2B items? (citisignal-b2b uses non-B2B content — may need its
   account page sourced/patched too; see account-features research.)
2. Scan a few copied pages for other fragment references / dropin pages to seed Step 03's test
   fixtures with real shapes.

## Risks & mitigations

- **Over-broad crawl** (following external/product links, infinite loops). Mitigate: only follow
  **internal** paths, dedup against visited, cap depth (fragments are shallow), exclude
  `/products/*` overlays (already filtered) and external hosts.
- **Regex misses a fragment-embed shape.** Mitigate: Step 03 audit is the safety net — even if
  discovery misses it, the audit names it; add the shape to tests when found.
- **citisignal-b2b content mismatch** (non-B2B source) may not be fixed by discovery alone (the
  source has no B2B nav to find). Track explicitly in Step 01 acceptance; may need its account
  content sourced from the B2B site or a content patch (decide from pre-work probe).
- **PDP class is catalog-derived**, not copyable — out of scope to *fix* here; Step 05 only
  *asserts* coverage so it can't silently regress. Fix stays on `b2b-pdp-404-gap` (Option A).

## Definition of done

- New `b2b` + `citisignal-b2b` projects show the full B2B account menu (live-verified).
- Discovery + audit covered by unit tests; `npm test` green; coverage ≥ 80% on changed files.
- Create and reset share one runtime-surface inventory; smoke harness asserts no dangling refs
  per package. CHANGELOG + ADR-006 note updated.
