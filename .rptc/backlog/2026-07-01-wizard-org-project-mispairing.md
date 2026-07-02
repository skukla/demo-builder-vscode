# Wizard auth step: displayed project can mispair with the token org

## Provenance
Phase 4 code-review of `fix/wizard-org-mismatch` (Finding 2, confidence ~80). The primary fix made
`getAuthContext` source the displayed **org** from the token (`getOrganizations()[0]`) — but left
`currentProject` sourced from `getCurrentProject()`, which reads the Adobe CLI's persisted console
context (`aio console where` / `cachedProject`). Full diagnosis:
`.rptc/research/wizard-org-mismatch/research.md` (+ its Follow-ups section).

## Goal / Scope
Ensure the wizard never presents an org/project pair that don't belong together. After an org switch,
`getAuthContext` can return `{ currentOrg: tokenOrg, currentProject: oldOrgProject }`. It self-heals
(the wizard re-selects a project in Integrations, and the project isn't shown on the auth step), so
this is a display-consistency gap, not data exposure — hence deferred, not blocking.

Also fold in research hardening point (c): the `withOrgContext` CLI env is ID-only ("leaky",
`orgContextEnv.ts:29-33`); enrich it with org code/name, and align
`organizationValidator.testDeveloperPermissions` (the `can-create-adobe-project` probe) to the same
org target so all three org consumers agree.

## Execution plan
1. Resolve the displayed project against the **token org** (or omit `currentProject` from the auth-step
   `auth-status` until it's re-selected), instead of the CLI console project.
2. Enrich `withOrgContext` targets with org code/name; wrap `testDeveloperPermissions` in the same
   org context.
3. Regression tests: cache-miss `getAuthContext` never pairs a token org with a foreign-org project;
   the probe targets the intended org.

## Constraints
Repo PUBLIC (no secrets/PII). Preserve the <1s quick-auth-check perf (cache-first; token resolve only
on miss). Surgical — no unrelated refactor. Fix branch off `develop`; no co-author trailers.

## Kickoff prompt
`/rptc:fix "Wizard auth step can pair the token org with a stale CLI-console project (org/project
mispairing on cache-miss); also align the withOrgContext CLI env (code/name) and testDeveloperPermissions
to the token org. Diagnosis + follow-ups in .rptc/research/wizard-org-mismatch/research.md; backlog at
.rptc/backlog/2026-07-01-wizard-org-project-mispairing.md."`
