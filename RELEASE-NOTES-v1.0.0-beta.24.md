# Demo Builder v1.0.0-beta.24 Release Notes

## 🚀 Major Performance Fix: 5-6x Faster Adobe CLI Commands

### Issue
Users experienced persistent 5-6 second delays for **every single Adobe CLI command**, causing:
- Authentication checks taking 5+ seconds and timing out
- Dashboard showing "needs-auth" even after successful login
- Configure screen taking 25+ seconds to verify auth status
- Mesh deployment checks taking 5+ seconds per call

**From logs:**
```
20:50:33: Save config
20:50:38: Auth check #1 (5004ms) → TIMEOUT ❌
20:50:45: Auth check #2 (5006ms) → TIMEOUT ❌
20:51:00: Auth check #3 (26694ms) → Success (but way too slow)
```

### Root Cause
Every `aio` command was using `fnm exec --using=24 -- aio config get ...`, which:
1. Spawns a new shell
2. Initializes fnm environment
3. Resolves Node version
4. Sets up PATH
5. **THEN** runs the actual command

This added **5-6 seconds of overhead PER COMMAND**. With multiple commands in sequence (auth checks, mesh status, config reads), users experienced 15-30 second delays.

### The Fix: Binary Path Caching

Instead of `fnm exec` for every command, we now:

**Once per session** (one-time cost):
```bash
# Detect Node version with aio-cli
fnm exec --using=24 -- which node  → /path/to/node  # 5s
fnm exec --using=24 -- which aio   → /path/to/aio   # 5s
# Cache these paths for the session
```

**All subsequent commands** (instant):
```bash
/path/to/node /path/to/aio config get token   # <1s ✅
/path/to/node /path/to/aio config get expiry  # <1s ✅
/path/to/node /path/to/aio console where      # <1s ✅
```

**Performance improvement:**
- **Before**: 5-6s per command (fnm exec overhead)
- **After**: <1s per command (direct binary execution)
- **Speedup**: 5-6x faster 🚀

### Impact

**Authentication Checks:**
```
Before: isAuthenticatedQuick took 26694ms (2 commands × 5s + retries)
After:  isAuthenticatedQuick took <2000ms  (2 commands × <1s)
```

**Dashboard Load:**
```
Before: 30+ seconds (auth check + mesh status + org verification)
After:  5 seconds (one-time cache + fast commands)
```

**Configure Screen:**
```
Before: 25+ seconds to verify authentication
After:  <2 seconds
```

### Additional Improvements
- ✅ Increased `CONFIG_READ` timeout: 5s → 10s (safety margin)
- ✅ Prioritized timeout retries for initial fnm initialization
- ✅ Cached binary paths persist for entire session
- ✅ Automatic fallback to `fnm exec` if caching fails

---

**Previous Fix (v1.0.0-beta.23)**: Fixed welcome screen conflict during project opening

**Full Changelog**: https://github.com/skukla/demo-builder-vscode/compare/v1.0.0-beta.23...v1.0.0-beta.24

