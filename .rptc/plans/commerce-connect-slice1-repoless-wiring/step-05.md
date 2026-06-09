# Step 5: Content-Satellite Backend Coordinates (inherit from upstream + manual override)

**Status: 🟡 Headless seed shipped (2026-06-06).** ✅ `seedComponentConfigsFromCommerce(commerce)` — a **pure mapper** from the join descriptor's already-resolved `commerce` coords → `componentConfigs` ACCS_* keys (the ones `configGenerator` reads), wired into `buildJoinModeState`. **Simplified vs the original plan:** the planned `upstreamConfigSeed.ts` that *fetches* the upstream `config.json` is **dropped as redundant** — Step 2's marker resolve already put the coords on `JoinDescriptor.commerce`, so seeding is in-memory, no second network read. ACCS-first (PaaS would need the marker to carry the backend type — deferred). 3/3 mapper + 6/6 join-seed + 477 regression + tsc/eslint/SOP green. **Remaining (F5):** the `ConnectStoreStepContent` *render* prefill from the seed + discovery-affordance suppression for the content flow (the data is seeded; the UI behavior is F5-verifiable).

> **2026-06-05 repivot reframe:** Decision D1 (inherit/seed primary + manual override secondary) is **unchanged** — coords are public, inheritable, no cross-org auth needed. **Strengthened** by the Adobe Merchandising API docs ("Authentication is not required" verbatim) — the cross-account read story is firmer than the original "URL + public keys" phrasing. **What changes under repoless:** there is no satellite-side `config.json` file to write to; the coords live in either (a) the upstream repo's `config.json` (Slice 1 — the Content SC's site reads it via the shared codebase by construction), or (b) authored as content nodes in AEM per the CitiSignal `configs`/`configs-stage`/`configs-dev` pattern (Slice 2+, multi-env story). Slice 1's mechanic is the simpler form: the Content SC's site shares code with the Commerce SC's upstream, so when the upstream's `config.json` is wired, both sites resolve the same coords automatically. The "manual override" path now means authoring a per-site config override via the Configuration Service or in the Content SC's own DA.live content — not editing a forked repo's `config.json`. The decision shape and the test categories survive; the destination changes.

**Purpose:** Give a content-flow site the Commerce SC's backend coordinates
(endpoint + website/store/store-view, and for PaaS the public Catalog Service
key + environment id) so it transacts — implementing **PM decision D1
("Both"), sharpened**:

- **Primary path — inherit/seed:** the content satellite resolves its backend
  coordinates from the **upstream repo's `config.json`** (which the Commerce SC
  wired). These are **public storefront config** (served to every browser), not
  secrets. Under repoless the satellite **shares the upstream's code by
  construction** (via the Config Service `code` reference), so when the upstream's
  `config.json` is wired both sites resolve the same coords automatically — no
  copy, no fork, no sync engine. The seed is read once at create to pre-fill the
  connect step.
- **Secondary path — manual override / re-seed:** the connect step lets the
  Content SC paste/confirm the backend URL the Commerce SC gives them, and
  adjust store-view if the demo needs a specific one.

**What this step deliberately does NOT do:** it does **not** make the content
satellite depend on the **authenticated `discoverStoreStructure`** flow cross-account.
That flow (admin token for PaaS; caller IMS token + a discovery service in the
Commerce org for ACCS) is the **Commerce SC's same-account tool** for producing
coordinates — not something the Content SC, in a different org, should require.
**Live cross-account read** of the backend is **deferred** to the same live
verification track as the spike (see Risk 3 / overview — "unverified live").

**Prerequisites:**
- [ ] `configGenerator.ts` understood — `config.json` shape, the
  `{COMMERCE_ENDPOINT}/{STORE_VIEW_CODE}/{STORE_CODE}/{WEBSITE_CODE}/...`
  replacements, and that it **prefers a direct backend URL when no mesh is
  deployed** (exactly the content-satellite case)
- [ ] `GitHubFileOperations` (fetch a file from a repo) understood
- [ ] Steps 1–4 complete

---

## Reuse map

- **`configGenerator.generateConfigJson`** — unchanged; already falls back to a direct backend URL when no mesh (the content case).
- **`GitHubFileOperations`** read — public read of the upstream `config.json` + marker (no auth).
- **`demo-packages.json` `configDefaults`** — store codes (shared across both SCs; no handoff).
- **`ConnectStoreStepContent`** — reuse the step; **suppress** the authenticated discovery affordance for the content flow.
- **`JoinDescriptor.commerce`** (already resolved from the marker in Step 2) — the coords source; no second fetch.
- **`envVarKeys`** constants (`ACCS_GRAPHQL_ENDPOINT`, …) — reused so the seed uses the exact keys `configGenerator` reads (no magic strings).
- **Net-new:** `seedComponentConfigsFromCommerce(commerce)` — one pure in-memory mapper (co-located in `resolveJoinLink.ts`).

---

> **Reframed 2026-06-06:** the original design re-fetched the upstream `config.json` via a new `upstreamConfigSeed.ts`. That's **redundant** — Step 2's marker resolve already carries the coords on `JoinDescriptor.commerce`. So the seed is a pure in-memory mapper, no `GitHubFileOperations` fetch. The fetch-based tests/files below are superseded by the mapper form.

## Tests to Write First

### Unit: `tests/.../seedComponentConfigsFromCommerce.test.ts` ✅ shipped
- [x] **Maps full coords → `ACCS_*` keys** under the ACCS backend component (the keys `configGenerator` reads).
- [x] **Partial inherit** → maps only the coords present; **no coords** → `{}` (manual entry fills them).
- [x] **Pure mapper** — no network/fetch, no auth (the coords are already resolved).

### Integration (F5): `ConnectStoreStepContent` prefill
- [ ] **Content flow shows the connect step pre-filled** from the seeded `componentConfigs`.
- [ ] **Manual override** — the user can edit endpoint/store-view; their values win.
- [ ] **No discover-store-structure affordance / admin-cred prompt** for the content flow.

---

## Files to Create/Modify
- [x] `src/features/project-creation/services/resolveJoinLink.ts` — `seedComponentConfigsFromCommerce(commerce)`: maps `JoinDescriptor.commerce` → `componentConfigs` `ACCS_*` keys (reusing `envVarKeys` constants). ACCS-first (PaaS deferred — would need the marker to carry the backend type).
- [x] `src/features/project-creation/ui/wizard/hooks/useWizardState.ts` — `buildJoinModeState` seeds `componentConfigs` from the mapper.
- [ ] **(F5)** `src/features/project-creation/ui/components/ConnectStoreStepContent.tsx` — for content flow, prefill fields from the seeded `componentConfigs` (kept editable); **suppress the discovery affordance** (it's the commerce-SC tool).
- [x] **No executor change needed** — Phase 4 `generateConfigJson` already consumes `project.componentConfigs` and falls back to a direct backend URL with no mesh (the content case).

---

## Implementation Details

### RED → GREEN (shipped)
- **Seed:** `seedComponentConfigsFromCommerce(commerce)` maps the already-resolved coords to the `componentConfigs` keys `configGenerator` consumes (`ACCS_GRAPHQL_ENDPOINT`, `ACCS_WEBSITE_CODE`, `ACCS_STORE_CODE`, `ACCS_STORE_VIEW_CODE`). No fetch, no auth.
- **Write:** content flow reuses Phase 4 `generateConfigJson` unchanged — direct backend URL with no mesh.

### Remaining (F5)
- **UI:** in `ConnectStoreStepContent`, prefill from the seeded `componentConfigs` and suppress the `discover-store-structure` trigger for content. The *data* is seeded; this is the *render* behavior (live-verifiable).

### REFACTOR
- Keep the seed a pure file-read mapper (no network auth) — that's what makes it
  cross-account-safe and offline of the Commerce org.
- Leave a short comment pointing at the deferred live-read enhancement.

---

## Acceptance Criteria
- [ ] Content satellite's resolved config carries the Commerce SC's coordinates, seeded
  from upstream and editable via manual override.
- [ ] Missing upstream config degrades gracefully to manual entry.
- [ ] No authenticated discovery / admin-cred / cross-org IMS dependency in the
  content path.
- [ ] Live cross-account read is documented as deferred, not attempted here.

**Estimated time:** 5–7 hours
