# VS Code Best Practices Implementation - Step Index

## Plan Overview

| Step | Title | Risk | Effort | Dependencies |
|------|-------|------|--------|--------------|
| 1 | [Optimize Activation Events](step-01.md) | Low | 15 min | None |
| 2 | [Add Memento for Transient State](step-02.md) | Low | 1-2 hrs | None |
| 3 | [Upgrade to LogOutputChannel API](step-03.md) | Medium | 3-4 hrs | PM Approval |
| 4 | [Integrate execa for Subprocess](step-04.md) | Medium | 4-6 hrs | None |

## Recommended Execution Order

### Phase 1: Quick Wins (Parallel)

Steps 1 and 2 can be done in parallel - they have no dependencies:

```
┌─────────────────────┐     ┌─────────────────────┐
│ Step 1: Activation  │     │ Step 2: Memento     │
│ (~15 min)           │     │ (~1-2 hrs)          │
└─────────────────────┘     └─────────────────────┘
```

### Phase 2: Infrastructure Upgrades

Step 3 requires PM approval for version bump:

```
                    PM Approval
                         │
                         ▼
            ┌─────────────────────────┐
            │ Step 3: LogOutputChannel │
            │ (~3-4 hrs)               │
            └─────────────────────────┘
```

### Phase 3: Subprocess Modernization

Step 4 can run independently:

```
┌─────────────────────────┐
│ Step 4: execa           │
│ (~4-6 hrs)              │
└─────────────────────────┘
```

## Total Estimated Effort

| Phase | Steps | Time |
|-------|-------|------|
| Quick Wins | 1, 2 | ~2 hours |
| Infrastructure | 3 | ~4 hours |
| Subprocess | 4 | ~5 hours |
| **Total** | | **~11 hours** |

## PM Decision Points

### Required Before Step 3

✅ **APPROVED** (2025-11-25)

Bumping minimum VS Code version from 1.74.0 to 1.84.0 is approved.

- VS Code 1.84 released October 2023 (2+ years ago)
- Required for LogOutputChannel API
- ~98%+ of active users already on 1.84+

## Success Metrics

After implementation:

1. **Activation Events** ✅
   - Measure: Extension activation time in unrelated projects
   - Target: 0ms (not activated)

2. **Memento** ✅
   - Measure: Notification suppression works correctly
   - Target: 100% of dismissed notifications stay dismissed

3. **LogOutputChannel** ✅
   - Measure: Users can change log level via VS Code command
   - Target: Log filtering works as expected
   - **Result**: Dual-channel architecture (User Logs + Debug Logs), 53 tests passing

4. **execa**
   - Measure: All existing tests pass
   - Target: 100% test pass rate

## Rollback Strategy

Each step has independent rollback:

| Step | Rollback Action |
|------|-----------------|
| 1 | Restore `onStartupFinished` to package.json |
| 2 | Delete TransientStateManager (no breaking changes) |
| 3 | Revert to OutputChannel, restore VS Code version |
| 4 | Revert to child_process.spawn |

## Files Summary

### Step 1: Activation Events
- `package.json` (modify)

### Step 2: Memento
- `src/core/state/transientStateManager.ts` (new)
- `src/core/state/index.ts` (modify)
- `src/extension.ts` (modify)
- `tests/core/state/transientStateManager.test.ts` (new)

### Step 3: LogOutputChannel
- `package.json` (modify - version bump)
- `src/core/logging/debugLogger.ts` (major refactor)
- `src/features/dashboard/ui/ProjectDashboardScreen.tsx` (modify)
- `src/features/dashboard/handlers/dashboardHandlers.ts` (modify)
- `tests/core/logging/debugLogger.test.ts` (update)

### Step 4: execa
- `package.json` (modify - add dependency)
- `src/core/shell/commandExecutor.ts` (major refactor)
- `src/core/shell/processCleanup.ts` (modify)
- `src/core/shell/types.ts` (modify)
- `tests/core/shell/commandExecutor.test.ts` (update)

## Related Documentation

- [VS Code Best Practices Audit](../../research/vscode-best-practices-audit-2025-11-25/research.md)
- [VS Code Activation Events](https://code.visualstudio.com/api/references/activation-events)
- [VS Code LogOutputChannel API](https://code.visualstudio.com/api/references/vscode-api#LogOutputChannel)
- [VS Code Memento API](https://code.visualstudio.com/api/references/vscode-api#Memento)
- [execa Documentation](https://github.com/sindresorhus/execa)
