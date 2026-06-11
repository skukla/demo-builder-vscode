# Step 04 — `AemContentSource` implementation (point-at, no-copy)

**Goal:** The net-new AEM implementation: produce the AEM registration `source` block and the AEM Helix auth header. **No content copy/publish** (point-at — the AEM instance IS the content).

## ⚠️ R1 — ideal-first; verification running (no dev-token quick-start)
`getContentSourceAuthorization()`'s token model is R1. PM ruled out a throwaway dev-token paste — build the ideal first. Clean either/or behind this one port (never the bookmarklet pattern):
- **(A)** reuse the wizard's existing `aio`/IMS identity — zero new credential UX; build this **if** the verification confirms a user IMS token carries the AEM content-read scope.
- **(B)** OAuth Server-to-Server (modern; NOT deprecated JWT), set up once via a guided card + stored in VS Code `secrets` — build this **if (A) is infeasible**.

The running research pass picks A vs B. Implement the port + its tests now (token provider is mockable headlessly); wire the chosen real provider when the pass returns. No live F5 until the chosen ideal is built. Cloud Manager creds are NOT used here (Slice 3).

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
