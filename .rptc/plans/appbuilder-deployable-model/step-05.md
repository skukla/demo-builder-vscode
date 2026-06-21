# Step 05 — Collision-free `ow.package` generator (the isolation primitive)

**Purpose:** Derive a distinct, deterministic OpenWhisk package name per deployable from its `id`, and
apply it before deploy. This is the load-bearing prune-isolation primitive proven in the spike (Q1/Q2):
two integrations sharing the default `application`/`dx-excshell-1` package clobber each other on
deploy/undeploy; distinct `ow.package` = full isolation.

**Prerequisites:** Step 01 (types). Independent of catalog; consumed by step 08 (deploy-contract).

**Reuse / surgical anchors (verified):**
- `src/features/app-builder/services/appComponentManager.ts` — existing owner/repo charset validation
  (rejects shell metacharacters); reuse the same validation discipline for the derived package name.
- Spike findings: package name is the ownership key (`projectName === ow.package`); never default.

## Tests to write FIRST (RED)

New file: `tests/features/app-builder/services/owPackageName.test.ts`

- [ ] `deriveOwPackage('erp-integration')` → a deterministic, lowercase, `[a-z0-9-]`-only name (e.g.
      `erp-integration` or `erp-integration-<shorthash>`), stable across calls (same input → same output).
- [ ] two different ids produce different package names (no collision).
- [ ] an id with unsafe characters (`erp;rm -rf`, spaces, uppercase) is sanitized to a safe name (no
      shell metacharacters survive).
- [ ] the result is NEVER `application` or `dx-excshell-1` even if the id literally equals one of those
      (guard against the default trap).
- [ ] result length is bounded (truncate + hash suffix) so long ids stay valid OpenWhisk package names.

## Files to create / modify

- CREATE `src/features/app-builder/services/owPackageName.ts` — `deriveOwPackage(deployableId): string`,
  pure, deterministic; sanitize → lowercase → strip to `[a-z0-9-]` → guard reserved names → bound length
  (append short stable hash when truncating).
- MODIFY `src/features/app-builder/services/index.ts` — export it.

## RED → GREEN → REFACTOR

- RED: derivation + safety tests fail.
- GREEN: implement; reuse the charset-validation idea from `appComponentManager`.
- REFACTOR: single function <30 lines; no nested ternaries; reserved-name guard as a small constant set.

## Acceptance criteria

- Deterministic, collision-free, shell-safe package names; never a default; suite GREEN.
- (Application to `app.config.yaml`/`ext.config.yaml` `ow.package` happens in step 08's deploy path — this
  step delivers + tests the pure generator.)

## Risks

- **Non-deterministic or colliding names** would silently re-introduce the prune-collision the spike
  proved fatal. Mitigation: determinism + uniqueness + reserved-name tests are first-class RED tests.
