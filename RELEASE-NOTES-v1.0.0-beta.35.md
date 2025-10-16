# Release Notes - v1.0.0-beta.35

## 🔥 Critical Authentication & UX Fixes

This release addresses critical authentication bugs discovered during user testing, plus important UX improvements and comprehensive timeout refactoring for better maintainability.

---

## 🐛 Critical Bug Fixes

### Authentication

**Fixed: "0 Organizations" After Login (CRITICAL)**
- **Problem**: After successful browser login, users would see "0 organizations" and could not proceed
- **Root Cause**: Extension was manually extracting and re-storing the token from `aio auth login` stdout, which corrupted the token that Adobe CLI had already stored correctly
- **Fix**: Removed all manual token extraction/storage logic. Now trusts Adobe CLI's automatic token management
- **Impact**: Authentication flow now works reliably for all users
- **Details**: Added 2-second delay after login to allow CLI config files to be fully written, with automatic retry if 0 orgs found

**Fixed: Incorrect CLI Version Detection Across Node Versions**
- **Problem**: Prerequisite checks showed the same `aio-cli` version for all Node versions (e.g., v11 for Node 18, 22, and 24)
- **Root Cause**: Binary path cache was global, not per-Node-version. First Node version checked would cache its paths, then all subsequent checks would reuse those cached paths
- **Fix**: Added version matching check before using cache: `cachedAdobeCLINodeVersion === String(nodeVersion)`
- **Impact**: Prerequisite checks now accurately report which CLI versions are installed for each Node version

### User Experience

**Fixed: Homebrew Terminal Not Closing After Installation**
- **Problem**: After successful Homebrew installation, users clicked "Continue" but the terminal stayed open
- **Root Cause**: Two confusing buttons ("Continue & Close Terminal" vs "Continue")
- **Fix**: Simplified to single "Continue" button that always closes terminal
- **Impact**: Clearer UX, fewer support questions

---

## 🔧 Technical Improvements

### Timeout Configuration Refactoring

**Centralized All Hardcoded Timeouts**
- Refactored **21 hardcoded timeout values** across **8 files** to use centralized `TIMEOUTS` config
- Added **13 new timeout constants** with clear documentation:
  ```typescript
  // Binary path caching and validation
  BINARY_PATH_CACHE: 5000,
  QUICK_CONFIG_CHECK: 2000,
  NODE_VERSION_TEST: 5000,
  
  // Homebrew operations
  HOMEBREW_CHECK: 3000,
  
  // Demo operations
  DEMO_START_CHECK: 5000,
  
  // Validation operations
  COMMERCE_VALIDATION: 10000,
  
  // Post-login delays
  POST_LOGIN_DELAY: 2000,
  POST_LOGIN_RETRY_DELAY: 3000,
  ```

**Files Refactored**:
- `autoUpdater.ts` - Update check and download timeouts
- `meshDeploymentVerifier.ts` - Mesh API call timeouts
- `meshVerifier.ts` - Mesh verification timeouts
- `stalenessDetector.ts` - Mesh staleness check timeouts
- `externalCommandManager.ts` - Binary caching and config check timeouts
- `createProjectWebview.ts` - Homebrew and API call timeouts
- `startDemo.ts` - Demo start/stop check timeouts
- `commerceValidator.ts` - Commerce validation timeouts

**Benefits**:
- Single source of truth for all timeout values
- Self-documenting timeout purposes
- Easier performance tuning
- Better testability

---

## 📊 Technical Details

### Authentication Flow Changes

**Before (Broken)**:
```typescript
aio auth login → extract token from stdout → manually store token → 401 errors ❌
```

**After (Fixed)**:
```typescript
aio auth login → let CLI store token automatically → wait 2s → verify orgs → ✅
```

### Binary Cache Logic Changes

**Before (Broken)**:
```typescript
if (cachedBinaryPath && command.startsWith('aio')) {
    // Always use cached path ❌
    // All Node versions use first cached path
}
```

**After (Fixed)**:
```typescript
if (cachedBinaryPath && 
    cachedAdobeCLINodeVersion === String(nodeVersion)) {
    // Only use cache if versions match ✅
    // Each Node version gets accurate detection
}
```

---

## 🔄 Upgrade Notes

No breaking changes. Simply update to v1.0.0-beta.35 when prompted.

**If authentication is not working**:
1. Run: `aio auth logout`
2. Restart VS Code
3. Try authentication again

---

## 🙏 Acknowledgments

Special thanks to the beta testers who reported the "0 organizations" authentication issue and the Node version detection bug. Your detailed logs were instrumental in identifying and fixing these critical issues.

---

**Full Changelog**: https://github.com/skukla/demo-builder-vscode/compare/v1.0.0-beta.34...v1.0.0-beta.35

