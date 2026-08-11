# Step 04 — Generalize the Configure collection surface from envSchema (3-bucket rule)

**Purpose:** Make the Configure screen collect ANY deployable's user-provided inputs (bucket 3) from its
catalog `envSchema`, not just the Commerce/mesh-shaped fields it renders today. Non-secret (`type:'text'`)
→ `componentConfigs` → `.env`; secret (`type:'secret'`) → masked input → VS Code **SecretStorage** (repo
is PUBLIC). Auto-provisioned (bucket 1) is skipped; auto-wired (bucket 2, `providedBy`) shows as a
read-only "connected" row. This is the functional HIGH gap underpinning both wizard and dashboard.

> Seed meshes are all `type:'text'`/`derivedFrom:'connect-commerce'` → classifier yields zero
> `userText`/`userSecret`. So the **text path is exercised by today's catalog only via existing Commerce
> fields; the secret path has NO live exerciser yet** — it must be fully unit-tested here (mocked
> SecretStorage) so a future integration's secret input works the day it ships.

## Prerequisites

- Step 01 (`classifyEnvSchema` → `{ autoProvisioned, autoWired, userText, userSecret }`).
- Reuse (do NOT fork): `ConfigureScreen.tsx`, `useServiceGroups.ts`/`useConfigureFields.ts`,
  `StoreConfigFieldRow.tsx`, `configureHandlers.ts` (the `save-configuration` handler),
  `getProvidedEnvVars` (`deployableState.ts:138`) for the bucket-2 "connected" values.

## Tests to write FIRST (RED)

**File:** `tests/unit/features/dashboard/ui/configure/deployableConfigFields.test.tsx`
(@testing-library/react)

- [ ] Given a deployable with a `type:'text'` user var, Configure renders a TextField for it (in a
      section labeled by the deployable name); editing writes into `componentConfigs[deployableId]`.
- [ ] Given a `type:'secret'` user var, Configure renders a MASKED field (Spectrum `type="password"` /
      isSecret); its value is NOT placed into `componentConfigs` (never `.env`).
- [ ] A `providedBy` var renders as a read-only "Connected to {provider}" row (no input).
- [ ] An auto-provisioned/`derivedFrom` var renders NO field (bucket 1 hidden).
- [ ] Seed-mesh deployable → no new editable fields appear (regression lock for "mesh = zero input").

**File:** `tests/unit/features/dashboard/handlers/configureHandlers.secrets.test.ts` (mock SecretStorage)

- [ ] `save-configuration` routes secret values to `context.secrets.store(key, value)` with a
      deterministic per-project/per-deployable/per-var key; never writes them to `componentConfigs`/`.env`.
- [ ] Non-secret values continue to flow into `componentConfigs` (existing behavior unchanged).
- [ ] Loading the Configure screen reads existing secrets via `context.secrets.get(key)` to seed masked
      fields as "set" (without revealing the value) — or shows a "secret is set / replace" affordance.
- [ ] Secrets are never logged (assert no logger call includes the secret value).

## Implementation (GREEN)

- Extend the Configure data assembly (`configureEnvLoader.ts` / `configureHandlers.ts`): for each
  selected deployable, run `classifyEnvSchema(getDeployableEnvSchema(id))` and feed `userText`/`userSecret`
  into the field model alongside the existing component env vars. Bucket-2 (`autoWired`) values resolve
  from `getProvidedEnvVars(project)`.
- Add a masked-field branch in the Configure field renderer (a small `SecretFieldRow` or a `type:'secret'`
  case in `StoreConfigFieldRow`) — masked input, "set/replace" state, no value echoed back to the webview
  after save.
- Extend `save-configuration` (`configureHandlers.ts`) to split the payload: secrets → `context.secrets`
  (SecretStorage) under a stable key scheme; non-secrets → `componentConfigs` (unchanged path).
- Define the secret key scheme in ONE place (e.g. `secretKey(projectId, deployableId, varName)`),
  unit-tested.

## Files

| File | Action |
|---|---|
| `src/features/dashboard/ui/configure/ConfigureScreen.tsx` | modify (render classified deployable fields) |
| `src/features/dashboard/ui/configure/hooks/useConfigureFields.ts` (or `useServiceGroups.ts`) | modify |
| `src/features/dashboard/ui/configure/SecretFieldRow.tsx` (or extend StoreConfigFieldRow) | create/modify |
| `src/features/dashboard/commands/configureEnvLoader.ts` | modify (assemble deployable fields) |
| `src/features/dashboard/handlers/configureHandlers.ts` | modify (secret routing on save/load) |
| `src/features/app-builder/services/secretKey.ts` (key scheme) | create |
| `tests/unit/.../deployableConfigFields.test.tsx` | create |
| `tests/unit/.../configureHandlers.secrets.test.ts` | create |

## Dependencies / ordering

- After Step 01. Independent of Steps 02/03. The dashboard "add a deployable" (Step 05) may route the
  user to Configure when bucket 3 is non-empty — so Step 04 lands before/with Step 05's add flow.

## Risks

- **Secret leakage to `.env`/git** (HIGH — repo is PUBLIC): the split-on-save test + a "never in
  componentConfigs" assertion are the gate. SecretStorage only; never settings/constants/fixtures
  (memory: `feedback_secrets_in_public_repo`). Use `fake-test-pw-not-a-secret` in fixtures (memory:
  `reference_gitguardian_test_fixtures`).
- **Configure screen complexity creep** (MEDIUM): `ConfigureScreen.tsx` is ~664 lines (over the 500
  SOP). Adding fields must NOT grow it — push the classification + field assembly into hooks/loaders and
  the masked field into its own component. Flag the pre-existing over-length as out-of-scope cleanup.
- **Load-time secret reveal** (MEDIUM): never round-trip the secret VALUE to the webview; only a
  boolean "is set". Locked by the load test.

## Self-critique (KISS/YAGNI)

- Reuses the existing field/section machinery; adds one masked-field branch + one save-split. No generic
  "form engine" rewrite. The secret key scheme is one function. No profile-bound-API handling (YAGNI —
  no current deployable needs it; D1 deferred it).
- Does NOT refactor the whole Commerce-shaped Configure; it ADDS the deployable-field path beside it.

## Acceptance criteria

- Any deployable's bucket-3 inputs render (text → .env, secret → SecretStorage); bucket 1 hidden;
  bucket 2 shown connected; secrets never reach `.env`/logs; seed-mesh adds zero fields. Suite green.
