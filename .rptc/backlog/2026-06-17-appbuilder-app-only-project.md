# App Builder app — app-only / no-storefront project

> **Status: PARTIAL dependency on slice 1** ([spine](2026-06-17-appbuilder-app-deploy-spine.md)) —
> can be designed in parallel, but needs the `app-builder` category the spine introduces. Slice 5 of 5.
> The heaviest, least-coupled slice (schema work).

## Provenance

Designed 2026-06-17 alongside the App Builder app-structure research
([`../research/app-builder-app-structure/research.md`](../research/app-builder-app-structure/research.md))
and the deployable-workspace research ([`../research/adobe-io-deployable-workspace/research.md`](../research/adobe-io-deployable-workspace/research.md),
§5 backend-only blockers). The forcing use case: "a Commerce backend + an App Builder app, with NO
storefront."

## Goal / scope

Allow a demo project with a backend + App Builder app(s) but **no storefront frontend** — today every
project requires a frontend.

**In scope (the four confirmed blockers):**
1. **Frontend-optional stack** — relax the hard requirement: `stacks.schema.json:74` (frontend +
   backend required) and the `executor.ts:1101` throw on missing stack/frontend. `executor.ts:1106`
   already adds frontend conditionally — the schema/type/wizard hard-require it.
2. **Reconcile the two stack definitions** — `project-creation/config/stacks.json` (runtime truth) AND
   the embedded `components.json:272-297` block. Any frontend-optional change touches both.
3. **Conditional wizard steps** — the `settings` (Connect Commerce) step is unconditional; `welcome`
   requires package + stack. Make the storefront-dependent steps conditional for app-only projects.
4. **Non-storefront output sink** — `MESH_ENDPOINT` / app URLs have no `.env` sink without a storefront.
   Define where app/mesh endpoints land for an app-only demo.

**Out of scope:**
- The deploy spine itself (slice 1).

## UX / interaction

The wizard renders an app-only path: storefront-dependent steps hidden when no frontend is chosen.
Reuse the existing step-filtering (`stepFiltering.ts` + the `useWizardState` cascade) rather than
adding a parallel flow. Light copy check on the welcome/stack step for the no-storefront case; no full
design pass needed.

## Reuse / refactor-for-reuse

- Reuse the existing step-filtering and the already-conditional frontend add (`executor.ts:1106`) —
  the work is relaxing schema/type hard-requirements, not new flow.
- Reuse slice-1's `app-builder` registry category + deploy.

## Execution plan (high level)

1. Frontend-optional stack shape (schema + type + both stack definitions reconciled).
2. Conditional wizard step filtering for app-only projects.
3. Output sink for endpoints without a storefront `.env`.
4. Validate an app-only project create end-to-end (backend + app, no frontend).

## Constraints / risk

- Touches the wizard's stack/step backbone — regression risk across normal storefront projects. Guard
  with tests on the existing storefront paths.
- The two parallel stack definitions are a known landmine — change both or neither.
- Confirm the open product question first: should headless+PaaS-without-mesh require an
  App-Builder-entitled org at all? (carried over from the org-context work). Resolve before building.

## Kickoff prompt

`/rptc:feat "Enable app-only / no-storefront demo projects (slice 5). Make frontend optional on a
stack (relax stacks.schema.json:74 + executor.ts:1101; executor already adds frontend conditionally),
reconcile BOTH stack definitions (project-creation/config/stacks.json and the embedded
components.json:272-297 block), make storefront-dependent wizard steps conditional, and define a
non-storefront output sink for mesh/app endpoints. Guard existing storefront paths with tests. See
.rptc/backlog/2026-06-17-appbuilder-app-only-project.md and
.rptc/research/adobe-io-deployable-workspace/research.md (§5)."`
