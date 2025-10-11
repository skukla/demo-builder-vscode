# Backend Call on Continue Pattern

## Overview

The "Backend Call on Continue" pattern is the standard UX pattern for all selection steps in the Demo Builder wizard. This pattern provides instant UI feedback while maintaining reliable backend synchronization and clear error handling at the commitment point.

## Problem Statement

Originally, the extension used immediate backend calls when users made selections (e.g., clicking a project). This created several issues:

1. **Slow UI Response**: Users had to wait for backend operations to complete before seeing visual feedback
2. **Unclear Error Timing**: Errors could occur at unexpected moments during interaction
3. **Complex State Management**: Background operations required tracking multiple loading states
4. **Poor UX for Exploration**: Users couldn't quickly browse options without triggering slow operations

## Solution: Backend Call on Continue

The pattern separates **UI updates** from **backend operations**:

### 1. Selection Phase - UI Only
When users make selections (click project, workspace, etc.):
- **Immediate visual feedback** (selection highlighting, state update)
- **No backend calls** - purely UI state changes
- **Fast and responsive** interaction

### 2. Commitment Phase - Backend Call
When users click "Continue":
- **Backend operations execute** with the selected choices
- **Loading overlay shown** during operations
- **Clear error handling** at the commitment point
- **Success leads to next step**

## Implementation Pattern

### Step Component Pattern

```typescript
// UI-only selection handler
const selectProject = (project: Project) => {
    // Update UI state immediately - no backend call
    updateState({
        adobeProject: {
            id: project.id,
            name: project.name,
            title: project.title,
            description: project.description
        }
    });
};

// In ListView - immediate selection feedback
<ListView
    items={projects}
    selectedKeys={state.adobeProject?.id ? [state.adobeProject.id] : []}
    onSelectionChange={(keys) => {
        const projectId = Array.from(keys)[0] as string;
        const project = projects.find(p => p.id === projectId);
        if (project) {
            selectProject(project); // UI-only, immediate
        }
    }}
/>
```

### Wizard Container Pattern

```typescript
// In WizardContainer.tsx - backend call on Continue
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

        if (state.currentStep === 'adobe-workspace' && state.adobeWorkspace?.id) {
            const result = await vscode.request('select-workspace', {
                workspaceId: state.adobeWorkspace.id
            });
            if (!result.success) {
                throw new Error(result.error || 'Failed to select workspace');
            }
        }

        setIsConfirmingSelection(false);
        goToStep(nextStep.id);

    } catch (error) {
        setIsConfirmingSelection(false);
        setFeedback({
            type: 'error',
            message: error instanceof Error ? error.message : 'Failed to proceed.'
        });
    }
};
```

### Loading Overlay Pattern

```typescript
// Clean loading overlay without verbose text
{isConfirmingSelection && (
    <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
    }}>
        <div style={{
            backgroundColor: 'var(--spectrum-global-color-gray-50)',
            padding: '24px',
            borderRadius: '50%',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            {/* Simple spinner - no text */}
            <div className="spinner"></div>
        </div>
    </div>
)}
```

## Benefits

### 1. Instant Feedback
- Clicking selections gives immediate visual response
- No waiting for backend operations during exploration
- Natural, responsive interaction pattern

### 2. Clear Commitment Point
- Continue button is the clear confirmation moment
- Users understand when backend operations will occur
- Clear distinction between browsing and committing

### 3. Resilient Error Handling
- Errors happen at expected moments (Continue click)
- Users can retry or go back easily
- No background failures during interaction

### 4. Simple State Management
- No complex tracking of background operations
- UI state and backend state clearly separated
- Loading states are simple and predictable

### 5. Consistent UX
- Same pattern across all selection steps
- Predictable behavior for users
- Easy to implement new selection steps

## Layout Standardization

All selection steps use the same layout pattern:

```typescript
<div style={{ display: 'flex', height: '100%', width: '100%', gap: '0' }}>
    {/* Left: Selection Content - constrained to 800px */}
    <div style={{
        maxWidth: '800px',
        width: '100%',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column'
    }}>
        {/* Selection UI (ListView, etc.) */}
    </div>

    {/* Right: Configuration Summary - flexible */}
    <div style={{
        flex: '1',
        padding: '24px',
        backgroundColor: 'var(--spectrum-global-color-gray-75)',
        borderLeft: '1px solid var(--spectrum-global-color-gray-200)'
    }}>
        <ConfigurationSummary state={state} />
    </div>
</div>
```

## Button State Management

During backend operations:

```typescript
// Disable all navigation buttons
<Button
    variant="secondary"
    onPress={goBack}
    isDisabled={isConfirmingSelection}
>
    Back
</Button>

<Button
    variant="accent"
    onPress={goNext}
    isDisabled={!canProceed || isConfirmingSelection}
>
    {isConfirmingSelection
        ? 'Continue'  // Keep same text during loading
        : (isLastStep ? 'Create Project' : 'Continue')
    }
</Button>
```

## Implementation Checklist

When implementing a new selection step:

- [ ] UI-only selection handlers (no backend calls)
- [ ] State updates use `updateState()` pattern
- [ ] Backend calls happen in `WizardContainer.goNext()`
- [ ] Loading overlay during backend operations
- [ ] All buttons disabled during loading
- [ ] Error handling at commitment point
- [ ] Layout follows 800px/flex pattern
- [ ] Configuration summary in right panel

## Migration Guide

For existing steps using immediate backend calls:

### 1. Extract Backend Logic
Move backend calls from selection handlers to wizard container:

```typescript
// Before: Immediate backend call
const selectProject = async (project: Project) => {
    setIsLoading(true);
    try {
        await vscode.request('select-project', { projectId: project.id });
        updateState({ adobeProject: project });
    } catch (error) {
        // Handle error
    }
    setIsLoading(false);
};

// After: UI-only selection
const selectProject = (project: Project) => {
    updateState({
        adobeProject: {
            id: project.id,
            name: project.name,
            title: project.title
        }
    });
};
```

### 2. Add Backend Call to Continue
In `WizardContainer.goNext()`:

```typescript
if (state.currentStep === 'your-step' && state.yourSelection?.id) {
    const result = await vscode.request('your-backend-action', {
        selectionId: state.yourSelection.id
    });
    if (!result.success) {
        throw new Error(result.error || 'Operation failed');
    }
}
```

### 3. Update Button States
Ensure buttons use `isConfirmingSelection`:

```typescript
isDisabled={!canProceed || isConfirmingSelection}
```

## Related Patterns

- **Loading States**: Use overlay pattern for backend operations
- **Error Handling**: Centralized at commitment points
- **State Management**: Clear separation of UI and backend state
- **Layout Consistency**: Standard 800px/flex pattern

## Version History

- **v1.5.0**: Initial implementation for project and workspace selection
- **Future**: Extend to component selection and configuration steps