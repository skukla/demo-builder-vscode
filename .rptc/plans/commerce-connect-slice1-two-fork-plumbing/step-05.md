# Step 5: Content-Fork Backend Coordinates (inherit from upstream + manual override)

**Purpose:** Give a content fork the Commerce SC's backend coordinates
(endpoint + website/store/store-view, and for PaaS the public Catalog Service
key + environment id) so it transacts — implementing **PM decision D1
("Both"), sharpened**:

- **Primary path — inherit/seed:** the content fork reads its backend
  coordinates from the **upstream repo's `config.json`** (which the Commerce SC
  wired). These are **public storefront config** (served to every browser), not
  secrets — so they travel safely with the forked code, and the sync engine
  already **preserves `config.json`** across syncs.
- **Secondary path — manual override / re-seed:** the connect step lets the
  Content SC paste/confirm the backend URL the Commerce SC gives them, and
  adjust store-view if the demo needs a specific one.

**What this step deliberately does NOT do:** it does **not** make the content
fork depend on the **authenticated `discoverStoreStructure`** flow cross-account.
That flow (admin token for PaaS; caller IMS token + a discovery service in the
Commerce org for ACCS) is the **Commerce SC's same-account tool** for producing
coordinates — not something the Content SC, in a different org, should require.
**Live cross-account read** of the backend is **deferred** to the same live
verification track as the spike (see Risk 3 / overview — "unverified live").

**Prerequisites:**
- [ ] `configGenerator.ts` understood — `config.json` shape, the
  `{COMMERCE_ENDPOINT}/{STORE_VIEW_CODE}/{STORE_CODE}/{WEBSITE_CODE}/...`
  replacements, and that it **prefers a direct backend URL when no mesh is
  deployed** (exactly the content-fork case)
- [ ] `GitHubFileOperations` (fetch a file from a repo) understood
- [ ] Steps 1–4 complete

---

## Tests to Write First

### Unit: `tests/.../upstreamConfigSeed.test.ts`
- [ ] **Seeds coords from upstream `config.json`** — given a fetched upstream
  `config.json`, extracts endpoint + website/store/store-view (+ PaaS public key
  / env id when present) into the content fork's component-config defaults
  (keys `configGenerator.ts` already consumes).
- [ ] **Missing/partial upstream config** → returns empty defaults without
  throwing (Assumption A2); the manual path can fill them.
- [ ] **Does NOT call any authenticated discovery / admin-token endpoint** —
  the seed is a plain file read; assert no admin/IMS path is invoked.

### Integration: `tests/.../content-connect-step.test.tsx`
- [ ] **Content flow shows the connect step pre-filled** from the upstream seed.
- [ ] **Manual override** — the user can edit the endpoint/store-view and those
  values win over the seed.
- [ ] **No backend deploy / no admin-cred prompt** appears for the content flow.

---

## Files to Create/Modify
- [ ] New helper: `src/features/eds/services/upstreamConfigSeed.ts` — fetch +
  parse the upstream repo's `config.json` (via `GitHubFileOperations`) into
  backend-coordinate defaults using the same keys `configGenerator.ts` reads
- [ ] `src/features/project-creation/ui/components/ConnectStoreStepContent.tsx`
  — for content flow, initialize fields from the seed; keep them editable
  (manual override); **suppress the authenticated discovery affordance** for the
  content flow (it's the commerce-SC tool)
- [ ] `src/features/project-creation/handlers/executor.ts` — content flow passes
  the seeded/confirmed coords into Phase 4 `configGenerator`
- [ ] test files above

---

## Implementation Details

### RED
Seed-extraction unit tests + content connect-step integration tests fail first.

### GREEN
- **Seed:** `upstreamConfigSeed.ts` fetches `config.json` from
  `upstream.{owner,repo}` and maps endpoint/store fields to the same
  `componentConfigs` keys `configGenerator.ts` consumes
  (`*_GRAPHQL_ENDPOINT`, `*_WEBSITE_CODE`, `*_STORE_CODE`, `*_STORE_VIEW_CODE`,
  and the public PaaS `x-api-key`/`Magento-Environment-Id` when present).
- **UI:** in `ConnectStoreStepContent`, when `flow==='content'`, prefill from the
  seed and keep fields editable; do not render the discover-store-structure
  trigger for content.
- **Write:** content flow reuses Phase 4 `generateConfigJson` unchanged — it
  already falls back to a direct backend URL with no mesh, which is the content
  case.

### REFACTOR
- Keep the seed a pure file-read mapper (no network auth) — that's what makes it
  cross-account-safe and offline of the Commerce org.
- Leave a short comment pointing at the deferred live-read enhancement.

---

## Acceptance Criteria
- [ ] Content fork's `config.json` carries the Commerce SC's coordinates, seeded
  from upstream and editable via manual override.
- [ ] Missing upstream config degrades gracefully to manual entry.
- [ ] No authenticated discovery / admin-cred / cross-org IMS dependency in the
  content path.
- [ ] Live cross-account read is documented as deferred, not attempted here.

**Estimated time:** 5–7 hours
