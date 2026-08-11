# AEM Assets binding lost on first-time DA.live user create (.115 fix)

**Status:** Draft. Root cause confirmed via field data; UX decisions locked; ready to implement.
**Filed:** 2026-06-11
**Origin:** Field issue with Leah Rayard. Her CitiSignal storefront created successfully but the DA.live Library never showed the AEM Assets entry. Steve's reset-of-his-own-storefront works (Library shows AEM Assets). Both flows go through the same code (`executeEdsPipeline` → `applyDaLiveOrgConfigSettings` → `DaLiveContentOperations.applyOrgConfig`), so the divergence had to be at runtime, not in the code path. Diagnostic confirmed it.

## Root cause

`DaLiveContentOperations.applyOrgConfig` (in `src/features/eds/services/daLiveContentOperations.ts`) does a **read-modify-write** cycle to update the DA.live org config sheet. It first does a `GET https://admin.da.live/config/<org>` to read existing config, then merges in the new keys (`aem.repositoryId`, `editor.path`), then POSTs the merged result back.

The code at lines 2418-2446 handles the GET response with three branches:

- **200 OK** → use existing config rows, merge updates in
- **404** → "No existing config — safe to create fresh" (because there are no permissions to lose if nothing exists)
- **anything else** → bail out with `{ success: false }` and a generic error string

The caller (`applyDaLiveOrgConfigSettings` in `edsHelpers.ts:634`) treats failure as non-fatal — logs a warn and the pipeline continues — so the storefront create succeeds even when the binding write fails. Which is why Leah's storefront shipped but her DA.live Library has no AEM Assets entry.

**The actual DA.live behavior:** when `/config/<org>/` has never been written for a user, DA.live returns **401, not 404**. Most likely because the endpoint requires owner-auth and a non-existent config has no owner record to authenticate against — so DA.live can't distinguish "not allowed" from "not yet created" and defaults to 401.

The existing 404 branch was correct in spirit (handle "config doesn't exist yet") but wrong in code (it only matches 404, never the 401 that real first-time users actually see).

**Diagnostic confirmation:**
- Steve has a prior DA.live presence from earlier projects. His `GET /config/skukla/` → 200 with existing JSON. Read-modify-write succeeds. Binding lands. Library shows AEM Assets. ✓
- Leah was a first-time DA.live user when she created. Her `GET /config/leahrayard/` → 401 (verified by Leah herself opening the URL in her browser). Extension bailed at line 2434. Binding never wrote. Library has no AEM Assets. ✗
- Her `demoBuilder.daLive.aemAuthorUrl` setting is populated (confirmed by Steve), so the precondition for the binding to write was met — only the read failed.

This pattern almost certainly applies to **every first-time DA.live SC** who's joining the team. Maddie too, once she gets past her own auth gap from earlier in this thread.

## The fix

Extend the read-handling branch in `applyOrgConfig` to recognize 401 as "first-time, no config exists" — but **only after verifying write access** via a separate probe, so we don't accidentally write a skeleton config to an org someone else owns (the existing comment at line 2412 explains why that's unsafe — it would erase a permissions sheet).

The write-access probe is `HEAD https://admin.da.live/list/<org>/` with the same Bearer token. DA.live returns the user's permissions in the `x-da-actions` response header (e.g., `read,write`). The function that does this — `hasWriteAccess` — already exists in `src/features/eds/handlers/edsDaLiveOrgHandlers.ts:261` and is used by the list-orgs handler at line 362 to flag each org as writable.

### Architecture: move `hasWriteAccess` to the service layer

`hasWriteAccess` is a pure DA.live API call with no handler or VS Code concerns. It's misplaced in `handlers/` for historical reasons (the original pre-auth gate that lived in handlers used it). The correct home is `src/features/eds/services/daLiveOrgOperations.ts` — "org operations" naturally fits a write-access probe at the org level.

Moving it accomplishes three things:
- Single source of truth: no duplicate inlined into `daLiveContentOperations.ts`
- Correct layering: services don't import from handlers
- Honest architecture: future services that need to probe write access can call the same helper

The list-orgs handler (the existing caller) updates to import from the service. Standard handler-imports-service direction, no layering violation.

The destination call site (`applyOrgConfig`) is a peer service-to-service import (`daLiveContentOperations` importing from `daLiveOrgOperations`). Both are services, so this is fine.

## Why this is safe

Two failure modes the fix has to avoid:

1. **Don't write skeleton config to an org someone else owns.** The 401 ambiguity ("doesn't exist" vs "you don't own this") is real. If we wrote `{ ':version': 3, ':names': ['data'], ':type': 'multi-sheet' }` unconditionally on 401, we could erase the permissions sheet of an org that exists but isn't ours. The write-access probe (HEAD `/list/<org>/`) closes this — only proceed if the user has confirmed write access.
2. **Don't re-introduce the pre-auth gate that Step 4 of the picker plan removed.** The picker plan deleted upfront write-access checks at create-time because they blocked legitimate first-time users. This fix is *narrower*: it only probes write access in the specific 401 branch of an already-running config write, not as a gate before the write begins. If the probe fails, we surface a clear error and the caller continues to treat the binding write as non-fatal (matching current behavior).

Three-case behavior matrix:

| GET `/config/<org>/` | HEAD `/list/<org>/` (in 401 branch) | Result |
|---|---|---|
| 200 | (not probed) | Use existing config; merge + write |
| 404 | (not probed) | Create fresh; write |
| 401 | HEAD returns `x-da-actions` containing `write` | Treat as first-time owner; create fresh; write |
| 401 | HEAD returns `x-da-actions` without `write`, or HEAD itself fails | Return `{ success: false }`; binding doesn't write; pipeline continues |
| 5xx, network failure | (not probed) | Return `{ success: false }`; binding doesn't write; pipeline continues |

## Files to change

| File | Change |
|---|---|
| `src/features/eds/services/daLiveOrgOperations.ts` | **Add** `hasWriteAccess(orgName, token)` as a public function (moved from handlers, byte-identical implementation) |
| `src/features/eds/handlers/edsDaLiveOrgHandlers.ts` | **Remove** the local `hasWriteAccess` definition. **Update** the `list-orgs` self-use at line 362 to import from the service. Update any re-export accordingly. |
| `src/features/eds/handlers/edsDaLiveHandlers.ts` | **Remove** the `hasWriteAccess` re-export at line 28 (or repoint at the new service location — see open question below) |
| `src/features/eds/services/daLiveContentOperations.ts` | **Add** the new 401 branch in `applyOrgConfig` calling into the moved `hasWriteAccess` |

## Tests

In `tests/features/eds/services/daLiveContentOperations.test.ts` (create if missing):

1. **First-time owner case**: GET `/config/<org>/` returns 401, HEAD `/list/<org>/` returns 200 with `x-da-actions: read,write` → `applyOrgConfig` succeeds, POSTs a fresh config that includes the merged updates (`aem.repositoryId`).
2. **401 without write access**: GET returns 401, HEAD returns 200 with `x-da-actions: read` (no write) → `applyOrgConfig` returns `{ success: false }` with the explicit "verify ownership" error. No POST happens.
3. **401 with HEAD network failure**: GET returns 401, HEAD throws → same as case 2 (refusal). Safe-by-default.
4. **404 regression check**: GET returns 404 → unchanged behavior (create fresh, write). Confirms the existing branch still works.

In `tests/features/eds/services/daLiveOrgOperations.test.ts` (create or extend):

5. **`hasWriteAccess` returns true** when HEAD response includes `x-da-actions: write`
6. **`hasWriteAccess` returns false** when HEAD response lacks `write` action
7. **`hasWriteAccess` returns false** when HEAD fails (network error, non-2xx)

Tests 5-7 already exist in `tests/features/eds/handlers/edsDaLiveOrgHandlers.test.ts` (probably — verify during implementation) and would move alongside the function. If they don't exist, the migration is the right moment to add them.

## Execution plan

### Step 1 — Refactor: move `hasWriteAccess` to service layer (behavior-preserving)

- Add `hasWriteAccess(orgName: string, token: string): Promise<boolean>` to `src/features/eds/services/daLiveOrgOperations.ts` as an exported free function (or static method — see open question)
- Implementation is byte-identical to the current handlers version
- Update `src/features/eds/handlers/edsDaLiveOrgHandlers.ts` to import from the service. Delete the local definition.
- Update `src/features/eds/handlers/edsDaLiveHandlers.ts` re-export (or remove it if no external use)
- Move existing `hasWriteAccess` tests alongside (if any). If none exist, add 3 cases per the Tests section (5-7 above).
- Verify all existing call sites still work — `list-orgs` flow unchanged.

This step has no behavior change. Lints clean, tests pass, the function lives in its correct home.

### Step 2 — Bug fix: handle 401 as "first-time, possibly safe to create"

- In `daLiveContentOperations.ts`, extend the read-handling branch in `applyOrgConfig` with the new 401 branch as described above
- Import `hasWriteAccess` from `daLiveOrgOperations`
- Add the 4 new tests (1-4 in the Tests section above)
- Verify the 404 regression test still passes
- Verify the existing positive-path test (200, existing config) still passes

## Acceptance criteria

After both steps ship:

1. A first-time DA.live SC (e.g., Maddie or any future colleague who hasn't created a project before) creates a CitiSignal demo through the wizard. The wizard completes normally.
2. They open `https://da.live` and navigate to their site's content. The Library sidebar shows both **Blocks** and **AEM Assets** entries — matching what Steve sees today after reset.
3. Their `https://admin.da.live/config/<their-namespace>/` endpoint, after the create, returns 200 with a JSON body that includes a row `{ key: "aem.repositoryId", value: "<aem-author-host>" }`.
4. Steve's existing reset and republish flows still work (no regression).
5. An SC who attempts to create against an org they don't own gets `[EDS Config] Failed to apply settings: Cannot read or write to org config (401): verify DA.live ownership of "<org>".` in the debug log, and their storefront still creates (binding write is non-fatal, per current behavior).

## Risk + rollback

**Risk 1 — DA.live API behavior change.** The fix assumes `HEAD /list/<org>/` continues to return `x-da-actions` and that the value reliably reflects write permission. If DA.live changes the header name or format, the probe returns false and we surface the existing error message. Worst case: the bug returns. Mitigation: log the probe's response header for debugging when it returns false.

**Risk 2 — Token expired between GET and HEAD.** If the GET 401s because the token expired (not because the config doesn't exist), the HEAD would also fail (same expired token). The probe correctly returns false and we surface the error. Distinguishing "expired" from "first-time" isn't necessary — the user-facing remediation in both cases is "verify your DA.live auth."

**Risk 3 — Two-call latency.** Adding a HEAD round-trip on the 401 path adds ~100-300ms in the worst case. Only triggered when GET returns 401, which is a once-per-org first-time event. Negligible.

**Risk 4 — Step 1 refactor breaks the existing `list-orgs` flow.** The migration is byte-identical; behavior shouldn't change. Existing tests for the list-orgs flow would catch regressions. Mitigation: run the full `tests/features/eds/handlers/edsDaLiveOrgHandlers.test.ts` suite after Step 1 before starting Step 2.

**Rollback:** Two independent commits (Step 1 then Step 2). Step 2 can be reverted alone if the bug fix proves incomplete; Step 1 can be reverted alone if the refactor turns out to need follow-up.

## Open questions before implementation

1. **`hasWriteAccess` as a free function or a class method?** `DaLiveOrgOperations` exports a class. Adding `hasWriteAccess` as a static class method (or instance method that accepts the token explicitly) would match the file's existing convention. As a free function it's simpler but stylistically inconsistent. Recommend: static method on `DaLiveOrgOperations` if the class has other static helpers; free function if not. Implementation-time decision, doesn't affect the plan.
2. **Keep `edsDaLiveHandlers.ts` re-export?** Currently re-exports `hasWriteAccess` from the handlers file. After the move, it would re-export from the service file. The re-export's purpose isn't clear at the plan level — check who imports it during Step 1 and either retain (repoint) or delete (no external consumers).
3. **Should the user-facing error message in the "401 + no write" branch include the install URL or any actionable next step?** Today it says `Cannot read or write to org config (401): verify DA.live ownership of "<org>".` That's a debug-log message, not a user notification (the caller is non-fatal, doesn't surface to the user). Keep as-is unless the field surfaces a real complaint.

## What this plan does NOT solve

- **The wizard's "Assets Enabled" toggle wiring** (raised earlier in this thread). Today the toggle controls the storefront-level `commerce-assets-enabled` flag in `config.json` but does not gate the DA.live binding write. They're decoupled by design and this fix doesn't couple them. If you want the toggle to gate the binding write, that's a separate decision — file as its own plan if it becomes a real requirement.
- **Pre-flight write-access verification at auth time.** The picker plan (parked on `feature/eds-namespace-picker`) deliberately removed the upfront write-access gate. This fix's HEAD probe is narrower — only on the specific 401 read branch, only as a safety check before "create fresh." We are NOT reintroducing a gate that runs before every create.
- **Steve's environment-checking workflow.** Steve's storefronts work because of his prior DA.live presence. Nothing in this fix needs to change his experience.

## Kickoff prompt

```
Implement the aem-assets-first-time-user-fix plan
(see .rptc/plans/aem-assets-first-time-user-fix/overview.md).

Design is locked. Execute Step 1 then Step 2 in order. Each step is
an independent commit on develop.

Hot files (Step 1 — refactor):
  - src/features/eds/services/daLiveOrgOperations.ts (add hasWriteAccess)
  - src/features/eds/handlers/edsDaLiveOrgHandlers.ts (remove local
    definition, update self-use at line 362 to import from service)
  - src/features/eds/handlers/edsDaLiveHandlers.ts (resolve the
    re-export — see open question 2)

Hot files (Step 2 — bug fix):
  - src/features/eds/services/daLiveContentOperations.ts (extend
    applyOrgConfig read-handling with the 401-branch + write-access probe)

Verify during implementation:
  - The full tests/features/eds/handlers/edsDaLiveOrgHandlers.test.ts
    suite passes unchanged after Step 1 (confirms the refactor is
    behavior-preserving)
  - The new 4 test cases for applyOrgConfig pass after Step 2
  - Lint clean across all touched files

Target: ship as part of beta.115.

Acceptance criteria: see "Acceptance criteria" section in the plan.
The single most important check is the first one — a fresh DA.live
user creates a project and sees AEM Assets in the Library after.
```
