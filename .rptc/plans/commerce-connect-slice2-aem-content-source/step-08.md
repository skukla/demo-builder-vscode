# Step 08 (OPTIONAL — PM-gated) — Dashboard/marker reflects content-source type

**Goal:** Per scaffold work-area 5, surface the content-source type on the dashboard. Only if the PM wants it; low priority.

## RED test
- Dashboard renders "Content source: AEM Sites" from persisted `contentSourceType`.

## GREEN surface
- Small read-only addition where Slice 1 surfaces share/marker state.

## Done-when
- Marker renders from persisted state; tiny footprint; full regression green.

---

## Test strategy (whole slice)

- **Characterization tests lock the DA.live/canonical path byte-identical** at every refactor step (01, 02, 05) — the single most important risk control (how Slice 1 held 856/856 EDS tests).
- **Unit (bulk, headless):** `ContentSource` impls (01, 04), factory (03), config-as-content writer (06; authoring API mocked).
- **Integration (headless):** `storefrontSetupPhases-aem.test.ts` (05) proves registration payload + copy/publish skipped for AEM and still runs for DA.live; manifest round-trip (03).
- **Coverage:** 80%+ overall; 100% on the two `ContentSource` impls + factory (small, pure, security-load-bearing). `npm run test:file` per step (5-10s loop); `test:fast` before each REFACTOR close.

### Single live-F5 verification script (end-to-end success criterion)
1. Run the **Join** flow against the repoless satellite path; on Connect, choose **AEM Sites**, enter the live AEM-as-Cloud-Service Author URL + auth, point at the already-authored `xcom` tree (`/content/<site>`).
2. Let setup register the satellite (cross-org `code.owner` = upstream; `content.source` = AEM author URL/contentPath) and run the config-as-content writer for `configs`/`configs-stage`/`configs-dev` (or, on the R2 fallback, author the three printed nodes manually).
3. Open the satellite's `aem.live` page for an AEM-authored `xcom` product page.
4. **Assert:** page renders **live products and prices** (commerce drop-ins read the authored `configs` node → Commerce SC backend).
5. **Assert:** add-to-cart succeeds and the flow **reaches checkout**.
6. Record evidence (URLs, timestamps, screenshots) in the status, matching Slice 1's F5 convention.

---

## Risk map

| # | Risk | L/I | Mitigation | Gate |
|---|---|---|---|---|
| R-A | AEM auth/token handling (R1) — wrong model = 401/403; leaked token = incident | M/H | Pin R1 before Step 04. `getContentSourceAuthorization()` = single choke point; redact in logs; store via VS Code `secrets` | **Security** |
| R-B | Breaking the DA.live path during refactor (01-02, 05) | M/H | Characterization locks byte-identical body+headers BEFORE refactor; default-to-DA.live; full EDS regression green | Eff + Sec |
| R-C | Multi-env authoring write — partial writes leave inconsistent storefront | M/M | Idempotent overwrite; all-three-or-report; R2 fallback prints exact paths+payloads; split 06a/06b if needed | Security |
| R-D | Manual-fallback ambiguity | M/M | R2 pins the line; typed `manualFallbackRequired`, not a silent skip | Efficiency |
| R-E | Over-scoping the interface (copy/publish with one impl) | L/M | 2-method interface; copy/publish stay on `DaLiveContentOperations`; YAGNI self-check | Efficiency |
| R-F | fstabGenerator mis-touch (scaffold implied it; code says canonical-only) | L/M | **Do not touch it** in Slice 2 | Efficiency |
| R-G | AEM URL/path injection into the registration URL | L/H | Validate https + path-segment safety in `AemContentSource` (04), reuse `validatePathSegment` | **Security** |

**Security focal points:** R-A (token model + redaction), R-C (authoring-API write auth), R-G (URL/path validation).
**Efficiency focal points:** R-B / R-E / R-F.

---

## Critical files
- `src/features/eds/services/configurationService.ts`
- `src/features/eds/services/helixApiClient.ts`
- `src/features/eds/handlers/storefrontSetupPhases.ts`
- `src/features/eds/services/configGenerator.ts`
- `src/features/eds/handlers/storefrontSetupPhase3.ts`
- New: `src/features/eds/services/contentSource/{contentSource,daLiveContentSource,aemContentSource,contentSourceFactory}.ts` + `src/features/eds/services/configAsContentWriter.ts`
- Type plumbing: `src/types/webview.ts`, `src/types/base.ts`, `src/types/demoPackages.ts`
