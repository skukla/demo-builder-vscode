# Step 07 — Drift-Gate Workflow (patches repo)

**Repo:** `skukla/eds-demo-patches` (generalized — D3). **Out of current session scope.**
**Depends on:** Step 6 (ledger). **Blocks:** Step 5.
**Status:** proposed (no code yet)

## Objective

Build the last-known-good gate: a daily GitHub Actions job in the patches repo that verifies every patch against
canonical `main`, advances the `last-known-good` pointer when green, and automates patch retirement — the
release-engineering pattern (Chromium LKGR / Nix channel promotion) at miniature scale.

## Artifacts (in the patches repo)

- `.github/workflows/lkg-gate.yml` — cron (daily) + on-PR triggers.
- A small **check script** (alongside the patch definitions) that:
  1. Clones canonical `hlxsites/aem-boilerplate-commerce` `main`.
  2. Verifies every patch's `precondition` still matches its `target`.
- `last-known-good` — a plain-text one-line file at the repo root holding **only** the verified canonical SHA
  (D2: Chromium LKGR / Nix `git-revision` convention). One writer (the gate), many readers (every extension
  create/reset). Rich detail (verifiedAt, canonical ref, which patches passed) goes in the **commit message**,
  not the file; the file's git history is the audit log.

## Behavior (ADR-006 §"Tracking canonical via a last-known-good gate")

1. **On success:** publish the verified canonical SHA to `last-known-good` — a one-line automation commit, made
   only when canonical moved and all patches pass (a few commits/week). History doubles as an audit log of which
   boilerplate version storefronts received when.
2. **On failure:** fail with a logged report — **just a failing run, no notification integration** (owner
   preference). The LKG pointer simply stops advancing.
3. **On every PR to the patches repo:** run the same check so a patch edit that doesn't match real canonical is
   caught at review time.

### Patch-retirement automation (ADR amendment 2026-06-10)

- **Obsolete-patch detection:** when a precondition no longer matches, additionally test whether the target
  **already contains the replacement**. If so, the fix landed upstream → **open a PR removing the patch**, with
  evidence in the description. Automation proposes; a human merges (never auto-delete — equivalence can be subtle).
- **Fixed-differently triage:** precondition gone, replacement absent → log the current state of the patched
  region for a human to retire / rewrite / keep.
- **Touched-file FYI:** log canonical commits since last LKG that touched a patched file, even when all patches
  still apply — early heads-up at zero cost.

## Approach (to detail after approval)

1. Author the check script with unit tests (in the patches repo) for: precondition pass/fail, obsolete-patch
   true positive (replacement present) and true negative (fixed-differently), touched-file enumeration.
2. Wire the workflow: cron + PR triggers; success path commits `last-known-good`; failure path exits non-zero.
3. Retirement: on obsolete detection, open a PR via the Actions token; gate that path behind the detection test.

## Risks (this step)

- **False obsolete-positive:** wrongly judging upstream's fix equivalent and removing a needed patch would break
  demos quietly — mitigated by PR-not-auto-delete and human merge.
- **Gate-stall visibility (R5):** nobody is paged by design; the red run + touched-file FYI are the only signal.
  Accepted per ADR; recovery is a push to the patches repo.
- **Token scope:** the Actions job needs permission to commit `last-known-good` and open retirement PRs in its
  own repo only.

## Test / verification

- Check-script unit tests (in patches repo) as above.
- Run the workflow on a branch: green advances `last-known-good`; a deliberately-broken precondition keeps it
  pinned and produces a red run; an upstream-landed fix produces a retirement PR.

## Exit criteria

- Daily gate runs green and advances `last-known-good`; PR-time validation works; obsolete-patch detection opens
  a retirement PR on at least one proven case. No notification integration (by design).
