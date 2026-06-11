# Step 01 — `ContentSource` interface + `DaLiveContentSource` refactor-in-place (the seam)

**Goal:** Introduce the `ContentSource` interface and route the **registration source payload** through it for DA.live, with the canonical path byte-identical.

## The interface (locked, 2-method minimum — PM-accepted R3)

```ts
// src/features/eds/services/contentSource/contentSource.ts
export interface ContentSource {
  readonly type: 'da-live' | 'aem-sites';
  /** Build the Config Service content.source block. DA.live → { url: https://content.da.live/{org}/{site}/, type: 'markup' }. */
  buildRegistrationSource(coords: ContentSourceCoords): { url: string; type: string };
  /** Helix x-content-source-authorization value, or null if none. DA.live → `Bearer <imsToken>`. */
  getContentSourceAuthorization(): Promise<string | null>;
}

export interface ContentSourceCoords {
  org: string;
  site: string;
  contentPath?: string; // AEM-only (point-at): /content/<site> tree root
}
```

Members deliberately excluded (one-implementation smell): `populateContent`/`copyContent`/`clearContent`/`createBlockLibrary`/`provision`. They stay on `DaLiveContentOperations`, off the interface.

## RED tests (write first)
- `tests/features/eds/services/contentSource/daLiveContentSource.test.ts`
  - `buildRegistrationSource({org,site})` → `{ url: 'https://content.da.live/{org}/{site}/', type: 'markup' }` (exact-string parity with old `buildContentSourceUrl`).
  - `type === 'da-live'`.
  - `getContentSourceAuthorization()` → `'Bearer <token>'`; same token the `TokenProvider` yields; matches today's missing-token behavior.
- `tests/features/eds/services/configurationService.test.ts` (extend): **characterization** — `registerSite` with a DA.live source produces the identical body `{ version:1, code:{...}, content:{ source:{ url, type:'markup' } } }` it does today. Lock this BEFORE refactor.

## GREEN surface
- New `src/features/eds/services/contentSource/contentSource.ts` (interface + `ContentSourceCoords`).
- New `src/features/eds/services/contentSource/daLiveContentSource.ts` (implements; constructed with existing `TokenProvider`).
- Edit `configurationService.ts` — `buildSiteConfigParams`/`registerSite` accept a `ContentSource`, call `buildRegistrationSource`; default to `DaLiveContentSource` when none passed (no caller churn).

## REFACTOR
- Delete the duplicated `buildContentSourceUrl` inline once parity passes — one source of truth.

## Done-when
- New tests green; full EDS regression green (Slice 1 baseline ~856 tests); canonical registration body byte-identical.
