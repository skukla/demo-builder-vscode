# Code patches never run in edit mode — `edsConfig.codePatches` is not rehydrated

> ## ✅ SHIPPED — archived 2026-08-13
>
> Fixed by **`3843b6be`** ("fix(eds): restore package settings in edit mode and survive a
> stale delayed.js SHA") — one commit that closed this AND its sibling
> [`2026-07-29-pdp404-stale-sha-conflict.md`](2026-07-29-pdp404-stale-sha-conflict.md).
> Found still-open on 2026-08-13 during a validation pass.
>
> Both halves of the goal landed:
>
> 1. **Rehydration** — `rehydratePackageDerivedConfig()` in
>    `src/features/eds/handlers/storefrontSetupConfigRehydration.ts`, called from
>    `storefrontSetupHandlers.ts`. Resolved at the point of use, as the item asked, so MCP
>    and reset paths get it too.
> 2. **The guard speaks** — the early return in `pinIfThinLayer()` now logs
>    `'[Storefront Setup] No code patches configured for this storefront — skipping patch step'`,
>    carrying a comment that names this defect: *"Logged, never silent. This guard disabled the
>    whole code-patch subsystem for every edit-mode run since before beta.121, and the absence
>    of any log is what hid it."*
>
> **Two citations in this file are dead** and were left as written rather than repaired —
> the file is history now. `storefrontSetupPhase1.ts` moved from `services/` to `handlers/`,
> and the guard is no longer at `:115`. `WelcomeStep.tsx:155` is no longer the only producer;
> `edsConfigFromStorefront.ts` and `wizardHelpers.ts` also emit `codePatches`.

**Filed:** 2026-07-29
**Origin:** Live Extension Host run against `skukla/demo-builder-test`, storefront
republish from the edit wizard. Expected `[Patch] Fetching code-patches.json from
skukla/eds-demo-patches`; got nothing, across two full runs including one with
reset-to-template and a 9-block install.
**Severity:** High — silently disables the ADR-007 SKU-encoding patches, which are
load-bearing for PDP routing.
**Present in:** `v1.0.0-beta.121` verbatim (`storefrontSetupPhase1.ts:115`). Not a
regression from the beta.122 hotfix — that branch touches neither file.

## Provenance

`demo-packages.json` → `custom` / `eds-accs` declares five patch IDs and a source:

    "codePatches": ["header-nav-tools-defensive", "product-link-sku-encoding",
                    "product-link-sku-slash-encoding", "aem-assets-sku-sanitization",
                    "commerce-account-sidebar-selector-race"],
    "codePatchSource": {"owner": "skukla", "repo": "eds-demo-patches",
                        "path": "b2b", "lkgFile": "b2b/last-known-good"}

None applied. The chain, from the run's own logs:

1. `fetchExternalPatches` logs `[Patch] Fetching <file> from <owner>/<repo>` at **info
   on every uncached call**. No such line in either run → the fetch never happened.
2. `getCodePatches` calls it unconditionally, so it was never reached.
3. `storefrontSetupPhase1.ts:115` — `if (!edsConfig.codePatchSource || !edsConfig.codePatches) return;`
   **Silent early return. No log.** This is why there is no trace at all.
4. Startup log shows why the guard tripped:

       [Edit] EDS metadata keys: [repoUrl, githubRepo, daLiveOrg, daLiveSite,
                                  templateOwner, templateRepo, lastSyncedCommit]
       [Edit] Extracted edsConfig: {"daLiveOrg","daLiveSite","githubOwner",
                                    "repoName","repoUrl"}

   Neither field is persisted in project metadata, and `extractSettingsFromProject`
   (`dashboardHandlers.ts`) does not reconstruct them from the package.
5. `WelcomeStep.tsx:155` (`codePatches: storefront.codePatches`) is the **only**
   producer. It runs on package selection during creation. Edit mode never passes
   through it, so the value stays `undefined`.

Net: fresh creations get patches; every edit-mode republish silently skips them.

## Why it matters

`product-link-sku-encoding`, `product-link-sku-slash-encoding`, and
`aem-assets-sku-sanitization` implement the reversible `_HH` SKU URL encoding of
ADR-007 — the storefront half of a contract whose extension half lives in
`pdpUrlEncoding.ts`. Skipping them leaves the two halves disagreeing, and PDPs
resolve against paths the storefront never generates.

This is one of **three** independent ways PDP routing breaks silently. See
[2026-07-29-pdp404-stale-sha-conflict.md](2026-07-29-pdp404-stale-sha-conflict.md)
for the second; the Configuration Service 403 is the third and is the only one that
surfaces a user-facing message.

## Goal / scope

1. Rehydrate `codePatches` + `codePatchSource` from the demo package whenever they
   are absent from `edsConfig`, keyed on the project's `selectedPackage` +
   `selectedStack` (both already persisted and both present in the run's logs:
   `selectedPackage=custom, selectedStack=eds-accs`).
2. **Log the early return.** A guard that disables a whole subsystem must say so.
   The absence of any log is what let this ship since before 121 and what made it
   cost a full session to find.

Resolve at the point of use rather than only in the wizard, so MCP and reset paths
get the same treatment. Out of scope: changing what the patches do, or the LKG pin
mechanism.

## Constraints

- Do not persist patch IDs into project metadata — the package config is the source
  of truth and must stay able to change between releases.
- Keep the guard: a storefront with no `codePatchSource` (non-patched stacks) must
  still no-op, just audibly.

## Verification

- Unit: edit-mode config lacking both fields resolves them from the package; a
  package with no `codePatchSource` still returns undefined and logs the skip.
- Live: republish an existing EDS project from the edit wizard and confirm
  `[Patch] Fetching code-patches.json from skukla/eds-demo-patches` appears.

## Kickoff prompt

> Read `.rptc/complete/2026-07-29-code-patches-not-rehydrated-in-edit-mode.md`.
> Rehydrate `edsConfig.codePatches` / `codePatchSource` from the demo package when
> absent, and make `storefrontSetupPhase1.ts:115` log when it skips. TDD.
