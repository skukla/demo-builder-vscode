# Step 05 — Satellite path honors `ContentSource` (AEM point-at end-to-end registration)

**Goal:** `executeSatelliteSetup` registers an AEM-sourced satellite correctly and **skips the DA.live content-population pipeline** when the source is AEM.

## RED tests
- `tests/features/eds/handlers/storefrontSetupPhases-aem.test.ts`
  - AEM satellite → `registerSite` called with `content.source.url` = AEM author URL/contentPath, `code.owner` = upstream (cross-org), `org/site` = joiner's coords.
  - AEM satellite → content-copy/clear/publish NOT invoked. Assert `daLiveContentOps.copyContentFromSource` / `deleteAllSiteContent` not called.
  - **DA.live satellite regression** (characterization): existing satellite behavior byte-identical (Slice 1's content pipeline still runs).
  - No-false-success: AEM registration failure throws/aborts (mirror Slice 1 `step-04.md` hardening).

## GREEN surface
- Edit `storefrontSetupPhases.ts` `executeSatelliteSetup` (lines ~266-323): construct the `ContentSource` via the factory from `edsConfig.contentSourceType`; thread it into `registerConfigurationService`; gate the content-population `executeEdsPipeline` so an AEM source skips copy/publish (named predicate: `contentSource.type === 'aem-sites'` OR existing `skipContent` when no DA contentSource).
- Edit `storefrontSetupPhase3.ts` `registerConfigurationService` + `buildSiteConfigParams` call to pass the `ContentSource`.

## REFACTOR
- The skip gate is a named predicate, not inline boolean soup.

## Done-when
- AEM registration + skip-pipeline tests green; DA.live satellite regression byte-identical; no-false-success enforced; full regression green.
