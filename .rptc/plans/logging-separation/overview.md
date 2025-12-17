# Logging Channel Separation

**Status**: ✅ Complete (commits `85b9d78`, `02ab029`)

## Feature Summary

Enforce proper logging discipline so the two output channels serve distinct audiences:
- **"Demo Builder: Logs"** - Clean, milestone-focused messages for end users
- **"Demo Builder: Debug"** - Technical details for IT support and developers

The logging architecture in `debugLogger.ts` is correct - this is a caller discipline fix.

## Problem Statement

Currently both channels show nearly identical content because:
1. Developers use `logger.info()` for technical implementation details that should use `logger.debug()`
2. Verbose diagnostic data uses `debug()` when it should use `trace()`

**Log Level Guidelines**:
| Level | Use For | Example |
|-------|---------|---------|
| `info()` | User milestones (✅, success, complete) | `Authentication successful` |
| `debug()` | Technical operations with `[Component]` prefix | `[Auth] Token check completed in 2519ms` |
| `trace()` | Verbose diagnostics (full payloads, stdout) | `[Auth] Full token response: {...}` |

## Scope

- **174 `logger.info('[...')` calls** across 34 files (candidates for `info` → `debug`)
- **Verbose `logger.debug()` calls** with full payloads/stdout (candidates for `debug` → `trace`)
- **34 files** to review and potentially modify
- **5 priority feature areas** based on user-visible impact

## Test Strategy

### Verification Approach

Since this is a refactoring task (routing change, not behavior change):

1. **Existing Test Preservation**: All 771 lines of tests in `tests/core/logging/debugLogger.test.ts` must continue passing
2. **Manual Verification**: After changes, compare output between "Logs" and "Debug" channels
3. **Grep Verification**: After each step, verify no `[Component]` prefixed `info()` calls remain in that area

### Success Criteria Validation

Run after completing all steps:
```bash
# Should return 0 results (all [Component] prefixed calls now use debug())
grep -rn "logger\.info.*\[" src/features/ src/core/ src/commands/ --include="*.ts" | grep -v "logger\.info('[^']*✅" | grep -v "logger\.info('[^']*successfully" | grep -v "logger\.info('[^']*complete"
```

### Expected Channel Output After Fix

**User Logs (clean, milestone-focused):**
```
[info] Adobe Demo Builder v1.0.0 starting...
[info] Prerequisites check complete - all installed
[info] Authentication successful
[info] Project created successfully
[info] Mesh deployed successfully
```

**Debug Logs (technical, detailed):**
```
[info] Adobe Demo Builder v1.0.0 starting...
[debug] [Prerequisites] Checking Homebrew...
[debug] [Prerequisites] Homebrew version: 5.0.3
[info] Prerequisites check complete - all installed
[debug] [Auth] Token-only check completed in 2519ms: false
[info] Authentication successful
[debug] [Project Creation] Created directory: /path/to/project
[debug] [ComponentManager] Installing Headless CitiSignal v0.1.0
[info] Project created successfully
```

## Acceptance Criteria

- [x] All existing tests pass (no regressions) - 4,733 tests pass
- [x] `logger.info('[Component]...')` calls changed to `logger.debug('[Component]...')` - 17 calls changed
- [x] `logger.debug()` calls with verbose data (full payloads, stdout) changed to `logger.trace()` - 5 calls in 2 files
- [x] User milestone messages remain as `info()` - Verified (emojis, success messages, progress indicators)
- [x] User Logs channel shows only user-relevant information
- [x] Debug channel shows technical operation flow
- [x] Trace level reserved for verbose diagnostics - JSON dumps and raw output moved to trace()
- [ ] Logging README updated with guidelines - Deferred (optional)

## Files Reference

### Logging Infrastructure (Read-Only)
- `src/core/logging/debugLogger.ts` - Dual-channel implementation (correct)
- `tests/core/logging/debugLogger.test.ts` - Existing tests (must pass)

### Reference Files (Correct Pattern)
- `src/core/shell/fileWatcher.ts` - All `[File Watcher]` uses `debug()`
- `src/core/shell/pollingService.ts` - Correct logging levels

### Priority Areas (by user impact)
1. `src/features/project-creation/` - 24+ info calls with prefix
2. `src/features/mesh/` - 30+ info calls with prefix
3. `src/features/authentication/` - 15+ info calls with prefix
4. `src/features/prerequisites/` - 7+ info calls with prefix
5. `src/features/dashboard/` - 10+ info calls with prefix
6. Remaining: `src/core/`, `src/commands/`, `src/features/lifecycle/`, `src/features/updates/`

## Implementation Constraints

- **No behavior changes**: Only change log level (`info` → `debug`), not message content
- **Preserve milestones**: Messages with ✅, "successfully", "complete" stay as `info()`
- **No new dependencies**: Use existing logging infrastructure
- **Test compatibility**: All existing tests must pass unchanged

## Configuration

**Efficiency Review**: enabled
**Security Review**: disabled (no security implications in log level changes)

## Risks

- **Low**: Missing a call that should be `debug()` (can fix later)
- **Low**: Changing a user-facing message to `debug()` (verify milestones preserved)

## Related

- Handoff from previous session: `.rptc/plans/logging-separation/HANDOFF.md`
- Logging architecture docs: `src/core/logging/README.md`
