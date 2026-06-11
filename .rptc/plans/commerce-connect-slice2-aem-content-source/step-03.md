# Step 03 — `ContentSource` selection seam + project/type plumbing

**Goal:** Add the `contentSourceType` discriminator to the satellite's config/state and a factory that returns the right `ContentSource`, defaulting to DA.live so nothing existing changes.

## RED tests
- `tests/features/eds/services/contentSource/contentSourceFactory.test.ts`
  - absent / `'da-live'` → `DaLiveContentSource`.
  - `'aem-sites'` → `AemContentSource` (RED until Step 04, or stub a throwing placeholder here and fill in 04).
  - unknown value → throws a clear config error (NO silent DA.live fallback for an explicit bad value).
- Manifest round-trip: `contentSourceType?: 'da-live'|'aem-sites'` and the AEM auth field survive the manifest writer/loader whitelist (mirror Slice 1's persist round-trip test; `step-04.md` bullet (b) — both writer and loader drop unknown fields).

## GREEN surface
- New `src/features/eds/services/contentSource/contentSourceFactory.ts` (small 3-case `switch`, no registry/DI).
- Edit `src/types/webview.ts` (EDSConfig, ~line 399): add `contentSourceType?`, `aemContentSource?: { authorUrl: string; contentPath: string }`, `aemAuth?` (shape depends on R1).
- Edit `src/types/base.ts` + manifest writer/loader whitelist to carry the new fields.
- Edit `src/types/demoPackages.ts`: optional `aemContentSource` alongside `DaLiveContentSource` so a package storefront can declare an AEM source.

## REFACTOR
- Factory stays a trivial selector — no abstraction layer.

## Dependency note
- The exact `aemAuth` field shape is **blocked on R1** (AEM auth model). If R1 = defer-with-stub, land this step with `aemAuth` as an opaque secret-ref placeholder and finalize in Step 04.

## Done-when
- Factory branch coverage incl. error case green; manifest round-trip green; existing callers unaffected (default DA.live).
