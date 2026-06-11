# Step 04 — `AemContentSource` implementation (point-at, no-copy)

**Goal:** The net-new AEM implementation: produce the AEM registration `source` block and the AEM Helix auth header. **No content copy/publish** (point-at — the AEM instance IS the content).

## ⚠️ Blocked on R1 (AEM auth model — PM deciding)
`getContentSourceAuthorization()`'s token model is R1. Recommended: AEM tech-account / IMS service-credential bearer, stored in VS Code `secrets` (never the manifest). If R1 = defer-with-stub, this step pins the real grant just before the live F5.

## RED tests
- `tests/features/eds/services/contentSource/aemContentSource.test.ts`
  - `buildRegistrationSource({org,site,contentPath})` → `{ url: <authorUrl + contentPath>, type: 'markup' }` matching the CitiSignal `paths.json` shape (`/content/<site>/...`).
  - `type === 'aem-sites'`.
  - `getContentSourceAuthorization()` returns the AEM token per R1, and **does not leak** the token in any log (security test: logger receives a redacted value).
  - URL/path **validation**: reject path segments with newline/space/`:` (reuse `fstabGenerator.validatePathSegment` discipline) and non-https author URLs.

## GREEN surface
- New `src/features/eds/services/contentSource/aemContentSource.ts` (implements `ContentSource`; constructed with the AEM auth provider from R1).
- Wire `contentSourceFactory` `'aem-sites'` branch to construct it.

## REFACTOR
- Keep it ≈ the size of `DaLiveContentSource` (two methods). Document that copy/publish is intentionally absent.

## Done-when
- AEM impl tests green incl. redaction + validation; factory `'aem-sites'` resolves; full regression green.
