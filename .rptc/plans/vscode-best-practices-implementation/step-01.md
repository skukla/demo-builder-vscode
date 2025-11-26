# Step 1: Optimize Activation Events

## Objective

Remove `onStartupFinished` from activation events to prevent eager extension activation on every VS Code startup.

## Current State

```json
// package.json:29-32
"activationEvents": [
    "onStartupFinished",      // <- Activates on EVERY VS Code startup
    "workspaceContains:.demo-builder"
]
```

**Problem:** Extension activates for all users on every VS Code launch, even when they're not working on Demo Builder projects.

## Target State

```json
"activationEvents": [
    "workspaceContains:.demo-builder"
]
```

**Benefit:** Extension only activates when:
1. Opening a folder containing `.demo-builder` directory, OR
2. Running a `demoBuilder.*` command (automatic activation via `contributes.commands`)

## Implementation

### File Changes

**package.json** (1 change):
```diff
  "activationEvents": [
-   "onStartupFinished",
    "workspaceContains:.demo-builder"
  ],
```

## Testing Strategy

### Manual Tests (Required)

1. **Existing Project Test**
   - Open VS Code with a folder containing `.demo-builder` directory
   - Verify extension activates (status bar appears)
   - Verify all commands work

2. **No Project Test**
   - Open VS Code with an unrelated folder (no `.demo-builder`)
   - Verify extension does NOT activate (check Extension Host output)
   - Verify activating via command palette still works

3. **Command Activation Test**
   - Open VS Code with unrelated folder
   - Run `Demo Builder: Create Project` from command palette
   - Verify extension activates and command executes

4. **Fresh VS Code Test**
   - Close all VS Code windows
   - Open VS Code fresh (no folder)
   - Verify extension does NOT activate
   - Open a Demo Builder project folder
   - Verify extension activates

### Automated Tests

No new automated tests needed - this is a configuration change. Focus on manual verification.

## Rollback Plan

If issues discovered, restore `onStartupFinished`:
```json
"activationEvents": [
    "onStartupFinished",
    "workspaceContains:.demo-builder"
]
```

## Acceptance Criteria

- [ ] `onStartupFinished` removed from package.json
- [ ] Extension activates when opening folder with `.demo-builder`
- [ ] Extension activates when running any `demoBuilder.*` command
- [ ] Extension does NOT activate when opening unrelated folders
- [ ] All existing functionality preserved

## Risk Assessment

**Risk Level:** LOW

**Rationale:**
- Simple one-line change
- VS Code handles `onCommand:` activation automatically
- Easy to rollback
- Well-documented VS Code behavior

## Dependencies

None - this step is independent.

## Estimated Effort

~15 minutes (mostly testing)
