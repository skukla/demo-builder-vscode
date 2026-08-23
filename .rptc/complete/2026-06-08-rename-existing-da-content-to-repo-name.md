# Retire `legacyLookupKey` infrastructure (Phase 2 — post-fleet-migration cleanup)

> ## EXECUTED 2026-08-23 — Option A decided and shipped the same day
>
> The re-measure below stopped this item at the repair gap; the user decided
> **Option A: make repair migrate-first**, and the full batch then executed:
>
> 1. **Repair migrates first.** `repairSiteConfigForProject` now runs
>    `findStorefrontNameMismatch` → `migrateStorefrontNameForProject` before
>    `repairSiteConfig`; a failed migration aborts the repair (`status:
>    'failed'`) rather than repairing INTO the broken name. The command and the
>    `repair_site_configuration` MCP tool both pass a persist callback; the MCP
>    tool's description and the commands/CLAUDE.md row now say repair can rename
>    a DA site.
> 2. **`legacyLookupKey` retired.** The param, its `SiteRegistrationParams`
>    field, and `cleanUpLegacyRegistration` are deleted;
>    `buildSiteConfigParams` is 4-arg (no `daLiveSite` param — content source
>    URL uses the repo name). All 5 call sites updated.
> 3. **Manifest `daLiveSite` strip-when-equal only** (the blanket-strip
>    correction below held): `stripRedundantDaLiveSite` in the project file
>    loader drops the field when it equals the repo name; an UNEQUAL value is
>    preserved as the migration net's detection signal + content pointer.
>    Readers (`getEdsDaLiveTarget`, `getEdsDaLiveUrl`,
>    `extractRepublishParams`, MCP promote context, cleanupDaLiveSites) fall
>    back to the repo name.
>
> Gate: full suite 1132/14873 green, whole-repo lint 0 errors, both typechecks
> clean. Original re-measure record kept below for the reasoning.

> ## RE-MEASURED 2026-08-23 — NOT safe to execute as written; one live consumer the item predates
>
> Picked up under the clean-codebase trigger and stopped by the trace. The
> legacy branch is DEAD on every create/reset/migration path (reset's step 0
> heals `params.daLiveSite` in place before registration, and a migration
> error aborts the reset — so `buildSiteConfigParams` never sees unequal
> names there). But **`repairSiteConfigHeadless` — shipped 2026-08-14, after
> this item was filed — reads the MANIFEST's `daLiveSite` via
> `extractRepublishParams` and does NOT migrate first.** For an unmigrated
> straggler, repair is the one path where `cleanUpLegacyRegistration` still
> fires, and it is load-bearing there: the orphan registration it deletes is
> what "403s every write" — the exact symptom Repair exists to fix. Deleting
> the branch would break repair for precisely the users most likely to need
> it. The straggler population is unmeasurable (the telemetry the trigger
> assumed never existed).
>
> **The path to actually finishing this item** (a product decision, not a
> unilateral edit): make repair run `migrateStorefrontNamingIfNeeded` first,
> like reset does — then every path heals-before-registers, the branch goes
> dead everywhere, and the whole batch below executes as written. Note the
> repair surfaces (`Repair Site Configuration` command,
> `repair_site_configuration` MCP tool with its confirm gate) would then be
> able to rename a DA site as a side effect, which their current copy does
> not mention — decide and update the copy together.
>
> Also corrected: the `daLiveSite` manifest field is NOT retirable-by-strip
> as step 3 says — on stragglers it differs from the repo name and is the
> load-bearing pointer to where the DA content actually lives (readers
> correctly prefer it), AND it is the migration net's detection signal. A
> blanket strip-on-load would blind the net; only a strip-when-equal is ever
> safe, and only after the repair fix above.

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
