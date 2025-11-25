# Step 12: Fix Async .then() Patterns

## Purpose

Replace fire-and-forget `.then()` patterns with proper `async/await` for error propagation and sequencing.

## Analysis

**Original plan scope:** 4-6 hours, 6+ files
**Actual scope:** ~1 hour, 2 files (5 patterns)

After analysis, most `.then()` patterns in the codebase are either:
1. **Intentionally background** (inside `setTimeout`, for non-blocking startup)
2. **Properly error-handled** (with error handlers or `.catch()`)
3. **Acceptable patterns** (file existence checks, UI callbacks)

**Only 5 patterns need fixing** - all are fire-and-forget command executions without error handling.

## Patterns to Fix

### File 1: `src/commands/configure.ts`

**Location 1: Lines 100-109** (toggle inspector)
```typescript
// BEFORE: Fire-and-forget with no error handling
await vscode.window.showInformationMessage(...).then(selection => {
    if (selection === 'Restart Now') {
        vscode.commands.executeCommand('demoBuilder.stopDemo').then(() => {
            vscode.commands.executeCommand('demoBuilder.startDemo');
        });
    }
});

// AFTER: Proper async/await with error handling
const selection = await vscode.window.showInformationMessage(
    'Restart the demo to apply changes',
    'Restart Now',
);
if (selection === 'Restart Now') {
    try {
        await vscode.commands.executeCommand('demoBuilder.stopDemo');
        await vscode.commands.executeCommand('demoBuilder.startDemo');
    } catch (error) {
        await this.showError(`Failed to restart demo: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
```

**Location 2: Lines 148-159** (change port)
Same pattern - fix identically.

### File 2: `src/features/dashboard/commands/configure.ts`

**Location 1: Lines 207-213** (mesh config changed, demo running)
```typescript
// BEFORE
.then(async selection => {
    if (selection === 'Redeploy Mesh') {
        vscode.commands.executeCommand('demoBuilder.deployMesh');
    }
});

// AFTER
const selection = await vscode.window.showInformationMessage(...);
if (selection === 'Redeploy Mesh') {
    try {
        await vscode.commands.executeCommand('demoBuilder.deployMesh');
    } catch (error) {
        // Error logged by deployMesh command
    }
}
```

**Location 2: Lines 233-239** (mesh config changed, demo stopped)
Same pattern.

**Location 3: Lines 258-266** (restart demo after config save)
Same stop/start pattern as configure.ts.

## Patterns NOT Fixed (Intentional)

### extension.ts (3 patterns)

All are inside `setTimeout` for non-blocking startup and have error handlers:

```typescript
// ACCEPTABLE: Background task with error handling
setTimeout(() => {
    vscode.commands.executeCommand('demoBuilder.showProjectDashboard').then(
        () => logger.debug('...'),
        (err) => logger.error('...', err),  // ← Error IS handled
    );
}, 500);
```

**Why not change:**
- Can't `await` inside `setTimeout` callback
- Errors ARE logged
- Intentionally non-blocking for fast startup
- Low-risk operations (show UI)

### Other files

- `errorLogger.ts` - UI callback, non-critical
- `fileWatcher.ts` - Inside promise chain with `.catch(reject)`
- `executor.ts` - File existence check pattern (returns boolean)
- `authenticationService.ts` - Initialization chain (awaited)

## Files Modified

- [x] `src/commands/configure.ts` (2 patterns) - Fixed
- [x] `src/features/dashboard/commands/configure.ts` (3 patterns) - Fixed

## Tests

Since these are UI notification patterns that trigger other commands:
- Existing tests for stopDemo, startDemo, deployMesh cover the commands themselves
- Visual verification that restart/redeploy flows work

## Acceptance Criteria

- [x] All 5 fire-and-forget patterns converted to async/await
- [x] Error handling added for command failures
- [x] No TypeScript errors
- [ ] Manual verification: restart demo after config change works (optional)

## Estimated Time

**~1 hour** (reduced from 4-6 hours)

- Analysis: 15 minutes (done)
- Implementation: 30 minutes
- Manual verification: 15 minutes

---

**Next Step:** Step 13 - Migrate componentUpdater.ts Deletion Pattern
