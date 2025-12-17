# Step 10: Remove Welcome Screen

## Overview

Delete the legacy Welcome Screen feature entirely and update all fallback references to use `demoBuilder.showProjectsList` instead.

## Test Requirements

### Test File
No new tests needed - this is a deletion step.

### Verification Tests

```bash
# Verify command references are updated
grep -r "showWelcome" src/ --include="*.ts" --include="*.tsx"
# Should return 0 results (except comments/docs)

# Verify import references are removed
grep -r "welcome" src/ --include="*.ts" --include="*.tsx" -l
# Should only return sidebar (context type), not feature imports
```

## Implementation

### Files to Delete

Delete the entire `src/features/welcome/` directory:

```
src/features/welcome/
├── index.ts
├── commands/
│   └── showWelcome.ts
└── ui/
    ├── index.tsx
    ├── WelcomeScreen.tsx
    └── components/
```

### Files to Update

#### 1. extension.ts - Remove Command Registration

**Before:**
```typescript
import { ShowWelcomeCommand } from '@/features/welcome';

// In registerCommands:
context.subscriptions.push(
    vscode.commands.registerCommand('demoBuilder.showWelcome', () =>
        new ShowWelcomeCommand(context).execute()
    )
);
```

**After:**
```typescript
// Remove import and registration entirely
// (command 'demoBuilder.showWelcome' no longer exists)
```

#### 2. package.json - Remove Command Definition

**Before:**
```json
{
  "commands": [
    {
      "command": "demoBuilder.showWelcome",
      "title": "Demo Builder: Show Welcome",
      "category": "Demo Builder"
    }
  ]
}
```

**After:**
```json
{
  "commands": [
    // Remove showWelcome command entirely
  ]
}
```

#### 3. Update Fallback References

Search for any `showWelcome` references and update to `showProjectsList`:

```typescript
// BEFORE (anywhere in codebase):
await vscode.commands.executeCommand('demoBuilder.showWelcome');

// AFTER:
await vscode.commands.executeCommand('demoBuilder.showProjectsList');
```

**Files to check:**
- `src/extension.ts` - Activation fallback
- `src/features/sidebar/handlers/sidebarHandlers.ts` - Navigation fallback
- `src/features/dashboard/handlers/dashboardHandlers.ts` - Close action
- Any error recovery paths

#### 4. webpack.config.js - Remove Entry Point

**Before:**
```javascript
entry: {
    wizard: './src/features/project-creation/ui/wizard/index.tsx',
    welcome: './webview-ui/src/welcome/index.tsx',  // Remove this
    dashboard: './webview-ui/src/dashboard/index.tsx',
    configure: './webview-ui/src/configure/index.tsx',
    projectsList: './src/features/projects-dashboard/ui/index.tsx',
}
```

**After:**
```javascript
entry: {
    wizard: './src/features/project-creation/ui/wizard/index.tsx',
    dashboard: './webview-ui/src/dashboard/index.tsx',
    configure: './webview-ui/src/configure/index.tsx',
    projectsList: './src/features/projects-dashboard/ui/index.tsx',
}
```

#### 5. Delete webview-ui/src/welcome/ (if exists)

If welcome screen has a legacy webview-ui location, delete that too.

## Verification

```bash
# Check for any remaining references
grep -r "welcome" src/ --include="*.ts" --include="*.tsx" | grep -v "WelcomeStep" | grep -v "// "

# Verify build succeeds
npm run compile

# Verify extension activates properly
npm run test:fast -- tests/extension.test.ts

# Test fallback navigation works
npm run test:fast -- tests/features/sidebar/
```

## Acceptance Criteria

- [x] `src/features/welcome/` directory deleted
- [N/A] `webview-ui/src/welcome/` - didn't exist
- [x] Command registration removed from commandManager.ts
- [x] Command definition removed from package.json
- [x] webpack.config.js entry point removed
- [x] All `showWelcome` references updated to `showProjectsList`
- [x] Build succeeds without errors (383 suites, 4169 tests)
- [x] Extension activates and shows Projects Dashboard

## Completion Notes

**Completed:** 2025-12-02
**Files Deleted:** 4 source files + 2 test files
**Files Modified:** 9 files updated to remove Welcome references
**Command Count:** Reduced from 18 to 17 commands

## Rollback Plan

If issues arise:
1. Revert the directory deletion
2. Restore command registration
3. Restore webpack entry point
4. Investigate specific failure before re-attempting

## Notes

- This step has no dependencies - can be done anytime after Projects Dashboard is working
- The Welcome Screen was the original "home screen" before Projects Dashboard replaced it
- Some legacy code paths may still reference it - search thoroughly
- Keep WelcomeStep (wizard step) - only remove Welcome Screen (standalone feature)
