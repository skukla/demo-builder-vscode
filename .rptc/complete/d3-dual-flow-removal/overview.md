# D3 — mesh dual-flow removal

**COMPLETE 2026-08-23** — all four slices executed on
`feature/d3-dual-flow-removal`; full gate green (whole-repo lint, both
typechecks, tsc-blindspots, full jest 1136 suites — one unrelated
`processCleanup.timeout` machine-load flake, passes in isolation).

Branch: `feature/d3-dual-flow-removal`. Source item:
`.rptc/backlog/2026-06-21-appbuilder-component-first-class-persistence.md` (D3 is
the whole live item).

## Re-measure findings (2026-08-23, this session)

- The mirror-write lock test is `tests/features/project-creation/ui/steps/useProjectBuilder.test.ts`
  ("mesh dual-flow mirror-write" suite) — NOT `useWizardState-dualFlow.test.tsx`,
  which no longer exists. The backlog's cited name is stale.
- The wizard no longer inserts an Adobe-auth step off the mesh gate at all
  (`useWizardState.ts:409` — sign-in subsumed into build-your-project). The only
  live `hasMeshInDependencies` gates are `storefrontSetupHandlers.ts:220` (wire
  payload) and `reviewPredicates.ts` (Review readiness).
- `hasMeshComponentSelected` (`wizardHelpers.ts:425`) has ZERO production
  callers — test-only. Dead; delete with D3.
- `useProjectBuilder.onOptionalDependenciesChange` has ZERO consumers. Dead.
- Mesh catalog ids ARE registry component ids (`meshCatalogDerivation.ts:126`);
  `meshAppBuilderComponentToComponentIds` is an identity check. The
  AddIntegrationFlowAdapter comment claiming the two namespaces differ
  (`commerce-eds-mesh`) is stale.
- All four stacks' `optionalDependencies` are single mesh ids and `dependencies`
  are `[]` — `selectedOptionalDependencies` is mesh-only in practice, so removing
  the mesh flow kills the field entirely (no soft deprecation).

## Design cut

`selectedAppBuilderComponents` becomes the single wizard-side authority for mesh
selection. The WIRE and PERSISTED contracts do not change:

- `buildProjectConfig` still emits mesh into `components.dependencies` — now
  derived by `selectedAppBuilderComponents.filter(isMeshComponentId)` instead of
  from the mirror. Creation (`loadComponentDefinitions`, mesh phase,
  `buildInitialProject`) is untouched: it transitively consumes mesh from
  `selectedAppBuilderComponents`.
- Persisted `componentSelections.dependencies` stays the mesh's home (ADR-011;
  `componentSelectionReconcile`, reset, edit extraction, runner all read it).
- `CheckPrerequisitesRequestPayload.selectedOptionalDependencies` stays (request
  contract, also an MCP tool input) — only what the webview passes changes.

## Slices (suite green after each)

1. **Writers seed `selectedAppBuilderComponents`** (mirror kept temporarily):
   `onStackSelect` reconciles mesh ids inside `selectedAppBuilderComponents`
   (strip mesh-kind, add the stack's mesh when the package requires it; preserve
   on same-stack re-select); edit seed unions mesh deps into
   `selectedAppBuilderComponents`; MCP `create_project` (both paths) passes them.
2. **Readers derive from `selectedAppBuilderComponents`**: `isMeshSelected`,
   `anyDeployableSelected`, `hasRequiredReviewData`, ReviewStep
   `componentSelection`, `buildProjectConfig` (+ drop the field from
   `ProjectConfigSource`), StorefrontSetupStep payload, PrerequisitesStep prop,
   IntegrationsStep reservedIds, `instanceId.ReservedIdInputs` (field removed),
   AddIntegrationFlowAdapter legacy key removed.
3. **Delete the mirror + field**: toggle mirror-write, `onStackSelect` dep write,
   `onOptionalDependenciesChange`, edit seed, WelcomeStep reset line,
   `WizardState.selectedOptionalDependencies`,
   `meshAppBuilderComponentToComponentIds`, dead `hasMeshComponentSelected`;
   flip the lock test to a removed-behavior pin; update stale comments
   (adapter, flowStages, integrationRows, tileStatus, useProjectBuilder,
   useWizardState, types/webview.ts).
4. **Gate + record**: `gate` skill (full), backlog item closed to
   `.rptc/complete/`, root CLAUDE.md's "mesh dual-flow mirror-write" mention
   updated.
