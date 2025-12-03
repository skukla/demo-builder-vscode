# Logging Channel Separation - Handoff Summary

## Problem Statement

The extension has two logging channels designed for different audiences:
- **"Demo Builder: Logs"** - For end users (high-level, friendly messages)
- **"Demo Builder: Debug"** - For IT support (technical details, command outputs, timing)

**Current Issue**: Both channels show nearly identical content, defeating the purpose of separation.

## Root Cause Analysis

The logging architecture is correctly implemented in `src/core/logging/debugLogger.ts`:

| Method | User Logs | Debug Logs |
|--------|-----------|------------|
| `info()` | YES | YES |
| `warn()` | YES | YES |
| `error()` | YES | YES |
| `debug()` | NO | YES |
| `trace()` | NO | YES |

**The problem is caller discipline, not architecture.** Developers are using `info()` for technical implementation details that should use `debug()`.

## Evidence

From user-provided logs, these technical details appear in BOTH channels (should be Debug only):

```
[info] [API Mesh] Layer 1: Downloading workspace configuration
[info] [API Mesh] Layer 2: Checking for existing mesh
[info] [Mesh Verification] Attempt 1/10 (20s elapsed)
[info] [Mesh Verification] Status: building
[info] [Project Creation] Created directory: /Users/kukla/.demo-builder/projects/...
[info] [ComponentManager] Headless CitiSignal version: 0.1.0
[info] [Adobe Setup] Selecting organization...
[info] [Adobe Setup] Organization selected: 3397333
```

These should use `logger.debug()` not `logger.info()`.

## Fix Strategy

### Rule of Thumb
**If a message has a `[ComponentName]` prefix, it's likely a technical detail that should use `debug()` not `info()`.**

### What Should Stay as `info()` (User-Facing)
```typescript
logger.info('Project created successfully');
logger.info('Authentication successful');
logger.info('All prerequisites installed');
logger.info('Mesh deployed successfully');
```

### What Should Change to `debug()` (Technical Details)
```typescript
// Before
logger.info('[Dashboard] Populated meshState.envVars');
logger.info('[API Mesh] Layer 1: Downloading workspace configuration');
logger.info('[Mesh Verification] Attempt 1/10 (20s elapsed)');

// After
logger.debug('[Dashboard] Populated meshState.envVars');
logger.debug('[API Mesh] Layer 1: Downloading workspace configuration');
logger.debug('[Mesh Verification] Attempt 1/10 (20s elapsed)');
```

## Scope of Work

- **~65 files** with logging calls
- **~744 logging call occurrences** to audit
- Files already doing it correctly (use as reference):
  - `src/core/shell/fileWatcher.ts`
  - `src/core/shell/pollingService.ts`
  - `src/features/mesh/services/meshVerifier.ts`

### Priority Files to Fix (based on user's log output)
1. `src/features/project-creation/` - Project creation workflow
2. `src/features/mesh/` - Mesh deployment and verification
3. `src/features/authentication/` - Auth flow, org/project/workspace selection
4. `src/features/prerequisites/` - Prerequisites checking
5. `src/features/dashboard/` - Dashboard operations

## Implementation Approach

### Phase 1: Audit and Categorize
For each file with logging, categorize calls:
- **Keep as `info()`**: User milestones, success messages, warnings users should see
- **Change to `debug()`**: Internal operations, state changes, technical flow, timing details

### Phase 2: Systematic Refactoring
Change technical `info()` calls to `debug()` in priority order.

### Phase 3: Add Guidelines
Update `src/core/logging/README.md` with:
- Clear examples of what level to use
- The `[ComponentName]` prefix rule
- Before/after examples

### Phase 4: Prevention (Optional)
Add ESLint rule to flag `info()` calls with `[Component]` prefix:
```javascript
"no-restricted-syntax": [
  "warn",
  {
    "selector": "CallExpression[callee.property.name='info'][arguments.0.value=/\\[[A-Z]/]",
    "message": "Consider using logger.debug() for [Component] prefixed messages"
  }
]
```

## Key Files

### Logging Infrastructure (Read-Only Reference)
- `src/core/logging/debugLogger.ts` - Dual-channel implementation (correct)
- `src/core/logging/logger.ts` - Wrapper class
- `tests/core/logging/debugLogger.test.ts` - Tests (771 lines)

### Files to Modify (Priority Order)
1. `src/features/project-creation/handlers/createHandler.ts`
2. `src/features/mesh/services/meshDeployer.ts`
3. `src/features/mesh/services/meshVerifier.ts`
4. `src/features/authentication/handlers/authenticationHandlers.ts`
5. `src/features/prerequisites/handlers/checkHandler.ts`
6. `src/features/dashboard/handlers/dashboardHandlers.ts`

## Success Criteria

After fix, the channels should show distinctly different content:

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
[debug] [Mesh Verification] Attempt 1/10 (20s elapsed)
[debug] [Mesh Verification] Status: building
[info] Mesh deployed successfully
```

## Commands to Find Logging Calls

```bash
# Find all info() calls with [Component] prefix (candidates for debug())
grep -rn "logger\.info.*\[" src/features/ --include="*.ts"

# Count logging calls by type
grep -rn "logger\.\(info\|debug\|warn\|error\)" src/ --include="*.ts" | wc -l

# Find files with most logging calls
grep -rln "logger\." src/features/ --include="*.ts" | xargs -I{} sh -c 'echo "$(grep -c "logger\." {}) {}"' | sort -rn | head -20
```

## Related Commits

- `824c29f` - Logging system upgrade to VS Code LogOutputChannel API
- The architecture is correct; only caller usage needs fixing

## Status

**Not Started** - Ready for implementation after context compaction.
