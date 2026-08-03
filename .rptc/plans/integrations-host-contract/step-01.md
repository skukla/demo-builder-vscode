# Step 01 — The flow owns its handler contract; hosts spread it

## Goal

Adding a message to the Add Integration flow is ONE edit, and every host gets it.
Today it is two edits in two registries, and forgetting the second is silent until a
test or a user finds it.

## Approach

Export the flow's required handlers as a single map from the feature that owns the
flow — `src/features/project-creation/handlers/addIntegrationFlowHandlers.ts`:

```ts
/** Every handler the Add Integration flow needs, wherever it is hosted. */
export const addIntegrationFlowHandlers = {
    'list-org-console-apis': handleListOrgConsoleApis,
    'check-auth': authentication.handleCheckAuth,
    authenticate: authentication.handleAuthenticate,
    'get-projects': authentication.handleGetProjects,
    'select-project': authentication.handleSelectProject,
    'create-adobe-project': authentication.handleCreateAdobeProject,
    'delete-adobe-project': authentication.handleDeleteAdobeProject,
    'get-workspaces': authentication.handleGetWorkspaces,
    'select-workspace': authentication.handleSelectWorkspace,
    'ensure-mesh-api-subscribed': meshHandlers['ensure-mesh-api-subscribed'],
    switchOrg: dashboardHandlers.switchOrg,
} as const;
```

Then:
- `showIntegrations.ts` — replace the hand-written `REUSED_WIZARD_HANDLERS` with
  `{ ...addIntegrationFlowHandlers }`
- `ProjectCreationHandlerRegistry.ts` — spread it too, so the wizard cannot drift from
  the flow either (it currently declares these individually)

## Why this and not "just keep the guard"

The guard (`webviewHandlerCoverage.test.ts`) reports drift AFTER it is written. This
makes drift impossible to express: there is one list, owned by the code that sends the
messages.

Keep the guard — it still covers messages sent from OUTSIDE this map (shared hooks,
future components) and every other panel.

## Watch out for

- **Import direction.** `project-creation` importing `dashboardHandlers` for `switchOrg`
  is a feature→feature import (`src/CLAUDE.md` says avoid). Options: move `handleSwitchOrg`
  to `features/authentication/handlers/` (it is auth recovery, not dashboard UI — this is
  probably the right home), or have hosts add `switchOrg` themselves. Decide before writing.
- Do NOT re-export the whole `projectCreationHandlers` registry: the integrations panel
  must not accidentally answer wizard-only messages like `create-project`.

## Acceptance

1. Adding a message to the flow requires editing one map.
2. `webviewHandlerCoverage` still green for every panel.
3. `showIntegrations.ts` contains no hand-listed reused handler.
4. `gate` green.
