# Step 04 — `AemContentSource` implementation (point-at, no-copy)

**Goal:** The net-new AEM implementation: produce the AEM registration `source` block and the AEM Helix auth header. **No content copy/publish** (point-at — the AEM instance IS the content).

## ⚠️ R1 direction set; verification running
`getContentSourceAuthorization()`'s token model is R1. **Credential = OAuth Server-to-Server** (modern tech account; NOT deprecated JWT Service Account), stored in VS Code `secrets` (never the manifest). Tiered UX behind this one port:
- **(C)** paste a dev token — quick-start to unblock the first F5 (aligns with the manual-author fallback).
- **(B)** OAuth S2S credential entered once — durable baseline.
- **(A)** reuse the wizard's existing `aio`/IMS identity — preferred if the verification confirms a user IMS token carries the content-read scope (zero new credential UX).

Implement the port + ship (C) first so this step lands; (A)/(B) refine once the research pass confirms what token the AEM-Sites content source accepts. Cloud Manager creds are NOT used here (Slice 3).

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
