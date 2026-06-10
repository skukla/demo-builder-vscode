# Implementation Plan: Thin-Layer Storefront Initiative (ADR-006)

## Status Tracking

- [ ] Planned (awaiting owner approval of structure)
- [ ] In Progress (TDD Phase)
- [ ] Efficiency Review
- [ ] Security Review
- [ ] Complete

**Created:** 2026-06-10
**Last Updated:** 2026-06-10
**Author:** Claude (planning session, picked up from `.rptc/HANDOFF.md`)

> **This is a proposal of plan _structure_ — steps, order, risks — for owner approval, per the handoff.**
> No production code is written yet. Once the structure is approved, each step gets its TDD detail
> (RED → GREEN → REFACTOR) before implementation. Per the handoff, `.rptc/HANDOFF.md` is deleted now
> that this plan exists.

---

## Executive Summary

**Initiative:** Retire the CitiSignal storefront forks. Build CitiSignal EDS storefronts from canonical
`hlxsites/aem-boilerplate-commerce` at an automation-verified **last-known-good (LKG)** commit, and apply
our customizations as a **thin layer** at storefront create/reset time: block-library install (exists),
`demo-config.json` templating (exists), content patches (exists), smart-404 vendoring (exists), plus a
**reinstated, externalized code-patch system (v2)** for the ~6–8 genuine file modifications.

**Why:** Per the audit (`findings.md`), the two forks store **one** customization surface (accs ⊂ citisignal),
30% of whose diff is itself manual upstream catch-up. 70% of the surface is already handled by existing
Demo Builder mechanisms or eliminated by cloning canonical directly; the remaining 30% collapses to a
single-digit patch ledger. The decision is **made and owner-approved** in ADR-006 — this plan does not
re-litigate it.

**Approach (decisions are fixed; see ADR-006):**
1. A generic **code-patch engine** in the extension (modeled on the living `contentPatchRegistry.ts` + the
   marker-bounded vendoring in `pdp404HandlerPublisher.ts`), with definitions **externalized** to the
   patches repo — the engine knows no canonical file by name.
2. Patches apply in the create/reset pipeline **after reset-to-template and after block install**, so one
   ledger targets both canonical files and installed library blocks. Loud per-patch failure when a
   precondition no longer matches.
3. The extension builds from the **LKG SHA** read from the patches repo, never raw canonical `main` and
   never a hand-maintained pin. A daily GitHub Actions gate in the patches repo verifies patches against
   canonical `main` and advances `last-known-good` on success.
4. Config flips point CitiSignal at canonical (template) and the demo team's boilerplate (block source).
5. Four canonical-bug carries + two product-teaser carries are PR'd upstream as patch **exits**; the gate
   detects upstream-landed fixes and opens retirement PRs.

**Scope crosses four repos:**

| Repo | In session scope? | Work |
|---|---|---|
| `skukla/demo-builder-vscode` (this repo) | ✅ | Steps 1–5, 9 — engine, pipeline, LKG plumbing, config flips, cutover |
| `skukla/eds-demo-content-patches` (or generalized successor) | ❌ (out of scope now) | Steps 6–7 — patch ledger + drift-gate workflow |
| `hlxsites/aem-boilerplate-commerce` | ❌ | Step 8 — 4 upstream PRs (patch exits) |
| `demo-system-stores/accs-citisignal` | ❌ | Step 8 — 2 product-teaser PRs; becomes the live block-source upstream |

**Estimated Complexity:** Complex (multi-repo, release-engineering surface).

**Estimated Timeline:** ~2–3 weeks of focused work, gated by the sequencing constraint and upstream review
cadence (which is decoupled — see Risk R1).

**Key Risks (full table below):**
1. **Sequencing**: nothing may point at `skukla/citisignal-eds-boilerplate` on archive day — the block-source
   flip (with teaser fixes as day-one patches) must land first.
2. **generate-from-template pins to HEAD**, not the LKG SHA — needs a verified pinning strategy (Step 4).
3. **Patches repo becomes load-bearing at create/reset** — needs a defined failure mode when unreachable.

---

## Research References

All decisions, evidence, and touchpoint analysis already exist — this plan executes against them:

- **Decision record:** `docs/architecture/adr/006-thin-layer-storefront-customization.md` (Accepted 2026-06-10,
  amendments through `ff9ad01`)
- **Fork audit (empirical basis):** `.rptc/research/thin-layer-storefront-evaluation/findings.md`
- **Touchpoint analysis (the consolidated checklist this plan follows):**
  `.rptc/research/thin-layer-storefront-evaluation/impact-analysis.md`
- **Prework:** `.rptc/research/thin-layer-storefront-evaluation/prework.md`
- **Successor backlog (out of scope, gated on this):** `.rptc/backlog/2026-06-10-buildright-eds-disposition.md`
- **Mechanism precedent (vendoring):** ADR-005, `src/features/eds/services/pdp404HandlerPublisher.ts`

### Relevant files identified (current-state map, verified this session)

**Code-patch precedents to model on (do NOT reinvent):**
- `src/features/eds/services/contentPatchRegistry.ts` — patch shape `{id, pagePath, description, searchPattern,
  replacement}`; external fetch from `raw.githubusercontent.com/{owner}/{repo}/main/{path}/patches.json` with
  per-source Promise caching and a `PREREQUISITE_CHECK` timeout; `ContentPatchSource = {owner, repo, path}`.
- `src/features/eds/services/pdp404HandlerPublisher.ts` — marker-bounded, idempotent vendoring into canonical
  files (`SMART_404_MARKER_START/END`, "already installed" short-circuit, runtime-value substitution,
  non-fatal skip on missing file). **This is the v2 code-patch model.**
- `src/features/eds/services/blockCollectionHelpers.ts` — dynamic block discovery (scan `blocks/`),
  first-seen-wins dedup against destination, merged `component-definition/filters/models.json`, single atomic
  commit. Confirms the block-source flip needs **zero installer changes**.

**Update-system touchpoints:**
- `src/features/project-creation/handlers/executor.ts` — `fetchTemplateCommitSha()` (~`:594`, called ~`:533`);
  writes `lastSyncedCommit` into EDS component metadata (`populateEdsMetadata`, ~`:504–550`).
- `src/features/updates/services/templateUpdateChecker.ts` — `checkForUpdates()` compares `lastSyncedCommit`
  vs template `main` via `getLatestBranchCommit`/`compareCommits` (~`:85,106`).
- `src/features/updates/services/templateSyncService.ts` — `merge` vs `reset` strategies; `performReset()`
  (`git read-tree --reset -u`); `updateLastSyncedCommit()` (~`:512–528`).
- `src/features/updates/services/forkSyncService.ts` — `checkForkStatus()` / `syncFork()` (merge-upstream API).
- `src/features/updates/commands/checkUpdates.ts` — `checkForkSyncUpdates()` (~`:358–394`);
  `getTemplateSource()` in `updateTypes.ts` (~`:90`).
- `src/features/updates/services/updateApplyService.ts` — `shouldSkipBlockLibrary()` secondary fork check.

**Create/reset pipeline:**
- `src/features/eds/handlers/storefrontSetupPhase1.ts` — `createFromTemplate()` (~`:135`) → repo at template HEAD.
- `src/features/eds/services/edsResetRepoHelper.ts` — `resetRepoToTemplate()` (Git Tree reset); placeholder
  fetch from `https://main--{repo}--{owner}.aem.live/...` (~`:53`).
- `src/features/eds/services/edsResetService.ts` — `executeEdsReset()` 12-step orchestration.
- `src/features/eds/services/edsPipeline.ts` — `executeEdsPipeline()`: clear → copy(+content patches) →
  block install → settings → purge → publish → library publish → prewarm.

**Config (the actual fork pointers):**
- `src/features/project-creation/config/demo-packages.json` — CitiSignal entries point at
  `skukla/citisignal-eds-boilerplate` (~`:277–348`); the **`custom` package already uses the canonical
  `hlxsites/aem-boilerplate-commerce` shape** (~`:109–133`) — the in-config precedent to mirror.
- `src/features/project-creation/config/block-libraries.json` — `demo-team-blocks.source` →
  `skukla/citisignal-eds-boilerplate` (~`:5–21`), `nativeForPackages: ["citisignal"]`.
- `src/types/demoPackages.ts` — `ContentPatchSource`; gains a sibling `CodePatchSource`.

**AI tooling:** No changes required (verified in impact-analysis §2). Optional: fix the stale note at
`src/features/project-creation/services/aiContextWriter.ts:309` (predates ADR-006).

---

## PM Decisions (from ADR-006 — fixed, do not re-litigate)

| Question | Decision |
|----------|----------|
| Fork disposition | `skukla/citisignal-eds-boilerplate` **archives**; `demo-system-stores/accs-citisignal` stays live as **block-source upstream** (demo team's repo; archiving it is their call) |
| Canonical tracking | Build from **LKG SHA**, automation-advanced. Not raw `main`, not a hand-maintained pin |
| Drift gate | Daily GHA cron in patches repo; on success publish verified SHA to `last-known-good`; on failure just log (no notifications, owner preference) |
| Patch home | **Externalized** to the patches repo. Engine generic in the extension; never bundled payloads, never a fork |
| Patch ledger | Target **~6–8** patches, each with a declared exit; "additive or upstream first" |
| Block modifications | Ship as **day-one code patches** applied after block install; never edit library blocks in place |
| Block source | `demo-team-blocks.source` → `demo-system-stores/accs-citisignal` (zero installer changes) |
| Upstream PRs | Patch **exits**, not gatekeepers; block-source flip does NOT wait on demo-team review |
| BuildRight | Out of scope; tracked in `.rptc/backlog/2026-06-10-buildright-eds-disposition.md` |
| `contentSource` (DA.live) | **Unchanged** — `demo-system-stores/accs-citisignal` on content.da.live is not the GitHub fork |

---

## Step Structure, Order & Dependencies

The work is four workstreams. Within the extension, Steps 1→2→3→4 are a dependency chain; Step 5 (config)
is the cutover trigger and is gated by the sequencing constraint. Steps 6–7 (patches repo) can begin in
parallel with extension work but must be **ready before** Step 5 flips config. Step 8 (upstreams) runs in
parallel and is non-blocking. Step 9 is the gated cutover.

```
 Extension (this repo)            Patches repo                 Upstreams
 ─────────────────────            ────────────                 ─────────
 1. Code-patch engine v2  ┐
 2. Pipeline integration  ├──► depends on 1                    8. Upstream PRs
 3. LKG record + check    │                                       (hlxsites ×4,
 4. Clone-at-LKG + sync   ┘                                        demo-team ×2)
        │                        6. Patch ledger  ───┐            (parallel,
        │                        7. Drift gate    ───┤             non-blocking;
        ▼                                            │             exits, not
 5. Config flips ◄──── must wait until 6 + 7 ready ──┘             gatekeepers)
        │                                                       
        ▼
 9. Cutover: archive fork (after block-source flip) ◄── requires 5 + (8 teaser fixes as day-one patches)
```

| Step | Title | Repo | Depends on | Blocking? |
|---|---|---|---|---|
| 1 | Code-patch engine v2 (generic, externalized) | extension | — | yes (2,4) |
| 2 | Reset/create pipeline integration | extension | 1 | yes (5,9) |
| 3 | LKG pointer: record at create + LKG-aware update check | extension | — | yes (4) |
| 4 | Clone canonical at LKG SHA + sync-strategy redirect | extension | 3 | yes (5) |
| 5 | Config flips (`demo-packages.json`, `block-libraries.json`) | extension | 2,4,6,7 | yes (9) |
| 6 | Extract & consolidate the patch ledger (~6–8 patches) | patches repo | (audit) | yes (5) |
| 7 | Drift-gate workflow (cron + LKG + retirement PRs) | patches repo | 6 | yes (5) |
| 8 | Upstream PRs (patch exits) | hlxsites, demo-team | 6 | no |
| 9 | Migration cutover, archival sequencing & cleanup | extension + GitHub | 5; 8(teaser carries) | terminal |

**Sequencing constraint (hard, from ADR-006 §"Tracking canonical" and impact-analysis item 9):**
On the day `skukla/citisignal-eds-boilerplate` is archived, **nothing** may point at it. Both
`demo-packages.json` (template) and `block-libraries.json` (block source) point at it today. The block-source
flip — with the two product-teaser fixes carried as **day-one code patches** (Step 6), not waiting on the
demo team's PR review — lands first (Step 5), then archival (Step 9).

---

## Test Strategy

**Framework:** Jest with ts-jest (Node) + @testing-library/react (UI), per `tests/README.md`.
**Coverage goal:** 85% overall; **100% on the code-patch engine** (precondition matching, loud-failure paths)
and on the LKG read/compare logic — these are the new load-bearing surfaces.

### Per-workstream approach

1. **Code-patch engine (Step 1):** pure unit tests — precondition match/no-match, idempotency
   (already-applied detection), loud per-patch failure object shape, external-fetch success/timeout/unreachable,
   per-source cache behavior. Mirror the existing `contentPatchRegistry` test patterns.
2. **Pipeline integration (Step 2):** integration tests asserting patch application runs **after**
   reset-to-template and **after** block install, targets both a canonical file and an installed library block,
   and surfaces a failed precondition without silently continuing.
3. **LKG plumbing (Steps 3–4):** unit tests for "record LKG at create", "up-to-date == matches LKG (even when
   canonical `main` is ahead)", and the generate-from-template HEAD→LKG pinning step. Mock the patches-repo
   `last-known-good` fetch.
4. **Config flips (Step 5):** schema/shape tests that CitiSignal mirrors the `custom` package; `contentSource`
   unchanged; new code-patch + LKG source fields parse; `demo-team-blocks.source` resolves.
5. **Patches repo (Steps 6–7):** the check script gets its own tests in that repo (precondition verification,
   obsolete-patch detection true/false positives, LKG-advance only-when-green); validated on PR.
6. **Failure-mode tests:** patches repo unreachable at create/reset → defined, tested behavior (see Risk R3).

### Explicitly out of scope for automated tests
- Live GitHub Actions cron execution (validated by running the workflow on a branch in the patches repo).
- Actual archival of the fork (a one-time GitHub operation, gated by a manual checklist in Step 9).
- Upstream PR acceptance (external maintainers).

---

## Risks & Mitigations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Archival sequencing** — archiving the fork while something still points at it breaks creates/resets (archived repos are read-only). | High | Step 5 flips **both** pointers (template + block source) before Step 9. Teaser fixes ride as day-one patches so the flip never waits on demo-team review. Step 9 opens with a "nothing references the fork" grep/verify gate across `demo-packages.json`, `block-libraries.json`, and any project metadata. |
| R2 | **generate-from-template produces a repo at template HEAD**, not the LKG SHA (impact-analysis 1.5 caveat). | High | Step 4 verifies the caveat empirically first, then pins via a follow-up reset/force-push to the LKG tree (the reset path already does a Git Tree reset — reuse it) or an alternate clone-at-SHA strategy. Tests assert the created repo's HEAD == LKG SHA. |
| R3 | **Patches repo load-bearing at create/reset** — if `raw.githubusercontent` / the repo is unreachable, creates/resets need a defined failure mode (same dependency `contentPatches` already has). | Med | Decide and test the failure mode in Step 2: fail the create loudly (patches are not optional for CitiSignal) vs. proceed-without and warn. Reuse `contentPatchRegistry`'s timeout + cache; surface a clear actionable error. **Owner input requested** (see Open Questions Q1). |
| R4 | **Silent patch drift** — a precondition that no longer matches ships stale/[]missing fixes. | Med | Loud per-patch failure at create/reset (the `911b6ac8` "not applied — code structure changed" case becomes a surfaced warning), **plus** the daily gate turning red before storefronts ever see it. Never silently skip (engine returns an explicit failed-patch result; pipeline treats it as an error per R3 decision). |
| R5 | **LKG pointer stalls** during a canonical incident — storefronts build progressively older (but verified) boilerplate; nobody is paged (by design). | Low (accepted in ADR) | Touched-file FYI + red-run logs in the gate; recovery is a push to the patches repo, no extension release in the path. Documented as accepted negative consequence. |
| R6 | **CSS theming stays modificational** — brand theming ships as append-dominant patches (EDS loads block CSS from fixed paths). | Low | Consolidate to one vendored `<link>` + an additive brand stylesheet (Step 6) to minimize per-file CSS patches; revisit only if churn proves high (ADR "Neutral"). |
| R7 | **Two product-teaser carries lost** if not PR'd to the demo team before the block-source flip. | Med | Step 6 authors them as day-one code patches (applied post-install); Step 8 files the PRs as exits. The flip does not depend on PR acceptance. |
| R8 | **`forkSyncService` confusion** — it must not offer merge-upstream against the archived fork. | Low | It no-ops automatically for canonical templates (`isFork: false`). Step 9 notes scheduled retirement when the last forked-template package (isle5/buildright) is gone — no action now. |

---

## Implementation Constraints

- **File size / complexity:** follow `.rptc/sop/code-patterns.md` — `TIMEOUTS.*` constants (no magic numbers;
  reuse `PREREQUISITE_CHECK` for the patch fetch as `contentPatchRegistry` does), helper extraction, no nested
  ternaries. New files <500 lines.
- **Reuse over reinvention (DRY):** the code-patch engine generalizes `contentPatchRegistry` + the vendoring
  shape; do **not** introduce a parallel fetch/cache mechanism. No new npm packages.
- **Single source of truth:** modifications to canonical/library code live **only** in the external patch set —
  never in a fork, never duplicated between bundled and external definitions (the v1 lesson).
- **Engine stays generic:** no canonical file name or content in extension code; coupling lives entirely in the
  external patch definitions.
- **Platforms:** Node 18+, VS Code 1.85+ (unchanged).

---

## Open Questions for Owner (before TDD detail)

These are genuine forks-in-the-road the ADR explicitly left to the implementation workstream
("What This ADR Does Not Decide"). None block approving the **structure**; they shape Steps 1–2 detail.

1. **Q1 — Create/reset failure mode when the patches repo is unreachable** (R3). Fail the create loudly, or
   proceed-without-patches and warn? ADR leans "defined failure mode"; recommendation: **fail loudly for
   CitiSignal** (patches are not cosmetic), proceed-with-warning only if a package marks patches optional.
2. **Q2 — `last-known-good` file format & location.** Recommendation: a one-line `last-known-good` file at the
   patches repo root (plus the existing per-brand `patches.json`), holding the verified canonical SHA; commit
   history is the audit log. Confirm filename/path so Steps 3, 6, 7 agree.
3. **Q3 — Patches repo name.** Keep `skukla/eds-demo-content-patches` (add `citisignal/code-patches.json` +
   root `last-known-good`) or generalize to `eds-demo-patches`? Affects `CodePatchSource` defaults in config.
4. **Q4 — Does smart-404 vendoring migrate onto the v2 engine now, or stay special-cased?** ADR says this is an
   implementation choice. Recommendation: **keep it special-cased** for this initiative (it injects net-new
   marker-bounded snippets with its own idempotency contract); revisit later.

---

## Definition of Done (initiative-level)

- CitiSignal EDS storefronts create/reset from canonical `hlxsites/aem-boilerplate-commerce` at the LKG SHA,
  with the ~6–8 patch ledger applied (canonical files + installed library blocks), all preconditions matching.
- `demo-packages.json` + `block-libraries.json` point at canonical / demo-team; `contentSource` unchanged.
- Daily gate green and advancing `last-known-good`; obsolete-patch retirement PRs proven on at least one patch.
- Four hlxsites PRs + two demo-team PRs filed (acceptance not required for done — they are exits).
- `skukla/citisignal-eds-boilerplate` archived with nothing pointing at it; the gated sync project
  (`2026-06-09-storefront-template-sync.md`) dropped, not executed.
- All tests green; coverage targets met; Efficiency + Security reviews passed.

---

## Step Files

- `step-01.md` — Code-patch engine v2 (generic, externalized)
- `step-02.md` — Reset/create pipeline integration
- `step-03.md` — LKG pointer: record at create + LKG-aware update check
- `step-04.md` — Clone canonical at LKG SHA + sync-strategy redirect
- `step-05.md` — Config flips (`demo-packages.json`, `block-libraries.json`)
- `step-06.md` — Extract & consolidate the patch ledger (patches repo)
- `step-07.md` — Drift-gate workflow (patches repo)
- `step-08.md` — Upstream PRs (patch exits)
- `step-09.md` — Migration cutover, archival sequencing & cleanup
