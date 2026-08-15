# Step 01 — The flow owns its handler contract; hosts spread it

## DONE 2026-08-03

`src/features/project-creation/handlers/addIntegrationFlowHandlers.ts` is the one list.
`showIntegrations.ts` spreads it (its hand-written `REUSED_WIZARD_HANDLERS` is gone) and
`ProjectCreationHandlerRegistry.ts` spreads it too, with its duplicated entries removed.

**Import-direction decision: `handleSwitchOrg` MOVED to
`features/authentication/handlers/orgSwitchHandler.ts` as `handleForcedOrgSwitch`** — but
not wholesale, because it ended by calling `handleRequestStatus`, which is dashboard-owned.
Split instead: authentication owns the forced sign-in, the dashboard keeps a wrapper that
adds its project guard and its status re-check. Behaviour on the dashboard is unchanged.

**Two bugs surfaced while doing it:**

1. `create-adobe-workspace` was unregistered on the integrations panel — the workspace
   picker's "New" button had nothing answering it. The coverage guard could not see the
   send: its `SEND` pattern used `<[^>]*>` for type arguments, which cannot match the
   NESTED generic in `request<HandlerResult<Workspace>>(...)`, so `AdobeEntityFields`
   read as sending nothing at all. Pattern now uses `<[^()]*>`. **Watched it go red on
   the real gap before fixing it** — the handoff's "a green guard proves nothing" rule.
2. The wizard's "Switch IMS Org" could never have worked. The dashboard's handler opened
   with a `getCurrentProject` guard returning `PROJECT_NOT_FOUND`, and during project
   creation there is no current project. The moved handler treats the project context as
   an optional targeting hint, so the wizard case now works.

Tests: `addIntegrationFlowHandlers.test.ts` (the contract + that the wizard registry
really spreads it), `authentication/handlers/orgSwitchHandler.test.ts` (the forced
sign-in, including the no-project case), and `dashboardHandlers-switchOrg.test.ts`
rewritten to cover the dashboard's composition rather than the sign-in it no longer owns.

Note for future hosts: `switchOrg` is in BOTH this map and `dashboardHandlers`. The
integrations panel registers the dashboard map second and `messageHandlers` is a `Map`,
so the dashboard's status-verifying variant wins there — which is what that surface wants.

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
