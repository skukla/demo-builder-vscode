---
id: PL-8
kind: fix
area: platform
needs: []
value: med
status: shipped
---

# Dedup pass over the pre-boundary clones the sweeps filed

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-08-27, from the quality-sweep loop (report:
`.rptc/handoff/2026-08-27-quality-sweep-report.md`). Both sweep passes found
these with jscpd, blame-dated every one to BEFORE the beta.143 consolidation
boundary, and left them per scope discipline. Repo-wide duplication is low
(0.62%) — this is the concentrated remainder, one tidy pass.

The worklist, largest first (jscpd regions as of 2026-08-27; re-run
`code-duplication-scan` before working — lines move):

1. **DA.live listing walk, 35 lines** — `daLiveBlockLibraryOperations.ts`
   [107-141] ↔ `daLiveContentOperations.ts` [279-313] (both under
   `eds/services/daLive/`). Blamed to the 2026-07-07 decomposition.
2. **projects-dashboard handler internals** — three overlapping clones inside
   `projects-dashboard/handlers/dashboardHandlers.ts` ([409-442]/[473-506],
   [674-687]/[710-723], [701-723]/[756-778]/[800-822]) — the delete/rename
   confirmation shape, blamed to 2026-01-30.
3. **prerequisites check/continue pair** — `checkHandler.ts` [174-184,
   401-411] ↔ `continueHandler.ts` [81-91, 196-206].
4. **auth project/workspace handler pair** — `projectHandlers.ts` [404-423] ↔
   `workspaceHandlers.ts` [133-152] (blamed 2026-08-03).
5. **updates** — `updateExecutor.ts` [467-478] ↔ `updateCore.ts` [82-93]
   (blamed 2026-08-14 — ironically the commit that "deduped the update core").
6. **ai/server internals** — `storefrontTools.ts` [68-78]/[141-151],
   `edsResetTool.ts` [103-125] ↔ `storefrontTools.ts` [155-177],
   `contentAuthoringTools.ts` ×3 ([306-315] vs three sites). These SURVIVED
   the Aug 20-24 consolidation.
7. **eds github pair** — `githubFileOperations.ts` [367-391] ↔
   `githubRepoOperations.ts` [466-501], plus an internal repoOperations clone.
8. **components/configure hook pair** — `useComponentConfig.ts` [388-410] ↔
   `useConfigureFieldValues.ts` [147-170].

The standing rule applies per clone: open BOTH sides, verify same job vs
variant (a variant is a finding too — record and leave), extract only on
verification, and prove each extraction by the consumers' tests passing
unchanged (the `guardOrBlock` extraction in this sweep is the reference).
Items 2 and 6 are single-file internals — lowest risk, start there.

## Shipped so far

- 2026-08-27  2026-08-27: sweep executed items 1-4, 7 partially, and adjudicated the rest. FIXED: projects-dashboard resolve-project prologue (7 copies → resolveProjectFromPath; 347 tests unchanged); contentAuthoringTools path-tool opener (3 → openPathCall; delete_page and write_page stated variants); edsToolGuards module (requireEdsProject/requireGitHub/requireDaLive, each at 3 copies across republish/sync_content/reset_eds_project; 731 ai/server tests unchanged); the DA.live '35-line clone' was a facade's COPIED DOCBLOCK, not logic — now a pointer; four Octokit factories → the one dead shared helper now has all three callers (120 tests unchanged); updates' boundary cast → real narrowing. RECORDED at two instances (Rule of Three): repoOperations response-mapper pair, prerequisites check/continue (NOTE: continue lacks check's resolveRequiredMajors id-mapping refinement — possibly a real inconsistency, needs its own look), auth project/workspace create prologues, updates pre-dialog lookup guard, and the config-hook updateField pair (items 5/6/8) — the LAST is the drift-dangerous one: the PAAS_URL→GraphQL linked-field rule lives in both useComponentConfig and useConfigureFieldValues; whoever touches either next extracts buildFieldWrites FIRST.
