# Step 6: Upstream Sync Wiring + `reset-to-upstream` Default for Content Forks

**Purpose:** Make a content fork **sync from the upstream** using the **existing**
`TemplateSyncService`, and implement **PM decision D2**: content forks default to
the **`reset`** strategy (`reset-to-upstream`). This is additive — the service
already supports `merge`/`reset`, falls back to reset on conflict, and preserves
`config.json` + `fstab.yaml`. We only (a) point the sync metadata at the upstream
and (b) choose the default strategy by flow.

**Prerequisites:**
- [ ] `templateSyncService.ts` understood — `syncWithTemplate(project, {strategy,
  preserveFiles})`, reads `metadata.{githubRepo, templateOwner, templateRepo}`,
  `DEFAULT_PRESERVE_FILES = ['fstab.yaml','config.json']`
- [ ] How EDS metadata is populated at creation (`populateEdsMetadata` in
  `executor.ts:491` sets `templateOwner/templateRepo`)
- [ ] Where sync is invoked from (dashboard/update entry) and how the strategy is
  currently chosen
- [ ] Steps 1–5 complete

---

## Reuse map

- **`TemplateSyncService`** (`src/features/updates/services/templateSyncService.ts`) — used **as-is** (no internal change); already preserves `config.json`/`fstab.yaml` and supports reset/merge.
- **`populateEdsMetadata`** write path — set `templateOwner/templateRepo = master` (and write the self-describing marker).
- **Net-new:** a one-line `defaultSyncStrategyForProject` predicate (`reset` for content).

---

## Tests to Write First

### Unit: `tests/.../content-sync-wiring.test.ts`
- [ ] **Content fork metadata points sync at the upstream** —
  `templateOwner/templateRepo` resolve to `project.upstream.{owner,repo}` for a
  content fork.
- [ ] **Default strategy for content flow is `reset`** — the strategy selector
  returns `'reset'` for content projects.
- [ ] **Commerce/EDS default unchanged** — existing default strategy preserved
  (regression).
- [ ] **Preserved files still include `config.json` + `fstab.yaml`** for content
  syncs (the backend wiring + content source survive the reset).

---

## Files to Create/Modify
- [ ] `src/features/project-creation/handlers/executor.ts` — when `flow==='content'`,
  populate `templateOwner/templateRepo` from `upstream` (extend the
  `populateEdsMetadata` path; it currently keys off EDS-stack)
- [ ] The sync invocation site (dashboard/update handler) — choose default
  strategy via a small `defaultSyncStrategyForProject(project)` predicate
  (`reset` for content, current default otherwise)
- [ ] `tests/.../content-sync-wiring.test.ts` — new

---

## Implementation Details

### RED
Tests assert upstream metadata + content default strategy; fail initially.

### GREEN
- **Metadata:** ensure content forks get `templateOwner/templateRepo` =
  `upstream.{owner,repo}` so `TemplateSyncService` syncs from the upstream with
  no service change. (If reusing EDS metadata fields proves awkward, add an
  explicit `upstreamRepo` to metadata — see Assumption A3 — but prefer reuse.)
- **Strategy default:** add `defaultSyncStrategyForProject(project)` returning
  `'reset'` for `isContentFlow(project)`, else today's default; use it at the
  invocation site. Do not change `TemplateSyncService` internals.

### REFACTOR
- Keep the strategy decision in one predicate, not scattered conditionals.
- **Document the reliability rationale** inline (brief) and in the plan: reset is
  safe for content forks because content lives in DA.live/AEM, not the repo, and
  the wiring files are preserved; durable code changes are promoted to the
  upstream rather than merged per-fork (two-way contribution = later slice).

---

## Acceptance Criteria
- [ ] Content fork syncs from its `upstream` via the existing service.
- [ ] Content default strategy = `reset`; commerce default unchanged.
- [ ] `config.json` + `fstab.yaml` preserved across content syncs.
- [ ] No modifications to `TemplateSyncService` behavior (additive wiring only).

**Estimated time:** 4–5 hours
