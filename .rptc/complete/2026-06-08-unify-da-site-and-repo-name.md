# Unify DA.live site name with GitHub repo name (Phase 1)

## Provenance

Surfaced 2026-06-08 during the BYOM/PDP-routing session that fixed a long-standing publish-silently-failing bug. The root cause of that bug — and of the legacy-registration orphan bug that followed — was the codebase carrying *two identifiers for one storefront*: a DA.live site name (wizard default: `<repo>-content`) and a GitHub repo name. Every layer that touches Configuration Service registration, URL stamping, or publish lookups has to remember which identifier to use, and getting it wrong silently corrupts the state.

Two fixes shipped in that session band-aid the symptom:

- [`164fd251`](https://github.com/skukla/demo-builder-vscode/commit/164fd251) — register the Helix site config under the GitHub repo name (not the DA.live site name) so preview/publish/live actually find the content source.
- [`85a7f288`](https://github.com/skukla/demo-builder-vscode/commit/85a7f288) — clean up the legacy registration on first reset to remove the orphan that pre-`164fd251` builds left behind.

Both are correct fixes given the dual-identifier model. **This backlog item proposes eliminating the model.** If `daLiveSite == repoName` is a hard invariant, the whole bug class disappears: one name, one lookup key, one URL coord, no orphans possible, no branching logic across layers.

## Goal / Scope

Make the DA.live site name always equal to the GitHub repo name for all *new* storefronts created by the extension. This is Phase 1 — covers new creates only. Existing storefronts with mismatched names continue to work via the legacy-cleanup path that already shipped ([`85a7f288`](https://github.com/skukla/demo-builder-vscode/commit/85a7f288)); see [Phase 2](2026-06-08-rename-existing-da-content-to-repo-name.md) for the migration that fully normalizes them.

**In scope:**

- Drop the separate DA.live site name input from the wizard (whichever step currently exposes it — search for `daLiveSite` in `src/features/eds/ui/steps/` and `src/features/project-creation/ui/steps/`).
- Derive `daLiveSite` from `repoName` at the wizard layer and pass the same value through to `edsConfig`. Single source of truth.
- Keep `buildSiteConfigParams` accepting the four-argument shape (it's also called from edit-mode and AI tools); just ensure the only producer of the params now feeds matching values for new creates.
- Validate that the resulting state satisfies `legacyLookupKey === undefined` in `buildSiteConfigParams` for new creates (the legacy-cleanup path becomes dead code on the happy path).

**Out of scope:**

- Migrating existing storefronts to matching names — that's [Phase 2](2026-06-08-rename-existing-da-content-to-repo-name.md).
- Removing the `daLiveSite` parameter from `buildSiteConfigParams` or `SiteRegistrationParams` — they stay until Phase 2 ships, because legacy data still flows through them on reset for old projects.
- Removing the legacy-cleanup code in `ConfigurationService.updateSiteConfig` — that's a Phase 2 follow-up after every existing project has been migrated.

## Root Cause

The wizard's DA.live site step (or equivalent) accepts a free-form site name that defaults to something like `<repo>-content`. The suffix appears to have been a UX convention to distinguish the DA content site from the GitHub code repo in the user's DA.live dashboard. It's purely cosmetic — Helix and DA don't care what the name is, only whether it's consistent across the layers that look it up.

Once the two names diverge, every Configuration Service lookup, every Helix preview/publish URL, and every cleanup operation has to disambiguate which name applies in which context. The dual-identifier model leaks into many code paths.

## Execution Plan

Single batch — small, focused, behavior-preserving for the typical path.

### Step 1: Locate and remove the DA.live site name input

Grep for `daLiveSite` in `src/features/eds/ui/` and `src/features/project-creation/ui/`. Identify the input field (likely in a settings or storefront-config step). Remove the input. Replace anywhere `daLiveSite` is read with a derivation from `repoName`.

If the wizard exposes `daLiveOrg` separately from `githubOwner`, leave that alone (it's a different concept — the DA tenant). The unification is name-only, not org-level.

### Step 2: Derive `daLiveSite` at the wizard's edsConfig assembly

Wherever `edsConfig.daLiveSite` is set today (probably `storefrontSetupHandlers.ts` or the wizard step's onContinue handler), set it to `edsConfig.repoName`.

### Step 3: Tests

- A new wizard-step test asserts `edsConfig.daLiveSite === edsConfig.repoName` after the user completes the step (for any value of repoName).
- An integration-style test on `buildSiteConfigParams` confirms that when the wizard feeds matching values, `legacyLookupKey` is `undefined` (the happy path skips the cleanup).
- No regression: existing tests that pass mismatched values directly to `buildSiteConfigParams` continue to work — the helper still supports the case for edit-mode of older projects.

### Step 4: Verification (manual)

1. F5 the extension.
2. Run through the wizard — confirm there's no separate DA.live site name input.
3. Create a B2B Boilerplate ACCS project. In the Debug log, confirm `[ConfigService] Registering site: <owner>/<repo>` uses the same name as the GitHub repo.
4. Check the AEM admin status (`GET /status/<owner>/<repo>/main/`) — preview and live should both be 200 once publish completes. No "primary site" warnings.
5. Re-open an existing pre-fix project from the dashboard — the edit-mode flow should still work because `daLiveSite` flows from the project's saved manifest, not the wizard.

## Constraints

- **No breaking change for existing projects.** Edit-mode reads `daLiveSite` from the project manifest, which is whatever was set at create time. The four-argument `buildSiteConfigParams` signature must remain.
- **No DA-side rename.** This phase doesn't move content from `<repo>-content` to `<repo>` for existing projects — that's Phase 2.
- **The legacy-cleanup code stays.** It's still needed for any existing project on its first post-fix reset. Phase 2 retires it.

## Kickoff prompt

> Pick up the `2026-06-08-unify-da-site-and-repo-name` backlog item. The goal is to make new EDS storefronts always have `daLiveSite === repoName` by removing the separate DA.live site name input from the wizard. Existing projects are out of scope (separate backlog item handles migration). The legacy-cleanup path in `ConfigurationService.updateSiteConfig` (commit `85a7f288`) stays in place. Read the full item before starting; the execution plan section names the files to touch.
