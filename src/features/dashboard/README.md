# Dashboard Feature

## Purpose

The Dashboard feature provides a centralized project control panel within VS Code. It displays real-time project status, mesh deployment state, Adobe context, and provides quick actions for common operations like starting/stopping the demo, deploying mesh, and opening configuration.

The dashboard is designed for at-a-glance status monitoring and one-click actions, with intelligent mesh status checking and focus retention for in-place actions.

## Responsibilities

- **Real-Time Status Display**: Show demo status (ready, starting, running, stopping)
- **Mesh Status Monitoring**: Async mesh status checking with auth-aware prompts
- **Adobe Context Display**: Show organization, project, and workspace
- **Quick Actions**: Start, Stop, Open Browser, Deploy Mesh (shown conditionally when project includes a mesh component), Configure
- **More Menu (overflow)**: Rename (non-EDS: stopped only), Copy Path, Export, Refresh Block Library (EDS), Republish Content (EDS), Dev Console, Reset
- **Focus Retention**: Maintain webview focus for in-place actions (Start/Stop)
- **Change Detection**: Detect frontend config changes requiring restart
- **Re-Authentication**: Handle lost Adobe access with browser auth flow
- **Developer Console Link**: Direct link to Adobe Developer Console workspace

## Key Handlers

### handleReady

**Purpose**: Send initialization data when dashboard webview loads

**Operations**:
1. Get current project
2. Detect theme (dark/light)
3. Send init message with theme and project info

### handleRequestStatus

**Purpose**: Send complete project status to dashboard

**Operations**:
1. Get current project
2. Check frontend config changes
3. Check mesh status (async if deployed, sync otherwise)
4. Send statusUpdate message with:
   - Project name and path
   - Demo status (ready, starting, running, stopping)
   - Port number
   - Adobe org and project
   - Frontend config changed flag
   - Mesh status (deployed, config-changed, not-deployed, checking, needs-auth, error)

### handleStartDemo / handleStopDemo

**Purpose**: Start or stop demo server

**Operations**:
1. Execute lifecycle command
2. Send quick demo status update (no mesh re-check)
3. Maintain webview focus (no panel reload)

### handleOpenBrowser

**Purpose**: Open demo in browser

**Operations**:
1. Get frontend port
2. Open http://localhost:{port} in external browser

### handleConfigure

**Purpose**: Open configuration UI

**Operations**:
1. Execute demoBuilder.configureProject command

### handleDeployMesh

**Purpose**: Deploy API mesh

**Operations**:
1. Execute demoBuilder.deployMesh command

### App Builder app handlers (handleAddApp / handleDeployApp / handleRedeployApp / handleRemoveApp)

**Purpose**: Manage the project's single App Builder app from the `AppBuilderCard` (sibling of
the mesh deploy surface). See `@/features/app-builder` for the underlying services.

**Operations**:
- `addApp` (`handleAddApp`, payload `{ gitUrl }`) — validate + clone+install a public-GitHub app
  via `addAppComponent`, then on success dispatch the `demoBuilder.deployApp` command. Add
  failures surface directly (no deploy).
- `deployApp` (`handleDeployApp`) — execute the `demoBuilder.deployApp` command (guards + deploy).
- `redeployApp` (`handleRedeployApp`) — alias of `handleDeployApp` (`aio app deploy` is idempotent,
  so deploy and redeploy are the same operation).
- `removeApp` (`handleRemoveApp`) — `removeAppComponent`: remote undeploy (best-effort) + local
  file/state cleanup.

### handleOpenDevConsole

**Purpose**: Open Adobe Developer Console for current project

**Operations**:
1. Build workspace-specific URL if org/project/workspace available
2. Fallback to project URL if workspace missing
3. Fallback to generic console URL if missing IDs
4. Validate URL before opening
5. Open in external browser

### handleReAuthenticate

**Purpose**: Re-authenticate with Adobe when access lost

**Operations**:
1. Update UI to 'authenticating' state
2. Trigger browser authentication
3. Restore project context (login only; org/project/workspace are NOT re-pinned
   to the aio global — each subsequent op targets them per-invocation via
   `withOrgContext`)
4. Re-check mesh status with fresh auth
5. Update dashboard with new status

### handleDeleteProject

**Purpose**: Delete current project

**Operations**:
1. Execute demoBuilder.deleteProject command
2. Close dashboard after deletion

### More-menu handlers (overflow)

These back the dashboard "More" overflow items. All resolve the project via
`getCurrentProject()` and reuse the same services as the projects-list kebab.

- **handleRenameProject** — validates `{newName}`, delegates to the shared
  `renameProjectCore` (folder rename + path updates + recent-projects + save),
  then re-sends `init` so the dashboard title refreshes.
- **handleCopyPath** — copy the current project's folder path to the clipboard.
- **handleExportProject** — export project settings to a file (reuses
  `exportProjectSettings`).
- **handleRepublishContent** — republish DA.live content to the CDN (EDS-only).
- Reset reuses the existing `handleResetProject` (`resetProject`), now surfaced
  in the More menu.

### handleNavigateBack

**Purpose**: Navigate back to projects list from project dashboard

**Operations**:
1. Clear current project from state
2. Execute `demoBuilder.showProjectsList` command
3. Return success response

**Usage**: Called when user clicks "All Projects" back link in dashboard header

## Architecture

**Directory Structure**:
```
features/dashboard/
├── index.ts                     # Public API exports
├── commands/
│   ├── showDashboard.ts        # Project dashboard webview command
│   └── configure.ts            # Configure project webview command
├── handlers/
│   ├── index.ts                # Handler exports
│   ├── dashboardHandlers.ts    # Dashboard message handlers
│   ├── configureHandlers.ts    # Configure screen handler map
│   └── meshStatusHelpers.ts    # Mesh status helper functions
└── README.md                   # This file
```

**Handler Flow**:
```
Dashboard Webview (React)
    │
    │ postMessage({ type: 'requestStatus' })
    ↓
dashboardHandlers (handler map)
    ↓
handleRequestStatus()
    ├─→ Get project
    ├─→ Detect frontend changes
    ├─→ Check mesh status (async)
    │    ├─→ Token-only auth check (isAuthenticated)
    │    ├─→ Fetch deployed config
    │    └─→ Detect config changes
    ↓
postMessage({ type: 'statusUpdate', payload: {...} })
    ↓
Dashboard UI updates
```

**Mesh Status Flow**:
```
Dashboard Load
    ↓
handleRequestStatus()
    ↓
Mesh deployed? → YES → checkMeshStatusAsync()
                           ├─→ isAuthenticated()
                           ├─→ Check org access
                           ├─→ detectMeshChanges()
                           └─→ verifyMeshDeployment() (background)
                ↓
            Send statusUpdate
                ↓
            Dashboard shows mesh status
```

## Integration Points

### Dependencies
- `@/features/authentication` - AuthenticationService for auth checks
- `@/features/mesh` - detectMeshChanges, detectFrontendChanges, verifyMeshDeployment
- `@/shared/validation` - validateURL for Dev Console links
- `@/shared/logging` - Logger for dashboard operations
- `@/services/serviceLocator` - ServiceLocator for CommandExecutor
- `vscode` - Commands, window, env APIs

### Used By
- `src/commands/dashboard.ts` - Dashboard command registration
- `src/webviews/components/dashboard/ProjectDashboard.tsx` - Dashboard UI

## Usage Examples

### Example 1: Open Dashboard
```typescript
// From extension.ts or command
await vscode.commands.executeCommand('demoBuilder.showProjectDashboard');

// Dashboard webview opens, sends 'ready' message
// handleReady responds with init data
```

### Example 2: Request Status Update
```typescript
// From dashboard UI (React)
vscode.postMessage({ type: 'requestStatus' });

// Extension handler sends statusUpdate
panel.webview.postMessage({
    type: 'statusUpdate',
    payload: {
        name: 'CitiSignal Demo',
        path: '/path/to/project',
        status: 'running',
        port: 3000,
        adobeOrg: 'Acme Corp',
        adobeProject: 'CitiSignal',
        frontendConfigChanged: false,
        mesh: {
            status: 'deployed',
            endpoint: 'https://graph.adobe.io/api/...'
        }
    }
});
```

### Example 3: Start Demo from Dashboard
```typescript
// From dashboard UI
vscode.postMessage({ type: 'startDemo' });

// Extension handler
await vscode.commands.executeCommand('demoBuilder.startDemo');

// Send quick status update (no mesh re-check)
setTimeout(() => sendDemoStatusUpdate(context), 1000);

// Dashboard shows "running" status
```

### Example 4: Handle Re-Authentication
```typescript
// From dashboard UI (when mesh status is 'needs-auth')
vscode.postMessage({ type: 're-authenticate' });

// Extension handler
const authManager = new AuthenticationService(/*...*/);
await authManager.login(); // Opens browser

// No manual org selection: the project's org/project/workspace is targeted
// per operation (from project.adobe) via the internal withOrgContext mechanism,
// so the extension never mutates the global `aio console` selection.

// Re-check mesh status with fresh auth
await handleRequestStatus(context);

// Dashboard shows updated mesh status
```

### Example 5: Open Developer Console
```typescript
// From dashboard UI
vscode.postMessage({ type: 'openDevConsole' });

// Extension builds URL
let consoleUrl = 'https://developer.adobe.com/console';

if (project.adobe?.organization && project.adobe?.projectId && project.adobe?.workspace) {
    // Direct link to workspace
    consoleUrl = `https://developer.adobe.com/console/projects/${org}/${projectId}/workspaces/${workspace}/details`;
}

// Validate and open
validateURL(consoleUrl);
await vscode.env.openExternal(vscode.Uri.parse(consoleUrl));
```

### Example 6: Async Mesh Status Checking
```typescript
// In handleRequestStatus
if (meshComponent && meshComponent.status !== 'deploying' && meshComponent.status !== 'error') {
    // Send initial status with 'checking'
    panel.webview.postMessage({
        type: 'statusUpdate',
        payload: {
            // ...other fields
            mesh: {
                status: 'checking',
                message: 'Verifying deployment status...'
            }
        }
    });

    // Check mesh status asynchronously (doesn't block UI)
    checkMeshStatusAsync(context, project, meshComponent, frontendConfigChanged)
        .catch(err => logger.error('Failed to check mesh status', err));

    return { success: true };
}
```

## Message Protocol

### Webview → Extension
- `ready` - Dashboard loaded, ready for init
- `requestStatus` - Request current project status
- `startDemo` - Start demo server
- `stopDemo` - Stop demo server
- `openBrowser` - Open demo in browser
- `configure` - Open configuration UI
- `deployMesh` - Deploy API mesh
- `addApp` / `deployApp` / `redeployApp` / `removeApp` - Manage the project's App Builder app
- `openDevConsole` - Open Adobe Developer Console
- `renameProject` - Rename current project (delegates to shared `renameProjectCore`)
- `copyPath` - Copy project folder path to clipboard
- `exportProject` - Export project settings to a file
- `republishContent` - Republish DA.live content to the CDN (EDS-only)
- `resetProject` - Reset project state
- `deleteProject` - Delete current project
- `re-authenticate` - Trigger browser authentication
- `navigateBack` - Navigate back to projects list

### Extension → Webview
- `init` - Initial dashboard data (theme, project)
- `statusUpdate` - Complete project status update
- `meshStatusUpdate` - Mesh-only status update (during async checking)
- `appStatusUpdate` - App Builder app status update (deploying/deployed/error + URL)

## Performance Considerations

### Async Mesh Checking
- **Token-only auth check**: Use `isAuthenticated()` (2-3s) instead of `isFullyAuthenticated()` (3-10s)
- **Non-blocking**: Mesh status checked asynchronously, doesn't block UI
- **Initial feedback**: Show "checking" status immediately while checking in background
- **Background verification**: Verify mesh exists in Adobe I/O without blocking status display

### Focus Retention
- **In-place actions**: Start/Stop don't reload panel (maintain focus)
- **No re-render**: Send targeted updates instead of full status refresh

### Best Practices
1. **Use async mesh checking**: Don't block UI on slow auth/API calls
2. **Send targeted updates**: Only update what changed (e.g., demo status only on start/stop)
3. **Cache auth status**: Use cached auth checks when possible
4. **Background verification**: Verify mesh exists without blocking status display
5. **Graceful degradation**: Show "needs-auth" prompt instead of error when auth lost

## State Management

### Dashboard State
The dashboard is stateless - it requests status on demand and receives updates via postMessage.

### Mesh Status States
- `checking` - Checking deployment status (async)
- `needs-auth` - User needs to authenticate to check status
- `deployed` - Mesh deployed and verified
- `config-changed` - Configuration changed, redeploy needed
- `not-deployed` - Mesh not found in Adobe I/O
- `deploying` - Mesh deployment in progress
- `error` - Error checking or deploying mesh

### Project Status States
- `ready` - Demo stopped, ready to start
- `starting` - Demo starting (terminal launched)
- `running` - Demo running
- `stopping` - Demo stopping

## Error Handling

### Authentication Errors
```typescript
// In checkMeshStatusAsync
const isAuth = await authManager.isAuthenticated();

if (!isAuth) {
    // Show auth prompt
    panel.webview.postMessage({
        type: 'statusUpdate',
        payload: {
            // ...other fields
            mesh: {
                status: 'needs-auth',
                message: 'Sign in to verify mesh status'
            }
        }
    });
    return;
}
```

### Org Access Lost
```typescript
// In checkMeshStatusAsync
const currentOrg = await authManager.getCurrentOrganization();

if (!currentOrg || currentOrg.id !== project.adobe.organization) {
    // User lost access to project's org
    panel.webview.postMessage({
        type: 'statusUpdate',
        payload: {
            // ...other fields
            mesh: {
                status: 'error',
                message: 'Organization access lost'
            }
        }
    });
    return;
}
```

### Mesh Verification Errors
```typescript
// In verifyMeshDeployment
const verification = await verifyMeshDeployment(project);

if (!verification.exists) {
    // Mesh deleted externally
    panel.webview.postMessage({
        type: 'meshStatusUpdate',
        payload: {
            status: 'not-deployed',
            message: 'Mesh not found in Adobe I/O - may have been deleted externally'
        }
    });
}
```

## Testing

### Manual Testing Checklist
- [ ] Dashboard opens successfully
- [ ] Project status displays correctly
- [ ] Mesh status checks work (deployed, config-changed, not-deployed)
- [ ] Auth prompt shows when not authenticated
- [ ] Start/Stop buttons work
- [ ] Open Browser works
- [ ] Deploy Mesh button works
- [ ] Configure button works
- [ ] Developer Console link works
- [ ] More menu: Rename works (folder renamed, title updates; hidden while a non-EDS demo runs)
- [ ] More menu: Copy Path copies the project path to the clipboard
- [ ] More menu: Export writes project settings to a file
- [ ] More menu: Republish Content works (EDS projects only)
- [ ] More menu: Reset works
- [ ] Re-authenticate flow works
- [ ] Focus retained for in-place actions
- [ ] Delete Project works
- [ ] Frontend config change detection works
- [ ] Mesh verification runs in background

### Integration Testing
- Test dashboard with various project states
- Test mesh status with auth/no auth scenarios
- Test async mesh checking
- Test re-authentication flow
- Test with mesh deleted externally
- Test with org access lost
- Test focus retention for Start/Stop

## See Also

- **[Lifecycle Feature](../lifecycle/README.md)** - Start/Stop commands
- **[Mesh Feature](../mesh/README.md)** - Mesh status checking
- **[Authentication Feature](../authentication/README.md)** - Auth checks and re-authentication
- **[Dashboard UI](../../webviews/components/dashboard/ProjectDashboard.tsx)** - React UI component

---

For overall architecture, see `../../CLAUDE.md`
For shared infrastructure, see `../shared/CLAUDE.md`
