# Step 06 — Config-as-content writer (multi-env: `configs` + `configs-stage` + `configs-dev`)

**Goal:** Author the three commerce-config content nodes into the AEM content tree via the authoring API, instead of pushing `config.json` to the repo. Reuse `generateConfigJson`'s value-derivation; only the destination changes.

**May split into 06a (prod `configs`) + 06b (stage/dev)** if the authoring-API write proves fiddly under live F5, to stay within the 10-iteration loop. The R2 manual fallback means the F5 gate is **not blocked** even if 06b slips.

## RED tests
- `tests/features/eds/services/configAsContentWriter.test.ts`
  - Writer derives the **same** commerce values today's `config.json` carries (reuse `extractConfigParamsFromConfigs` / `generateHeaders` — parity on `commerce-core-endpoint`, `x-api-key`, `Magento-Environment-Id`, store headers).
  - Authors **all three** nodes at CitiSignal `paths.json`-mapped paths: `/content/<site>/configs`, `/configs-stage`, `/configs-dev` (three write calls, correct paths).
  - Writer goes through a content-write port (both DA.live `createSource` and AEM authoring API satisfiable; AEM authoring write is the real target).
  - **Manual-fallback boundary (R2 — ACCEPTED):** when `aemAuth` is absent OR a write returns 401/403, the writer stops cleanly, returns `manualFallbackRequired` with exact paths + JSON payloads, and **does not fail the whole setup**. Test both auto-write success and the fallback branch.
  - Security: no secret values logged (redaction test).

## GREEN surface
- New `src/features/eds/services/configAsContentWriter.ts` — takes `{ contentSource, project, environments: ['prod','stage','dev'] }`, derives values via existing config-generator functions, writes via the authoring API.
- Reuse `configGenerator.ts` extraction functions unchanged (no duplication).
- Edit the satellite path to call the writer **after** registration when `contentSourceType === 'aem-sites'`. Edit executor Phase 5 guard (`executor.ts:818` `syncEdsConfigToRemote` skips for content flow) — the AEM writer is the content-flow replacement.

## REFACTOR
- Multi-env is a `for (const env of envs)` loop over one write function (ADR-003: the n=3 case of one primitive, not three code paths).

## Done-when
- Value-parity + three-node + fallback + redaction tests green; F5-unblocking fallback verified; full regression green.
