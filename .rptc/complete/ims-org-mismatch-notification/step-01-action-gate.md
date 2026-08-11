# Step 01 — Reactive action-time org-context gate

## Problem
`deployMesh.ts:73-91` detects an org mismatch then shows a **button-less** warning
("…uses a different Adobe organization… Use 'Switch IMS Org' on the dashboard") and aborts.
It's a dead end: the user must leave the action, find the banner, and start over. The
expired-token sibling case right above it (`ensureAdobeIOAuth`) already does the right thing —
a blocking Sign In / Cancel prompt that recovers inline.

## Build: `ensureProjectOrgContext`
New `src/features/authentication/services/ensureProjectOrgContext.ts`, mirroring
`ensureAdobeIOAuth`:

```
detect (detectProjectOrgMismatch)
  ├─ undefined (no org / can't check) → { reachable: true }      // non-blocking, matches detector contract
  ├─ reachable                        → { reachable: true, currentOrg }
  └─ mismatch:
       showWarningMessage(prompt, 'Switch IMS Org', 'Cancel')
         ├─ not 'Switch IMS Org' → { reachable: false, cancelled: true, currentOrg }
         └─ 'Switch IMS Org':
              loginAndRestoreProjectContext({org,project,workspace}, force=true)
              re-detect → { reachable: after.reachable, currentOrg: after.currentOrg ?? currentOrg }
```

- Auth surface kept structural: `OrgContextAuthManager extends OrgAwareAuthManager` (adds
  `loginAndRestoreProjectContext(ctx, force?)`).
- Prompt names the current org + project: *"You're signed into <current> — but '<project>'
  was created in a different Adobe organization. Switch organizations to continue."*

## Adopt in `deployMesh`
Replace lines 73-91 with the guard:
```ts
const { ensureProjectOrgContext } = await import('@/features/authentication/services/ensureProjectOrgContext');
const orgResult = await ensureProjectOrgContext({ authManager, project, logger: this.logger, logPrefix: '[Mesh Deployment]' });
if (!orgResult.reachable) {
    await ProjectDashboardWebviewCommand.refreshStatus();
    if (!orgResult.cancelled) {
        vscode.window.showErrorMessage('Still signed into the wrong Adobe organization. Close any other Adobe browser tab, then try again.');
    }
    return;
}
```

## Tests (RED first)
- `tests/features/authentication/services/ensureProjectOrgContext.test.ts` — mock
  `detectProjectOrgMismatch`: reachable/undefined fast-paths (no prompt); mismatch→cancel
  (no forced login); mismatch→switch→reachable; mismatch→switch→still-mismatch; forced login
  called with `force=true` + project context; custom logPrefix.
- `tests/features/mesh/commands/deployMesh-orgContext.test.ts` — mock the guard: reachable→
  proceeds; cancelled→refreshStatus, no error; unreachable(not cancelled)→refreshStatus + error.
- Existing `deployMesh-auth.test.ts` stays green (reachable path runs through the real detector).

## Acceptance
- Action-time mismatch presents an inline **Switch IMS Org / Cancel** prompt that recovers
  without leaving the flow; persistent failure aborts with clear guidance; cancel is silent.
