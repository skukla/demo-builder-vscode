# Rename existing DA.live content sites to match GitHub repo name (Phase 2)

## Provenance

Surfaced 2026-06-08 alongside [Phase 1](2026-06-08-unify-da-site-and-repo-name.md), which makes new EDS storefronts always satisfy `daLiveSite === repoName`. This phase closes the loop: migrates existing pre-Phase-1 storefronts so the same invariant holds for them too, and once it ships, retires the dual-identifier model from the codebase entirely.

The downstream code beneficiaries are concrete:

- `SiteRegistrationParams.legacyLookupKey` and the cleanup branch in [`ConfigurationService.updateSiteConfig`](../../src/features/eds/services/configurationService.ts) — both can be deleted.
- The four-argument signature of `buildSiteConfigParams(repoOwner, repoName, daLiveOrg, daLiveSite, ...)` collapses to two-argument (`repoOwner`, `repoName`).
- The `daLiveSite` field on the project manifest becomes redundant (always equals `repoName`).
- Edit-mode no longer needs to thread two names through the wizard.

Run this *after* Phase 1 has been in the wild long enough that any storefront created on a pre-Phase-1 build is rare. The migration is one-time; the code simplification it unlocks is permanent.

## Goal / Scope

For existing storefronts whose DA.live site name differs from their GitHub repo name (the typical pre-Phase-1 default: `<repo>-content` vs `<repo>`), perform a one-time DA content rename: copy all DA.live content from `<daLiveOrg>/<daLiveSite>` to `<daLiveOrg>/<repoName>`, update the storefront's Configuration Service registration to point at the new content source URL, update the project's local manifest, and delete the old DA site. After this runs, the storefront satisfies `daLiveSite === repoName`.

**In scope:**

- Detect the mismatch on project reset/configure/check-for-updates (whatever path makes sense as the migration trigger).
- Surface a one-time prompt: "This storefront's DA content lives at `<daLiveOrg>/<daLiveSite>`. We'd like to rename it to `<daLiveOrg>/<repoName>` for consistency. Proceed?"
- On confirm: DA content rename (copy → re-register → delete old). On decline: skip; offer again on the next eligible operation.
- Tests covering the copy, registration update, manifest update, and deletion sequence; rollback if any step fails partway.

**Out of scope:**

- Anything in `accs-discovery-service` (Phase 1 already eliminated the BYOM secret coordination; nothing here touches the action).
- The `daLiveOrg` value — only the site name changes. `daLiveOrg` stays as-is.
- Automating the rename without user consent. The migration is destructive (deletes the old DA site after the new one is registered) and the user should approve once per storefront.

**Once this ships:**

- Remove `legacyLookupKey` from `SiteRegistrationParams`.
- Remove the `cleanUpLegacyRegistration` branch from `ConfigurationService.updateSiteConfig`.
- Collapse `buildSiteConfigParams` signature to two args.
- Remove `daLiveSite` from the project manifest.

These cleanups become a follow-up commit gated on this phase having run across the fleet (track via a project-creation/migration version flag if needed).

## Root Cause

Pre-`164fd251` builds let `daLiveSite` and `repoName` diverge. The shipped fixes (commit `164fd251` and `85a7f288`) let mismatched-name storefronts keep working, but they have to do extra work forever to compensate for the divergence: the registration uses one name, the content source URL uses the other, and the legacy-cleanup path has to know about both.

A real fix renames the DA content so the two names align. After that, every code path can assume a single identifier.

## Execution Plan

Multi-batch. The DA rename is the load-bearing operation and needs careful sequencing because failure mid-way could leave the storefront in an inconsistent state.

### Batch 1: Detection + UX surface

Identify where to detect the mismatch. Strongest candidates:

- Project reset (already a heavy state operation; user expects it to take a moment).
- Configure screen open (lighter, but user is already in admin-edit mode).
- A dedicated "Migrate storefront name" action under the dashboard kebab.

Detection logic: project manifest has `daLiveSite !== repoName`. Surface a single non-blocking notification with "Migrate now" / "Later" / "Don't ask again on this project" actions.

### Batch 2: DA content rename pipeline

The rename is a copy-then-delete. The shape:

1. Verify the user is authenticated to DA.live with write access to `<daLiveOrg>/<daLiveSite>` and `<daLiveOrg>/<repoName>` (latter will be created).
2. Enumerate every file under `<daLiveOrg>/<daLiveSite>` via the DA.live list API.
3. For each file, fetch from the old path and write to the new path. Preserve content type and binary handling.
4. Verify the new site is complete (re-enumerate, compare counts).
5. Update the Helix Configuration Service registration at `/sites/<repoName>.json` to point `content.source.url` at the new DA site.
6. Update the local project manifest's `daLiveSite` to `repoName`.
7. DELETE the old DA site only after steps 5–6 succeed.

Failure handling: every step must be resumable. If step 4 fails, the old site is intact and the new site is partial — the user can retry. If step 5 succeeds but step 7 fails, the user has a duplicate that needs manual cleanup; surface a "cleanup needed" diagnostic.

### Batch 3: Tests

- Detection: produces an actionable notification only when `daLiveSite !== repoName`.
- Pipeline: each step is testable in isolation. Mock DA.live list/get/put/delete. Mock Helix admin PUT.
- Failure cases: step 4 (incomplete copy), step 5 (registration update fails), step 7 (old-site DELETE fails).
- Idempotency: re-running after partial completion converges to the same final state without duplicating work.

### Batch 4: Manual verification

Test in this order on a real (test) project:

1. Create a project on a pre-Phase-1 build with mismatched names. Confirm it works (publishes, serves).
2. Build the migration code. Run it. Observe the notification.
3. Click "Migrate now." Observe the copy progress.
4. After migration, confirm: DA list at `<repoName>` matches the file count from `<daLiveSite>`; AEM admin status reports preview/live 200 against the new content source URL; old DA site returns 404.
5. Re-run reset on the migrated project. Confirm `legacyLookupKey` is undefined, the cleanup branch doesn't fire, and the reset succeeds.

### Batch 5 (follow-up commit, after fleet migration): code cleanup

When telemetry / git history confirms no pre-Phase-1 storefronts remain active:

- Drop `legacyLookupKey` from `SiteRegistrationParams`.
- Drop `cleanUpLegacyRegistration` from `ConfigurationService`.
- Collapse `buildSiteConfigParams` signature.
- Remove `daLiveSite` from the project manifest type.
- Remove `daLiveSite` from any downstream code that read it.

This is mechanical at that point — every prior `daLiveSite` reference becomes `repoName`.

## Constraints

- **The DA rename is destructive.** The old site gets deleted at the end. Require explicit user confirmation. Never run silently.
- **Resume must be safe.** A user who quits VS Code mid-migration must be able to re-trigger the operation and converge correctly. Use the file count + listing checks as guards.
- **Block on auth.** If the DA.live token has expired or lacks write access to the destination, fail fast with a clear error before mutating any state.
- **No assumption about content size.** Some demos have hundreds of files; the copy must batch and show progress.

## Kickoff prompt

> Pick up the `2026-06-08-rename-existing-da-content-to-repo-name` backlog item. The goal is a one-time DA.live content rename so existing storefronts satisfy `daLiveSite === repoName` — the invariant Phase 1 already locks in for new projects. The migration is destructive (deletes the old DA site after copying) and must require user consent. Once shipped widely, the `legacyLookupKey` infrastructure and the four-argument `buildSiteConfigParams` collapse to a much simpler model. Read the full item; the execution plan section breaks the work into five batches.
