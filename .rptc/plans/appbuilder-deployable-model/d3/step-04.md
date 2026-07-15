# Step 04 — Per-integration redeploy from the projects-dashboard

**Purpose:** The projects-dashboard kebab "Redeploy App" is singular (`deployAppHeadless`, one app),
while the keyed model supports N. Make redeploy per-integration (by id) so each of N integrations can be
redeployed independently from the card grid.

**Prerequisites:** Steps 02–03 (one writer + one isolating path).

**Reuse / surgical anchors (verified 2026-07-15):**
- `src/features/projects-dashboard/handlers/dashboardHandlers.ts:1086-1100` — `handleRedeployApp`
  (`{ projectPath }` only) dynamically imports and calls the singular `deployAppHeadless`.
- `src/features/projects-dashboard/utils/projectStatusUtils.ts` — the card's app-status display
  (`getAppBuilderAppStatus`, redeploy visibility). *(confirm the redeploy-visibility predicate at execution.)*
- The MCP tools `deploy_integration`/`redeploy_integration`/`remove_integration` already take `{ id }`
  (`src/features/ai/server/actionDescriptors.ts:30-64`) — mirror their id-scoped shape.

## Tests to write FIRST (RED)

- [ ] `handleRedeployApp` accepts an integration `id` and redeploys only that integration.
- [ ] Redeploying one of N leaves the others' state untouched.
- [ ] The card surfaces a redeploy affordance per deployed integration (not one global "Redeploy App").

## Files to create / modify

- MODIFY `dashboardHandlers.ts` `handleRedeployApp` (and its message payload) to carry `id`, routing to
  the keyed `deployAppBuilderComponent` (runner) rather than the singular `deployAppHeadless`.
- MODIFY the projects-dashboard card UI to emit a per-id redeploy (small — mirrors the detail list's
  id-scoped dispatch).
- Tests alongside.

## Acceptance criteria

- Redeploy is per-integration by id via the projects-dashboard; independent of siblings.

## Risks

- The projects-dashboard card currently assumes one app — thread the id without breaking the
  single-app display for projects that legitimately have one.
