# Step 03 — `ContentSource` selection seam + project/type plumbing

**Goal:** Add the `contentSourceType` discriminator to the satellite's config/state and a factory that returns the right `ContentSource`, defaulting to DA.live so nothing existing changes.

## RED tests
- `tests/features/eds/services/contentSource/contentSourceFactory.test.ts`
  - absent / `'da-live'` → `DaLiveContentSource`.
  - `'aem-sites'` → `AemContentSource` (RED until Step 04, or stub a throwing placeholder here and fill in 04).
  - unknown value → throws a clear config error (NO silent DA.live fallback for an explicit bad value).
- Manifest round-trip: `contentSourceType?: 'da-live'|'aem-sites'` and `aemContentSource?: { authorUrl, contentPath }` survive the manifest writer/loader whitelist (mirror Slice 1's persist round-trip test — both writer and loader drop unknown fields). **No secret field** — read is AEM-owned, write reuses the existing IMS token.

## GREEN surface
- New `src/features/eds/services/contentSource/contentSourceFactory.ts` (small 3-case `switch`, no registry/DI).
- Edit `src/types/webview.ts` (EDSConfig, ~line 399): add `contentSourceType?` and `aemContentSource?: { authorUrl: string; contentPath: string }`. **No `aemAuth`** (R1 resolved: read = AEM-owned/null, write = existing IMS token).
- Edit `src/types/base.ts` + manifest writer/loader whitelist to carry the new fields.
- Edit `src/types/demoPackages.ts`: optional `aemContentSource` alongside `DaLiveContentSource` so a package storefront can declare an AEM source.

## REFACTOR
- Factory stays a trivial selector — no abstraction layer.

## Dependency note
- R1 is **resolved** — no `aemAuth` field to plumb. The only AEM-specific config is `aemContentSource: { authorUrl, contentPath }`.

## Done-when
- Factory branch coverage incl. error case green; manifest round-trip green; existing callers unaffected (default DA.live).
