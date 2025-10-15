# Release Notes - v1.0.0-beta.32

## 🐛 Critical Bug Fix: Cached Binary Paths with Spaces

This release fixes a critical bug that prevented authentication and all Adobe CLI commands from working for users whose fnm installation path contains spaces.

---

## The Problem

When using cached binary paths for performance optimization (introduced in v1.0.0-beta.24), paths containing spaces (like the default macOS path `/Users/username/Library/Application Support/fnm/...`) were not properly quoted when building shell commands.

### Error Symptoms

**User Experience:**
- ❌ "Sign in" button doesn't open browser
- ❌ Mesh shows "Session expired" even after authentication
- ❌ All `aio` commands fail with exit code 127

**Debug Logs:**
```
[Auth] Login command failed with exit code: 127
[Auth] Error output: zsh:1: no such file or directory: /Users/username/Library/Application
```

### Root Cause

The cached paths were concatenated without quotes:
```bash
# Before (broken)
/Users/username/Library/Application Support/fnm/.../node /Users/username/Library/Application Support/fnm/.../aio auth login

# Shell interprets this as:
# Command: /Users/username/Library/Application
# Args: Support/fnm/.../node Support/fnm/.../aio auth login
# Error: Command not found ❌
```

---

## The Fix

**Modified:** `src/utils/externalCommandManager.ts`

Added proper quoting for cached binary paths:

```typescript
// Before
finalCommand = `${this.cachedNodeBinaryPath} ${this.cachedAioBinaryPath} ${aioCommand}`;

// After
finalCommand = `"${this.cachedNodeBinaryPath}" "${this.cachedAioBinaryPath}" ${aioCommand}`;
```

Now paths with spaces are correctly interpreted:
```bash
# After (fixed)
"/Users/username/Library/Application Support/fnm/.../node" "/Users/username/Library/Application Support/fnm/.../aio" auth login

# Shell correctly interprets the full quoted paths ✅
```

---

## Impact

### Who Was Affected

This bug affected **all users** whose fnm installation path contains spaces, including:
- Default macOS paths: `~/Library/Application Support/fnm/...`
- Custom installation paths with spaces
- Username directories with spaces

### What's Fixed

✅ Authentication works correctly  
✅ "Sign in" button opens browser  
✅ All `aio` commands execute properly  
✅ Mesh status checks work  
✅ Organization/project selection works  
✅ Performance optimization (cached paths) now reliable for all users

---

## Testing

### Before Fix
1. User with path containing spaces (e.g., `Application Support`)
2. Try to authenticate → Browser doesn't open
3. Check logs → Error: "no such file or directory"

### After Fix
1. Same user with spaces in path
2. Try to authenticate → Browser opens correctly ✅
3. All `aio` commands work properly ✅

---

## Upgrade Notes

**Automatic:** No migration needed. The fix applies immediately on extension reload.

**For Affected Users:**
- If you experienced authentication issues or "Session expired" errors
- Simply reload VS Code after updating to v1.0.0-beta.32
- Authentication and all Adobe CLI features will work correctly

---

## Technical Details

### Command Building Logic

**Cached Path Performance Optimization (v1.0.0-beta.24):**
- Caches Node and `aio` binary paths on first use
- Avoids `fnm exec` overhead (5-6s → <1s)
- Dramatically improves `aio` command performance

**Bug Introduced:** Paths weren't quoted when building commands  
**Bug Fixed:** All cached paths now properly quoted

### Shell Behavior

Shells (bash, zsh, sh) interpret unquoted spaces as argument separators:
- `path with spaces arg` → 3 arguments: `path`, `with`, `spaces`
- `"path with spaces" arg` → 2 arguments: `path with spaces`, `arg` ✅

This is critical for any file path on macOS where system directories often contain spaces.

---

## Summary

v1.0.0-beta.32 fixes a critical path quoting bug that prevented authentication and Adobe CLI commands from working for users with spaces in their fnm installation path (the macOS default).

**If you experienced authentication issues in v1.0.0-beta.24 through v1.0.0-beta.31, this release resolves them completely.**

---

## Related Issues

- Authentication not working (exit code 127)
- Browser not opening on "Sign in"
- "Session expired" loops
- All `aio` commands failing silently

**All resolved in v1.0.0-beta.32** ✅

