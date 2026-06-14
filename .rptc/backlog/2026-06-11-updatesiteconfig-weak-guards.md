# Harden `updateSiteConfig` — match `writeMergedDataConfig`'s sheet-preservation + 401 ownership guards

## Provenance

Surfaced by the `rptc:security-agent` during verification of the AEM Assets site-scope fix (.116 dev, `applySiteConfig` / `writeMergedDataConfig`). Out of scope for that fix (the function was untouched), filed here so it isn't lost. Pre-existing.

## Goal / Scope

`DaLiveContentOperations.updateSiteConfig` (`src/features/eds/services/daLiveContentOperations.ts:~1589-1669`) writes the block-library `library` sheet to the **same** per-site config URL (`/config/{org}/{site}`) that the new `applySiteConfig` now also writes to — but with materially weaker safety than the hardened `writeMergedDataConfig` helper:

1. **Silent "start fresh" on GET failure.** Its GET is wrapped in a `try { … } catch { /* start fresh */ }` that swallows ALL errors into an empty `existingConfig`. Any transient network/timeout/401 on the read → it proceeds to write anyway.
2. **No 401 write-access ownership probe.** Unlike `writeMergedDataConfig` (which probes `hasWriteAccess(org, token)` on 401 before creating fresh), `updateSiteConfig` has no such guard.
3. **Hardcoded `:names: ['data', 'library']`.** Even though it spreads `...existingConfig`, it overwrites `:names` to exactly `['data','library']` — so a `permissions` sheet present in the existing site config is dropped from the sheet listing (and thus effectively erased on read-back), even if its data was spread.

Combined, a GET hiccup or a config that already carries a `permissions` sheet can lead to writing a config that **drops site-level permissions** — the exact failure mode `writeMergedDataConfig` was built to prevent.

## Execution plan

- Refactor `updateSiteConfig` to reuse the same read-merge-write discipline as `writeMergedDataConfig`: fail-closed on GET network/timeout errors; on 401, probe `hasWriteAccess(org, token)` before creating fresh; preserve ALL existing sheets and compute `:names` dynamically (don't hardcode), merging only the `library` sheet.
- Ideally generalize `writeMergedDataConfig` to merge an arbitrary named sheet (not just `data`) so `updateSiteConfig` can delegate to it — single hardened write path for the site config. Evaluate during planning (Rule of Three: `data`-sheet + `library`-sheet writes = 2 uses of the same site endpoint).
- Add tests mirroring `daLiveContentOperations-applySiteConfig.test.ts`: GET-failure → no destructive write; 401 + no write access → refuse; existing `permissions` sheet preserved through a library write.

## Constraints

- Behavior-preserving for the happy path (block library still lands at `/config/{org}/{site}` with the `library` sheet). Surgical; no scope creep into the broader EDS pipeline.
- Do not regress the AEM Assets `applySiteConfig` path — both write the same URL; keep them consistent.

## Kickoff prompt

> Harden `DaLiveContentOperations.updateSiteConfig` to match the sheet-preservation and 401-ownership guards of `writeMergedDataConfig` (preserve all sheets incl. `permissions`, dynamic `:names`, fail-closed GET, ownership probe on 401). Prefer delegating to a generalized `writeMergedDataConfig` that merges a named sheet. Add regression tests for GET-failure, 401-no-access, and permissions-sheet preservation. See `.rptc/backlog/2026-06-11-updatesiteconfig-weak-guards.md`.
