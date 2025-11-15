# Step 1: Fix resolveCommands() to Handle Pre-Substituted Templates

## Purpose

Modify `ProgressUnifier.resolveCommands()` to check if `commandTemplate` contains `{version}` placeholder before requiring `nodeVersion` parameter. This allows pre-substituted templates (e.g., "fnm install 18") to work correctly.

## Prerequisites

- Understand current `resolveCommands()` implementation (lines 207-225 in ProgressUnifier.ts)
- Understand how PrerequisitesManager pre-substitutes versions for dynamic installs

## Tests to Write First

### Test File: `tests/core/utils/ProgressUnifier.test.ts`

**Test Scenarios** (Given-When-Then format):

1. **Pre-substituted template (no placeholder)**
   - Given: commandTemplate = "fnm install 18" (no {version} placeholder)
   - And: nodeVersion is undefined
   - When: resolveCommands() is called
   - Then: Returns ["fnm install 18"]

2. **Template with placeholder + nodeVersion provided**
   - Given: commandTemplate = "fnm install {version}"
   - And: nodeVersion = "20"
   - When: resolveCommands() is called
   - Then: Returns ["fnm install 20"]

3. **Template with placeholder but nodeVersion missing**
   - Given: commandTemplate = "fnm install {version}"
   - And: nodeVersion is undefined
   - When: resolveCommands() is called
   - Then: Returns [] (empty array - can't substitute)

4. **Static commands array (backward compatibility)**
   - Given: step.commands = ["echo test", "npm install"]
   - And: commandTemplate is undefined
   - When: resolveCommands() is called
   - Then: Returns ["echo test", "npm install"]

5. **Empty commandTemplate**
   - Given: commandTemplate = ""
   - And: nodeVersion is undefined
   - When: resolveCommands() is called
   - Then: Returns []

## Implementation Guidance

**File to Modify**: `src/core/utils/ProgressUnifier.ts`

**Method to Fix**: `resolveCommands(step: InstallStep, options?: { nodeVersion?: string }): string[]`

**Current Buggy Code** (lines 207-225):
```typescript
private resolveCommands(step: InstallStep, options?: { nodeVersion?: string }): string[] {
    let commands: string[] = [];
    if (step.commands) {
        commands = step.commands;
    } else if (step.commandTemplate && options?.nodeVersion) {
        // BUG: Requires BOTH commandTemplate AND nodeVersion
        commands = [step.commandTemplate.replace(/{version}/g, options.nodeVersion)];
    }

    // Returns empty array when above conditions fail
    return commands;
}
```

**Fixed Code (Option B)**:
```typescript
private resolveCommands(step: InstallStep, options?: { nodeVersion?: string }): string[] {
    let commands: string[] = [];

    if (step.commands) {
        // Static commands array takes priority
        commands = step.commands;
    } else if (step.commandTemplate) {
        // Check if template still has {version} placeholder
        if (step.commandTemplate.includes('{version}')) {
            // Needs substitution
            if (options?.nodeVersion) {
                commands = [step.commandTemplate.replace(/{version}/g, options.nodeVersion)];
            }
            // else: empty array (can't substitute without nodeVersion)
        } else {
            // Already substituted (e.g., "fnm install 18")
            commands = [step.commandTemplate];
        }
    }

    return commands;
}
```

## Expected Outcome

- All 5 test scenarios pass
- Node.js dynamic installs work correctly (installation starts)
- Backward compatibility maintained (existing uses still work)
- No regressions in test suite

## Acceptance Criteria

- [  ] All new tests pass (5 test scenarios)
- [  ] Existing ProgressUnifier tests still pass
- [  ] Code follows KISS principle (simple if/else logic)
- [  ] Both pre-substituted and placeholder templates supported

## Files to Create/Modify

**Create**:
- `tests/core/utils/ProgressUnifier.test.ts` (if doesn't exist)

**Modify**:
- `src/core/utils/ProgressUnifier.ts` (resolveCommands method, lines 207-225)

## Dependencies from Other Steps

None (single-step fix)
