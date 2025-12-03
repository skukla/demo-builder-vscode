# Step 8: Documentation and Guidelines

## Purpose

Update logging documentation with clear guidelines to prevent future regression.

## Prerequisites

- Step 7 complete (all code changes done)

## Tests to Write First

### Test: Final Verification

```bash
# Full test suite must pass
npm run test:fast

# Count remaining info calls with [Component] prefix (should be very few)
grep -rn "logger\.info.*\[" src/ --include="*.ts" | wc -l

# Verify debug calls increased
grep -rn "logger\.debug\(" src/ --include="*.ts" | wc -l
```

### Test: Channel Separation Verification

Manual verification:
1. Run a project creation workflow
2. Compare "Demo Builder: Logs" vs "Demo Builder: Debug" channels
3. Verify Logs channel shows only user milestones
4. Verify Debug channel shows full technical details

## Implementation

### Update `src/core/logging/README.md`

Add new section:

```markdown
## Logging Level Guidelines

### When to Use Each Level

| Level | Audience | Use For | Example |
|-------|----------|---------|---------|
| `info()` | End users | Milestones, success/failure | `'Project created successfully'` |
| `debug()` | IT support | Technical details, flow | `'[Component] Loading config...'` |
| `warn()` | Both | Recoverable issues | `'Retrying connection...'` |
| `error()` | Both | Failures | `'Failed to connect'` |
| `trace()` | Developers | Verbose debugging | Variable dumps, timing |

### The [Component] Prefix Rule

**If a message has a `[ComponentName]` prefix, use `debug()` not `info()`.**

```typescript
// ❌ WRONG - Technical detail using info()
logger.info('[Project Creation] Created directory: /path/to/project');
logger.info('[API Mesh] Layer 1: Downloading workspace configuration');

// ✅ CORRECT - Technical detail using debug()
logger.debug('[Project Creation] Created directory: /path/to/project');
logger.debug('[API Mesh] Layer 1: Downloading workspace configuration');
```

### User Milestones (Keep as `info()`)

Messages that users should see in the "Demo Builder: Logs" channel:

```typescript
// ✅ User milestones - use info()
logger.info('Project created successfully');
logger.info('Authentication successful');
logger.info('Prerequisites check complete - all installed');
logger.info('Mesh deployed successfully');
logger.info('Demo started on port 3000');
```

### Technical Details (Use `debug()`)

Messages that only IT support needs in the "Demo Builder: Debug" channel:

```typescript
// ✅ Technical details - use debug()
logger.debug('[Prerequisites] Checking Homebrew...');
logger.debug('[Prerequisites] Homebrew version: 5.0.3');
logger.debug('[Auth] Token-only check completed in 2519ms');
logger.debug('[Mesh Verification] Attempt 1/10 (20s elapsed)');
logger.debug('[Mesh Verification] Status: building');
```

### Quick Decision Guide

Ask yourself:
1. **Would an end user care about this message?**
   - Yes → `info()` (but remove [Component] prefix)
   - No → `debug()`

2. **Does it have a `[ComponentName]` prefix?**
   - Yes → Almost always `debug()`
   - Exception: Messages with ✅ emoji indicating user milestone

3. **Is it a success/completion message?**
   - Yes → `info()` without prefix
   - Internal step completion → `debug()`
```

## Expected Outcome

- Clear documentation prevents future regression
- New developers understand logging expectations
- Both channels serve their intended audiences

## Acceptance Criteria

- [ ] `src/core/logging/README.md` updated with guidelines
- [ ] Examples show correct and incorrect patterns
- [ ] Quick decision guide included
- [ ] All tests pass
- [ ] Manual verification confirms channel separation
