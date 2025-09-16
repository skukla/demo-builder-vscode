# State Management Patterns

## Overview

The Demo Builder extension uses multiple state management approaches depending on the context and requirements. This document outlines the patterns and best practices for managing state across different components of the system.

## State Types and Scope

### 1. Extension Global State
**Scope**: Persists across VS Code sessions
**Location**: `vscode.ExtensionContext.globalState`
**Manager**: `StateManager` class

```typescript
// Persistent state keys
const STATE_KEYS = {
    WIZARD_LAST_STATE: 'wizard.lastState',
    USER_PREFERENCES: 'user.preferences',
    PREREQUISITES_STATUS: 'prerequisites.status',
    RECENT_PROJECTS: 'projects.recent',
    ADOBE_AUTH_CACHE: 'adobe.authCache'
};

// Usage
const stateManager = new StateManager(context);
await stateManager.set(STATE_KEYS.USER_PREFERENCES, preferences);
const lastState = await stateManager.get(STATE_KEYS.WIZARD_LAST_STATE);
```

### 2. Webview Local State
**Scope**: React component lifecycle
**Location**: React hooks (`useState`, `useReducer`)
**Manager**: React state management

```typescript
// Local component state
const [state, setState] = useState<WizardState>({
    currentStep: 'welcome',
    projectName: '',
    projectTemplate: 'commerce-paas',
    componentConfigs: {},
    adobeAuth: {
        isAuthenticated: undefined,
        isChecking: false
    }
});

// Update patterns
const updateState = useCallback((updates: Partial<WizardState>) => {
    setState(prev => ({ ...prev, ...updates }));
}, []);
```

### 3. Message State Sync
**Scope**: Between extension and webview
**Location**: Message protocol
**Manager**: `WebviewCommunicationManager`

## State Management Patterns

### 1. Backend Call on Continue Pattern

**Key Principle**: UI state and backend state are managed separately

#### UI State Updates (Immediate)
```typescript
// Selection handlers - UI only
const selectProject = (project: Project) => {
    // Immediate UI update - no backend call
    updateState({
        adobeProject: {
            id: project.id,
            name: project.name,
            title: project.title,
            description: project.description
        },
        // Clear dependent state when parent changes
        adobeWorkspace: undefined
    });
};
```

#### Backend State Sync (On Continue)
```typescript
// In WizardContainer.goNext() - backend call
const goNext = async () => {
    try {
        setIsConfirmingSelection(true);

        // Backend operations based on current step
        if (state.currentStep === 'adobe-project' && state.adobeProject?.id) {
            const result = await vscode.request('select-project', {
                projectId: state.adobeProject.id
            });
            if (!result.success) {
                throw new Error(result.error || 'Failed to select project');
            }
        }

        // State is now synchronized
        goToStep(nextStep.id);
    } catch (error) {
        setIsConfirmingSelection(false);
        // Handle error without corrupting state
    }
};
```

### 2. Dependent State Management

**Pattern**: Clear dependent state when parent selections change

```typescript
// When project changes, clear workspace
const selectProject = (project: Project) => {
    updateState({
        adobeProject: project,
        adobeWorkspace: undefined,  // Clear dependent state
        // Could also clear deeper dependencies
        componentConfigs: project.template !== state.projectTemplate
            ? {}
            : state.componentConfigs
    });
};

// When components change, recalculate prerequisites
const updateComponents = (components: ComponentSelection) => {
    updateState({
        components,
        // Recalculate based on new selection
        requiredPrerequisites: getRequiredPrerequisites(components)
    });
};
```

### 3. State Validation Pattern

**Ensure state consistency at critical points**

```typescript
// Validate state before proceeding
const canProceed = useMemo(() => {
    switch (state.currentStep) {
        case 'welcome':
            return !!(state.projectName && state.projectTemplate);

        case 'component-selection':
            return !!state.components && validateComponentSelection(state.components);

        case 'adobe-project':
            return !!(state.adobeProject?.id);

        case 'adobe-workspace':
            return !!(state.adobeWorkspace?.id);

        default:
            return true;
    }
}, [state.currentStep, state.projectName, state.projectTemplate,
        state.components, state.adobeProject, state.adobeWorkspace]);

// Use in UI
<Button
    variant="accent"
    onPress={goNext}
    isDisabled={!canProceed || isConfirmingSelection}
>
    Continue
</Button>
```

### 4. Loading State Pattern

**Separate loading states for different operations**

```typescript
// Multiple loading states for different purposes
const [isLoadingProjects, setIsLoadingProjects] = useState(false);
const [isConfirmingSelection, setIsConfirmingSelection] = useState(false);
const [isTransitioning, setIsTransitioning] = useState(false);

// Usage patterns
// Data loading (show spinner in content area)
if (isLoadingProjects) {
    return <LoadingDisplay message="Loading projects..." />;
}

// Backend confirmation (show overlay)
{isConfirmingSelection && (
    <div className="loading-overlay">
        <div className="spinner" />
    </div>
)}

// UI transition (temporary, no visible indicator)
if (isTransitioning) {
    // Content temporarily hidden during animation
}
```

### 5. Error State Pattern

**Centralized error handling with recovery options**

```typescript
const [error, setError] = useState<string | null>(null);
const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);

// Error handling
const handleError = (operation: string, error: Error) => {
    const userMessage = getUserFriendlyError(error);

    setFeedback({
        type: 'error',
        message: userMessage,
        action: {
            label: 'Retry',
            handler: () => retryOperation(operation)
        }
    });

    // Also log for debugging
    logger.error(`${operation} failed`, error);
};

// Recovery patterns
const retryOperation = async (operation: string) => {
    setFeedback(null);
    setError(null);

    try {
        await performOperation(operation);
    } catch (error) {
        handleError(operation, error);
    }
};
```

## State Persistence Patterns

### 1. Auto-Save Pattern
```typescript
// Auto-save wizard state on changes
useEffect(() => {
    const saveState = debounce(async () => {
        await stateManager.set(STATE_KEYS.WIZARD_LAST_STATE, {
            ...state,
            timestamp: Date.now()
        });
    }, 1000);

    saveState();
}, [state]);

// Restore on initialization
useEffect(() => {
    const restoreState = async () => {
        const saved = await stateManager.get(STATE_KEYS.WIZARD_LAST_STATE);
        if (saved && isRecent(saved.timestamp)) {
            setState(prev => ({ ...prev, ...saved }));
        }
    };

    restoreState();
}, []);
```

### 2. Selective Persistence
```typescript
// Only persist certain parts of state
const persistableState = {
    projectName: state.projectName,
    projectTemplate: state.projectTemplate,
    components: state.components,
    // Don't persist authentication state (security)
    // Don't persist temporary UI state
};

await stateManager.set(STATE_KEYS.WIZARD_CONFIG, persistableState);
```

## Message-Based State Sync

### 1. Request-Response Pattern
```typescript
// Extension side
comm.on('get-projects', async (payload) => {
    const projects = await this.adobeAuth.getProjects(payload.orgId);
    return { projects, timestamp: Date.now() };
});

// Webview side
const loadProjects = async () => {
    const result = await vscode.request('get-projects', { orgId });
    setProjects(result.projects);
};
```

### 2. State Broadcast Pattern
```typescript
// Extension broadcasts state changes
const updateAdobeAuth = async (authState: AdobeAuthState) => {
    await stateManager.set(STATE_KEYS.ADOBE_AUTH, authState);

    // Broadcast to all interested webviews
    this.communicationManager.broadcast('adobe-auth-updated', authState);
};

// Webviews listen for broadcasts
useEffect(() => {
    const unsubscribe = vscode.onMessage('adobe-auth-updated', (authState) => {
        updateState({ adobeAuth: authState });
    });

    return unsubscribe;
}, []);
```

## State Shape Definitions

### Core Wizard State
```typescript
interface WizardState {
    // Navigation
    currentStep: WizardStep;

    // Project Configuration
    projectName: string;
    projectTemplate: string;
    components?: ComponentSelection;
    componentConfigs: Record<string, any>;

    // Adobe Integration
    adobeAuth: AdobeAuthState;
    adobeOrg?: AdobeOrg;
    adobeProject?: AdobeProject;
    adobeWorkspace?: AdobeWorkspace;

    // Creation Process
    creationProgress?: CreationProgress;
}

interface AdobeAuthState {
    isAuthenticated?: boolean;  // undefined = unknown, true/false = known
    isChecking: boolean;
    organizations?: AdobeOrg[];
    error?: string;
}
```

## Best Practices

### 1. State Immutability
```typescript
// ✅ Correct - immutable updates
const updateState = (updates: Partial<WizardState>) => {
    setState(prev => ({ ...prev, ...updates }));
};

// ❌ Incorrect - direct mutation
const updateStateBad = (updates: Partial<WizardState>) => {
    Object.assign(state, updates);  // Mutates state directly
};
```

### 2. Derived State with useMemo
```typescript
// Compute expensive derived state only when dependencies change
const requiredPrerequisites = useMemo(() => {
    if (!state.components) return [];

    return getRequiredPrerequisites(state.components);
}, [state.components]);

const isStepComplete = useMemo(() => {
    return validateStepCompletion(state.currentStep, state);
}, [state.currentStep, state]);
```

### 3. State Reset Patterns
```typescript
// Reset state when starting new project
const startNewProject = () => {
    setState({
        currentStep: 'welcome',
        projectName: '',
        projectTemplate: 'commerce-paas',
        componentConfigs: {},
        // Keep authentication state
        adobeAuth: state.adobeAuth,
        adobeOrg: state.adobeOrg
    });
};

// Partial reset when backing out of selection
const resetToStep = (targetStep: WizardStep) => {
    const resetState = { ...state };

    // Reset subsequent steps
    if (stepIndex(targetStep) <= stepIndex('adobe-project')) {
        resetState.adobeProject = undefined;
        resetState.adobeWorkspace = undefined;
    }

    setState(resetState);
};
```

### 4. Error Recovery
```typescript
// Graceful degradation when state is invalid
const safeGetState = <T>(key: string, defaultValue: T, validator?: (value: any) => boolean): T => {
    try {
        const value = stateManager.get(key);
        if (validator && !validator(value)) {
            return defaultValue;
        }
        return value || defaultValue;
    } catch (error) {
        logger.warn(`Failed to get state for ${key}, using default`);
        return defaultValue;
    }
};
```

## Common Pitfalls

### 1. Race Conditions
```typescript
// ❌ Problem - multiple async updates
const loadData = async () => {
    setIsLoading(true);
    const projects = await getProjects();
    setProjects(projects);
    setIsLoading(false);  // Might happen after component unmounts
};

// ✅ Solution - cleanup and cancellation
const loadData = async () => {
    setIsLoading(true);
    let isCancelled = false;

    try {
        const projects = await getProjects();
        if (!isCancelled) {
            setProjects(projects);
        }
    } finally {
        if (!isCancelled) {
            setIsLoading(false);
        }
    }

    return () => { isCancelled = true; };
};
```

### 2. State Synchronization Issues
```typescript
// ❌ Problem - UI and backend state drift
const selectProject = async (project) => {
    updateState({ selectedProject: project });  // UI updated
    await selectProjectBackend(project.id);     // Backend might fail
};

// ✅ Solution - Backend Call on Continue pattern
const selectProject = (project) => {
    updateState({ selectedProject: project });  // UI only
    // Backend call happens in goNext()
};
```

### 3. Memory Leaks
```typescript
// ✅ Always cleanup subscriptions
useEffect(() => {
    const unsubscribe = vscode.onMessage('update', handleUpdate);
    return unsubscribe;  // Cleanup
}, []);

// ✅ Cancel pending operations
useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
        const data = await fetchData();
        if (!cancelled) {
            setData(data);
        }
    };

    loadData();
    return () => { cancelled = true; };
}, []);
```