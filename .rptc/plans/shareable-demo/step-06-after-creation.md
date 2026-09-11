# Step 06 — Reset, update, edit and forget an added demo

Item: [[EDS-13a]]. Decisions: D2, D4. Depends on steps 01 and 05.

**Reuse:** section G of `../portable-demos/reuse-map.md` lists every existing thing this step is built from and how (use as is / add to it / make it shared / build new). A new file, hook, shape or word not in that section names the row it replaces and why.

## Goal

Every door in research §3b behaves for an added demo as it does for a shipped one, because
each reads the step-01 resolver. This step is mostly verification of step 01 against a real
project, plus the few places that need a colleague-specific rule.

| Door | Expected after steps 01 + 05 | Colleague-specific rule |
|---|---|---|
| Reset (both dashboard doors, MCP) | resolves the stored row; re-fetches the demo's source; re-copies pages | no LKG pin (`edsResetRepoHelper.ts:286` branch is skipped because no `codePatchSource`); the dry check re-runs and reset's completion message gains the same consequence-worded caveat list the wizard card shows (reset has no caveat channel today: `edsResetUI.ts` shows none); nothing persists (D23) |
| `refresh_block_library` | passes the template guard | — |
| Edit-mode rebuild | rehydration finds the row | a MISS logs at warn (step 01) |
| Republish / `.env` regenerate | flags from the stored row | the SC's B2B answer is one of those flags |
| Dashboard subtitle, projects-list card | the demo's name | — |
| AGENTS.md | the demo's name | — |
| Update checker / template sync | UNCHANGED code: `checkForkSyncUpdates` already checks whether the project's template repo is a fork behind its parent (the SC's fork behind Jen) and offers a pre-ticked sync per repo; `TemplateUpdateChecker`'s non-thin-layer path offers each project "N changes behind" its template (Jen's `main` when unforked, the fork when forked); both in one picker, one confirmation | `getTemplateSource` (`updateTypes.ts:90`) reads instance metadata: Change source and rename self-heal must update it together with the project row, or step 01's resolver becomes what it reads |
| Name migration, site-config repair | resolve without overlay | — |
| Block-library audience, inspector overrides | defaults | accepted degradation, named in docs |

## When the source is unreachable (unforked demos; and content for all)

Today: reset fails midway with raw git output (`githubRepoOperations.ts:551`), the update
check logs a warning and shows nothing (`templateUpdateChecker.ts:205`), nothing displays a
project's source. Decided 2026-09-11 (owner):

- **Notice.** The dashboard shows a notice on the project (the dashboard-notice convention in
  `spectrum-webview-ui`): "Jen's demo can't be reached. Reset and updates are unavailable
  until it is." The source is probed by the same handler as step 03, read-only.
- **Reset refuses up front** with that sentence, before the confirmation dialog, instead of
  failing midway with git output. The check is a preflight in `extractResetParams`'s caller.
- **Rename self-heal.** When GitHub answers with a different `full_name` (a redirect), the
  stored owner/repo in the project row and the remembered setting are updated silently and
  logged, the way the storefront name migration already self-heals names.
- **Change source.** A dashboard action reopens the Add dialog on stage 1 to point the
  project at a new link of the SAME kind (EDS to EDS, headless to headless), or at a fork
  made now if the original still exists. It rewrites the project row's source and, when the
  SC asks, the remembered setting; it touches neither the SC's repo nor their site.
  Pointing back undoes it.
- **Content is not forkable.** When the colleague's DA.live site (or the fork's upstream
  site) has no reachable index at reset time, reset offers "keep my current content" and
  resets code only, instead of failing on the index.

## Tests first

The reset-params suite with a project carrying a stored row (injected `packages` empty to
prove the catalog is not consulted); the config-flag suite with a stored `configFlags`; the
dashboard/projects-list name tests with a stored row.

## Done when

On a real project created in step 05: reset completes from both doors, Configure opens with
the demo card present, republish preserves the B2B flags, and the update check reports
against the colleague's `main`.
