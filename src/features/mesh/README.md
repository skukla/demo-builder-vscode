# Mesh Feature

## Purpose

The Mesh feature manages Adobe API Mesh deployment, verification, and configuration change detection. It orchestrates mesh configuration building, deployment to Adobe I/O Runtime, endpoint generation, and intelligent staleness detection to prompt users when redeployment is needed.

This feature provides seamless integration between local mesh configuration and Adobe's API Mesh infrastructure, with real-time deployment status and configuration drift detection.

## Responsibilities

- **Mesh Deployment**: Deploy mesh.json to Adobe I/O Runtime with validation
- **Deployment Verification**: Poll for deployment completion with exponential backoff
- **Endpoint Generation**: Generate workspace-specific mesh endpoint URLs
- **Configuration Staleness Detection**: Compare local vs deployed configuration
- **Environment Variable Tracking**: Track mesh-relevant env vars that affect deployment
- **Source File Hashing**: Detect changes in resolvers, schemas, and mesh config files
- **Pre-flight Authentication**: Verify auth before mesh operations to prevent surprise browser launches
- **Deployed Config Fetching**: Retrieve deployed mesh config from Adobe I/O for comparison
- **Change Detection**: Identify env var changes, source file changes, and unknown deployed states
- **User-Friendly Error Formatting**: Parse Adobe CLI errors into actionable messages

## Key Services

### deployMeshComponent

**Purpose**: Deploy mesh component from cloned repository (used during project creation)

**Parameters**:
- `componentPath` - Path to commerce-mesh component directory containing mesh.json
- `commandManager` - ExternalCommandManager for executing commands
- `logger` - Logger for info/error messages
- `onProgress?` - Optional callback for progress updates

**Returns**: `MeshDeploymentResult` with success status, meshId, endpoint, or error

**Example Usage**:
```typescript
import { deployMeshComponent } from '@/features/mesh';

const result = await deployMeshComponent(
    '/path/to/commerce-mesh',
    commandManager,
    logger,
    (message, subMessage) => {
        console.log(`${message}: ${subMessage}`);
    }
);

if (result.success) {
    console.log(`Mesh deployed at: ${result.endpoint}`);
} else {
    console.error(`Deployment failed: ${result.error}`);
}
```

### MeshDeployer

**Purpose**: High-level mesh deployment orchestration with error handling

**Key Methods**:
- `deploy(options)` - Deploy mesh with comprehensive error handling and verification
- `buildMeshConfig(options)` - Build mesh.json from environment variables
- `validateMeshConfig(configPath)` - Validate mesh.json structure

**Example Usage**:
```typescript
import { MeshDeployer } from '@/features/mesh';

const deployer = new MeshDeployer(logger);

const result = await deployer.deploy({
    meshConfigPath: '/path/to/mesh.json',
    componentPath: '/path/to/commerce-mesh',
    onProgress: (message) => console.log(message)
});
```

### verifyMeshDeployment / syncMeshStatus

**Purpose**: Verify mesh exists in Adobe I/O and sync component status

**Key Methods**:
- `verifyMeshDeployment(project)` - Check if mesh exists in Adobe I/O
- `syncMeshStatus(project, verification)` - Update project state based on verification result

**Example Usage**:
```typescript
import { verifyMeshDeployment, syncMeshStatus } from '@/features/mesh';

const verification = await verifyMeshDeployment(project);

if (!verification.exists) {
    console.warn('Mesh not found in Adobe I/O - may have been deleted externally');
    await syncMeshStatus(project, verification);
    await stateManager.saveProject(project);
}
```

### waitForMeshDeployment

**Purpose**: Poll for mesh deployment completion with exponential backoff

**Key Methods**:
- `waitForMeshDeployment(options)` - Wait up to 3 minutes for deployment to complete

**Example Usage**:
```typescript
import { waitForMeshDeployment } from '@/features/mesh';

const result = await waitForMeshDeployment({
    onProgress: (attempt, maxRetries, elapsedSeconds) => {
        console.log(`Attempt ${attempt}/${maxRetries} (${elapsedSeconds}s elapsed)`);
    },
    logger
});

if (result.deployed) {
    console.log(`Mesh deployed at: ${result.endpoint}`);
}
```

### Staleness Detection Services

**Purpose**: Detect configuration changes that require redeployment

**Key Functions**:
- `getMeshEnvVars(componentConfig)` - Extract mesh-relevant environment variables
- `fetchDeployedMeshConfig()` - Fetch deployed mesh config from Adobe I/O for comparison
- `calculateMeshSourceHash(meshPath)` - Hash mesh source files (resolvers, schemas, config)
- `getCurrentMeshState(project)` - Get stored mesh state from project
- `detectMeshChanges(project, newConfig)` - Compare local vs deployed configuration
- `updateMeshState(project)` - Update mesh state after successful deployment
- `detectFrontendChanges(project)` - Detect if frontend env vars changed (restart needed)

**Example Usage**:
```typescript
import { detectMeshChanges, fetchDeployedMeshConfig, updateMeshState } from '@/features/mesh';

// Detect changes
const changes = await detectMeshChanges(project, project.componentConfigs!);

if (changes.hasChanges) {
    console.log('Mesh configuration has changed:');
    if (changes.envVarsChanged) {
        console.log(`  - Env vars changed: ${changes.changedEnvVars.join(', ')}`);
    }
    if (changes.sourceFilesChanged) {
        console.log('  - Source files changed');
    }

    // Prompt user to redeploy
    const redeploy = await askUser('Redeploy mesh?');
    if (redeploy) {
        await deployMesh();
        await updateMeshState(project);
    }
}
```

### getEndpoint / getSetupInstructions

**Purpose**: Generate mesh endpoint URLs and setup instructions

**Key Functions**:
- `getEndpoint(workspaceId, orgCode)` - Generate workspace-specific mesh endpoint URL
- `getSetupInstructions()` - Get mesh setup instructions for users

**Example Usage**:
```typescript
import { getEndpoint } from '@/features/mesh';

const endpoint = getEndpoint(
    project.adobe.workspace,
    project.adobe.organization
);
// Result: https://graph.adobe.io/api/<workspaceId>/graphql?api_key=<orgCode>

console.log(`Mesh endpoint: ${endpoint}`);
```

## Types

See `services/types.ts` for type definitions:

- `MeshDeploymentResult` - Deployment result (success, meshId, endpoint, error)
- `MeshVerificationResult` - Verification result (exists, meshId, endpoint, error)
- `MeshState` - Stored mesh state (envVars, sourceHash, lastDeployed)
- `MeshChanges` - Change detection result (hasChanges, envVarsChanged, sourceFilesChanged, changedEnvVars, unknownDeployedState, shouldSaveProject)

## Architecture

**Directory Structure**:
```
features/mesh/
├── index.ts                     # Public API exports
├── commands/
│   └── deployMesh.ts           # VS Code command for mesh deployment
├── handlers/
│   ├── checkHandler.ts         # Check mesh status
│   ├── createHandler.ts        # Create new mesh
│   ├── deleteHandler.ts        # Delete mesh
│   └── shared.ts               # Shared handler utilities
├── services/
│   ├── meshDeployment.ts       # Deploy mesh component
│   ├── meshDeployer.ts         # High-level deployment orchestration
│   ├── meshEndpoint.ts         # Endpoint URL generation
│   ├── meshVerifier.ts         # Deployment verification
│   ├── meshDeploymentVerifier.ts  # Deployment polling
│   ├── stalenessDetector.ts    # Configuration change detection
│   └── types.ts                # Type definitions
└── README.md                   # This file
```

**Service Flow**:
```
Deploy Command (deployMesh.ts)
    ↓
deployMeshComponent() or MeshDeployer.deploy()
    ↓
1. Validate mesh.json
2. Execute aio api-mesh update
3. waitForMeshDeployment() (poll up to 3 minutes)
4. verifyMeshDeployment()
5. updateMeshState()
    ↓
Deployment Complete
```

**Staleness Detection Flow**:
```
Dashboard Load / Configuration UI
    ↓
detectMeshChanges(project, newConfig)
    ↓
1. Get current mesh state (meshState.envVars, meshState.sourceHash)
2. If meshState.envVars empty, fetchDeployedMeshConfig() from Adobe I/O
3. Compare env vars (ADOBE_COMMERCE_GRAPHQL_ENDPOINT, etc.)
4. Compare source hash (resolvers, schemas, mesh.config.js)
    ↓
MeshChanges result
    ↓
If hasChanges: Show "Redeploy Mesh" prompt
```

## Integration Points

### Dependencies
- `@/shared/command-execution` - ExternalCommandManager for CLI operations
- `@/shared/logging` - Logger for mesh operations
- `@/shared/state` - getFrontendEnvVars, updateFrontendState for frontend change detection
- `@/types/typeGuards` - parseJSON for safe JSON parsing
- `@/utils/timeoutConfig` - TIMEOUTS.API_MESH_UPDATE constant
- `@/utils/errorFormatter` - formatAdobeCliError for user-friendly errors
- `@/services/serviceLocator` - ServiceLocator for CommandExecutor access

### Used By
- `src/commands/deployMesh.ts` - Manual mesh deployment command
- `src/features/dashboard` - Mesh status display and redeploy prompts
- `src/features/project-creation` - Mesh deployment during project creation
- `src/webviews/components/configure/ConfigureView.tsx` - Configuration change detection

## Usage Examples

### Example 1: Deploy Mesh During Project Creation
```typescript
import { deployMeshComponent } from '@/features/mesh';

const result = await deployMeshComponent(
    meshComponentPath,
    commandManager,
    logger,
    (message, subMessage) => {
        // Update progress UI
        progress.report({ message, subMessage });
    }
);

if (result.success) {
    // Update project state
    project.componentInstances!['commerce-mesh'].status = 'deployed';
    project.componentInstances!['commerce-mesh'].endpoint = result.endpoint;
    await stateManager.saveProject(project);
}
```

### Example 2: Manual Mesh Deployment
```typescript
import { MeshDeployer } from '@/features/mesh';

const deployer = new MeshDeployer(logger);

try {
    const result = await deployer.deploy({
        meshConfigPath: path.join(meshComponentPath, 'mesh.json'),
        componentPath: meshComponentPath,
        onProgress: (message) => {
            vscode.window.showInformationMessage(message);
        }
    });

    vscode.window.showInformationMessage(`Mesh deployed at: ${result.endpoint}`);
} catch (error) {
    vscode.window.showErrorMessage(`Deployment failed: ${error.message}`);
}
```

### Example 3: Check Mesh Status (Dashboard)
```typescript
import { detectMeshChanges, verifyMeshDeployment } from '@/features/mesh';

// Check if configuration has changed
const changes = await detectMeshChanges(project, project.componentConfigs!);

let meshStatus: 'deployed' | 'config-changed' | 'not-deployed' = 'not-deployed';

if (changes.hasChanges) {
    meshStatus = 'config-changed';
} else if (project.meshState && Object.keys(project.meshState.envVars).length > 0) {
    meshStatus = 'deployed';

    // Verify mesh still exists in Adobe I/O (background check)
    verifyMeshDeployment(project).then(verification => {
        if (!verification.exists) {
            // Mesh was deleted externally
            updateDashboardStatus('not-deployed');
        }
    });
}

// Display status to user
displayMeshStatus(meshStatus);
```

### Example 4: Fetch Deployed Config for Comparison
```typescript
import { fetchDeployedMeshConfig } from '@/features/mesh';

// Fetch what's actually deployed in Adobe I/O
const deployedConfig = await fetchDeployedMeshConfig();

if (deployedConfig) {
    console.log('Deployed configuration:');
    console.log('  Commerce endpoint:', deployedConfig.ADOBE_COMMERCE_GRAPHQL_ENDPOINT);
    console.log('  Catalog endpoint:', deployedConfig.ADOBE_CATALOG_SERVICE_ENDPOINT);

    // Compare with local config
    const localConfig = getMeshEnvVars(project.componentConfigs!['commerce-mesh']);

    if (deployedConfig.ADOBE_COMMERCE_GRAPHQL_ENDPOINT !== localConfig.ADOBE_COMMERCE_GRAPHQL_ENDPOINT) {
        console.log('Commerce endpoint has changed - redeploy needed');
    }
} else {
    console.log('Could not fetch deployed config (not authenticated or mesh not found)');
}
```

### Example 5: Update Mesh State After Deployment
```typescript
import { updateMeshState } from '@/features/mesh';

// After successful deployment, capture baseline state
await updateMeshState(project);

// This sets:
// - project.meshState.envVars = current mesh env vars
// - project.meshState.sourceHash = hash of resolvers/schemas/config
// - project.meshState.lastDeployed = current timestamp

await stateManager.saveProject(project);

console.log('Mesh state captured - future changes will be detected');
```

### Example 6: Detect Frontend Changes (Restart Prompt)
```typescript
import { detectFrontendChanges } from '@/features/mesh';

// Check if frontend env vars changed while demo is running
const hasChanges = detectFrontendChanges(project);

if (hasChanges) {
    const restart = await vscode.window.showInformationMessage(
        'Frontend configuration changed. Restart demo to apply changes?',
        'Restart',
        'Cancel'
    );

    if (restart === 'Restart') {
        await vscode.commands.executeCommand('demoBuilder.stopDemo');
        await vscode.commands.executeCommand('demoBuilder.startDemo');
    }
}
```

## Configuration

### Tracked Environment Variables
The following env vars affect mesh configuration (tracked for staleness detection):
- `ADOBE_COMMERCE_GRAPHQL_ENDPOINT` - Commerce GraphQL endpoint
- `ADOBE_CATALOG_SERVICE_ENDPOINT` - Catalog Service endpoint
- `ADOBE_CATALOG_API_KEY` - Catalog Service API key
- `ADOBE_COMMERCE_ENVIRONMENT_ID` - Commerce environment ID
- `ADOBE_COMMERCE_WEBSITE_CODE` - Website code
- `ADOBE_COMMERCE_STORE_VIEW_CODE` - Store view code
- `ADOBE_COMMERCE_STORE_CODE` - Store code

### Tracked Source Files
The following files are hashed for change detection:
- `mesh.config.js` - Mesh configuration
- `build/resolvers/*.js` - Resolver implementations
- `schema/*.graphql` - GraphQL schema files

### Mesh State Schema
```typescript
interface MeshState {
    envVars: Record<string, string>;    // Deployed env vars
    sourceHash: string | null;          // Hash of source files
    lastDeployed: string;               // ISO timestamp
}
```

## Error Handling

### Deployment Errors
```typescript
import { deployMeshComponent } from '@/features/mesh';

const result = await deployMeshComponent(
    meshComponentPath,
    commandManager,
    logger
);

if (!result.success) {
    // User-friendly error messages
    if (result.error?.includes('not authenticated')) {
        showError('Please authenticate with Adobe I/O before deploying mesh');
    } else if (result.error?.includes('timeout')) {
        showError('Deployment timed out. Check your network connection and try again.');
    } else if (result.error?.includes('invalid mesh')) {
        showError('Mesh configuration is invalid. Check mesh.json for errors.');
    } else {
        showError(`Deployment failed: ${result.error}`);
    }
}
```

### Authentication Errors
```typescript
import { fetchDeployedMeshConfig } from '@/features/mesh';

// Pre-flight auth check before fetching
const authService = new AuthenticationService(/*...*/);
const isAuth = await authService.isAuthenticated();

if (!isAuth) {
    console.log('Not authenticated - skipping deployed config fetch');
    return null;
}

// Fetch deployed config (will return null if auth fails)
const deployedConfig = await fetchDeployedMeshConfig();

if (!deployedConfig) {
    // Could mean: not authenticated, mesh not found, or network error
    // Conservative approach: flag as changed to prompt redeployment
}
```

### Verification Errors
```typescript
import { verifyMeshDeployment } from '@/features/mesh';

const verification = await verifyMeshDeployment(project);

if (!verification.exists) {
    if (verification.error?.includes('not authenticated')) {
        showError('Please authenticate to verify mesh deployment');
    } else if (verification.error?.includes('timeout')) {
        showWarning('Mesh verification timed out - status unknown');
    } else {
        showWarning('Mesh not found in Adobe I/O - may have been deleted');
    }
}
```

## Performance Considerations

### Deployment Times
- **Mesh Update**: ~30-60 seconds (Adobe I/O Runtime deployment)
- **Verification Polling**: Up to 3 minutes with exponential backoff
- **Total Deployment**: 1-4 minutes

### Optimization Strategies
1. **Pre-flight Auth**: Check auth BEFORE deployment to avoid surprise browser launches
2. **Background Verification**: Verify mesh exists in background, don't block UI
3. **Cached Deployed Config**: Fetch deployed config once per dashboard load
4. **Fast Change Detection**: Compare hashes and env vars locally before fetching deployed config
5. **Exponential Backoff**: Poll with increasing intervals (1s, 2s, 4s, 8s...) to reduce API calls

### Best Practices
- Always update mesh state after successful deployment
- Use `detectMeshChanges()` to check if redeployment needed before prompting user
- Fetch deployed config only when needed (not on every check)
- Handle authentication failures gracefully (don't crash, return null/false)
- Show clear progress during deployment (parsing, validating, deploying, verifying)

## Staleness Detection Algorithm

### Detection Logic
```typescript
// 1. Get current deployed state
const currentState = getCurrentMeshState(project);

if (!currentState || Object.keys(currentState.envVars).length === 0) {
    // No baseline - try to fetch from Adobe I/O
    const deployedConfig = await fetchDeployedMeshConfig();

    if (deployedConfig) {
        // Successfully fetched - use as baseline
        project.meshState.envVars = deployedConfig;
        // Continue with comparison
    } else {
        // Failed to fetch - unknown deployed state
        return {
            hasChanges: true,
            unknownDeployedState: true
        };
    }
}

// 2. Compare env vars
const newEnvVars = getMeshEnvVars(newComponentConfig);
const changedEnvVars = [];

for (const key of MESH_ENV_VARS) {
    if (currentState.envVars[key] !== newEnvVars[key]) {
        changedEnvVars.push(key);
    }
}

// 3. Compare source files
const newSourceHash = await calculateMeshSourceHash(meshPath);
const sourceFilesChanged = newSourceHash !== currentState.sourceHash;

// 4. Return result
return {
    hasChanges: changedEnvVars.length > 0 || sourceFilesChanged,
    envVarsChanged: changedEnvVars.length > 0,
    sourceFilesChanged,
    changedEnvVars
};
```

## Testing

### Manual Testing Checklist
- [ ] Mesh deploys successfully during project creation
- [ ] Deployment progress updates show correctly
- [ ] Deployment verification completes within 3 minutes
- [ ] Mesh endpoint URL generates correctly
- [ ] Configuration changes detected accurately
- [ ] Env var changes trigger staleness warning
- [ ] Source file changes trigger staleness warning
- [ ] Deployed config fetches successfully
- [ ] Pre-flight auth check prevents surprise browser launch
- [ ] Mesh verification detects externally deleted meshes
- [ ] Error messages are user-friendly and actionable

### Integration Testing
- Test mesh deployment during project creation
- Test manual mesh deployment command
- Test dashboard mesh status display
- Test configuration UI change detection
- Test pre-flight auth checks
- Test verification polling and backoff
- Test error scenarios (no auth, invalid config, timeout)

## See Also

- **[Authentication Feature](../authentication/README.md)** - Pre-flight auth checks
- **[Dashboard Feature](../dashboard/README.md)** - Mesh status display
- **[Project Creation Feature](../project-creation/README.md)** - Mesh deployment integration
- **[State Management](../shared/state/CLAUDE.md)** - Mesh state persistence
- **[Timeout Configuration](../../utils/timeoutConfig.ts)** - TIMEOUTS.API_MESH_UPDATE constant

---

For overall architecture, see `../../CLAUDE.md`
For shared infrastructure, see `../shared/CLAUDE.md`
