# Step 5: Content-Fork Backend Coordinates (upstream-seeded + discovery override)

**Purpose:** Give a content fork the Commerce SC's backend coordinates
(endpoint + website/store/store-view) so it transacts — implementing **PM
decision D1 ("Both")**: **seed** the coordinates from the **upstream repo's
`config.json`**, then let the user **confirm/override** them via the **existing
`discoverStoreStructure` flow**. Reuses `commerceStoreDiscovery.ts`,
`ConnectStoreStepContent.tsx`, and `configGenerator.ts` — no new discovery code.

**Prerequisites:**
- [ ] Discovery flow understood: `ConnectStoreStepContent` → `discover-store-structure`
  → `handleDiscoverStoreStructure` (`edsHandlers.ts:207`) →
  `discoverStoreStructure` (`commerceStoreDiscovery.ts`) → `configGenerator.ts`
- [ ] PaaS vs ACCS asymmetry understood (PaaS = URL+admin-creds, org-agnostic;
  ACCS = caller IMS token + a discovery service for the Commerce org)
- [ ] Steps 1–4 complete

---

## Tests to Write First

### Unit: `tests/.../upstreamConfigSeed.test.ts`
- [ ] **Seeds backend coords from upstream `config.json`** — given a fetched
  upstream `config.json`, extracts endpoint + website/store/store-view into the
  content fork's component config defaults.
- [ ] **Missing/partial upstream config** → falls back to empty/manual without
  throwing (Assumption A2).

### Integration: `tests/.../content-connect-step.test.tsx`
- [ ] **Content flow shows the connect step pre-filled** with upstream-seeded
  coords.
- [ ] **Override path** — user can run discovery (PaaS) and replace the seeded
  store/website/store-view.
- [ ] **ACCS gating** — when backend is ACCS and no IMS token / discovery service
  is available, the UI surfaces the manual/seeded values rather than failing.

---

## Files to Create/Modify
- [ ] New helper: `src/features/eds/services/upstreamConfigSeed.ts` — fetch +
  parse the upstream repo's `config.json` into backend-coordinate defaults
  (reuse `GitHubFileOperations` for the fetch; reuse the `config.json` shape
  `configGenerator.ts` already understands)
- [ ] `src/features/project-creation/ui/components/ConnectStoreStepContent.tsx`
  — for content flow, initialize fields from the upstream seed; keep discovery +
  manual override available
- [ ] `src/features/project-creation/handlers/executor.ts` — content flow passes
  seeded/confirmed coords into Phase 4 `configGenerator`
- [ ] test files above

---

## Implementation Details

### RED
Seed-extraction unit tests + content connect-step integration tests fail first.

### GREEN
- **Seed:** `upstreamConfigSeed.ts` fetches `config.json` from
  `upstream.{owner,repo}` (via `GitHubFileOperations.getFileContents` or the
  existing helper) and maps its endpoint/store fields to the same
  `componentConfigs` keys `configGenerator.ts` consumes
  (`*_GRAPHQL_ENDPOINT`, `*_WEBSITE_CODE`, `*_STORE_CODE`, `*_STORE_VIEW_CODE`).
- **UI:** in `ConnectStoreStepContent`, when `flow==='content'`, prefill from the
  seed; the existing progressive-disclosure discovery remains the override.
- **Write:** the content flow reuses Phase 4 `generateConfigJson` unchanged — it
  already prefers a direct backend URL when no mesh is deployed
  (`configGenerator.ts`), which is exactly the content-fork case.

### REFACTOR
- Keep PaaS reuse as the proven happy path. **Record the ACCS prerequisite** (a
  discovery service provisioned for the Commerce org) in the plan's risk notes;
  do not build new ACCS plumbing in this slice.
- No new discovery transport — only a config-seed reader feeding existing fields.

---

## Acceptance Criteria
- [ ] Content fork's `config.json` carries the Commerce SC's coordinates,
  seeded from upstream and confirmable via discovery.
- [ ] Missing upstream config degrades gracefully to manual/discovery.
- [ ] No duplication of discovery logic; `commerceStoreDiscovery.ts` reused.
- [ ] PaaS path verified; ACCS limitation documented.

**Estimated time:** 6–8 hours
