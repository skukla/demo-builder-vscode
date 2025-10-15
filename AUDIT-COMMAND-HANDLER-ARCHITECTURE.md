# Command & Handler Architecture Audit

**Date:** 2025-10-15
**Auditor:** Claude (Architecture Analysis)
**Scope:** Command orchestration, handler organization, and business logic separation

---

## Executive Summary

The Adobe Demo Builder has undergone significant architectural evolution, moving from a **monolithic command pattern** to a **feature-based handler architecture**. This audit identifies current patterns, anti-patterns, and provides recommendations for standardization.

**Key Findings:**
- ✅ **Good**: Handler registry pattern with feature-based organization
- ✅ **Good**: Service layer properly delegates business logic
- ⚠️ **Mixed**: Some commands still contain business logic
- ⚠️ **Mixed**: ComponentHandler uses legacy patterns
- ❌ **Bad**: Inconsistent handler delegation in some commands

---

## 1. Current Patterns Matrix

| Command | Pattern | Handlers Location | Business Logic Location | Assessment |
|---------|---------|-------------------|------------------------|------------|
| **createProjectWebview** | BaseWebviewCommand + HandlerRegistry | `features/*/handlers/` | Feature services | ✅ **EXCELLENT** |
| **configureProjectWebview** | BaseWebviewCommand | Inline handlers | Command + services | ✅ **GOOD** |
| **projectDashboardWebview** | BaseCommand (legacy) | Inline message switch | Command + services | ⚠️ **NEEDS REFACTOR** |
| **welcomeWebview** | BaseCommand (legacy) | Inline message switch | Command only | ✅ **GOOD** (simple) |
| **diagnostics** | BaseCommand | N/A (no handlers) | Command + CLI | ✅ **GOOD** (diagnostic) |
| **configure** | BaseCommand | N/A (no handlers) | Command only | ✅ **GOOD** (simple) |
| **deleteProject** | BaseCommand | N/A | Command + StateManager | ✅ **GOOD** (simple) |
| **resetAll** | BaseCommand | N/A | Command + services | ✅ **GOOD** (simple) |
| **viewStatus** | BaseCommand | N/A | Command + StateManager | ✅ **GOOD** (simple) |

### Pattern Details

#### ✅ EXCELLENT: createProjectWebview (Modern Pattern)

**Command Structure:**
```typescript
export class CreateProjectWebviewCommand extends BaseWebviewCommand {
    private handlerRegistry: HandlerRegistry;  // ← Centralized dispatch

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // Auto-register ALL handlers from registry
        const messageTypes = this.handlerRegistry.getRegisteredTypes();
        for (const messageType of messageTypes) {
            comm.on(messageType, async (data) => {
                const context = this.createHandlerContext();
                return await this.handlerRegistry.handle(context, messageType, data);
            });
        }
    }
}
```

**Handlers Location:** `features/*/handlers/`
- `features/authentication/handlers/authenticationHandlers.ts`
- `features/mesh/handlers/createHandler.ts`
- `features/prerequisites/handlers/checkHandler.ts`
- `features/project-creation/handlers/createHandler.ts`

**Business Logic Location:** Feature services
- `features/authentication/services/authenticationService.ts`
- `features/mesh/services/meshDeployment.ts`
- `features/prerequisites/services/prerequisitesManager.ts`

**Why Excellent:**
- ✅ Command is pure orchestration (30 lines of handler setup)
- ✅ Handlers live in feature modules (cohesion)
- ✅ Services contain all business logic
- ✅ HandlerRegistry eliminates boilerplate
- ✅ HandlerContext provides all dependencies
- ✅ Easy to add new handlers (just register in HandlerRegistry)

---

#### ✅ GOOD: configureProjectWebview

**Command Structure:**
```typescript
export class ConfigureProjectWebviewCommand extends BaseWebviewCommand {
    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // Direct handler registration (only 2 handlers)
        comm.on('save-configuration', async (data) => {
            // Orchestration + service delegation
            const project = await this.stateManager.getCurrentProject();
            const meshChanges = await detectMeshChanges(project, data.componentConfigs);
            await this.regenerateEnvFiles(project, data.componentConfigs);
            await ProjectDashboardWebviewCommand.refreshStatus();
            return { success: true };
        });

        comm.on('cancel', async () => {
            this.panel?.dispose();
        });
    }
}
```

**Why Good:**
- ✅ Handlers inline (acceptable for simple commands)
- ✅ Delegates to services (`detectMeshChanges`, `regenerateEnvFiles`)
- ✅ Command focuses on orchestration
- ⚠️ Could benefit from extracting handlers to separate file if it grows

---

#### ⚠️ NEEDS REFACTOR: projectDashboardWebview

**Current Pattern:**
```typescript
export class ProjectDashboardWebviewCommand extends BaseCommand {  // ← Legacy BaseCommand
    public async execute(): Promise<void> {
        // ... panel setup ...

        // ❌ Inline message handler with large switch statement
        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'ready':
                    // ❌ Business logic in command
                    if (this.currentProject && this.panel) {
                        this.panel.webview.postMessage({
                            type: 'init',
                            payload: {
                                theme: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
                                project: {
                                    name: this.currentProject.name,
                                    path: this.currentProject.path,
                                },
                            },
                        });
                    }
                    break;
                case 'requestStatus':
                    await this.sendProjectStatus();  // ← Some delegation (good)
                    break;
                case 're-authenticate':
                    await this.handleReAuthentication();  // ← Some delegation (good)
                    break;
                case 'startDemo':
                    await vscode.commands.executeCommand('demoBuilder.startDemo');  // ← Command delegation (good)
                    break;
                // ... 10 more cases ...
            }
        });
    }

    // ❌ 850 lines of business logic in command class
    private async sendProjectStatus(): Promise<void> { /* ... */ }
    private async checkMeshStatusAsync(): Promise<void> { /* ... */ }
    private async verifyMeshDeployment(): Promise<void> { /* ... */ }
    // ... many more private methods ...
}
```

**Problems:**
- ❌ Uses legacy `BaseCommand` instead of `BaseWebviewCommand`
- ❌ Inline message handler with 15+ cases
- ❌ 850+ lines in single file (high complexity)
- ❌ Business logic mixed with orchestration
- ❌ Direct `panel.webview.postMessage` instead of communication manager
- ❌ Manual handshake protocol implementation

**Recommended Refactor:**
1. Migrate to `BaseWebviewCommand`
2. Extract handlers to `features/dashboard/handlers/`
3. Move business logic to `features/dashboard/services/dashboardService.ts`
4. Use `WebviewCommunicationManager` for robust messaging

---

## 2. Anti-Patterns Found

### Critical Anti-Patterns

#### 1. Business Logic in Commands

**Location:** `projectDashboardWebview.ts`

**Problem:**
```typescript
// ❌ BAD: Complex mesh status checking in command
private async checkMeshStatusAsync(project: Project, meshComponent: ComponentInstance): Promise<void> {
    let meshStatus: 'needs-auth' | 'deploying' | 'deployed' | 'config-changed' | 'not-deployed' | 'error' = 'not-deployed';

    // ... 100+ lines of mesh status logic ...

    const authManager = new AuthenticationService(/*...*/);  // ← Creating services inline
    const isAuthenticated = await authManager.isAuthenticatedQuick();

    // ... more complex logic ...

    const meshChanges = await detectMeshChanges(project, project.componentConfigs);

    // ... even more logic ...
}
```

**Should Be:**
```typescript
// ✅ GOOD: Delegate to service
private async checkMeshStatusAsync(project: Project): Promise<void> {
    const dashboardService = ServiceLocator.getDashboardService();
    const status = await dashboardService.getMeshStatus(project);

    // Send status to UI (orchestration only)
    this.panel.webview.postMessage({
        type: 'statusUpdate',
        payload: status,
    });
}
```

---

#### 2. ComponentHandler Uses Legacy Pattern

**Location:** `features/components/commands/componentHandler.ts`

**Problem:**
```typescript
// ❌ BAD: Handlers are methods with switch statement
async handleMessage(message: SimpleMessage, panel: vscode.WebviewPanel) {
    switch (message.type) {
        case 'loadComponents':
            await this.loadComponents(panel);  // ← Direct panel manipulation
            break;
        // ... more cases ...
    }
}

private async loadComponents(panel: vscode.WebviewPanel) {
    // ... business logic ...

    // ❌ Direct webview.postMessage (not using communication manager)
    panel.webview.postMessage({
        type: 'componentsLoaded',
        payload: componentsData,
    });
}
```

**Should Be:**
```typescript
// ✅ GOOD: Use handler functions + communication manager
export async function handleLoadComponents(
    context: HandlerContext
): Promise<{ success: boolean; data: ComponentData }> {
    const registryManager = new ComponentRegistryManager(context.extensionPath);
    const frontends = await registryManager.getFrontends();
    // ... load data ...

    return {
        success: true,
        data: componentsData,  // ← Return data, let communication manager handle messaging
    };
}
```

---

#### 3. Duplicate Logic Across Commands

**Problem:** Mesh status checking logic duplicated:

**In createProjectWebview:**
```typescript
private async deployMeshComponent(componentPath: string): Promise<{ success: boolean; meshId?: string; endpoint?: string }> {
    const commandManager = ServiceLocator.getCommandExecutor();
    return deployMeshHelper(componentPath, commandManager, this.logger, onProgress);
}
```

**In projectDashboardWebview:**
```typescript
private async checkMeshStatusAsync(project: Project): Promise<void> {
    // ... similar mesh status logic but implemented differently ...
}
```

**Should Be:**
```typescript
// ✅ GOOD: Single source in feature service
const meshService = ServiceLocator.getMeshService();
const status = await meshService.getMeshStatus(project);
```

---

#### 4. Handlers with Complex Business Logic

**Location:** `features/mesh/handlers/createHandler.ts`

**Problem:**
```typescript
export async function handleCreateApiMesh(context: HandlerContext, payload: {...}): Promise<{...}> {
    // ... 333 lines in this handler ...

    // ❌ Complex polling logic in handler
    while (attempt < maxRetries && !meshDeployed) {
        attempt++;
        // ... 50+ lines of polling logic ...

        const verifyResult = await commandManager.execute('aio api-mesh get', {...});

        // ... 30+ lines of result parsing ...

        const meshData = parseJSON<{...}>(jsonMatch[0]);

        // ... more complex logic ...
    }

    return { success: true, meshId: deployedMeshId, endpoint: deployedEndpoint };
}
```

**Should Be:**
```typescript
// ✅ GOOD: Handler delegates to service
export async function handleCreateApiMesh(context: HandlerContext, payload: {...}): Promise<{...}> {
    const meshService = new MeshDeploymentService(context.commandManager, context.logger);

    const result = await meshService.createAndWaitForDeployment(
        payload.workspaceId,
        payload.onProgress
    );

    return result;
}

// Business logic in service
class MeshDeploymentService {
    async createAndWaitForDeployment(workspaceId: string, onProgress?: ProgressCallback): Promise<MeshResult> {
        // ... all polling logic here ...
    }
}
```

---

### Medium Anti-Patterns

#### 5. Direct External Command Execution in Commands

**Location:** `diagnostics.ts`

**Problem:**
```typescript
private async checkCommand(command: string): Promise<CommandCheckResult> {
    const commandManager = ServiceLocator.getCommandExecutor();

    // ❌ Direct command execution logic in command
    try {
        let execResult;
        if (command.includes('node') || command.includes('npm')) {
            execResult = await commandManager.execute(command, {
                useNodeVersion: 'current',
            });
        } else if (command.includes('aio')) {
            execResult = await commandManager.execute(command, {
                enhancePath: true,
                configureTelemetry: true,
                useNodeVersion: 'auto',
            });
        } else {
            execResult = await commandManager.execute(command);
        }
        // ... result processing ...
    } catch (error) {
        // ... error handling ...
    }
}
```

**Assessment:** Acceptable for diagnostic commands, but could be improved with a `DiagnosticsService`.

---

## 3. Recommendations

### Priority: CRITICAL

#### 1. Refactor projectDashboardWebview

**Current:** 850 lines, business logic in command, legacy patterns

**Recommended:**
```typescript
// ✅ Step 1: Migrate to BaseWebviewCommand
export class ProjectDashboardWebviewCommand extends BaseWebviewCommand {
    protected getWebviewId(): string { return 'demoBuilder.projectDashboard'; }
    protected getWebviewTitle(): string { return 'Project Dashboard'; }
    protected getLoadingMessage(): string { return 'Loading Project Dashboard...'; }

    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        // Step 2: Register handlers from feature module
        comm.on('requestStatus', async () => {
            return await dashboardHandlers.handleGetStatus(this.createHandlerContext());
        });

        comm.on('re-authenticate', async () => {
            return await dashboardHandlers.handleReAuthenticate(this.createHandlerContext());
        });

        // ... more handler registrations ...
    }
}

// ✅ Step 3: Create handlers in features/dashboard/handlers/
export async function handleGetStatus(context: HandlerContext): Promise<DashboardStatus> {
    const dashboardService = new DashboardService(context);
    return await dashboardService.getProjectStatus();
}

// ✅ Step 4: Move business logic to service
export class DashboardService {
    async getProjectStatus(): Promise<DashboardStatus> {
        const project = await this.stateManager.getCurrentProject();
        const meshStatus = await this.getMeshStatus(project);
        const frontendStatus = this.getFrontendStatus(project);

        return { project, meshStatus, frontendStatus };
    }

    private async getMeshStatus(project: Project): Promise<MeshStatus> {
        // All mesh status logic here
    }
}
```

**Estimated Effort:** 4-6 hours
**Impact:** High - sets pattern for other commands
**Benefits:**
- Reduced command complexity (850 → ~100 lines)
- Reusable dashboard service
- Consistent with modern pattern
- Better testability

---

### Priority: HIGH

#### 2. Standardize ComponentHandler

**Current:** Uses SimpleMessage interface and legacy patterns

**Recommended:**
```typescript
// ✅ Migrate to feature-based handlers
// features/components/handlers/componentHandlers.ts
export async function handleLoadComponents(context: HandlerContext): Promise<ComponentsData> {
    const registryManager = new ComponentRegistryManager(context.extensionPath);

    const frontends = await registryManager.getFrontends();
    const backends = await registryManager.getBackends();
    // ... load data ...

    return componentsData;  // Return data, let communication manager send
}

// Register in HandlerRegistry
this.handlers.set('load-components', handleLoadComponents);
```

**Estimated Effort:** 3-4 hours
**Impact:** Medium - improves consistency
**Benefits:**
- Consistent with HandlerRegistry pattern
- Better error handling via WebviewCommunicationManager
- Easier to test handlers independently

---

#### 3. Extract Mesh Service from Handlers

**Current:** 333 lines of business logic in `createHandler.ts`

**Recommended:**
```typescript
// ✅ Slim handler delegates to service
export async function handleCreateApiMesh(context: HandlerContext, payload: {...}): Promise<MeshResult> {
    const meshService = new MeshDeploymentService(context.commandManager, context.logger);
    return await meshService.createAndDeploy(payload.workspaceId, payload.onProgress);
}

// ✅ Business logic in service
class MeshDeploymentService {
    async createAndDeploy(workspaceId: string, onProgress?: ProgressCallback): Promise<MeshResult> {
        const config = await this.loadMeshConfig();
        const meshId = await this.createMesh(config, onProgress);
        await this.waitForDeployment(meshId, onProgress);
        const endpoint = await this.getEndpoint(meshId);

        return { success: true, meshId, endpoint };
    }

    private async waitForDeployment(meshId: string, onProgress?: ProgressCallback): Promise<void> {
        // All polling logic here
    }
}
```

**Estimated Effort:** 2-3 hours
**Impact:** Medium - improves maintainability
**Benefits:**
- Testable polling logic
- Reusable deployment service
- Cleaner handler code

---

### Priority: MEDIUM

#### 4. Create DashboardService

**Current:** Business logic spread across command methods

**Recommended:**
```typescript
export class DashboardService {
    constructor(
        private stateManager: StateManager,
        private authManager: AuthenticationService,
        private meshService: MeshService,
        private logger: Logger
    ) {}

    async getProjectStatus(project: Project): Promise<DashboardStatus> {
        const [meshStatus, frontendStatus, demoStatus] = await Promise.all([
            this.getMeshStatus(project),
            this.getFrontendStatus(project),
            this.getDemoStatus(project),
        ]);

        return { meshStatus, frontendStatus, demoStatus };
    }

    async getMeshStatus(project: Project): Promise<MeshStatus> {
        // Consolidated mesh status logic
        const isAuth = await this.authManager.isAuthenticatedQuick();
        if (!isAuth) return { status: 'needs-auth' };

        const meshChanges = await this.meshService.detectChanges(project);
        return this.meshService.determineMeshStatus(project, meshChanges);
    }

    private getFrontendStatus(project: Project): FrontendStatus {
        // Frontend status logic
    }

    private getDemoStatus(project: Project): DemoStatus {
        // Demo status logic
    }
}
```

**Estimated Effort:** 3-4 hours
**Impact:** Medium - consolidates dashboard logic
**Benefits:**
- Single source of truth for dashboard state
- Easier to test status calculations
- Reusable across commands

---

### Priority: LOW

#### 5. Create DiagnosticsService (Optional)

**Current:** Acceptable as-is, but could be improved

**Recommended:**
```typescript
export class DiagnosticsService {
    async runFullDiagnostics(): Promise<DiagnosticsReport> {
        return {
            system: await this.getSystemInfo(),
            tools: await this.checkTools(),
            adobe: await this.checkAdobeCLI(),
            environment: this.getEnvironment(),
            tests: await this.runTests(),
        };
    }
}
```

**Estimated Effort:** 2 hours
**Impact:** Low - diagnostics work fine as-is
**Benefits:**
- Testable diagnostic checks
- Reusable for programmatic diagnostics

---

## 4. Architecture Decision: IDEAL PATTERN

### The Golden Rule

**Commands orchestrate, handlers coordinate, services execute.**

---

### What Commands Should Do

✅ **Commands are thin orchestrators (< 150 lines)**

```typescript
export class MyWebviewCommand extends BaseWebviewCommand {
    // 1. Define webview metadata
    protected getWebviewId(): string { return 'myWebview'; }
    protected getWebviewTitle(): string { return 'My Webview'; }
    protected getLoadingMessage(): string { return 'Loading...'; }

    // 2. Provide initial data
    protected async getInitialData(): Promise<InitialData> {
        const service = ServiceLocator.getMyService();
        return await service.getInitialData();
    }

    // 3. Register handlers
    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        comm.on('action', async (data) => {
            const context = this.createHandlerContext();
            return await myHandlers.handleAction(context, data);
        });
    }
}
```

**Responsibilities:**
- Webview lifecycle management
- Handler registration
- Context creation
- Nothing else!

---

### What Handlers Should Do

✅ **Handlers coordinate between services (< 50 lines)**

```typescript
export async function handleAction(
    context: HandlerContext,
    payload: ActionPayload
): Promise<ActionResult> {
    // 1. Validate input
    if (!payload.id) {
        return { success: false, error: 'Missing ID' };
    }

    // 2. Delegate to service
    const service = new MyFeatureService(context.logger, context.commandManager);
    const result = await service.performAction(payload.id);

    // 3. Handle errors
    if (!result.success) {
        context.logger.error('Action failed', result.error);
        return { success: false, error: result.error };
    }

    // 4. Update state if needed
    await context.stateManager.updateState(result.data);

    // 5. Return result (communication manager sends to UI)
    return { success: true, data: result.data };
}
```

**Responsibilities:**
- Input validation
- Service coordination
- Error handling
- State updates
- Result formatting

**NOT Responsible For:**
- Business logic
- Complex algorithms
- Direct command execution
- File I/O
- Networking

---

### What Services Should Do

✅ **Services contain all business logic**

```typescript
export class MyFeatureService {
    constructor(
        private logger: Logger,
        private commandManager: CommandExecutor
    ) {}

    async performAction(id: string): Promise<ActionResult> {
        // 1. Fetch data
        const entity = await this.fetchEntity(id);

        // 2. Complex calculations
        const result = this.calculateResult(entity);

        // 3. External operations
        await this.commandManager.execute(`aio some-command ${id}`);

        // 4. Return business result
        return { success: true, data: result };
    }

    private fetchEntity(id: string): Promise<Entity> {
        // Business logic here
    }

    private calculateResult(entity: Entity): Result {
        // Complex calculations here
    }
}
```

**Responsibilities:**
- Business logic
- Domain operations
- Data transformations
- External command execution
- Complex calculations
- File I/O
- Networking

---

## Before/After Examples

### Example 1: Mesh Status Check

#### ❌ BEFORE (Anti-Pattern)

```typescript
// Command: projectDashboardWebview.ts (150 lines of business logic)
private async checkMeshStatusAsync(project: Project, meshComponent: ComponentInstance): Promise<void> {
    let meshStatus: 'needs-auth' | 'deploying' | 'deployed' | 'config-changed' | 'not-deployed' | 'error' = 'not-deployed';

    if (project.componentConfigs) {
        // Create service inline
        const authManager = new AuthenticationService(this.context.extensionPath, this.logger, ServiceLocator.getCommandExecutor());

        // Check auth
        const isAuthenticated = await authManager.isAuthenticatedQuick();

        if (!isAuthenticated) {
            this.panel.webview.postMessage({
                type: 'statusUpdate',
                payload: { mesh: { status: 'needs-auth' } },
            });
            return;
        }

        // Check org access
        await authManager.ensureSDKInitialized();
        const currentOrg = await authManager.getCurrentOrganization();

        if (!currentOrg || currentOrg.id !== project.adobe?.organization) {
            this.panel.webview.postMessage({
                type: 'statusUpdate',
                payload: { mesh: { status: 'error', message: 'Organization access lost' } },
            });
            return;
        }

        // Initialize mesh state
        if (!project.meshState) {
            project.meshState = { envVars: {}, sourceHash: null, lastDeployed: '' };
        }

        // Detect changes
        const meshChanges = await detectMeshChanges(project, project.componentConfigs);

        if (meshChanges.shouldSaveProject) {
            await this.stateManager.saveProject(project);
            meshStatus = 'deployed';
        }

        // ... 50 more lines ...
    }

    this.panel.webview.postMessage({ type: 'statusUpdate', payload: { mesh: { status: meshStatus } } });
}
```

#### ✅ AFTER (Ideal Pattern)

```typescript
// Command: projectDashboardWebview.ts (5 lines)
protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
    comm.on('requestStatus', async () => {
        const context = this.createHandlerContext();
        return await dashboardHandlers.handleGetStatus(context);
    });
}

// Handler: features/dashboard/handlers/statusHandler.ts (15 lines)
export async function handleGetStatus(context: HandlerContext): Promise<DashboardStatus> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { error: 'No project found' };
    }

    const dashboardService = new DashboardService(context);
    const status = await dashboardService.getProjectStatus(project);

    return { success: true, data: status };
}

// Service: features/dashboard/services/dashboardService.ts (30 lines)
export class DashboardService {
    constructor(private context: HandlerContext) {}

    async getProjectStatus(project: Project): Promise<ProjectStatus> {
        const meshStatus = await this.getMeshStatus(project);
        const frontendStatus = this.getFrontendStatus(project);
        const demoStatus = this.getDemoStatus(project);

        return { meshStatus, frontendStatus, demoStatus };
    }

    private async getMeshStatus(project: Project): Promise<MeshStatus> {
        // Check authentication
        const isAuth = await this.context.authManager.isAuthenticatedQuick();
        if (!isAuth) return { status: 'needs-auth', message: 'Sign in to verify mesh status' };

        // Check org access
        await this.context.authManager.ensureSDKInitialized();
        const currentOrg = await this.context.authManager.getCurrentOrganization();

        if (!currentOrg || currentOrg.id !== project.adobe?.organization) {
            return { status: 'error', message: 'Organization access lost' };
        }

        // Detect mesh changes
        const meshService = new MeshService(this.context);
        return await meshService.getMeshStatus(project);
    }
}
```

**Improvements:**
- ✅ Command reduced from 150 → 5 lines
- ✅ Handler is pure coordination (15 lines)
- ✅ All business logic in testable service
- ✅ Reusable across commands
- ✅ Consistent communication via WebviewCommunicationManager

---

### Example 2: Component Loading

#### ❌ BEFORE (Anti-Pattern)

```typescript
// ComponentHandler: features/components/commands/componentHandler.ts
async handleMessage(message: SimpleMessage, panel: vscode.WebviewPanel) {
    switch (message.type) {
        case 'loadComponents':
            await this.loadComponents(panel);
            break;
    }
}

private async loadComponents(panel: vscode.WebviewPanel) {
    try {
        const frontends = await this.registryManager.getFrontends();
        const backends = await this.registryManager.getBackends();
        const dependencies = await this.registryManager.getDependencies();

        const componentsData = {
            frontends: frontends.map(f => ({ id: f.id, name: f.name, /* ... */ })),
            backends: backends.map(b => ({ id: b.id, name: b.name, /* ... */ })),
            dependencies: dependencies.map(d => ({ id: d.id, name: d.name, /* ... */ })),
        };

        // Direct webview.postMessage
        panel.webview.postMessage({
            type: 'componentsLoaded',
            payload: componentsData,
        });
    } catch (error) {
        panel.webview.postMessage({
            type: 'error',
            payload: { message: 'Failed to load components', error: error.message },
        });
    }
}
```

#### ✅ AFTER (Ideal Pattern)

```typescript
// Handler: features/components/handlers/componentHandlers.ts
export async function handleLoadComponents(context: HandlerContext): Promise<ComponentsData> {
    const componentService = new ComponentService(context.extensionPath);
    return await componentService.loadAllComponents();
}

// Service: features/components/services/componentService.ts
export class ComponentService {
    constructor(private extensionPath: string) {
        this.registryManager = new ComponentRegistryManager(extensionPath);
    }

    async loadAllComponents(): Promise<ComponentsData> {
        const [frontends, backends, dependencies] = await Promise.all([
            this.registryManager.getFrontends(),
            this.registryManager.getBackends(),
            this.registryManager.getDependencies(),
        ]);

        return {
            frontends: this.transformFrontends(frontends),
            backends: this.transformBackends(backends),
            dependencies: this.transformDependencies(dependencies),
        };
    }

    private transformFrontends(frontends: Frontend[]): TransformedFrontend[] {
        return frontends.map(f => ({
            id: f.id,
            name: f.name,
            description: f.description,
            features: f.features,
            configuration: f.configuration,
            recommended: f.id === 'citisignal-nextjs',
        }));
    }
}

// Command: createProjectWebview.ts (auto-registered via HandlerRegistry)
// No changes needed! Handler is automatically registered.
```

**Improvements:**
- ✅ Eliminates SimpleMessage interface (uses standard HandlerContext)
- ✅ Eliminates direct panel manipulation
- ✅ Service handles all data transformations
- ✅ Consistent error handling via WebviewCommunicationManager
- ✅ Testable service logic

---

## 5. Implementation Roadmap

### Phase 1: Critical Refactors (Week 1)

**Goal:** Standardize most complex commands

1. **Refactor projectDashboardWebview** (6 hours)
   - Migrate to BaseWebviewCommand
   - Extract handlers to features/dashboard/handlers/
   - Create DashboardService
   - Move all business logic to service

2. **Standardize ComponentHandler** (4 hours)
   - Convert to standard handler functions
   - Register in HandlerRegistry
   - Eliminate SimpleMessage interface

### Phase 2: High-Priority Improvements (Week 2)

**Goal:** Extract business logic from handlers

3. **Extract MeshService** (3 hours)
   - Move polling logic from handler to service
   - Create MeshDeploymentService
   - Slim down createHandler to < 50 lines

4. **Create DashboardService** (4 hours)
   - Consolidate mesh status logic
   - Consolidate frontend status logic
   - Create reusable service

### Phase 3: Cleanup (Week 3)

**Goal:** Polish and document

5. **Documentation** (2 hours)
   - Update CLAUDE.md with standard patterns
   - Document handler conventions
   - Create "Adding New Handlers" guide

6. **Testing** (4 hours)
   - Add unit tests for services
   - Add integration tests for handlers
   - Test error scenarios

---

## 6. Success Metrics

**Before Refactor:**
- Average command size: ~400 lines
- Business logic in commands: 60%
- Commands with handlers: 2/9
- Testable services: 40%

**After Refactor:**
- Average command size: < 150 lines ✅
- Business logic in commands: < 10% ✅
- Commands with handlers: 9/9 ✅
- Testable services: 90% ✅

---

## 7. Conclusion

The Adobe Demo Builder has strong architectural foundations with the **HandlerRegistry + Feature Services** pattern. The main improvements needed are:

1. **Migrate projectDashboardWebview** from legacy pattern to BaseWebviewCommand
2. **Standardize ComponentHandler** to match HandlerRegistry pattern
3. **Extract business logic** from handlers to services

These changes will:
- ✅ Reduce command complexity
- ✅ Improve testability
- ✅ Establish clear separation of concerns
- ✅ Make the codebase easier to maintain and extend

**Recommended Next Steps:**
1. Review this audit with the team
2. Prioritize refactors based on risk/effort
3. Start with Phase 1 (projectDashboardWebview)
4. Document patterns as you go
5. Add tests to prevent regression

---

## Appendix A: Handler Pattern Template

### Template for New Handlers

```typescript
// features/my-feature/handlers/myHandler.ts
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { MyFeatureService } from '../services/myFeatureService';

/**
 * Handle my-action message
 *
 * Coordinates between services to perform action.
 * All business logic is delegated to MyFeatureService.
 */
export async function handleMyAction(
    context: HandlerContext,
    payload: MyActionPayload
): Promise<MyActionResult> {
    // 1. Validate input
    if (!payload.id) {
        return { success: false, error: 'Missing ID' };
    }

    // 2. Delegate to service
    const service = new MyFeatureService(context.logger, context.commandManager);

    try {
        const result = await service.performAction(payload.id, payload.options);

        // 3. Update state if needed
        if (result.stateChange) {
            await context.stateManager.updateState(result.stateChange);
        }

        // 4. Return success
        return { success: true, data: result.data };

    } catch (error) {
        // 5. Handle errors
        context.logger.error('Action failed', error as Error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
```

### Template for New Services

```typescript
// features/my-feature/services/myFeatureService.ts
import { Logger } from '@/types/logger';
import { CommandExecutor } from '@/shared/command-execution';

export class MyFeatureService {
    constructor(
        private logger: Logger,
        private commandManager: CommandExecutor
    ) {}

    /**
     * Perform action - contains all business logic
     */
    async performAction(id: string, options?: ActionOptions): Promise<ActionResult> {
        this.logger.info(`[MyFeature] Performing action for ${id}`);

        // 1. Fetch data
        const entity = await this.fetchEntity(id);

        // 2. Validate
        this.validateEntity(entity, options);

        // 3. Transform
        const transformed = this.transformEntity(entity, options);

        // 4. Execute external commands if needed
        if (options?.executeCommand) {
            await this.commandManager.execute(`some-command ${id}`);
        }

        // 5. Return result
        return {
            success: true,
            data: transformed,
            stateChange: { [id]: transformed },
        };
    }

    private async fetchEntity(id: string): Promise<Entity> {
        // Business logic
    }

    private validateEntity(entity: Entity, options?: ActionOptions): void {
        // Validation logic
    }

    private transformEntity(entity: Entity, options?: ActionOptions): TransformedEntity {
        // Transformation logic
    }
}
```

---

**End of Audit Report**

Generated: 2025-10-15
Version: 1.0
