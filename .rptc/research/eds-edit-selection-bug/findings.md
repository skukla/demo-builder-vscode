# Research: EDS Project Edit Mode - selectedPackage/selectedStack Not Pre-Selected

## Executive Summary

**Bug**: When editing an EDS project, `selectedPackage` and `selectedStack` are not pre-selected in the WelcomeStep.

**Root Cause Hypothesis**: The data flow is correct, but verification needed at each checkpoint to identify where values are lost.

---

## Data Flow Analysis

### 1. Project Creation (Write Path)

| Step | File:Line | Code | Status |
|------|-----------|------|--------|
| Wizard builds config | `wizardHelpers.ts:674-675` | `selectedPackage: wizardState.selectedPackage` | ✓ Correct |
| Executor receives config | `executor.ts:152` | `const typedConfig = config as ProjectCreationConfig` | ✓ Correct |
| Project object created | `executor.ts:233-234` | `selectedPackage: typedConfig.selectedPackage` | ✓ Correct |
| **EDS-specific early save** | `executor.ts:399` | `await context.stateManager.saveProject(project)` | ⚠️ CHECKPOINT 1 |
| Final save | `executor.ts:682` | `await finalizeProject(...)` | ⚠️ CHECKPOINT 2 |

### 2. Manifest Writer

| Step | File:Line | Code | Status |
|------|-----------|------|--------|
| Write to manifest | `projectConfigWriter.ts:116-118` | `selectedPackage: project.selectedPackage` | ✓ Correct |

### 3. Project Loading (Read Path)

| Step | File:Line | Code | Status |
|------|-----------|------|--------|
| Read manifest | `projectFileLoader.ts:82-84` | `selectedPackage: manifest.selectedPackage` | ✓ Correct |

### 4. Edit Flow

| Step | File:Line | Code | Status |
|------|-----------|------|--------|
| Load project | `dashboardHandlers.ts:375` | `loadProjectFromPath(payload.projectPath)` | ⚠️ CHECKPOINT 3 |
| Extract settings | `settingsSerializer.ts:125-127` | `selectedPackage: project.selectedPackage` | ✓ Correct |
| Debug logging | `dashboardHandlers.ts:388-389` | Logs both values | 🔍 CHECK OUTPUT |
| Initialize wizard | `useWizardState.ts:136-138` | `selectedPackage: editSettings.selectedPackage` | ✓ Correct |

---

## Key Checkpoints to Verify

### Checkpoint 1: EDS Early Save (executor.ts:399)

The EDS-specific save happens AFTER project object creation, so values SHOULD be present.

**To verify**: Add logging before line 399:
```typescript
context.logger.debug(`[EDS Save] Before early save: selectedPackage=${project.selectedPackage}, selectedStack=${project.selectedStack}`);
```

### Checkpoint 2: Final Save (executor.ts:682)

The final save via `finalizeProject()` should overwrite any previous manifest.

**To verify**: Check `projectFinalizationService.ts` for any field filtering.

### Checkpoint 3: Manifest Contents

The actual `.demo-builder.json` file should have these fields.

**To verify**: After creating an EDS project, check:
```bash
cat ~/.demo-builder/projects/<project-name>/.demo-builder.json | jq '.selectedPackage, .selectedStack'
```

### Checkpoint 4: Debug Output (dashboardHandlers.ts:388-389)

Existing debug logging should show the values:
```typescript
context.logger.info(`[Edit Debug] selectedPackage: ${project.selectedPackage}, selectedStack: ${project.selectedStack}`);
```

**To verify**: Check "Demo Builder: Logs" output channel when clicking Edit.

---

## Code Bug Found: Undefined Variable Reference

**Location**: `executor.ts:418`

```typescript
// Line 404-424 (BEFORE componentDefinitions is declared)
if (isEdsStack && edsComponentPath && ...) {
    ...
    componentDefinitions.set(COMPONENT_IDS.EDS_STOREFRONT, {...});  // Line 418
}

// Line 441 (WHERE componentDefinitions is declared)
const componentDefinitions = await loadComponentDefinitions(...);
```

This is a reference to `componentDefinitions` BEFORE it's declared. This would cause a ReferenceError if the code path executed. However, this may be dead code that never runs, or the error is being swallowed.

---

## Recommended Investigation Steps

1. **Check the manifest file directly**:
   ```bash
   cat ~/.demo-builder/projects/<eds-project>/.demo-builder.json | jq '{selectedPackage, selectedStack}'
   ```
   - If empty/missing: Bug is in project creation save
   - If present: Bug is in edit flow loading

2. **Check Debug Channel**:
   When clicking Edit, look for:
   ```
   [Edit Debug] selectedPackage: ..., selectedStack: ...
   ```
   - If undefined: Project load is the issue
   - If present but wizard empty: Wizard state initialization issue

3. **Add diagnostic logging** at executor.ts:399 (before EDS early save)

4. **Fix the undefined variable reference** at executor.ts:418 (move code block after line 441)

---

## Files Summary

| File | Purpose | Lines of Interest |
|------|---------|-------------------|
| `executor.ts` | Project creation orchestration | 233-234, 399, 418, 441, 682 |
| `projectConfigWriter.ts` | Manifest writer | 116-118 |
| `projectFileLoader.ts` | Manifest reader | 82-84 |
| `dashboardHandlers.ts` | Edit flow handler | 375, 385, 388-389 |
| `settingsSerializer.ts` | Settings extraction | 125-127 |
| `useWizardState.ts` | Wizard state initialization | 136-138 |
| `wizardHelpers.ts` | Config builder | 674-675 |

---

## Next Steps

1. Check actual manifest file contents
2. Check debug output when clicking Edit
3. Add logging to EDS save point if needed
4. Fix the undefined variable reference bug
