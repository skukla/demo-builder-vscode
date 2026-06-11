# Step 04 — `AemContentSource` implementation (point-at, no-copy)

**Goal:** The net-new AEM implementation: produce the AEM registration `source` block and the AEM Helix auth header. **No content copy/publish** (point-at — the AEM instance IS the content).

## R1 resolved — content READ is AEM-owned, so this impl carries NO token
Per the verified research, EDS reads AEM-author markup using a Site Authentication Token / technical account **configured inside AEM** (auto-provisioned on first publish). The extension passes nothing for read. So `AemContentSource.getContentSourceAuthorization()` returns a **constant `null`** — no token, no `secrets`, no read-token redaction. (The config-as-content *write* auth is a separate concern handled in Step 06 by reusing the existing IMS token.) Headless-testable today; no live dependency to build the impl.

## RED tests
- `tests/features/eds/services/contentSource/aemContentSource.test.ts`
  - `buildRegistrationSource({org,site,contentPath})` → `{ url: <authorUrl + contentPath>, type: 'markup' }` matching the CitiSignal `paths.json` shape (`/content/<site>/...`).
  - `type === 'aem-sites'`.
  - `getContentSourceAuthorization()` → **`null`** (read is AEM-owned; the Helix header is omitted — see Step 02's omit-when-null behavior).
  - URL/path **validation**: reject path segments with newline/space/`:` (reuse `fstabGenerator.validatePathSegment` discipline) and non-https author URLs. (Injection-into-registration-URL is the remaining security focus here — R-G.)

## GREEN surface
- New `src/features/eds/services/contentSource/aemContentSource.ts` (implements `ContentSource`; takes `{ authorUrl, contentPath }`, no auth provider).
- Wire `contentSourceFactory` `'aem-sites'` branch to construct it.

## REFACTOR
- Keep it ≈ the size of `DaLiveContentSource` (two methods, `null` auth). Document that copy/publish AND read-auth are intentionally absent.

## Done-when
- AEM impl tests green incl. URL/path validation; `getContentSourceAuthorization()` returns `null`; factory `'aem-sites'` resolves; full regression green.
