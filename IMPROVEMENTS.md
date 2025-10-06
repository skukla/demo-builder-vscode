# Project Creation Improvements

## 1. Enhanced ComponentSource Configuration

Add these fields to `ComponentSource` interface:

```typescript
export interface ComponentSource {
    type: 'git' | 'npm' | 'local';
    url?: string;
    package?: string;
    version?: string;
    branch?: string;
    
    // NEW: Git-specific options
    gitOptions?: {
        shallow?: boolean;           // Use --depth=1 for faster clones
        recursive?: boolean;          // Clone submodules (--recursive)
        tag?: string;                 // Clone specific tag
        commit?: string;              // Clone specific commit hash
        authType?: 'https' | 'ssh';  // Authentication method
    };
    
    // NEW: Timeout configuration
    timeouts?: {
        clone?: number;               // Override default clone timeout
        install?: number;             // Override default install timeout
    };
    
    // NEW: Retry configuration
    retry?: {
        maxAttempts?: number;         // Max retry attempts (default: 3)
        backoffMs?: number;           // Backoff between retries (default: 1000)
    };
}
```

### Example Usage:
```json
{
  "source": {
    "type": "git",
    "url": "https://github.com/skukla/citisignal-nextjs",
    "branch": "master",
    "gitOptions": {
      "shallow": true,
      "recursive": false
    },
    "timeouts": {
      "clone": 180000,
      "install": 600000
    },
    "retry": {
      "maxAttempts": 2
    }
  }
}
```

---

## 2. Configuration-Driven Project Creation Flow

Create a new `projectCreationConfig.json`:

```json
{
  "timeouts": {
    "perComponent": {
      "clone": 120000,
      "install": 300000
    },
    "overall": 1800000,
    "gracePeriod": 30000
  },
  "progressSteps": [
    {
      "id": "setup",
      "label": "Setting Up Project",
      "weight": 15,
      "actions": ["createDirectories", "initializeProject"]
    },
    {
      "id": "components",
      "label": "Installing Components",
      "weight": 60,
      "actions": ["loadDefinitions", "installComponents"]
    },
    {
      "id": "finalize",
      "label": "Finalizing Project",
      "weight": 20,
      "actions": ["generateEnv", "createManifest", "saveState"]
    },
    {
      "id": "complete",
      "label": "Project Created",
      "weight": 5,
      "actions": ["addToWorkspace", "switchToExplorer"]
    }
  ],
  "errorHandling": {
    "strategy": "fail-fast",
    "partialSuccess": false,
    "cleanup": true,
    "logging": "verbose"
  },
  "componentOrder": [
    "backend",
    "dependencies",
    "frontend",
    "appBuilder"
  ]
}
```

---

## 3. Timeout Guardrails Implementation

### A. Overall Project Creation Timeout

```typescript
// In handleCreateProject()
const OVERALL_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const GRACE_PERIOD_MS = 30 * 1000;         // 30 seconds

const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
        reject(new Error(
            'Project creation timed out after 30 minutes. ' +
            'This may indicate a network issue or a very large component. ' +
            'Please check your connection and try again.'
        ));
    }, OVERALL_TIMEOUT_MS);
});

try {
    await Promise.race([
        this.executeProjectCreation(config),
        timeoutPromise
    ]);
} catch (error) {
    // Handle timeout or failure
    await this.cleanupPartialProject(projectPath);
    throw error;
}
```

### B. Per-Component Adaptive Timeouts

```typescript
private calculateTimeout(componentDef: ComponentDefinition): number {
    const baseTimeout = componentDef.source?.timeouts?.clone || 120000;
    
    // Adaptive: increase timeout for larger repos
    if (componentDef.metadata?.estimatedSize === 'large') {
        return baseTimeout * 2;
    }
    
    return baseTimeout;
}
```

### C. Cancellation Support

```typescript
// Add abort controller for cancellation
private abortController: AbortController | null = null;

async handleCreateProject(config: any) {
    this.abortController = new AbortController();
    
    try {
        await this.executeProjectCreation(config, this.abortController.signal);
    } catch (error) {
        if (error.name === 'AbortError') {
            this.logger.info('[Project Creation] Cancelled by user');
            await this.sendMessage('creationCancelled', {});
        }
    }
}

// Allow user to cancel
comm.on('cancel-project-creation', async () => {
    this.abortController?.abort();
    return { success: true };
});
```

---

## 4. Enhanced Progress Reporting

```typescript
interface EnhancedCreationProgress {
    currentOperation: string;
    progress: number;
    message: string;
    logs: string[];
    error?: string;
    
    // NEW: Detailed metrics
    metrics: {
        startTime: Date;
        elapsedMs: number;
        estimatedRemainingMs: number;
        componentsCompleted: number;
        componentsTotal: number;
        currentComponent?: {
            name: string;
            phase: 'cloning' | 'installing' | 'configuring';
            progress: number;
        };
    };
    
    // NEW: Timeout awareness
    timeout: {
        overall: number;
        remaining: number;
        warningThreshold: number; // Show warning at 80%
    };
}
```

---

## 5. Failure Recovery

### Partial Success Handling

```typescript
interface ComponentInstallResult {
    componentId: string;
    success: boolean;
    error?: string;
    partialInstall?: {
        cloneSucceeded: boolean;
        installSucceeded: boolean;
        path?: string;
    };
}

// At end of creation:
const results = await this.installAllComponents(components);
const failed = results.filter(r => !r.success);

if (failed.length > 0) {
    await this.sendMessage('creationPartialSuccess', {
        succeeded: results.filter(r => r.success),
        failed: failed,
        options: {
            retryFailed: true,
            continueWithout: true,
            rollback: true
        }
    });
}
```

---

## Priority Recommendations

### **High Priority (Do Now):**
1. ✅ Add overall project creation timeout (30 minutes)
2. ✅ Add cancellation support (abort controller)
3. ✅ Add shallow clone option to ComponentSource
4. ✅ Add timeout configuration to ComponentSource

### **Medium Priority (Next Sprint):**
1. Make progress steps configuration-driven
2. Add retry configuration
3. Add partial success handling
4. Add estimated time remaining

### **Low Priority (Future):**
1. Add SSH auth support
2. Add submodule support
3. Add tag/commit hash support
4. Adaptive timeout scaling

