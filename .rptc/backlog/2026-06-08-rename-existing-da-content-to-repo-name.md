# Retire `legacyLookupKey` infrastructure (Phase 2 — post-fleet-migration cleanup)

## Status

**The user-facing migration shipped in commits `23efd831` and `b2169699`** (2026-06-08). New projects always satisfy `daLiveSite === repoName`, and existing projects auto-migrate on their next reset (copy DA → re-register Helix at new URL → patch manifest → delete old DA site). The original Phase 2 plan called for that migration plus a follow-up cleanup batch; the migration is done, this entry is now scoped to the cleanup batch.

## Provenance

When `23efd831` shipped, three pieces of "legacy compatibility" infrastructure were left in the codebase to support storefronts that hadn't yet been reset on a post-migration build:

- `SiteRegistrationParams.legacyLookupKey` and the `cleanUpLegacyRegistration` branch in `ConfigurationService.updateSiteConfig` (commit `85a7f288`) — deletes the orphan registration at the legacy DA-keyed URL during reset.
- The four-argument `buildSiteConfigParams(repoOwner, repoName, daLiveOrg, daLiveSite, ...)` signature — passes the DA coords separately even though they now always match the repo coords.
- The `daLiveSite` field on `eds-storefront` instance metadata in the project manifest — duplicates `githubRepo` since the names are locked together.

All three become dead code once every active storefront has been reset at least once on a post-`23efd831` build. Until then they remain load-bearing for the heal-on-first-reset path.

## Goal / Scope

Retire the dead code. The codebase collapses to a single-identifier model: one name (the GitHub repo) drives both the Helix lookup key and the DA content source URL.

**In scope:**

- Remove `legacyLookupKey` from `SiteRegistrationParams` and the `cleanUpLegacyRegistration` branch from `ConfigurationService.updateSiteConfig`. Update tests.
- Collapse `buildSiteConfigParams(repoOwner, repoName, daLiveOrg, daLiveSite, overlayUrl?)` to `buildSiteConfigParams(repoOwner, repoName, daLiveOrg, overlayUrl?)`. Update every call site.
- Remove the `daLiveSite` field from the eds-storefront manifest metadata type. Update every reader (use `githubRepo` instead). Add a one-time migration in `StateManager.loadProject` that drops `daLiveSite` from existing manifests on load.
- The `storefrontNameMigration` module itself stays — it's no-op on the happy path (names already match) and remains a defensive net.

**Out of scope:**

- Removing the `storefrontNameMigration` module — it's idempotent and cheap (the skip path is two equality checks), and keeping it as a fail-safe protects against any edge case where a manifest gets manually edited or restored from an old backup.

## Trigger

Run when:

- Telemetry shows zero `storefrontNameMigration` activations across the SC team for at least 30 days (no one is hitting the heal path anymore), OR
- A clean-codebase pass needs to retire transitional infrastructure (e.g., a structural baseline cycle).

The amount of "carried" code is small — Batch 5 is a single-day commit, not a feature. It's pure deletion, with no behavior change for any storefront that's already on the post-`23efd831` model.

## Execution Plan

Single batch. All-or-nothing — partial cleanups create more dead code than they remove.

1. Delete `legacyLookupKey` from `SiteRegistrationParams` and `cleanUpLegacyRegistration` from `ConfigurationService.updateSiteConfig`. Remove related tests.
2. Remove the fourth argument from `buildSiteConfigParams`. Compiler will name every call site; update each in place to drop the `daLiveSite` argument.
3. Remove `daLiveSite` from the `eds-storefront` metadata type. Compile, fix every reader (they'll all want `githubRepo` instead). Add a one-shot strip in the manifest-loading code so existing on-disk manifests don't carry the dead field.
4. Run the full test suite. Expect green — the deleted code was already on a no-op path.

## Kickoff prompt

> Pick up the `2026-06-08-rename-existing-da-content-to-repo-name` backlog item — Batch 5 cleanup only (the user-facing migration already shipped in `23efd831` + `b2169699`). Retire `SiteRegistrationParams.legacyLookupKey`, the `cleanUpLegacyRegistration` branch in `ConfigurationService.updateSiteConfig`, the fourth argument to `buildSiteConfigParams`, and the `daLiveSite` field on `eds-storefront` manifest metadata. Add a one-time loader-side strip so on-disk manifests don't keep the dead field. Read the full item; the execution plan is a single batch. Hold the work until telemetry confirms no `storefrontNameMigration` activations for 30+ days.
