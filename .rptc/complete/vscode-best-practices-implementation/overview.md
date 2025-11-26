# VS Code Best Practices Implementation

## Executive Summary

Implement 4 VS Code best practice improvements identified in the 2025-11-25 audit:

1. **Activation Events** - Remove `onStartupFinished` for faster cold startup
2. **Memento API** - Add VS Code's native transient state storage
3. **LogOutputChannel API** - Upgrade to native logging with severity levels
4. **execa** - Modern subprocess execution for cleaner command handling

## Motivation

The [VS Code Best Practices Audit](.rptc/research/vscode-best-practices-audit-2025-11-25/research.md) identified these as HIGH and MEDIUM priority improvements:

| Item | Priority | Impact |
|------|----------|--------|
| Activation Events | HIGH | 50-90% faster cold startup |
| LogOutputChannel | HIGH | Native severity filtering, user-configurable |
| Memento | MEDIUM | Proper transient state, cross-machine sync |
| execa | MEDIUM | Cleaner subprocess API, built-in timeout |

## Current State

### Activation Events (package.json:29-32)
```json
"activationEvents": [
    "onStartupFinished",  // <- Activates on EVERY VS Code startup
    "workspaceContains:.demo-builder"
]
```

### Logging (debugLogger.ts)
- Custom dual-channel system with manual timestamps
- No native severity filtering
- Users cannot change log levels via VS Code

### State Management (stateManager.ts)
- File-based only (`~/.demo-builder/state.json`)
- No transient state storage (session flags, notification suppression)
- No cross-machine sync capability

### Command Execution (commandExecutor.ts)
- Direct `child_process.spawn` usage
- Custom timeout and retry logic
- Working but verbose

## Proposed Changes

### Step 1: Activation Events (Low Risk)
Remove `onStartupFinished`, rely on:
- `workspaceContains:.demo-builder` - Existing projects
- `onCommand:demoBuilder.*` - Manual invocation (automatic in VS Code)

### Step 2: Memento for Transient State (Low Risk, Additive)
Add new `TransientStateManager` using VS Code's `globalState`:
- "Don't show again" notification flags
- Session-specific cache (dashboard preferences)
- Keys marked for sync across machines

### Step 3: LogOutputChannel Upgrade (Medium Risk)
**Requires:** Bump minimum VS Code version 1.74.0 → 1.84.0

Upgrade to `createOutputChannel(name, { log: true })`:
- Native severity levels (trace/debug/info/warn/error)
- User-configurable via "Set Log Level..." command
- Structured logging format
- No manual timestamp handling

### Step 4: execa Integration (Medium Complexity)
Replace `child_process.spawn` with `execa`:
- Promise-based API with built-in timeout
- AbortController signal support
- Better cross-platform handling
- Cleaner error messages

## Dependencies

```
Step 1 (Activation) ──┐
                      ├──→ Independent
Step 2 (Memento) ─────┘

Step 3 (LogOutputChannel) → Requires VS Code version bump (PM approval)

Step 4 (execa) → Requires npm package addition
```

## Version Compatibility

### LogOutputChannel Requirement
- `LogOutputChannel` API introduced in VS Code 1.84 (October 2023)
- Current minimum: VS Code 1.74.0 (December 2022)
- Required: Bump to 1.84.0

**Impact Assessment:**
- VS Code 1.84 is 2+ years old
- Practically all active users are on 1.84+
- Industry-standard to require ~2 year old version

**PM Decision Required:** Approve VS Code version bump from 1.74.0 to 1.84.0

## Success Criteria

1. **Activation Events**
   - Extension does NOT activate when opening unrelated projects
   - Extension activates when opening folder with `.demo-builder`
   - Extension activates when running any `demoBuilder.*` command

2. **Memento**
   - Notification flags persist across extension reloads
   - Dashboard preferences persist per-session
   - TransientStateManager has comprehensive tests

3. **LogOutputChannel**
   - Users can change log level via VS Code command
   - Debug logs only appear when log level set to debug
   - All existing logging functionality preserved

4. **execa**
   - All existing tests pass
   - Command execution behavior unchanged
   - Cleaner timeout handling

## Risk Assessment

| Step | Risk | Mitigation |
|------|------|------------|
| Activation Events | Low | Test with various project scenarios |
| Memento | Low | Additive change, doesn't replace file-based state |
| LogOutputChannel | Medium | Requires version bump, thorough testing |
| execa | Medium | Well-tested library, comprehensive test coverage |

## Estimated Complexity

- **Step 1:** Small (1 file change, testing focus)
- **Step 2:** Medium (new service, tests)
- **Step 3:** Medium-Large (logging infrastructure, version bump)
- **Step 4:** Large (core infrastructure change, comprehensive tests)

## References

- [VS Code Best Practices Audit](.rptc/research/vscode-best-practices-audit-2025-11-25/research.md)
- [VS Code Activation Events](https://code.visualstudio.com/api/references/activation-events)
- [VS Code LogOutputChannel API](https://code.visualstudio.com/api/references/vscode-api#LogOutputChannel)
- [VS Code Memento API](https://code.visualstudio.com/api/references/vscode-api#Memento)
- [execa npm package](https://www.npmjs.com/package/execa)
