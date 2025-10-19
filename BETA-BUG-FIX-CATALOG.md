# Beta Analysis: Bug Fix Catalog (Beta 1-72)

## Executive Summary

**Analysis Period**: October 13-17, 2025 (143 commits across 72 beta releases)

### Bug Fix Statistics
- **Total Commits Analyzed**: 143 (99 commits beta.1-50, 44 commits beta.51-72)
- **Bug Fixes Identified**: 80 fixes
- **CRITICAL Fixes**: 14 (system-breaking, data corruption, security)
- **HIGH Fixes**: 25 (major functionality impact)
- **MEDIUM Fixes**: 30 (specific scenario failures)
- **LOW Fixes**: 11 (edge cases, cosmetic)

### Integration Priority Summary
- **Priority 1 (MUST integrate)**: 29 fixes (~12-18 hours)
- **Priority 2 (Should integrate)**: 25 fixes (~8-12 hours)
- **Priority 3 (Can defer to v1.1)**: 20 fixes (~3-5 hours)
- **Priority 4 (Optional)**: 6 fixes (~1-2 hours)

### Critical Path - Beta 1-50
**THE BIG THREE** authentication fixes (beta.42, .49, .50) are part of a comprehensive authentication rewrite (beta.34-50) that MUST be adopted as a complete system. You cannot cherry-pick individual fixes.

### Critical Path - Beta 51-72
**NODE VERSION MANAGEMENT** (beta.51-53) is an interdependent 3-release chain fixing critical Node 14/24 fallback issues. **TERMINAL MANAGEMENT** (beta.61-66) is a 6-release iterative redesign. **FNM SHELL CONFIGURATION** (beta.59) prevents demo startup failures. These are MUST-INTEGRATE fixes.

---

## Quick Reference Matrix

| Beta | Area | Severity | Summary | Priority | Effort | Status |
|------|------|----------|---------|----------|--------|--------|
| 42 | Auth | **CRITICAL** | Token corruption race condition | P1 | 0h* | ⚠️ VERIFY |
| 49 | Auth | **CRITICAL** | Cache timeout on login | P1 | 0h* | ⚠️ VERIFY |
| 50 | Auth | **CRITICAL** | SDK re-init after login | P1 | 0h* | ⚠️ VERIFY |
| 50 | Build | **CRITICAL** | tree-sitter packaging failure | P1 | 30m | ⚠️ VERIFY |
| 32 | Auth | HIGH | Binary paths with spaces | P1 | 0h* | ⚠️ VERIFY |
| 33 | Auth | HIGH | Node 24 compatibility | P1 | 0h* | ⚠️ VERIFY |
| 35 | Auth | HIGH | Auth timeout refactoring | P1 | 0h* | ⚠️ VERIFY |
| 19-20 | Mesh | HIGH | Node version for mesh commands | P1 | 2h | 🔍 REVIEW |
| 21 | Dashboard | HIGH | Mesh status detection | P1 | 1h | 🔍 REVIEW |
| 18 | Dashboard | HIGH | Component versions, deployment errors | P1 | 2h | 🔍 REVIEW |
| 22 | Updates | HIGH | False update notifications | P1 | 1h | 🔍 REVIEW |
| 28-30 | Components | HIGH | Version tracking | P1 | 2h | 🔍 REVIEW |
| 23 | Project | MEDIUM | Welcome screen conflict | P2 | 1h | 🔍 REVIEW |
| 18 | Prerequisites | MEDIUM | Git prerequisite detection | P2 | 30m | 🔍 REVIEW |
| 13 | Prerequisites | MEDIUM | Adobe CLI Node version | P2 | 1h | 🔍 REVIEW |
| 12 | Prerequisites | MEDIUM | Per-node plugin checks | P2 | 1h | 🔍 REVIEW |
| 11 | Updates | MEDIUM | Update checker semver | P2 | 30m | 🔍 REVIEW |
| 9 | Prerequisites | MEDIUM | fnm reliability | P2 | 1h | 🔍 REVIEW |
| 7 | Updates | MEDIUM | Semver comparison | P2 | 30m | 🔍 REVIEW |
| 3-5 | Prerequisites | MEDIUM | fnm/Node awareness | P2 | 1h | 🔍 REVIEW |
| 1-2 | Build | MEDIUM | VSIX packaging | P2 | 30m | 🔍 REVIEW |
| 47 | Logging | LOW | Org switching logs | P3 | 15m | 📋 LIST |
| 46 | Logging | LOW | Duplicate timeout message | P3 | 15m | 📋 LIST |
| 45 | Logging | LOW | Prerequisite status messages | P3 | 15m | 📋 LIST |
| 44 | Logging | LOW | Log cleanup | P3 | 15m | 📋 LIST |
| 43 | Prerequisites | LOW | Prerequisites UX | P3 | 30m | 📋 LIST |
| 48 | Logging | LOW | Emoji standardization | P4 | 15m | ⏭️ SKIP |
| 31 | Logging | LOW | Debug log verbosity | P4 | 15m | ⏭️ SKIP |

### Beta 51-72 Additions (28 New Fixes)

| Beta | Area | Severity | Summary | Priority | Effort | Status |
|------|------|----------|---------|----------|--------|--------|
| 51 | Node Version | **CRITICAL** | Node 14 fallback causing MODULE_NOT_FOUND | P1 | 2h** | 🔍 REVIEW |
| 51 | Node Version | **CRITICAL** | Leaky abstraction with allowed versions | P1 | 2h** | 🔍 REVIEW |
| 53 | Node Version | **CRITICAL** | Adobe CLI using Node 24 instead of 18 | P1 | 2h** | 🔍 REVIEW |
| 53 | Node Version | **CRITICAL** | Auth fails without project context | P1 | 2h** | 🔍 REVIEW |
| 56 | Auth | **CRITICAL** | Silent failures without Developer role | P1 | 2h*** | 🔍 REVIEW |
| 59 | Prerequisites | **CRITICAL** | "Can't find environment variables" error | P1 | 1h | 🔍 REVIEW |
| 59 | Prerequisites | **CRITICAL** | fnm installed but not configured | P1 | 1h | 🔍 REVIEW |
| 61 | Terminal | **CRITICAL** | "Starting directory does not exist" error | P1 | 2h**** | 🔍 REVIEW |
| 61 | Terminal | **CRITICAL** | Homebrew install failures during prereqs | P1 | 2h**** | 🔍 REVIEW |
| 70 | Type Safety | **CRITICAL** | project.created.toISOString() crashes | P1 | 30m | 🔍 REVIEW |
| 55 | Auth | HIGH | Confusing timeout for no App Builder access | P2 | 2h*** | 🔍 REVIEW |
| 55 | Auth | HIGH | Generic error messages | P2 | 2h*** | 🔍 REVIEW |
| 56 | Auth | HIGH | Can't distinguish permission vs connection | P2 | 2h*** | 🔍 REVIEW |
| 57 | Auth | HIGH | Retry button pointless for permissions | P2 | 2h*** | 🔍 REVIEW |
| 58 | Auth | HIGH | "Sign In Again" reuses insufficient token | P2 | 2h*** | 🔍 REVIEW |
| 62 | Terminal | HIGH | Terminal errors with project as workspace | P2 | 2h**** | 🔍 REVIEW |
| 63 | Terminal | HIGH | Workspace folder conflicts | P2 | 2h**** | 🔍 REVIEW |
| 65 | Terminal | HIGH | Extension Host restart needed for terminals | P2 | 2h**** | 🔍 REVIEW |
| 70 | Prerequisites | HIGH | Adobe CLI checks show incorrect status | P2 | 1h | 🔍 REVIEW |
| 71 | Prerequisites | HIGH | Node 24 shows not installed after install | P2 | 1h | 🔍 REVIEW |
| 52 | Components | MEDIUM | Redundant adobe-cli-sdk component | P3 | 30m | 🔍 REVIEW |
| 64 | Logging | MEDIUM | console.error instead of Logger | P3 | 15m | 📋 LIST |
| 66 | Code Cleanup | MEDIUM | 132 lines of dead code | P3 | 15m | 📋 LIST |
| 67 | Notifications | MEDIUM | Verbose progress notifications | P3 | 15m | 📋 LIST |
| 69 | Notifications | MEDIUM | Notification flash from overlapping | P3 | 15m | 📋 LIST |
| 54 | Auth | LOW | Can't diagnose 0 organizations issue | P4 | 15m | ⏭️ SKIP |
| 68 | Notifications | LOW | Passive "Waiting for port..." message | P4 | 15m | ⏭️ SKIP |
| 72 | Notifications | MEDIUM | Auto-dismissing notifications pattern | P3 | 30m | 🔍 REVIEW |

**Legend**:
- *0h = Included in auth system rewrite (adopt wholesale)
- **2h = Part of Node Version Management chain (beta.51-53), integrate together
- ***2h = Part of Auth & Permissions chain (beta.54-58), integrate together
- ****2h = Part of Terminal & Workspace chain (beta.61-66), integrate together
- ⚠️ VERIFY = Must verify fix exists in refactor branch
- 🔍 REVIEW = Requires code review and comparison
- 📋 LIST = Lower priority, document for future
- ⏭️ SKIP = Optional, can defer indefinitely

---

## Detailed Bug Fix Analysis

### CRITICAL Fixes (4 fixes)

These bugs cause system crashes, data corruption, security vulnerabilities, or break core workflows.

---

#### BUG-001: Token Corruption Race Condition
- **Beta**: 42
- **Commit**: `99dbdc8`
- **Date**: 2025-10-16 21:31:25
- **File**: `src/utils/adobeAuthManager.ts`
- **Lines Changed**: +74 / -30
- **Impact Area**: Authentication
- **Severity**: CRITICAL
- **Frequency**: 5-30% of auth operations (user-reported, multiple cases)
- **User Impact**: Auth fails with "expiry = 0", requires re-login, blocks ALL Adobe operations

**Description**:
Token and expiry fetched via separate concurrent `Promise.all()` Adobe CLI queries. Race condition when Adobe CLI updates token between queries, resulting in mismatched token/expiry pair (token exists but expiry = 0).

**Root Cause**:
```typescript
// BROKEN (beta.41 and earlier)
const [tokenResult, expiryResult] = await Promise.all([
    executeAdobeCLI('aio config get ims.contexts.cli.access_token.token'),
    executeAdobeCLI('aio config get ims.contexts.cli.access_token.expiry')
]);
const token = tokenResult.stdout.trim();
const expiry = parseInt(expiryResult.stdout.trim());
// If Adobe CLI updates token between these two calls → expiry = 0 mismatch
```

**Fix**:
```typescript
// FIXED (beta.42+)
const result = await executeAdobeCLI(
    'aio config get ims.contexts.cli.access_token --json'
);
const tokenData = JSON.parse(result.stdout);
const token = tokenData.token;
const expiry = tokenData.expiry || 0;
// Single atomic read of entire token object → no race condition
```

**Integration Strategy**:
- **Priority**: P1 (CRITICAL)
- **Method**: Part of auth system rewrite (beta.34-50), adopt wholesale
- **Verification**:
  ```bash
  # Check refactor branch for vulnerable pattern
  grep -n "Promise.all" src/utils/adobeAuthManager.ts
  grep -n "access_token --json" src/utils/adobeAuthManager.ts
  ```
- **Test Case**:
  1. Perform authentication 20 times rapidly (stress test)
  2. Check for `expiry = 0` or auth failures in logs
  3. Expected: 0% failure rate
- **Effort**: 0 hours (included in auth system adoption)

**Related Fixes**:
- Beta 39-41: Attempted fixes for token corruption detection/recovery
- Beta 35-38: Auth debugging and error logging improvements
- All superseded by beta.42 atomic fix

---

#### BUG-002: Auth Cache Causing Login Timeout
- **Beta**: 49
- **Commit**: `7d8888c`
- **Date**: 2025-10-16 23:35:11
- **File**: `src/utils/adobeAuthManager.ts`
- **Lines Changed**: +6 / -0
- **Impact Area**: Authentication
- **Severity**: CRITICAL
- **Frequency**: 100% of login attempts (after auth check)
- **User Impact**: "Authentication timed out" error despite successful login, blocks workflow

**Description**:
Initial auth check sets `cachedAuthStatus = false` (30s TTL). User logs in successfully. However, `getOrganizations()` calls `withAuthCheck()`, which sees cached status (< 30s old), uses stale `cachedAuthStatus = false`, and throws "Token expired 0 minutes ago" error.

**Root Cause**:
```typescript
// BROKEN (beta.48 and earlier)
async login() {
    // ... successful login ...
    // BUG: cachedAuthStatus still false from initial check
    // Next operation uses stale cache → fails
}
```

**Fix**:
```typescript
// FIXED (beta.49+)
async login() {
    // ... successful login ...
    // Update cache to reflect new auth state
    this.cachedAuthStatus = true;
    this.cacheTimestamp = Date.now();
}

// Also clear cache before org verification
async getOrganizations() {
    this.cachedAuthStatus = undefined; // Force fresh check
    return await this.withAuthCheck(() => { ... });
}
```

**Integration Strategy**:
- **Priority**: P1 (CRITICAL)
- **Method**: Part of auth system rewrite, adopt wholesale
- **Verification**:
  ```bash
  # Check for cache update after login
  grep -A 20 "async login" src/utils/adobeAuthManager.ts | grep "cachedAuthStatus"
  ```
- **Test Case**:
  1. Perform auth check (should cache false)
  2. Login successfully
  3. Immediately call getOrganizations()
  4. Expected: Success, no "Authentication timed out"
- **Effort**: 0 hours (included in auth system adoption)

**Timeline**:
- Beta 48: Cache introduced for performance
- Beta 49: Cache invalidation bug discovered and fixed

---

#### BUG-003: SDK Not Re-initialized After Login
- **Beta**: 50
- **Commit**: `d237771`
- **Date**: 2025-10-17 00:01:32
- **Files**: `src/utils/adobeAuthManager.ts`, `src/extension.ts`, `src/commands/*.ts`
- **Lines Changed**: +124 / -90
- **Impact Area**: Authentication, Performance
- **Severity**: CRITICAL (performance) / HIGH (functionality)
- **Frequency**: 100% of post-login operations
- **User Impact**: 30x slower operations after login (9+ seconds vs <1s), poor UX

**Description**:
Adobe Console SDK caches authentication state at initialization. After user logs in, SDK still has old (unauthenticated) state, forcing full authentication checks (9+ seconds) instead of using cached token (<1s).

**Root Cause**:
```typescript
// BROKEN (beta.49 and earlier)
async login() {
    await executeAdobeCLI('aio auth login -f');
    // BUG: SDK still has old auth state
    // Next operation: 9+ second full auth check
}
```

**Fix**:
```typescript
// FIXED (beta.50+)
async login() {
    await executeAdobeCLI('aio auth login -f');
    // Re-initialize SDK with new auth state
    await this.initializeSDK();
    // Next operation: <1s cached auth check
}
```

**Integration Strategy**:
- **Priority**: P1 (CRITICAL for UX)
- **Method**: Part of auth system rewrite, adopt wholesale
- **Verification**:
  ```bash
  # Check for SDK re-init after login
  grep -A 30 "async login" src/utils/adobeAuthManager.ts | grep "initializeSDK"
  ```
- **Test Case**:
  1. Login successfully
  2. Immediately call getOrganizations()
  3. Measure time to complete
  4. Expected: <2 seconds (vs 9+ seconds without fix)
- **Effort**: 0 hours (included in auth system adoption)

**Performance Impact**:
- Pre-login operations: 9+ seconds (full auth check)
- Post-login (without fix): 9+ seconds (SDK not updated)
- Post-login (with fix): <1 second (SDK cached token)
- **30x performance improvement**

---

#### BUG-004: tree-sitter Packaging Failure
- **Beta**: 50 (final fix), 43 (initial attempt)
- **Commits**: `7aedc75` (beta.50), `3079c38` (beta.43), `9847d28` (beta.50)
- **Date**: 2025-10-17 02:27:22 (final)
- **File**: `package.json`
- **Lines Changed**: +1 / -3
- **Impact Area**: Build/Packaging
- **Severity**: CRITICAL
- **Frequency**: 100% of VSIX builds (before fix)
- **User Impact**: Extension fails to install, users cannot use extension

**Description**:
The `@adobe/aio-cli-plugin-cloudmanager` package depends on `tree-sitter`, but it wasn't explicitly listed in `package.json`. VSIX packaging failed because `tree-sitter` native binary wasn't included.

**Root Cause**:
```json
// BROKEN (beta.1-42)
{
  "dependencies": {
    "@adobe/aio-cli-plugin-cloudmanager": "^3.7.0"
    // tree-sitter is transitive dep, not included in VSIX
  }
}
```

**Fix Attempt 1 (beta.43)**:
```json
{
  "dependencies": { ... },
  "overrides": {
    "tree-sitter": "0.21.1"  // Forces specific version but doesn't include in VSIX
  }
}
```

**Fix Attempt 2 (beta.50)**:
```json
{
  "dependencies": {
    "@adobe/aio-cli-plugin-cloudmanager": "^3.7.0",
    "tree-sitter": "0.21.1"  // ✅ Explicit dependency, included in VSIX
  }
  // Removed overrides section
}
```

**Integration Strategy**:
- **Priority**: P1 (CRITICAL)
- **Method**: Check `package.json` for explicit `tree-sitter` dependency
- **Verification**:
  ```bash
  # Check if tree-sitter is explicit dependency
  grep '"tree-sitter"' package.json

  # Test VSIX build
  npm run package
  unzip -l demo-builder-*.vsix | grep tree-sitter
  ```
- **Test Case**:
  1. Build VSIX: `npm run package`
  2. Check for tree-sitter binary in VSIX
  3. Install VSIX in fresh VS Code
  4. Activate extension
  5. Expected: No errors, extension loads successfully
- **Effort**: 30 minutes (verify and test)

**Related Fixes**:
- Beta 1: `fix: include node_modules and templates in VSIX` (ef4124b)
- Beta 1: `fix: include SVG icons in VSIX` (790b62e)
- Beta 43: First tree-sitter attempt (overrides only)
- Beta 50: Final solution (explicit dependency)

---

### HIGH Severity Fixes (15 fixes)

These bugs break specific features, cause significant UX degradation, or have frequent user impact.

---

#### BUG-005: Cached Binary Paths with Spaces
- **Beta**: 32
- **Commit**: `533a24d`
- **Date**: 2025-10-15 10:35:06
- **File**: `src/utils/externalCommandManager.ts`
- **Lines Changed**: +2 / -1
- **Impact Area**: Authentication, Command Execution
- **Severity**: HIGH (breaks auth on macOS)
- **Frequency**: 100% on macOS with default npm global paths
- **User Impact**: Auth fails silently, Adobe CLI commands fail

**Description**:
Binary path caching optimization (beta.24) introduced 5-6x performance improvement by avoiding `fnm exec` overhead. However, paths weren't quoted, breaking on macOS where npm global installs go to `/Users/username/Library/Application Support/fnm/...` (spaces in path).

**Root Cause**:
```typescript
// BROKEN (beta.24-31)
finalCommand = `${this.cachedNodeBinaryPath} ${this.cachedAioBinaryPath} ${aioCommand}`;
// Result: /path/to/node /Users/user/Library/Application Support/fnm/bin/aio auth login
// Shell interprets as: /path/to/node /Users/user/Library/Application
// Fails with "command not found"
```

**Fix**:
```typescript
// FIXED (beta.32+)
finalCommand = `"${this.cachedNodeBinaryPath}" "${this.cachedAioBinaryPath}" ${aioCommand}`;
// Result: "/path/to/node" "/Users/user/Library/Application Support/fnm/bin/aio" auth login
// Works correctly
```

**Integration Strategy**:
- **Priority**: P1 (HIGH, affects all macOS users)
- **Method**: Part of auth system rewrite, adopt wholesale
- **Verification**:
  ```bash
  # Check for quoted paths in command execution
  grep -n 'cachedNodeBinaryPath' src/utils/externalCommandManager.ts
  # Should see: `"${this.cachedNodeBinaryPath}" "${this.cachedAioBinaryPath}"`
  ```
- **Test Case**:
  1. Test on macOS with default npm global path
  2. Run Adobe CLI command
  3. Check command execution in debug logs
  4. Expected: Quoted paths, successful execution
- **Effort**: 0 hours (included in auth system adoption)

**Context**:
- Beta 24: Binary path caching introduced (5-6x performance boost)
- Beta 32: Spaces in paths bug discovered and fixed
- Critical for macOS users (default npm install location has spaces)

---

#### BUG-006: Node 24 Compatibility
- **Beta**: 33
- **Commit**: `d5c65d3`
- **Date**: 2025-10-15 11:00:41
- **File**: `src/utils/externalCommandManager.ts`
- **Lines Changed**: +12 / -1
- **Impact Area**: Prerequisites, Authentication
- **Severity**: HIGH
- **Frequency**: 100% if Node 24 installed
- **User Impact**: Adobe CLI fails with cryptic errors, auth doesn't work

**Description**:
Adobe CLI SDK requires Node.js 18, 20, or 22 (LTS versions). Node 24 was released in October 2025 with breaking changes that break the Adobe IMS SDK. If user had Node 24 installed via fnm, extension would try to use it and fail.

**Root Cause**:
```typescript
// BROKEN (beta.1-32)
// Uses whatever Node version is active
const result = await executeCommand('fnm exec node --version');
// Could return v24.x.x → Adobe CLI breaks
```

**Fix**:
```typescript
// FIXED (beta.33+)
async getNodeVersion(): Promise<string | null> {
    const versions = await this.getInstalledNodeVersions();
    // Filter to supported LTS versions (18, 20, 22)
    const supported = versions.filter(v =>
        v.startsWith('18.') || v.startsWith('20.') || v.startsWith('22.')
    );
    // Use highest supported version
    return supported[supported.length - 1] || null;
}
```

**Integration Strategy**:
- **Priority**: P1 (HIGH, breaks extension for Node 24 users)
- **Method**: Part of auth system rewrite, adopt wholesale
- **Verification**:
  ```bash
  # Check for Node version filtering
  grep -n "getNodeVersion" src/utils/externalCommandManager.ts
  grep -A 10 "supported.*18.*20.*22" src/utils/externalCommandManager.ts
  ```
- **Test Case**:
  1. Install Node 24 via fnm
  2. Run extension
  3. Check which Node version is used for Adobe CLI
  4. Expected: Uses Node 18/20/22, not 24
- **Effort**: 0 hours (included in auth system adoption)

**Timeline**:
- Beta 13-14: Adobe CLI Node version issues discovered
- Beta 15: Dynamic Node version detection
- Beta 33: Node 24 compatibility enforced (reject unsupported versions)

---

#### BUG-007: Auth Timeout Refactoring
- **Beta**: 35
- **Commit**: `6009c50`
- **Date**: 2025-10-16 14:41:14
- **Files**: Multiple authentication-related files
- **Impact Area**: Authentication
- **Severity**: HIGH
- **Frequency**: Variable (timeout-dependent)
- **User Impact**: Auth operations timeout prematurely, inconsistent behavior

**Description**:
Timeout values were hardcoded throughout the codebase with inconsistent durations. Adobe CLI operations (especially config writes) were timing out at 5 seconds despite needing up to 10 seconds on slow systems.

**Root Cause**:
```typescript
// BROKEN (beta.1-34)
// Scattered throughout codebase
await executeCommand('aio config set ...', { timeout: 5000 }); // Too short
await executeCommand('aio auth login', { timeout: 30000 });     // Inconsistent
await executeCommand('aio config get ...', { timeout: 3000 });  // Magic numbers
```

**Fix**:
```typescript
// FIXED (beta.35+)
const TIMEOUTS = {
    CONFIG_READ: 5000,      // Fast read operations
    CONFIG_WRITE: 10000,    // ✅ Doubled to 10s for reliability
    AUTH_OPERATION: 60000,  // Full auth flow
    ORG_LIST: 30000,        // API calls
    PROJECT_LIST: 30000
};

await executeCommand('aio config set ...', { timeout: TIMEOUTS.CONFIG_WRITE });
```

**Integration Strategy**:
- **Priority**: P1 (HIGH, affects reliability)
- **Method**: Part of auth system rewrite, adopt wholesale
- **Verification**:
  ```bash
  # Check for TIMEOUTS constant
  grep -n "TIMEOUTS" src/utils/adobeAuthManager.ts
  grep -n "CONFIG_WRITE.*10000" src/utils/adobeAuthManager.ts
  ```
- **Test Case**:
  1. Run auth operations on slow system
  2. Check for timeout errors in logs
  3. Expected: No premature timeouts, operations complete
- **Effort**: 0 hours (included in auth system adoption)

**Related**:
- Beta 46: Remove duplicate timeout message (logging fix)
- Beta 35: Comprehensive timeout standardization

---

#### BUG-008-009: Mesh Node Version Issues
- **Betas**: 19, 20
- **Commits**: `e0ddf6a` (beta.19), `bdf4ea7` (beta.20)
- **Date**: 2025-10-14 15:14:08 (beta.19), 15:35:15 (beta.20)
- **Files**: Mesh deployment commands, dashboard
- **Impact Area**: API Mesh Deployment
- **Severity**: HIGH
- **Frequency**: 100% of mesh operations
- **User Impact**: Mesh creation/deployment fails, uses wrong Node version

**Description**:
API Mesh operations (`aio api-mesh create`, `aio api-mesh update`) require specific Node versions (18, 20, 22). Extension was using default/active Node version instead of explicitly setting correct version via fnm.

**Root Cause** (Beta 19):
```typescript
// BROKEN (beta.1-18)
async createMesh() {
    // Uses whatever Node is active (could be 16, 14, 24, etc.)
    await executeCommand('aio api-mesh create mesh.json');
    // Fails if Node version incompatible
}
```

**Fix** (Beta 19):
```typescript
// PARTIAL FIX (beta.19)
async createMesh() {
    const nodeVersion = await getHighestSupportedNodeVersion(); // 18, 20, or 22
    await executeCommand(`fnm exec --using=${nodeVersion} aio api-mesh create mesh.json`);
}
// But missed some mesh commands...
```

**Complete Fix** (Beta 20):
```typescript
// COMPLETE FIX (beta.20+)
// Applied Node version management to ALL mesh commands:
// - aio api-mesh create
// - aio api-mesh update
// - aio api-mesh delete
// - aio api-mesh get
// All mesh commands now use: fnm exec --using=${supportedNodeVersion}
```

**Integration Strategy**:
- **Priority**: P1 (HIGH, breaks mesh functionality)
- **Method**: Review mesh deployment code for Node version handling
- **Verification**:
  ```bash
  # Check mesh commands for Node version management
  grep -n "api-mesh" src/commands/deployMesh*.ts
  grep -A 5 "api-mesh" src/commands/deployMesh*.ts | grep "fnm exec"
  ```
- **Test Cases**:
  1. Create new mesh with Node 24 active
  2. Check command execution uses Node 18/20/22
  3. Expected: Mesh creation succeeds
  4. Test: Update mesh, delete mesh (all commands)
- **Effort**: 2 hours (review and verify all mesh commands)

**Timeline**:
- Beta 13-18: Various Node version management improvements
- Beta 19: Mesh Node version fix (partial)
- Beta 20: Complete mesh Node version fix (all commands)

---

#### BUG-010: Dashboard Mesh Status Detection
- **Beta**: 21
- **Commit**: `b8cf3c0`
- **Date**: 2025-10-14 16:06:17
- **Files**: Dashboard mesh status checking
- **Impact Area**: Dashboard
- **Severity**: HIGH
- **Frequency**: 100% when mesh deployed
- **User Impact**: Dashboard shows incorrect mesh status, confuses users

**Description**:
Dashboard couldn't detect if mesh was deployed. Checked only `lastDeployed` timestamp, which doesn't exist for legacy projects or fresh deployments. Needed fallback to check `componentConfigs.mesh` field.

**Root Cause**:
```typescript
// BROKEN (beta.1-20)
function isMeshDeployed() {
    return projectState.lastDeployed !== undefined;
    // Always returns false for legacy projects
}
```

**Fix**:
```typescript
// FIXED (beta.21+)
function isMeshDeployed() {
    // Primary check: lastDeployed timestamp
    if (projectState.lastDeployed) {
        return true;
    }
    // Fallback: check componentConfigs
    if (projectState.componentConfigs?.mesh) {
        return true;
    }
    return false;
}
```

**Integration Strategy**:
- **Priority**: P1 (HIGH, affects dashboard UX)
- **Method**: Review dashboard mesh status logic
- **Verification**:
  ```bash
  # Check dashboard mesh status detection
  grep -n "isMeshDeployed\|meshStatus" src/commands/*dashboard*.ts
  grep -A 10 "componentConfigs.*mesh" src/commands/*dashboard*.ts
  ```
- **Test Cases**:
  1. Open project with mesh deployed (has lastDeployed)
  2. Dashboard shows mesh as deployed ✓
  3. Open legacy project with mesh (no lastDeployed, has componentConfigs)
  4. Dashboard shows mesh as deployed ✓
  5. Open project without mesh
  6. Dashboard shows no mesh ✓
- **Effort**: 1 hour (review and test)

---

#### BUG-011: Dashboard Issues - Multiple Fixes
- **Beta**: 18
- **Commit**: `335b6a0`
- **Date**: 2025-10-14 15:09:10
- **Files**: Dashboard webview and backend
- **Impact Area**: Dashboard
- **Severity**: HIGH
- **Frequency**: Various (per issue)
- **User Impact**: Dashboard shows wrong data, errors not displayed

**Description**:
Beta 18 fixed multiple dashboard issues in a single commit:
1. Component versions not displayed correctly
2. Mesh status detection wrong
3. Deployment errors not shown to user
4. No immediate feedback on actions

**Specific Fixes**:

**1. Component Versions Not Displayed**:
```typescript
// BROKEN: Fetched versions but didn't update UI
async getComponentVersions() {
    const versions = await fetchVersions();
    // BUG: Never sent to webview
}

// FIXED: Send to webview
async getComponentVersions() {
    const versions = await fetchVersions();
    this.webview.postMessage({
        type: 'componentVersions',
        versions: versions
    });
}
```

**2. Deployment Errors Not Shown**:
```typescript
// BROKEN: Errors caught but not displayed
async deployMesh() {
    try {
        await deploy();
    } catch (error) {
        // BUG: Error logged but user not notified
        console.error(error);
    }
}

// FIXED: Show error to user
async deployMesh() {
    try {
        await deploy();
    } catch (error) {
        vscode.window.showErrorMessage(`Mesh deployment failed: ${error.message}`);
        this.webview.postMessage({ type: 'deploymentError', error: error.message });
    }
}
```

**Integration Strategy**:
- **Priority**: P1 (HIGH, affects dashboard UX)
- **Method**: Review dashboard code for these specific patterns
- **Verification**:
  ```bash
  # Check dashboard error handling
  grep -n "showErrorMessage\|postMessage.*error" src/commands/*dashboard*.ts
  ```
- **Test Cases**:
  1. Open dashboard, check component versions displayed
  2. Trigger deployment error, check error shown to user
  3. Perform action, check immediate feedback
- **Effort**: 2 hours (multiple related fixes)

---

#### BUG-012: False Component Update Notifications
- **Beta**: 22
- **Commit**: `0e0cca9`
- **Date**: 2025-10-14 16:32:35
- **Files**: Update checking, component versioning
- **Impact Area**: Auto-Update System
- **Severity**: HIGH
- **Frequency**: 100% on project open (before fix)
- **User Impact**: Constant false "updates available" notifications, notification fatigue

**Description**:
Opening existing projects always showed "component updates available" notification, even when components were up-to-date. Version checking logic compared full SHA vs short SHA, always detecting mismatch.

**Root Cause**:
```typescript
// BROKEN (beta.1-21)
function checkForUpdates() {
    const installedVersion = projectState.components.mesh.version; // Short SHA: "abc1234"
    const latestVersion = await getLatestSHA();                     // Full SHA: "abc1234567890..."

    if (installedVersion !== latestVersion) {  // Always true!
        showUpdateNotification();
    }
}
```

**Fix**:
```typescript
// FIXED (beta.22+)
function checkForUpdates() {
    const installedVersion = projectState.components.mesh.version;  // "abc1234"
    const latestVersion = await getLatestSHA();                     // "abc1234567890..."
    const latestShortSHA = latestVersion.substring(0, 7);          // "abc1234"

    if (installedVersion !== latestShortSHA) {
        showUpdateNotification();
    }
}
```

**Integration Strategy**:
- **Priority**: P1 (HIGH, affects user experience)
- **Method**: Review component version comparison logic
- **Verification**:
  ```bash
  # Check SHA comparison logic
  grep -n "substring.*7\|slice.*7" src/utils/componentUpdater.ts
  grep -A 10 "checkForUpdates" src/utils/componentUpdater.ts
  ```
- **Test Cases**:
  1. Open project with up-to-date components
  2. Check for update notification
  3. Expected: No notification
  4. Update a component to older version
  5. Open project
  6. Expected: Update notification shown
- **Effort**: 1 hour (review and test)

**Related Fixes**:
- Beta 28-30: Further version tracking improvements
- Beta 22: Initial fix for false notifications

---

#### BUG-013-015: Component Version Tracking Issues
- **Betas**: 28, 29, 30
- **Commits**: `22810d7` (beta.28), `8e5ed0a` (beta.29), `05d4932` (beta.30)
- **Dates**: 2025-10-15 (all three on same day)
- **Files**: Component updater, project creation
- **Impact Area**: Component System, Auto-Update
- **Severity**: HIGH
- **Frequency**: 100% during project creation (beta.28), update checks (beta.29-30)
- **User Impact**: Component versions not tracked correctly, auto-update breaks

**Description**:
Three related fixes addressing component version tracking:
1. **Beta 28**: Versions not saved during project creation
2. **Beta 29**: Git SHA detection in auto-fix logic
3. **Beta 30**: Fetch real commit SHAs, short SHA comparison

**Beta 28 - Version Tracking During Creation**:
```typescript
// BROKEN (beta.1-27)
async createProject() {
    await installComponents();
    // BUG: Component versions never saved to project state
}

// FIXED (beta.28+)
async createProject() {
    const versions = await installComponents();
    await projectState.setComponentVersions({
        mesh: versions.mesh,
        frontend: versions.frontend
        // ... etc
    });
}
```

**Beta 29 - Git SHA Detection**:
```typescript
// BROKEN (beta.28)
async getCurrentSHA() {
    const result = await exec('git rev-parse HEAD', { cwd: componentDir });
    return result.stdout.trim(); // Could be empty if git fails
}

// FIXED (beta.29+)
async getCurrentSHA() {
    const result = await exec('git rev-parse HEAD', { cwd: componentDir });
    if (result.code !== 0 || !result.stdout) {
        throw new Error('Failed to get git SHA');
    }
    return result.stdout.trim();
}
```

**Beta 30 - Real Commit SHAs**:
```typescript
// BROKEN (beta.28-29)
async getLatestSHA(repo: string) {
    // Fetched tag/branch ref, not actual commit SHA
    const result = await exec(`git ls-remote ${repo} HEAD`);
    return result.stdout.split('\t')[0]; // Might be ref, not SHA
}

// FIXED (beta.30+)
async getLatestSHA(repo: string) {
    // Fetch actual commit object
    const result = await exec(`git ls-remote ${repo} HEAD`);
    const fullSHA = result.stdout.split('\t')[0];
    // Verify it's a valid SHA (40 hex chars)
    if (!/^[0-9a-f]{40}$/i.test(fullSHA)) {
        throw new Error('Invalid SHA format');
    }
    return fullSHA.substring(0, 7); // Return short SHA for comparison
}
```

**Integration Strategy**:
- **Priority**: P1 (HIGH, breaks auto-update system)
- **Method**: Review component version tracking end-to-end
- **Verification**:
  ```bash
  # Check version tracking during creation
  grep -n "setComponentVersions" src/commands/createProject*.ts

  # Check SHA detection logic
  grep -n "git rev-parse HEAD" src/utils/componentUpdater.ts
  grep -n "ls-remote" src/utils/componentUpdater.ts
  ```
- **Test Cases**:
  1. Create new project
  2. Check `.demo-builder/state.json` has component versions
  3. Update component
  4. Check version updated correctly
  5. Run update check
  6. Verify SHA comparison correct
- **Effort**: 2 hours (end-to-end review and testing)

---

#### BUG-016: Welcome Screen Conflict
- **Beta**: 23
- **Commit**: `8fcc9c5`
- **Date**: 2025-10-14 16:42:02
- **Files**: Project opening, welcome screen
- **Impact Area**: Project Lifecycle
- **Severity**: MEDIUM (impacts UX)
- **Frequency**: 100% when opening project with VS Code welcome screen enabled
- **User Impact**: Dashboard doesn't open, welcome screen blocks view

**Description**:
When opening a demo builder project folder, the dashboard webview tried to open but VS Code welcome screen took focus/tab space, preventing dashboard from displaying.

**Root Cause**:
```typescript
// BROKEN (beta.1-22)
async openProject(folderPath: string) {
    await vscode.commands.executeCommand('vscode.openFolder', folderPath);
    // Dashboard opens in background
    await this.showDashboard();
    // BUG: Welcome screen steals focus, dashboard hidden
}
```

**Fix**:
```typescript
// FIXED (beta.23+)
async openProject(folderPath: string) {
    await vscode.commands.executeCommand('vscode.openFolder', folderPath);

    // Wait for workspace to fully load
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Close welcome screen if open
    const welcomeTab = vscode.window.tabGroups.all
        .flatMap(g => g.tabs)
        .find(t => t.label === 'Welcome');

    if (welcomeTab) {
        await vscode.window.tabGroups.close(welcomeTab);
    }

    // Now show dashboard
    await this.showDashboard();
}
```

**Integration Strategy**:
- **Priority**: P2 (MEDIUM, UX issue not blocking)
- **Method**: Review project opening logic
- **Verification**:
  ```bash
  # Check for welcome screen handling
  grep -n "Welcome\|tabGroups\.close" src/commands/*project*.ts
  ```
- **Test Cases**:
  1. Enable VS Code welcome screen (setting)
  2. Open demo builder project
  3. Expected: Dashboard opens and is visible (welcome closed)
- **Effort**: 1 hour (review and test)

---

#### BUG-017: Git Prerequisite Detection
- **Beta**: 18
- **Commit**: `d8ebdec`
- **Date**: 2025-10-14 14:37:05
- **Files**: Prerequisites system
- **Impact Area**: Prerequisites
- **Severity**: MEDIUM
- **Frequency**: Variable (depends on git installation)
- **User Impact**: Git prerequisite fails even when git installed

**Description**:
Prerequisite check for git was too strict, only accepting git installed via Homebrew. Failed for users with Xcode Command Line Tools git, system git, or other installations.

**Root Cause**:
```typescript
// BROKEN (beta.1-17)
async checkGit() {
    const result = await exec('which git');
    const gitPath = result.stdout.trim();

    // BUG: Only accepts Homebrew git
    if (!gitPath.includes('/opt/homebrew/bin/git')) {
        return { installed: false };
    }
    return { installed: true };
}
```

**Fix**:
```typescript
// FIXED (beta.18+)
async checkGit() {
    const result = await exec('git --version');

    // Accept ANY git installation
    if (result.code === 0 && result.stdout.includes('git version')) {
        return {
            installed: true,
            version: result.stdout.match(/git version ([\d.]+)/)?.[1]
        };
    }

    return { installed: false };
}
```

**Integration Strategy**:
- **Priority**: P2 (MEDIUM, only affects specific configurations)
- **Method**: Review prerequisite checking logic
- **Verification**:
  ```bash
  # Check git prerequisite logic
  grep -n "checkGit\|git --version" templates/prerequisites.json
  grep -n "checkGit" src/features/prerequisites/*.ts
  ```
- **Test Cases**:
  1. Test with Homebrew git: Should pass
  2. Test with Xcode Command Line Tools git: Should pass
  3. Test with system git: Should pass
  4. Test without git: Should fail
- **Effort**: 30 minutes (review and test)

---

#### BUG-018: Adobe CLI Node Version Management
- **Beta**: 13
- **Commit**: `a2e29e4`
- **Date**: 2025-10-14 11:03:45
- **Files**: Prerequisites, Adobe CLI execution
- **Impact Area**: Prerequisites, Authentication
- **Severity**: MEDIUM
- **Frequency**: 100% when multiple Node versions installed
- **User Impact**: Adobe CLI uses wrong Node version, may fail

**Description**:
Adobe CLI should always use highest compatible Node version (18, 20, or 22) for best compatibility. Before fix, used whatever Node version was active, which could be incompatible (14, 16, 24).

**Root Cause**:
```typescript
// BROKEN (beta.1-12)
async executeAdobeCLI(command: string) {
    // Uses active Node version (could be anything)
    return await exec(`aio ${command}`);
}
```

**Fix**:
```typescript
// FIXED (beta.13+)
async executeAdobeCLI(command: string) {
    // Always use highest compatible Node version
    const nodeVersion = await this.getHighestSupportedNodeVersion(); // 18, 20, or 22
    return await exec(`fnm exec --using=${nodeVersion} aio ${command}`);
}

async getHighestSupportedNodeVersion(): Promise<string> {
    const versions = await this.getInstalledNodeVersions();
    const supported = versions.filter(v =>
        v.startsWith('18.') || v.startsWith('20.') || v.startsWith('22.')
    );
    // Return highest version (sorted)
    return supported[supported.length - 1];
}
```

**Integration Strategy**:
- **Priority**: P2 (MEDIUM, usually not an issue but critical when it is)
- **Method**: Review Adobe CLI command execution
- **Verification**:
  ```bash
  # Check for Node version management in CLI execution
  grep -n "fnm exec --using" src/utils/externalCommandManager.ts
  grep -n "getHighestSupportedNodeVersion" src/utils/externalCommandManager.ts
  ```
- **Test Cases**:
  1. Install multiple Node versions (16, 18, 20, 22, 24)
  2. Set active version to 16
  3. Run Adobe CLI command
  4. Check command uses Node 22 (highest compatible)
- **Effort**: 1 hour (review and test)

---

#### BUG-019: Per-Node-Version Plugin Checks
- **Beta**: 12
- **Commit**: `0d8aaaa`
- **Date**: 2025-10-14 10:19:41
- **Files**: Prerequisites system, Adobe CLI plugin checks
- **Impact Area**: Prerequisites
- **Severity**: MEDIUM
- **Frequency**: 100% when multiple Node versions installed
- **User Impact**: Plugin checks fail, incorrect prerequisite status

**Description**:
Adobe CLI plugins are installed per Node version (fnm creates separate npm global directories for each Node version). Prerequisite checks only checked plugins for active Node version, missing plugins installed for other versions.

**Root Cause**:
```typescript
// BROKEN (beta.1-11)
async checkAdobePlugins() {
    // Only checks active Node version
    const result = await exec('aio plugins');
    return parsePlugins(result.stdout);
}
```

**Fix**:
```typescript
// FIXED (beta.12+)
async checkAdobePlugins() {
    const nodeVersions = await this.getInstalledNodeVersions();
    const allPlugins = new Map();

    // Check plugins for EACH Node version
    for (const version of nodeVersions) {
        const result = await exec(`fnm exec --using=${version} aio plugins`);
        const plugins = parsePlugins(result.stdout);

        // Merge plugin lists
        plugins.forEach(plugin => {
            if (!allPlugins.has(plugin.name)) {
                allPlugins.set(plugin.name, plugin);
            }
        });
    }

    return Array.from(allPlugins.values());
}
```

**Integration Strategy**:
- **Priority**: P2 (MEDIUM, affects multi-version setups)
- **Method**: Review prerequisite checking for plugins
- **Verification**:
  ```bash
  # Check plugin checking logic
  grep -n "aio plugins" src/features/prerequisites/*.ts
  grep -A 20 "checkAdobePlugins\|checkPlugins" src/features/prerequisites/*.ts
  ```
- **Test Cases**:
  1. Install Node 18 and 20
  2. Install Adobe CLI plugins on Node 18 only
  3. Switch to Node 20 (active)
  4. Run prerequisite check
  5. Expected: Plugins detected (from Node 18 check)
- **Effort**: 1 hour (review and test)

---

#### BUG-020: Update Checker Semver Sorting
- **Beta**: 11
- **Commit**: `6ae4584`
- **Date**: 2025-10-13 20:05:17
- **Files**: Update manager
- **Impact Area**: Auto-Update System
- **Severity**: MEDIUM
- **Frequency**: 100% when checking for updates
- **User Impact**: Wrong "latest" version detected, may show outdated versions as updates

**Description**:
GitHub API returns releases in chronological order (newest first), not semantic version order. If releases published out of order (e.g., v1.0.0-beta.10 published after v1.0.0-beta.9 but v1.0.0-beta.11 published before beta.10), GitHub's order is misleading.

**Root Cause**:
```typescript
// BROKEN (beta.1-10)
async getLatestVersion() {
    const releases = await fetchGitHubReleases(); // Returns chronological order
    return releases[0].tag_name; // First = most recently published, NOT highest version
}
```

**Fix**:
```typescript
// FIXED (beta.11+)
import semver from 'semver';

async getLatestVersion() {
    const releases = await fetchGitHubReleases();

    // Extract version tags
    const versions = releases.map(r => r.tag_name);

    // Sort by semantic version (highest first)
    const sorted = versions
        .filter(v => semver.valid(v))
        .sort((a, b) => semver.rcompare(a, b)); // Reverse compare = highest first

    return sorted[0]; // Highest semantic version
}
```

**Integration Strategy**:
- **Priority**: P2 (MEDIUM, usually not an issue but critical when it is)
- **Method**: Review update checking logic
- **Verification**:
  ```bash
  # Check for semver usage
  grep -n "semver" src/utils/updateManager.ts
  grep -n "rcompare\|sort.*version" src/utils/updateManager.ts
  ```
- **Test Cases**:
  1. Simulate releases published out of order
  2. Run update check
  3. Verify latest version is highest semantic version, not most recent publish
- **Effort**: 30 minutes (review and test)

---

### MEDIUM Severity Fixes (22 fixes)

These bugs affect specific scenarios, cause UI glitches, or have occasional user impact.

---

#### BUG-021: fnm Reliability Improvements
- **Beta**: 9
- **Commit**: `01b94d6`
- **Date**: 2025-10-13 19:15:26
- **Files**: External command manager, prerequisite checks
- **Impact Area**: Prerequisites, Node Version Management
- **Severity**: MEDIUM
- **Frequency**: Variable (environment-dependent)
- **User Impact**: fnm commands fail intermittently, Node version detection broken

**Description**:
fnm path detection and command execution had reliability issues. Multiple commits addressed:
1. fnm path not found in PATH
2. fnm commands timing out
3. Duplicate fnm path checks (performance)

**Fixes Applied**:
- Explicit fnm path detection and caching
- Retry logic for fnm commands
- Better error handling when fnm not in PATH
- Performance optimization (cached fnm path)

**Integration Strategy**:
- **Priority**: P2 (MEDIUM)
- **Method**: Review fnm-related code
- **Effort**: 1 hour

---

#### BUG-022: Semver Version Comparison (Update Checker)
- **Beta**: 7
- **Commit**: `11a407e`
- **Date**: 2025-10-13 18:41:25
- **Files**: Update manager
- **Impact Area**: Auto-Update System
- **Severity**: MEDIUM
- **Frequency**: 100% of version comparisons
- **User Impact**: String comparison fails for versions (e.g., "1.0.10" < "1.0.9" as strings)

**Description**:
Version comparison used string comparison instead of semantic versioning. Beta versions with 2-digit numbers sorted incorrectly.

**Root Cause**:
```typescript
// BROKEN (beta.1-6)
if (currentVersion < latestVersion) {  // String comparison!
    // "1.0.9" > "1.0.10" (lexicographic)
}
```

**Fix**:
```typescript
// FIXED (beta.7+)
import semver from 'semver';

if (semver.lt(currentVersion, latestVersion)) {
    // Proper semantic version comparison
}
```

**Integration Strategy**:
- **Priority**: P2 (MEDIUM)
- **Method**: Search for version comparisons
- **Verification**:
  ```bash
  grep -n "semver\.lt\|semver\.gt\|semver\.compare" src/utils/updateManager.ts
  ```
- **Effort**: 30 minutes

---

#### BUG-023-025: fnm/Node-Version Awareness (Prerequisites)
- **Betas**: 3, 4, 5
- **Commits**: `5a22e45` (beta.3), `4519b6a` (beta.4)
- **Dates**: 2025-10-13
- **Files**: Prerequisites system, wizard checks
- **Impact Area**: Prerequisites
- **Severity**: MEDIUM
- **Frequency**: 100% when using fnm
- **User Impact**: Prerequisites checks fail or show wrong status

**Description**:
Early betas didn't account for fnm's per-version Node installations. Prerequisite checks needed to be fnm-aware.

**Fixes**:
- Beta 3: Make prerequisite checks fnm/Node-version aware
- Beta 4: Add fnm path verification to wizard checks
- Beta 5: Auto-update compatibility for fnm setups

**Integration Strategy**:
- **Priority**: P2 (MEDIUM)
- **Method**: Review prerequisite checking logic for fnm awareness
- **Effort**: 1 hour

---

#### BUG-026-027: VSIX Packaging Issues
- **Betas**: 1, 2
- **Commits**: `ef4124b` (node_modules/templates), `790b62e` (SVG icons), `071bf59` (commands)
- **Date**: 2025-10-13
- **Files**: package.json, .vscodeignore
- **Impact Area**: Build/Packaging
- **Severity**: MEDIUM (HIGH when it fails)
- **Frequency**: 100% of builds before fix
- **User Impact**: Extension fails to install or missing features

**Description**:
Initial VSIX packaging didn't include critical files:
1. node_modules (dependencies)
2. templates directory (prerequisites/components configs)
3. SVG icons (UI assets)
4. Commands listed in package.json

**Fixes**:
```json
// package.json - Include files
{
  "vsce": {
    "files": [
      "dist/**/*",
      "media/**/*",
      "templates/**/*",
      "node_modules/**/*"
    ]
  }
}

// .vscodeignore - Don't exclude needed files
// Removed: node_modules/** (was excluding dependencies)
// Removed: templates/** (was excluding configs)
```

**Integration Strategy**:
- **Priority**: P2 (MEDIUM, likely already fixed)
- **Method**: Review .vscodeignore and package.json
- **Verification**:
  ```bash
  npm run package
  unzip -l *.vsix | grep -E "node_modules|templates|media"
  ```
- **Effort**: 30 minutes

---

#### BUG-028: Repository URL Fixes
- **Betas**: 2, 5
- **Commits**: `e31fe8e` (beta.2), `74827a1` (beta.5)
- **Dates**: 2025-10-13
- **Files**: package.json, updateManager.ts
- **Impact Area**: Auto-Update System
- **Severity**: MEDIUM
- **Frequency**: 100% of update checks
- **User Impact**: Update checks fail, can't fetch releases

**Description**:
Repository URL in package.json was incorrect or missing, breaking GitHub API calls for update checking.

**Fix**:
```json
// package.json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/adobe/demo-builder-vscode"  // Corrected URL
  },
  "author": "Adobe Systems Incorporated"  // Added author
}
```

**Integration Strategy**:
- **Priority**: P2 (MEDIUM)
- **Method**: Verify repository URL in package.json
- **Effort**: 5 minutes

---

### LOW Severity Fixes (11 fixes)

These are logging improvements, UI polish, and edge case fixes.

---

#### BUG-029: Org Switching Log Symbols
- **Beta**: 47
- **Commit**: `b6da839`
- **Date**: 2025-10-16 23:08:51
- **Files**: Logging
- **Impact Area**: Logging/UX
- **Severity**: LOW
- **User Impact**: Minor visual inconsistency in logs

**Integration**: P3 (Nice to have), 15 minutes

---

#### BUG-030: Duplicate Timeout Message
- **Beta**: 46
- **Commit**: `f892e56`
- **Date**: 2025-10-16 22:47:38
- **Files**: Logging
- **Impact Area**: Logging
- **Severity**: LOW
- **User Impact**: Duplicate log message (visual noise)

**Integration**: P3 (Nice to have), 15 minutes

---

#### BUG-031: Prerequisite Status Messages
- **Beta**: 45
- **Commit**: `c060bd5`
- **Date**: 2025-10-16 22:26:29
- **Files**: Logging, Prerequisites
- **Impact Area**: Logging/UX
- **Severity**: LOW
- **User Impact**: Status messages not visible in main logs

**Integration**: P3 (Nice to have), 15 minutes

---

#### BUG-032: Log Cleanup & Adobe CLI Detection
- **Beta**: 44
- **Commit**: `c89a902`
- **Date**: 2025-10-16 22:17:29
- **Files**: Logging
- **Impact Area**: Logging
- **Severity**: LOW
- **User Impact**: Verbose logging, noise in logs

**Integration**: P3 (Nice to have), 15 minutes

---

#### BUG-033: Prerequisites UX
- **Beta**: 43
- **Commit**: `be508fe`
- **Date**: 2025-10-16 21:52:18
- **Files**: Prerequisites UI
- **Impact Area**: Prerequisites/UX
- **Severity**: LOW
- **User Impact**: Minor UX improvements in prerequisite checking

**Integration**: P3 (Nice to have), 30 minutes

---

#### BUG-034: Emoji Standardization
- **Beta**: 48
- **Commit**: `6bb53b5`
- **Date**: 2025-10-16 23:23:05
- **Files**: DebugLogger
- **Impact Area**: Logging
- **Severity**: LOW
- **User Impact**: Cosmetic (emoji consistency)

**Integration**: P4 (Optional), 15 minutes

---

#### BUG-035: Debug Log Verbosity Reduction
- **Beta**: 31
- **Commit**: `b9414ef`
- **Date**: 2025-10-15 09:51:54
- **Files**: Debug logging
- **Impact Area**: Logging
- **Severity**: LOW
- **User Impact**: Excessive debug logs (85% reduction)

**Integration**: P4 (Optional), 15 minutes

---

#### BUG-036-040: Progress Label Fixes
- **Betas**: 50 (multiple commits)
- **Commits**: `8551d05`, `b6263a9`, `f650588`, etc.
- **Date**: 2025-10-17 01-02 AM
- **Files**: Prerequisites progress display
- **Impact Area**: UX
- **Severity**: LOW
- **User Impact**: Progress labels confusing or inconsistent

**Integration**: P3-P4 (Nice to have), 30 minutes total

---

#### BUG-041: Adobe CLI Installation Detection
- **Betas**: 50 (multiple commits)
- **Commits**: `4f67cc5`, `7f6bab0`
- **Date**: 2025-10-17 01 AM
- **Files**: Prerequisites
- **Impact Area**: Prerequisites
- **Severity**: MEDIUM (affects prerequisite status)
- **User Impact**: Adobe CLI shows as not installed when it is

**Integration**: P2 (Should have), 1 hour

---

### CRITICAL Fixes - Beta 51-72 (10 additional fixes)

---

#### BUG-053: Node 14 Fallback Causing MODULE_NOT_FOUND
- **Beta**: 51
- **Commit**: `63a7325`
- **Date**: 2025-10-17 10:23:25
- **File**: `src/utils/externalCommandManager.ts`, `src/commands/createProjectWebview.ts`
- **Lines Changed**: +40 / -35
- **Impact Area**: Node Version Management, Authentication
- **Severity**: CRITICAL
- **Frequency**: Variable (depends on fnm default version)
- **User Impact**: Auth fails with MODULE_NOT_FOUND, blocks ALL Adobe operations

**Description**:
The "allowed versions" concept allowed fallback to fnm default Node version, which could be Node 14. This caused catastrophic auth failures with MODULE_NOT_FOUND errors since Adobe IMS SDK requires Node 18+.

**Root Cause**:
```typescript
// BROKEN (beta.1-50)
// Could fall back to fnm default (Node 14)
const allowedVersions = await getComponentNodeVersions();
// If no match, uses fnm default → Could be Node 14
```

**Fix**:
```typescript
// FIXED (beta.51+)
// REMOVED allowedNodeVersions concept entirely
// Always use infrastructure-defined version from components.json
// Single source of truth, no fallback to unsafe versions
```

**Integration Strategy**:
- **Priority**: P1 (CRITICAL)
- **Method**: Part of Node Version Management chain (beta.51-53), integrate together
- **Dependencies**: Requires beta.52-53 changes
- **Effort**: 2 hours (as part of chain)

**Related Fixes**: BUG-054 (beta.51), BUG-055 (beta.53), BUG-056 (beta.53)

---

#### BUG-054: Leaky Abstraction with Allowed Versions
- **Beta**: 51
- **Commit**: `63a7325`
- **Date**: 2025-10-17 10:23:25
- **File**: `src/utils/externalCommandManager.ts`
- **Impact Area**: Node Version Management
- **Severity**: CRITICAL (architectural)
- **User Impact**: Inconsistent Node version selection, unpredictable behavior

**Description**:
The setAllowedNodeVersions() API was a leaky abstraction that exposed internal version management logic to callers. Created inconsistency and made Node version behavior hard to reason about.

**Fix**:
```typescript
// REMOVED (beta.51)
// - setAllowedNodeVersions() method
// - clearAllowedNodeVersions() method
// - allowedNodeVersions instance variable

// NEW (beta.51)
// Single source of truth: components.json
// Infrastructure version ALWAYS used
```

**Integration**: P1 (CRITICAL), 2 hours (part of chain)

**Related**: BUG-053, BUG-055, BUG-056

---

#### BUG-055: Adobe CLI Using Node 24 Instead of Node 18
- **Beta**: 53
- **Commit**: `c9c7b1b`
- **Date**: 2025-10-17 10:50:00
- **File**: `src/utils/externalCommandManager.ts`
- **Lines Changed**: +13 / -3
- **Impact Area**: Authentication, Node Version Management
- **Severity**: CRITICAL
- **Frequency**: 100% when Node 24 installed
- **User Impact**: "Node.js v24.10.0 not supported" SDK errors, auth fails

**Description**:
During authentication (before project creation), system scanned all installed Node versions [18, 20, 22, 24], found Node 24 with aio-cli installed, and used it instead of infrastructure-defined Node 18. Adobe Console SDK doesn't support Node 24.

**Root Cause**:
```typescript
// BROKEN (beta.51-52)
// Auth happens BEFORE project creation (no project context)
// System scans all versions, finds Node 24
// Uses Node 24 → SDK fails with "not supported" error
```

**Fix**:
```typescript
// FIXED (beta.53+)
// PRIORITY 1: Infrastructure-defined version (even without project)
// PRIORITY 2: Project-configured versions
// PRIORITY 3: Scan all versions only as fallback
async getNodeVersion() {
    // Try infrastructure version first (works before project creation)
    const infraVersion = await getInfrastructureNodeVersion();
    if (infraVersion) return infraVersion;

    // Then project versions
    // Then scan as last resort
}
```

**Integration Strategy**:
- **Priority**: P1 (CRITICAL)
- **Method**: Part of Node Version Management chain (beta.51-53)
- **Test**: Auth must work before project creation with infrastructure Node 18
- **Effort**: 2 hours (part of chain)

**Related**: BUG-053, BUG-054, BUG-056

---

#### BUG-056: Auth Fails Without Project Context
- **Beta**: 53
- **Commit**: `c9c7b1b`
- **Date**: 2025-10-17 10:50:00
- **File**: `src/utils/externalCommandManager.ts`
- **Impact Area**: Authentication
- **Severity**: CRITICAL
- **Frequency**: 100% of initial auth attempts
- **User Impact**: Cannot authenticate before creating first project

**Description**:
Node version detection required project context, but authentication happens BEFORE project creation. System couldn't determine correct Node version for Adobe CLI operations during initial setup.

**Fix**:
Infrastructure-defined Node version (from components.json) is now always available and used first, even without project context. Auth works before any projects exist.

**Integration**: P1 (CRITICAL), 2 hours (part of chain)

**Related**: BUG-053, BUG-054, BUG-055

---

#### BUG-057: Silent Failures for Users Without Developer Role
- **Beta**: 56
- **Commit**: `f75dc06`
- **Date**: 2025-10-17 11:15:00
- **Files**: `src/utils/adobeAuthManager.ts`, `src/commands/createProjectWebview.ts`
- **Lines Changed**: +55 / -3
- **Impact Area**: Authentication, Permissions
- **Severity**: CRITICAL
- **Frequency**: 100% for users without Developer/System Admin role
- **User Impact**: Confusing errors, blocked workflow, no clear guidance

**Description**:
Users without Developer or System Admin role in Adobe Console experienced silent failures or confusing timeout messages. No definitive permission check existed, leading to 30-second timeouts and unclear error messages.

**Root Cause**:
```typescript
// BROKEN (beta.1-55)
// No definitive permission check
// Users without proper role → timeout errors
// Confusing "Authentication timed out" message
```

**Fix**:
```typescript
// FIXED (beta.56+)
// New testDeveloperPermissions() method
private async testDeveloperPermissions(): Promise<boolean> {
    // Uses 'aio app list --json' which REQUIRES Developer permissions
    const result = await executeAdobeCLI('app list --json');
    if (result.code === 0) {
        return true; // Has permissions
    }
    // Check error for permission keywords
    if (result.stderr.includes('permissions') || result.stderr.includes('access')) {
        throw new Error('no_app_builder_access');
    }
    return false;
}
```

**Integration Strategy**:
- **Priority**: P1 (CRITICAL for UX)
- **Method**: Part of Auth & Permissions chain (beta.54-58), integrate together
- **Test**: User without Developer role gets clear "Insufficient Privileges" error
- **Effort**: 2 hours (as part of auth chain)

**Related**: BUG-058 through BUG-062

---

#### BUG-058: fnm Installed But Not Configured
- **Beta**: 59
- **Commit**: `caa3fd9`
- **Date**: 2025-10-17 12:01:00
- **File**: `src/utils/progressUnifier.ts`
- **Lines Changed**: +67 / -1
- **Impact Area**: Prerequisites, Demo Startup
- **Severity**: CRITICAL
- **Frequency**: 100% on fresh installs
- **User Impact**: "We can't find necessary environment variables" error on demo startup

**Description**:
The "Configuring shell" step during prerequisites was just a placeholder that did nothing. fnm was installed but shell profile (.zshrc or .bash_profile) never configured, causing demo startup failures.

**Root Cause**:
```typescript
// BROKEN (beta.1-58)
async configureFnmShell() {
    // TODO: Actually configure shell
    // Step showed as complete but did nothing
}
```

**Fix**:
```typescript
// FIXED (beta.59+)
async configureFnmShell() {
    // Detect shell type
    const shellProfile = process.env.SHELL?.includes('zsh')
        ? '.zshrc'
        : '.bash_profile';

    // Check if already configured
    const profileContent = await fs.readFile(shellProfile, 'utf8');
    if (profileContent.includes('fnm env')) {
        return; // Already configured
    }

    // Add fnm configuration
    await fs.appendFile(shellProfile, `
# fnm (Fast Node Manager)
export PATH="$HOME/.fnm:$PATH"
eval "$(fnm env --use-on-cd)"
`);
}
```

**Integration Strategy**:
- **Priority**: P1 (CRITICAL)
- **Method**: Standalone fix, add to prerequisite system
- **Test**: Demo startup should work without manual shell configuration
- **Effort**: 1 hour

**Related**: BUG-059

---

#### BUG-059: "Can't Find Environment Variables" Error
- **Beta**: 59
- **Commit**: `caa3fd9`
- **Date**: 2025-10-17 12:01:00
- **File**: `src/utils/progressUnifier.ts`
- **Impact Area**: Prerequisites, Demo Startup
- **Severity**: CRITICAL
- **User Impact**: Demo fails to start with cryptic error message

**Description**:
Consequence of BUG-058. Without fnm shell configuration, environment variables (FNM_DIR, PATH with fnm) weren't set, causing demo processes to fail finding Node.js.

**Fix**: Same as BUG-058 (fnm shell configuration implementation)

**Integration**: P1 (CRITICAL), 1 hour (same fix as BUG-058)

---

#### BUG-060: "Starting Directory Does Not Exist" Error
- **Beta**: 61
- **Commit**: `4556597`
- **Date**: 2025-10-17 12:17:00
- **Files**: `src/commands/createProjectWebview.ts`, `src/utils/terminalManager.ts`
- **Lines Changed**: +26 / -5
- **Impact Area**: Terminal Management, Prerequisites
- **Severity**: CRITICAL
- **Frequency**: 100% when creating terminals during prerequisites
- **User Impact**: Terminal creation fails, Homebrew installation fails

**Description**:
During prerequisites installation, terminals tried to open in project directories that didn't exist yet. VS Code failed with "Starting directory does not exist" error.

**Root Cause**:
```typescript
// BROKEN (beta.1-60)
async createTerminal() {
    // Project directory doesn't exist during prerequisites
    const cwd = projectPath; // /path/to/project (doesn't exist)
    const terminal = vscode.window.createTerminal({ cwd });
    // ERROR: Starting directory does not exist
}
```

**Fix**:
```typescript
// FIXED (beta.61+)
async createTerminal() {
    // Safe fallback to home directory
    let cwd = projectPath;
    if (!fs.existsSync(cwd)) {
        cwd = os.homedir(); // Fallback to home
    }
    const terminal = vscode.window.createTerminal({ cwd });
}
```

**Integration Strategy**:
- **Priority**: P1 (CRITICAL)
- **Method**: Part of Terminal & Workspace chain (beta.61-66), integrate together
- **Effort**: 2 hours (as part of chain)

**Related**: BUG-061, BUG-062, BUG-063, BUG-064, BUG-065

---

#### BUG-061: Homebrew Install Failures During Prerequisites
- **Beta**: 61
- **Commit**: `4556597`
- **Date**: 2025-10-17 12:17:00
- **Impact Area**: Prerequisites
- **Severity**: CRITICAL
- **User Impact**: Cannot install prerequisites, extension unusable

**Description**:
Consequence of BUG-060. Terminal creation failures prevented Homebrew installation from running, blocking entire prerequisite flow.

**Fix**: Same as BUG-060 (safe terminal directory fallback)

**Integration**: P1 (CRITICAL), 2 hours (part of Terminal chain)

**Related**: BUG-060, BUG-062-065

---

#### BUG-062: project.created.toISOString() Crashes
- **Beta**: 70
- **Commit**: `80ee9a8`
- **Date**: 2025-10-17 15:47:00
- **File**: `src/utils/stateManager.ts`
- **Lines Changed**: +2 / -1
- **Impact Area**: State Management, Type Safety
- **Severity**: CRITICAL
- **Frequency**: Variable (when project.created is stored as string)
- **User Impact**: Extension crashes with "toISOString is not a function"

**Description**:
Project creation date is sometimes stored as ISO string, sometimes as Date object. Calling toISOString() on string crashes the extension.

**Root Cause**:
```typescript
// BROKEN (beta.1-69)
created: project.created.toISOString()
// If project.created is string → TypeError: toISOString is not a function
```

**Fix**:
```typescript
// FIXED (beta.70+)
created: (project.created instanceof Date
    ? project.created
    : new Date(project.created)
).toISOString()
```

**Integration Strategy**:
- **Priority**: P1 (CRITICAL - prevents crashes)
- **Method**: Standalone type safety fix
- **Test**: Open projects with various state.json formats
- **Effort**: 30 minutes

**Note**: This MUST be in final code - prevents crashes

---

### HIGH Severity Fixes - Beta 51-72 (10 additional fixes)

---

#### BUG-063: Confusing Timeout for No App Builder Access
- **Beta**: 55
- **Commit**: `7102b6d`
- **Date**: 2025-10-17 11:10:00
- **Files**: `src/commands/createProjectWebview.ts`, `src/utils/adobeAuthManager.ts`
- **Lines Changed**: +5 / -13
- **Impact Area**: Authentication, Error Messaging
- **Severity**: HIGH
- **User Impact**: Users see "Authentication timed out" instead of clear permission error

**Description**:
Users without App Builder access got confusing "Authentication timed out" message after 30-second wait. No clear guidance on what to do.

**Fix**:
```typescript
// FIXED (beta.55+)
// Error type: 'no_app_builder_access' vs generic timeout
// Message: "You don't have App Builder access. Contact your administrator or try a different account."
```

**Integration**: P2 (HIGH), 2 hours (part of Auth & Permissions chain)

**Related**: BUG-057, BUG-064-067

---

#### BUG-064: Generic Error Messages
- **Beta**: 55
- **Commit**: `7102b6d`
- **Date**: 2025-10-17 11:10:00
- **File**: `src/commands/createProjectWebview.ts`
- **Impact Area**: Error Handling, UX
- **Severity**: HIGH
- **User Impact**: Users don't know how to resolve errors

**Description**:
Error messages were generic ("Authentication failed") without specific guidance for different failure modes (permissions, network, timeouts).

**Fix**:
Specific error messages with actionable guidance:
- Permission errors: "Contact administrator or try different account"
- Network errors: "Check connection and try again"
- Timeout errors: "Adobe I/O may be slow, try again later"

**Integration**: P2 (HIGH), 2 hours (part of Auth chain)

---

#### BUG-065: Can't Distinguish Permission vs Connection Errors
- **Beta**: 56
- **Commit**: `f75dc06`
- **Date**: 2025-10-17 11:15:00
- **File**: `src/utils/adobeAuthManager.ts`
- **Impact Area**: Error Handling
- **Severity**: HIGH
- **User Impact**: Wrong error messages, wrong recovery actions suggested

**Description**:
All errors treated as generic failures. Couldn't tell if user had permission issues (permanent) vs network issues (transient).

**Fix**:
```typescript
// FIXED (beta.56+)
// Parse error messages for permission keywords
if (error.includes('permissions') || error.includes('access')) {
    throw new Error('no_app_builder_access');
} else if (error.includes('ECONNREFUSED') || error.includes('timeout')) {
    throw new Error('network_error');
}
```

**Integration**: P2 (HIGH), 2 hours (part of Auth chain)

---

#### BUG-066: Retry Button Pointless for Permission Errors
- **Beta**: 57
- **Commit**: `c8d617c`
- **Date**: 2025-10-17 11:21:00
- **File**: `src/webviews/components/steps/AdobeAuthStep.tsx`
- **Lines Changed**: +28 / -11
- **Impact Area**: UI, UX
- **Severity**: HIGH
- **User Impact**: Users click retry button repeatedly, doesn't help

**Description**:
UI showed "Retry" button for permission errors. Retrying doesn't help - user needs different organization with proper permissions.

**Fix**:
```typescript
// FIXED (beta.57+)
// Permission errors: Show "Sign In Again" (force new login to select different org)
// Connection errors: Keep "Retry" button
{error.type === 'no_app_builder_access' ? (
    <Button onClick={() => handleLogin(true)}>Sign In Again</Button>
) : (
    <Button onClick={handleRetry}>Retry</Button>
)}
```

**Integration**: P2 (HIGH), 2 hours (part of Auth chain)

---

#### BUG-067: "Sign In Again" Reuses Insufficient Token
- **Beta**: 58
- **Commit**: `c51a540`
- **Date**: 2025-10-17 11:31:00
- **File**: `src/webviews/components/steps/AdobeAuthStep.tsx`
- **Lines Changed**: +2 / -2
- **Impact Area**: Authentication, UX
- **Severity**: HIGH
- **User Impact**: Cannot select different organization with proper permissions

**Description**:
"Sign In Again" button used force=false, which reused existing (insufficient) token. User couldn't select different organization.

**Fix**:
```typescript
// FIXED (beta.58+)
// force=true → Always open browser, even with valid token
handleLogin(force = true); // User can select different org
```

**Integration**: P2 (HIGH), 2 hours (part of Auth chain)

---

#### BUG-068: Terminal Errors with Project as Workspace Folder
- **Beta**: 62
- **Commit**: `ac36ab4`
- **Date**: 2025-10-17 12:23:00
- **Files**: `src/commands/createProjectWebview.ts`, `src/utils/terminalManager.ts`
- **Lines Changed**: +30 / -16
- **Impact Area**: Terminal Management
- **Severity**: HIGH
- **User Impact**: Terminal creation fails when project is workspace folder

**Description**:
If project directory was added to workspace, terminals during prerequisites had conflicts and errors.

**Fix**:
```typescript
// FIXED (beta.62+)
// Detect if cwd is .demo-builder/projects pattern
if (cwd.includes('.demo-builder/projects')) {
    cwd = os.homedir(); // Use home directory instead
}
```

**Integration**: P2 (HIGH), 2 hours (part of Terminal chain)

---

#### BUG-069: Workspace Folder Conflicts
- **Beta**: 63
- **Commit**: `a83d547`
- **Date**: 2025-10-17 13:06:00
- **Files**: `src/commands/createProjectWebview.ts`, `src/utils/terminalManager.ts`
- **Lines Changed**: +18 / -47
- **Impact Area**: Workspace Management
- **Severity**: HIGH
- **User Impact**: Terminal errors, workspace conflicts

**Description**:
Adding project to workspace caused terminal directory errors and workspace conflicts. Simpler approach: use ComponentTreeProvider for file browsing, don't add to workspace.

**Fix**:
```typescript
// FIXED (beta.63+)
// REMOVED workspace folder addition logic (-41 lines)
// Use ComponentTreeProvider only for file browsing
// Eliminates all workspace-related terminal issues
```

**Integration**: P2 (HIGH), 2 hours (part of Terminal chain)

---

#### BUG-070: Extension Host Restart Needed for Terminals
- **Beta**: 65
- **Commit**: `30d156d`
- **Date**: 2025-10-17 13:22:00
- **Files**: `src/commands/createProjectWebview.ts`, `src/utils/terminalManager.ts`
- **Lines Changed**: +98 / -19
- **Impact Area**: Terminal Management
- **Severity**: HIGH
- **User Impact**: Have to restart VS Code for terminals to work correctly

**Description**:
Terminal management wasn't using proper project directory detection. Required Extension Host restart for terminals to work after project creation.

**Fix**:
```typescript
// FIXED (beta.65+)
// Smart directory detection with fallback hierarchy
async getTerminalCwd() {
    // Priority 1: Existing project directory
    if (projectDir && fs.existsSync(projectDir)) {
        return projectDir;
    }

    // Priority 2: Workspace folder
    if (vscode.workspace.workspaceFolders?.[0]) {
        return vscode.workspace.workspaceFolders[0].uri.fsPath;
    }

    // Priority 3: Home directory
    return os.homedir();
}
```

**Integration**: P2 (HIGH), 2 hours (part of Terminal chain)

---

#### BUG-071: Adobe CLI Checks Show Incorrect Status
- **Beta**: 70
- **Commit**: `80ee9a8`
- **Date**: 2025-10-17 15:47:00
- **File**: `src/commands/createProjectWebview.ts`
- **Lines Changed**: +5 / -1
- **Impact Area**: Prerequisites
- **Severity**: HIGH
- **User Impact**: Adobe CLI shows as not installed after successful installation

**Description**:
Adobe CLI prerequisite checks used wrong method (execute() instead of executeAdobeCLI()), showing incorrect installation status for specific Node versions.

**Fix**:
```typescript
// FIXED (beta.70+)
// Use executeAdobeCLI() for per-node version checks
const result = await executeAdobeCLI('plugins', nodeVersion);
// Correctly detects Adobe CLI in specific Node version
```

**Integration**: P2 (HIGH), 1 hour

---

#### BUG-072: Node 24 Shows Not Installed After Install
- **Beta**: 71
- **Commit**: `0549830`
- **Date**: 2025-10-17 15:52:00
- **File**: `src/commands/createProjectWebview.ts`
- **Lines Changed**: +32 / -1
- **Impact Area**: Prerequisites
- **Severity**: HIGH
- **User Impact**: False negative - Adobe CLI appears missing for component Node versions

**Description**:
Adobe CLI was only checked in infrastructure Node versions (18, 20, 22). Missed component-specific versions like Node 24 (used by citisignal-nextjs).

**Root Cause**:
```typescript
// BROKEN (beta.1-70)
// Only checked infrastructure versions
const versions = getInfrastructureNodeVersions(); // [18, 20, 22]
// Missed Node 24 from citisignal-nextjs component
```

**Fix**:
```typescript
// FIXED (beta.71+)
// Check ALL project Node versions (infrastructure + components)
const versions = getRequiredNodeVersions(); // [18, 20, 22, 24]
for (const version of versions) {
    await checkAdobeCLI(version);
}
```

**Integration**: P2 (HIGH), 1 hour

---

### MEDIUM Severity Fixes - Beta 51-72 (8 additional fixes)

---

#### BUG-073: Redundant adobe-cli-sdk Component
- **Beta**: 52
- **Commit**: `9f17b28`
- **Date**: 2025-10-17 10:32:00
- **File**: `templates/components.json`
- **Lines Changed**: +2 / -7
- **Impact Area**: Architecture, Components
- **Severity**: MEDIUM
- **User Impact**: Unnecessary complexity, separate component for SDK

**Description**:
Adobe CLI and Adobe Console SDK were defined as separate infrastructure components, but SDK runs inside CLI process. Redundant architecture.

**Fix**:
```json
// FIXED (beta.52+)
{
  "name": "Adobe I/O CLI & SDK",
  "nodeVersion": 18,
  "installCommand": "npm install -g @adobe/aio-cli"
}
// Removed separate adobe-cli-sdk component
```

**Integration**: P3 (MEDIUM), 30 minutes

---

#### BUG-074: console.error Instead of Logger
- **Beta**: 64
- **Commit**: `2780300`
- **Date**: 2025-10-17 13:12:00
- **File**: `src/utils/stateManager.ts`
- **Lines Changed**: +9 / -2
- **Impact Area**: Logging
- **Severity**: MEDIUM
- **User Impact**: Inconsistent logging, errors not in proper log channel

**Description**:
StateManager used console.error instead of proper Logger instance, causing errors to go to wrong output channel.

**Fix**:
```typescript
// FIXED (beta.64+)
// Use Logger instead of console.error
this.logger.error('Failed to save project state', error);
```

**Integration**: P3 (MEDIUM - logging cleanup), 15 minutes

---

#### BUG-075: 132 Lines of Dead Code
- **Beta**: 66
- **Commit**: `2adf6fa`
- **Date**: 2025-10-17 13:24:00
- **File**: `src/utils/terminalManager.ts` (DELETED)
- **Lines Changed**: -132
- **Impact Area**: Code Quality
- **Severity**: MEDIUM
- **User Impact**: None (code not used)

**Description**:
TerminalManager class was not being used anywhere. Actual terminal creation logic was in createProjectWebview.ts. Entire file was dead code.

**Fix**:
Deleted entire file (-132 lines).

**Integration**: P3 (MEDIUM - code cleanup), 15 minutes
**Note**: Verify refactor branch doesn't import this file

---

#### BUG-076: Verbose Progress Notifications
- **Beta**: 67
- **Commit**: `09982ae`
- **Date**: 2025-10-17 13:40:00
- **File**: `src/commands/startDemo.ts`
- **Lines Changed**: -1
- **Impact Area**: UX, Notifications
- **Severity**: MEDIUM
- **User Impact**: Too many notifications, notification fatigue

**Description**:
"Starting frontend application..." notification was redundant - dashboard indicators already show status.

**Fix**:
Removed notification. Dashboard provides sufficient visual feedback.

**Integration**: P3 (MEDIUM - UX polish), 15 minutes

---

#### BUG-077: Notification Flash from Overlapping Messages
- **Beta**: 69
- **Commit**: `18a44ba`
- **Date**: 2025-10-17 13:52:00
- **File**: `src/commands/stopDemo.ts`
- **Lines Changed**: -1
- **Impact Area**: UX, Notifications
- **Severity**: MEDIUM
- **User Impact**: Visual flash from notification overlap

**Description**:
"Releasing port X..." notification overlapped with "Demo stopped successfully", causing visual flash.

**Fix**:
Removed intermediate notification. Single "Demo stopped successfully" notification is cleaner.

**Integration**: P3 (MEDIUM - UX polish), 15 minutes

---

#### BUG-078: Auto-Dismissing Notifications Pattern
- **Beta**: 72
- **Commits**: `b484231`, `da0e5a7`
- **Date**: 2025-10-17 16:00-16:02:00
- **Files**: `src/shared/base/baseCommand.ts`, `src/commands/configureProjectWebview.ts`
- **Lines Changed**: +6 / -3
- **Impact Area**: UX, Notifications
- **Severity**: MEDIUM (pattern improvement)
- **User Impact**: Modal notifications require manual dismissal

**Description**:
Success notifications used showInformationMessage() which requires manual dismissal. Better UX: auto-dismiss after 2 seconds.

**Fix**:
```typescript
// FIXED (beta.72+)
// Before: Modal notification
vscode.window.showInformationMessage(message);

// After: Auto-dismissing (2 seconds)
await this.showProgressNotification(message, 2000);
```

**Integration**: P3 (MEDIUM - UX pattern), 30 minutes

---

### LOW Severity Fixes - Beta 51-72 (2 additional fixes)

---

#### BUG-079: Can't Diagnose 0 Organizations Issue
- **Beta**: 54
- **Commit**: `70d3f9f`
- **Date**: 2025-10-17 11:00:00
- **File**: `src/utils/adobeAuthManager.ts`
- **Lines Changed**: +9
- **Impact Area**: Debugging, Logging
- **Severity**: LOW (debug tooling)
- **User Impact**: Developers can't diagnose why 0 organizations returned

**Description**:
Temporary debug logging added to understand SDK vs CLI response format differences when 0 organizations returned.

**Note**: This debug logging was removed in beta.55 after issue diagnosed.

**Integration**: P4 (Optional - debug code removed anyway), skip

---

#### BUG-080: Passive "Waiting for Port..." Message
- **Beta**: 68
- **Commit**: `e1508ce`
- **Date**: 2025-10-17 13:48:00
- **File**: `src/commands/stopDemo.ts`
- **Lines Changed**: +1 / -1
- **Impact Area**: UX, Messaging
- **Severity**: LOW (wording)
- **User Impact**: Passive message instead of active

**Description**:
Message said "Waiting for port X..." (passive) instead of "Releasing port X..." (active).

**Note**: Message was removed entirely in beta.69 (BUG-077).

**Integration**: P4 (Optional - message removed anyway), skip

---

## Fixes by Impact Area

### Authentication System (17 fixes - 12 from beta.1-50, 5 from beta.51-72)
| Beta | Severity | Summary | Priority |
|------|----------|---------|----------|
| 42 | **CRITICAL** | Token corruption race condition | P1 |
| 56 | **CRITICAL** | Silent failures without Developer role | P1 |
| 55 | HIGH | Confusing timeout for no App Builder access | P2 |
| 55 | HIGH | Generic error messages | P2 |
| 56 | HIGH | Can't distinguish permission vs connection | P2 |
| 57 | HIGH | Retry button pointless for permissions | P2 |
| 58 | HIGH | "Sign In Again" reuses insufficient token | P2 |
| 49 | **CRITICAL** | Cache timeout on login | P1 |
| 50 | **CRITICAL** | SDK re-init after login | P1 |
| 32 | HIGH | Binary paths with spaces | P1 |
| 33 | HIGH | Node 24 compatibility | P1 |
| 35 | HIGH | Auth timeout refactoring | P1 |
| 39-41 | HIGH | Token corruption detection/recovery | P1 |
| 36-38 | MEDIUM | Auth debugging improvements | P2 |
| 34 | HIGH | Auth system rewrite (foundation) | P1 |

**Total Critical Impact**: Must integrate entire auth system rewrite (beta.34-50) as a cohesive unit. Individual fixes depend on the refactored architecture.

**Integration Strategy**: **ACCEPT MASTER AUTH SYSTEM WHOLESALE** (4-6 hours testing)

---

### Build/Packaging System (3 fixes)
| Beta | Severity | Summary | Priority |
|------|----------|---------|----------|
| 50 | **CRITICAL** | tree-sitter packaging | P1 |
| 1 | MEDIUM | Include node_modules/templates | P2 |
| 1 | MEDIUM | Include SVG icons | P2 |
| 1 | MEDIUM | Restore missing commands | P2 |

**Integration**: Review package.json and .vscodeignore (1 hour)

---

### Mesh Deployment System (4 fixes)
| Beta | Severity | Summary | Priority |
|------|----------|---------|----------|
| 19 | HIGH | API Mesh Node version (partial) | P1 |
| 20 | HIGH | ALL mesh Node versions (complete) | P1 |
| 21 | HIGH | Dashboard mesh status detection | P1 |
| 19 | HIGH | Bulletproof rollback | P1 |

**Integration**: Review mesh commands for Node version handling (2-3 hours)

---

### Component/Update System (8 fixes)
| Beta | Severity | Summary | Priority |
|------|----------|---------|----------|
| 28 | HIGH | Version tracking during creation | P1 |
| 29 | HIGH | Git SHA detection | P1 |
| 30 | HIGH | Real commit SHAs + short SHA compare | P1 |
| 22 | HIGH | False update notifications | P1 |
| 31 | MEDIUM | Visual progress indicators | P2 |
| 11 | MEDIUM | Update checker semver sorting | P2 |
| 7 | MEDIUM | Semver version comparison | P2 |
| 2,5 | MEDIUM | Repository URL fixes | P2 |

**Integration**: Review component version tracking and update checking (3-4 hours)

---

### Prerequisites System (11 fixes)
| Beta | Severity | Summary | Priority |
|------|----------|---------|----------|
| 18 | MEDIUM | Git prerequisite detection | P2 |
| 13 | MEDIUM | Adobe CLI Node version | P2 |
| 12 | MEDIUM | Per-node plugin checks | P2 |
| 9 | MEDIUM | fnm reliability | P2 |
| 50 | MEDIUM | Adobe CLI installation detection | P2 |
| 3-5 | MEDIUM | fnm/Node awareness | P2 |
| 43 | LOW | Prerequisites UX | P3 |
| 45 | LOW | Status messages | P3 |

**Integration**: Review prerequisite checking logic (2-3 hours)

---

### Dashboard System (2 fixes)
| Beta | Severity | Summary | Priority |
|------|----------|---------|----------|
| 21 | HIGH | Mesh status detection | P1 |
| 18 | HIGH | Multiple dashboard fixes | P1 |

**Integration**: Review dashboard code (2-3 hours)

---

### Project Lifecycle (1 fix)
| Beta | Severity | Summary | Priority |
|------|----------|---------|----------|
| 23 | MEDIUM | Welcome screen conflict | P2 |

**Integration**: Review project opening logic (1 hour)

---

### Logging/UX (11 fixes - mostly LOW priority)
| Beta | Severity | Summary | Priority |
|------|----------|---------|----------|
| 47 | LOW | Org switching logs | P3 |
| 46 | LOW | Duplicate timeout message | P3 |
| 45 | LOW | Prerequisite status messages | P3 |
| 44 | LOW | Log cleanup | P3 |
| 48 | LOW | Emoji standardization | P4 |
| 31 | LOW | Debug verbosity reduction | P4 |
| 50 | LOW | Multiple progress label fixes | P3-P4 |

**Integration**: Optional polish (1-2 hours total if desired)

---

## Integration Priority Breakdown

### Priority 1: MUST Have Before v1.0 (19 fixes)

These are critical path fixes that MUST be verified/integrated:

1. **BUG-001-003**: Authentication fixes (token corruption, cache timeout, SDK re-init)
   - **Method**: Adopt entire auth system rewrite (beta.34-50)
   - **Effort**: 4-6 hours (testing and verification)
   - **Risk**: HIGH if not integrated, LOW if adopted wholesale

2. **BUG-004**: tree-sitter packaging
   - **Method**: Verify explicit dependency in package.json
   - **Effort**: 30 minutes
   - **Risk**: CRITICAL if missing (extension won't install)

3. **BUG-005**: Binary paths with spaces
   - **Method**: Part of auth system (included in #1)
   - **Effort**: 0 hours additional
   - **Risk**: LOW (macOS-specific)

4. **BUG-006**: Node 24 compatibility
   - **Method**: Part of auth system (included in #1)
   - **Effort**: 0 hours additional
   - **Risk**: MEDIUM (affects Node 24 users)

5. **BUG-007**: Auth timeout refactoring
   - **Method**: Part of auth system (included in #1)
   - **Effort**: 0 hours additional
   - **Risk**: MEDIUM (reliability)

6. **BUG-008-009**: Mesh Node version issues
   - **Method**: Review mesh command execution
   - **Effort**: 2 hours
   - **Risk**: HIGH (breaks mesh deployment)

7. **BUG-010**: Dashboard mesh status detection
   - **Method**: Review dashboard logic
   - **Effort**: 1 hour
   - **Risk**: MEDIUM (UX issue)

8. **BUG-011**: Dashboard multiple fixes
   - **Method**: Review dashboard code
   - **Effort**: 2 hours
   - **Risk**: MEDIUM (UX issues)

9. **BUG-012**: False component update notifications
   - **Method**: Review version comparison
   - **Effort**: 1 hour
   - **Risk**: MEDIUM (user annoyance)

10. **BUG-013-015**: Component version tracking
    - **Method**: Review version tracking end-to-end
    - **Effort**: 2 hours
    - **Risk**: HIGH (breaks auto-update)

**Total P1 Effort**: 12-15 hours
**Total P1 Fixes**: 19 fixes

---

### Priority 2: Should Have Before v1.0 (15 fixes)

Important fixes that should be integrated:

1. **BUG-016**: Welcome screen conflict (1 hour)
2. **BUG-017**: Git prerequisite detection (30 minutes)
3. **BUG-018**: Adobe CLI Node version (1 hour)
4. **BUG-019**: Per-node plugin checks (1 hour)
5. **BUG-020**: Update checker semver (30 minutes)
6. **BUG-021**: fnm reliability (1 hour)
7. **BUG-022**: Semver version comparison (30 minutes)
8. **BUG-023-025**: fnm/Node awareness (1 hour)
9. **BUG-026-027**: VSIX packaging (30 minutes)
10. **BUG-028**: Repository URL (5 minutes)
11. **BUG-041**: Adobe CLI detection (1 hour)

**Total P2 Effort**: 8-10 hours
**Total P2 Fixes**: 15 fixes

---

### Priority 3: Can Defer to v1.1 (12 fixes)

Nice-to-have improvements:

1. **BUG-029-033**: Logging improvements (1-2 hours total)
2. **BUG-036-040**: Progress label fixes (30 minutes)

**Total P3 Effort**: 1.5-2.5 hours
**Total P3 Fixes**: 12 fixes

---

### Priority 4: Optional (6 fixes)

Cosmetic fixes, can defer indefinitely:

1. **BUG-034**: Emoji standardization (15 minutes)
2. **BUG-035**: Debug log verbosity (15 minutes)

**Total P4 Effort**: 30 minutes
**Total P4 Fixes**: 6 fixes

---

## Verification Checklist

### Authentication Fixes (BUG-001 to BUG-007)

#### ✅ Step 1: Verify Auth System Architecture
```bash
# Check if refactor branch has the rewritten auth system
ls -la src/utils/adobeAuthManager.ts
git log --oneline src/utils/adobeAuthManager.ts | head -20

# Compare master vs refactor
git diff master refactor/claude-first-attempt -- src/utils/adobeAuthManager.ts | head -100
```

**Decision Point**:
- If refactor has similar auth rewrite → Verify fixes present
- If refactor has old auth code → Must integrate beta.34-50 auth rewrite

#### ✅ Step 2: Check for Token Corruption Fix (BUG-001)
```bash
# Search for vulnerable pattern (should NOT exist)
grep -n "Promise.all" src/utils/adobeAuthManager.ts

# Search for fix (should exist)
grep -n "access_token --json" src/utils/adobeAuthManager.ts
grep -A 10 "access_token --json" src/utils/adobeAuthManager.ts
```

**Expected**:
- ❌ No `Promise.all([...token..., ...expiry...])` pattern
- ✅ Single atomic `aio config get ims.contexts.cli.access_token --json`

**Test Case**:
```typescript
// Test: Rapid authentication stress test
for (let i = 0; i < 20; i++) {
    await authenticate();
    const token = await inspectToken();
    expect(token.expiry).toBeGreaterThan(0);
}
```

#### ✅ Step 3: Check for Auth Cache Fix (BUG-002)
```bash
# Search for cache update after login
grep -A 30 "async login" src/utils/adobeAuthManager.ts | grep "cachedAuthStatus"
```

**Expected**:
```typescript
async login() {
    // ... login logic ...
    this.cachedAuthStatus = true;  // ✅ Cache updated
    this.cacheTimestamp = Date.now();
}
```

**Test Case**:
```typescript
// Test: Login then immediate operation
await checkAuth();  // Sets cachedAuthStatus = false
await login();      // Should update cachedAuthStatus = true
await getOrganizations();  // Should succeed (no timeout)
```

#### ✅ Step 4: Check for SDK Re-init Fix (BUG-003)
```bash
# Search for SDK re-initialization after login
grep -A 30 "async login" src/utils/adobeAuthManager.ts | grep "initializeSDK"
```

**Expected**:
```typescript
async login() {
    // ... login logic ...
    await this.initializeSDK();  // ✅ SDK re-initialized
}
```

**Test Case**:
```typescript
// Test: Post-login performance
await login();
const start = Date.now();
await getOrganizations();
const duration = Date.now() - start;
expect(duration).toBeLessThan(2000);  // Should be <2s, not 9+s
```

#### ✅ Step 5: Check for Binary Paths Fix (BUG-005)
```bash
# Search for quoted paths
grep -n "cachedNodeBinaryPath" src/utils/externalCommandManager.ts
grep -A 5 "cachedNodeBinaryPath" src/utils/externalCommandManager.ts
```

**Expected**:
```typescript
finalCommand = `"${this.cachedNodeBinaryPath}" "${this.cachedAioBinaryPath}" ${aioCommand}`;
// ✅ Paths are quoted
```

**Test Case**:
```bash
# Test on macOS with spaces in path
npm config get prefix  # Should return path with "Application Support"
# Run Adobe CLI command, check it succeeds
```

#### ✅ Step 6: Check for Node 24 Compatibility (BUG-006)
```bash
# Search for Node version filtering
grep -n "getNodeVersion" src/utils/externalCommandManager.ts
grep -A 10 "18.*20.*22" src/utils/externalCommandManager.ts
```

**Expected**:
```typescript
const supported = versions.filter(v =>
    v.startsWith('18.') || v.startsWith('20.') || v.startsWith('22.')
);
// ✅ Only LTS versions allowed
```

**Test Case**:
```bash
fnm install 24
fnm use 24
# Run extension, verify it uses Node 22 (not 24)
```

#### ✅ Step 7: Check for Timeout Refactoring (BUG-007)
```bash
# Search for TIMEOUTS constant
grep -n "TIMEOUTS" src/utils/adobeAuthManager.ts
grep -n "CONFIG_WRITE.*10000" src/utils/adobeAuthManager.ts
```

**Expected**:
```typescript
const TIMEOUTS = {
    CONFIG_WRITE: 10000,  // ✅ 10 seconds (was 5)
    // ...
};
```

---

### Build/Packaging Fixes (BUG-004, BUG-026-027)

#### ✅ Step 8: Verify tree-sitter Packaging (BUG-004)
```bash
# Check for explicit dependency
grep '"tree-sitter"' package.json

# Build and verify inclusion
npm run package
unzip -l demo-builder-*.vsix | grep tree-sitter
```

**Expected**:
```json
{
  "dependencies": {
    "tree-sitter": "0.21.1"  // ✅ Explicit dependency
  }
}
```

**Test Case**:
1. Build VSIX: `npm run package`
2. Install in fresh VS Code
3. Activate extension
4. Expected: No errors

#### ✅ Step 9: Verify VSIX Packaging (BUG-026-027)
```bash
# Check package includes critical files
npm run package
unzip -l demo-builder-*.vsix | grep -E "node_modules|templates|media"
```

**Expected**:
- node_modules directory included
- templates directory included
- media/SVG icons included

---

### Mesh Deployment Fixes (BUG-008 to BUG-010)

#### ✅ Step 10: Check Mesh Node Version Handling (BUG-008-009)
```bash
# Search for mesh commands with Node version management
grep -n "api-mesh" src/commands/deployMesh*.ts
grep -A 5 "api-mesh" src/commands/deployMesh*.ts | grep -E "fnm exec|getNodeVersion"
```

**Expected**:
```typescript
// All mesh commands should use:
const nodeVersion = await getHighestSupportedNodeVersion();
await exec(`fnm exec --using=${nodeVersion} aio api-mesh ${command}`);
```

**Test Case**:
```bash
fnm install 24
fnm use 24
# Create mesh, verify uses Node 22 (not 24)
```

#### ✅ Step 11: Check Dashboard Mesh Status (BUG-010)
```bash
# Search for mesh status detection
grep -n "isMeshDeployed\|meshStatus" src/commands/*dashboard*.ts
grep -A 10 "componentConfigs.*mesh\|lastDeployed" src/commands/*dashboard*.ts
```

**Expected**:
```typescript
function isMeshDeployed() {
    return projectState.lastDeployed || projectState.componentConfigs?.mesh;
    // ✅ Fallback to componentConfigs
}
```

**Test Case**:
1. Open project with lastDeployed set → Shows deployed ✓
2. Open legacy project (no lastDeployed, has componentConfigs.mesh) → Shows deployed ✓
3. Open project without mesh → Shows not deployed ✓

---

### Component/Update System Fixes (BUG-012 to BUG-015, BUG-020, BUG-022)

#### ✅ Step 12: Check Version Comparison Logic (BUG-012)
```bash
# Search for SHA comparison
grep -n "substring.*7\|slice.*7" src/utils/componentUpdater.ts
grep -A 10 "checkForUpdates" src/utils/componentUpdater.ts
```

**Expected**:
```typescript
const latestShortSHA = latestVersion.substring(0, 7);
if (installedVersion !== latestShortSHA) {
    // ✅ Compare short SHA to short SHA
}
```

#### ✅ Step 13: Check Version Tracking (BUG-013-015)
```bash
# Check version saving during creation
grep -n "setComponentVersions" src/commands/createProject*.ts

# Check SHA detection
grep -n "git rev-parse HEAD" src/utils/componentUpdater.ts
grep -n "ls-remote" src/utils/componentUpdater.ts
```

**Expected**:
- Versions saved during project creation
- SHA detection has error handling
- ls-remote fetches actual commit SHA

#### ✅ Step 14: Check Semver Usage (BUG-020, BUG-022)
```bash
# Search for semver usage
grep -n "import.*semver" src/utils/updateManager.ts
grep -n "semver\." src/utils/updateManager.ts
```

**Expected**:
```typescript
import semver from 'semver';
// Version comparison:
if (semver.lt(current, latest)) { ... }
// Version sorting:
versions.sort((a, b) => semver.rcompare(a, b));
```

---

### Prerequisites System Fixes (BUG-017 to BUG-019, BUG-021, BUG-023-025, BUG-041)

#### ✅ Step 15: Check Git Detection (BUG-017)
```bash
# Check git prerequisite logic
grep -n "checkGit\|git --version" templates/prerequisites.json
```

**Expected**:
```typescript
// Accept ANY git installation (not just Homebrew)
const result = await exec('git --version');
return result.code === 0 && result.stdout.includes('git version');
```

#### ✅ Step 16: Check Adobe CLI Node Version (BUG-018)
```bash
# Check Adobe CLI execution with Node version
grep -n "executeAdobeCLI" src/utils/externalCommandManager.ts
grep -A 10 "executeAdobeCLI" src/utils/externalCommandManager.ts
```

**Expected**:
```typescript
async executeAdobeCLI(command: string) {
    const nodeVersion = await getHighestSupportedNodeVersion();
    return await exec(`fnm exec --using=${nodeVersion} aio ${command}`);
}
```

#### ✅ Step 17: Check Per-Node Plugin Checks (BUG-019)
```bash
# Check plugin checking logic
grep -n "aio plugins" src/features/prerequisites/*.ts
grep -A 20 "checkPlugins" src/features/prerequisites/*.ts
```

**Expected**:
```typescript
// Check plugins for EACH Node version
for (const version of nodeVersions) {
    const result = await exec(`fnm exec --using=${version} aio plugins`);
    // Merge results...
}
```

#### ✅ Step 18: Check fnm Reliability (BUG-021, BUG-023-025)
```bash
# Check fnm path detection and caching
grep -n "fnmPath\|getFnmPath" src/utils/externalCommandManager.ts
```

**Expected**:
- fnm path detected and cached
- Error handling when fnm not in PATH
- Prerequisite checks are fnm-aware

---

## Risk Assessment

### HIGH RISK: Potential Lost Fixes

These fixes may be lost if refactor branch diverged before they were made:

1. **Authentication System Rewrite (beta.34-50)**
   - **Risk**: Entire auth improvement may be missing
   - **Impact**: CRITICAL (all auth bugs resurface)
   - **Mitigation**: Compare master vs refactor auth code, adopt master auth wholesale if needed

2. **tree-sitter Packaging (beta.50)**
   - **Risk**: Extension may not install
   - **Impact**: CRITICAL
   - **Mitigation**: Verify package.json has explicit tree-sitter dependency

3. **Mesh Node Version Handling (beta.19-20)**
   - **Risk**: Mesh deployment broken
   - **Impact**: HIGH
   - **Mitigation**: Verify all mesh commands use Node version management

4. **Component Version Tracking (beta.28-30)**
   - **Risk**: Auto-update system broken
   - **Impact**: HIGH
   - **Mitigation**: Review version tracking end-to-end

---

### MEDIUM RISK: Architectural Conflicts

These fixes may conflict with refactor architecture:

1. **Binary Path Caching (beta.24, fixed beta.32)**
   - **Risk**: Refactor may have different command execution
   - **Impact**: MEDIUM (performance regression or macOS breakage)
   - **Mitigation**: Compare command execution patterns

2. **Dashboard Improvements (beta.18-21)**
   - **Risk**: Refactor may have different dashboard architecture
   - **Impact**: MEDIUM (UX issues)
   - **Mitigation**: Review dashboard code structure

3. **Prerequisite System Changes (beta.3-19)**
   - **Risk**: Refactor may have different prerequisite handling
   - **Impact**: MEDIUM (prerequisite checks fail)
   - **Mitigation**: Compare prerequisite logic

---

### LOW RISK: Simple Ports

These fixes should port easily:

1. **Logging Improvements** (various betas)
   - Simple text/formatting changes
   - Low conflict potential

2. **VSIX Packaging** (beta.1)
   - package.json changes
   - Easy to verify

3. **Repository URL** (beta.2, 5)
   - Simple metadata
   - No code impact

---

## Bug Fix Dependencies

Some fixes depend on other changes and must be adopted together:

### Dependency Chain 1: Authentication Stabilization (CRITICAL PATH)

```
Beta 34: Auth rewrite (foundation)
    ↓
Beta 35: Timeout refactoring
    ↓
Beta 36-38: Debug improvements
    ↓
Beta 39-41: Token corruption detection/recovery (partial)
    ↓
Beta 42: Token corruption fix (atomic read) ✅ CRITICAL
    ↓
Beta 48: Auth cache introduction
    ↓
Beta 49: Auth cache timeout fix ✅ CRITICAL
    ↓
Beta 50: SDK re-init fix ✅ CRITICAL
```

**Integration**: Must adopt auth rewrite (beta.34-50) as complete system. Cannot cherry-pick individual fixes.

**Effort**: 4-6 hours (testing and verification)

---

### Dependency Chain 2: Component Version Tracking

```
Beta 22: False notification fix (short SHA comparison)
    ↓
Beta 28: Version tracking during creation
    ↓
Beta 29: Git SHA detection error handling
    ↓
Beta 30: Real commit SHAs + validation
```

**Integration**: Adopt all component version tracking changes together

**Effort**: 2-3 hours

---

### Dependency Chain 3: Node Version Management

```
Beta 9: fnm reliability
    ↓
Beta 13: Adobe CLI Node version
    ↓
Beta 14-15: Dynamic Node version detection
    ↓
Beta 33: Node 24 compatibility (version filtering)
    ↓
Beta 19-20: Mesh Node version handling
```

**Integration**: Adopt Node version management system

**Effort**: 2-3 hours (if not included in auth rewrite)

---

## Testing Requirements

### Critical Bug Regression Tests

```typescript
describe('Bug Fix Regression Tests', () => {

    describe('Authentication (BUG-001 to BUG-007)', () => {
        it('BUG-001: should not corrupt token/expiry (beta.42)', async () => {
            // Stress test: rapid authentication
            for (let i = 0; i < 20; i++) {
                await authenticate();
                const token = await inspectToken();
                expect(token.expiry).toBeGreaterThan(0);
                expect(token.valid).toBe(true);
            }
        });

        it('BUG-002: should update cache on login (beta.49)', async () => {
            // Initial check (cache = false)
            await checkAuth();

            // Login (should update cache)
            await login();

            // Immediate operation (should use fresh cache)
            const start = Date.now();
            const orgs = await getOrganizations();
            const duration = Date.now() - start;

            expect(orgs).toBeDefined();
            expect(duration).toBeLessThan(10000); // No timeout
        });

        it('BUG-003: should re-init SDK after login (beta.50)', async () => {
            await login();

            // Post-login operation should be fast (<2s)
            const start = Date.now();
            await getOrganizations();
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(2000); // Not 9+s
        });

        it('BUG-005: should handle binary paths with spaces (beta.32)', async () => {
            // Test on macOS with default npm path
            const result = await executeAdobeCLI('auth login');
            expect(result.code).toBe(0);
            // Command should succeed despite spaces in path
        });

        it('BUG-006: should use compatible Node version (beta.33)', async () => {
            // Install Node 24
            await exec('fnm install 24');
            await exec('fnm use 24');

            // Extension should use Node 22 (not 24)
            const nodeVersion = await getNodeVersionForAdobeCLI();
            expect(nodeVersion).toMatch(/^(18|20|22)\./);
        });
    });

    describe('Build/Packaging (BUG-004, BUG-026-027)', () => {
        it('BUG-004: should package tree-sitter (beta.50)', async () => {
            await exec('npm run package');
            const vsixContents = await listVSIXContents();
            expect(vsixContents).toContain('node_modules/tree-sitter');
        });

        it('BUG-026-027: should include all required files (beta.1)', async () => {
            await exec('npm run package');
            const vsixContents = await listVSIXContents();
            expect(vsixContents).toContain('templates/');
            expect(vsixContents).toContain('media/');
            expect(vsixContents).toContain('node_modules/');
        });
    });

    describe('Mesh Deployment (BUG-008 to BUG-010)', () => {
        it('BUG-008-009: should use correct Node version for mesh (beta.19-20)', async () => {
            // Install Node 24 (incompatible)
            await exec('fnm install 24');
            await exec('fnm use 24');

            // Mesh creation should use Node 22
            const result = await createMesh();
            expect(result.success).toBe(true);
        });

        it('BUG-010: should detect mesh status correctly (beta.21)', async () => {
            // Test 1: Project with lastDeployed
            const project1 = { lastDeployed: Date.now() };
            expect(isMeshDeployed(project1)).toBe(true);

            // Test 2: Legacy project (componentConfigs only)
            const project2 = { componentConfigs: { mesh: {...} } };
            expect(isMeshDeployed(project2)).toBe(true);

            // Test 3: No mesh
            const project3 = {};
            expect(isMeshDeployed(project3)).toBe(false);
        });
    });

    describe('Component/Update System (BUG-012 to BUG-015)', () => {
        it('BUG-012: should not show false update notifications (beta.22)', async () => {
            // Project with up-to-date components (short SHA)
            const project = {
                components: { mesh: { version: 'abc1234' } }
            };

            // Mock latest version (full SHA with same prefix)
            mockLatestSHA('abc1234567890abcdef');

            const hasUpdates = await checkForUpdates(project);
            expect(hasUpdates).toBe(false);
        });

        it('BUG-013-015: should track component versions (beta.28-30)', async () => {
            // Create project
            const project = await createProject();

            // Verify versions saved
            const state = await readProjectState(project);
            expect(state.components.mesh.version).toBeDefined();
            expect(state.components.mesh.version).toMatch(/^[0-9a-f]{7}$/);
        });

        it('BUG-020: should sort versions semantically (beta.11)', async () => {
            const versions = ['v1.0.10', 'v1.0.9', 'v1.0.11', 'v1.0.2'];
            const sorted = sortVersions(versions);
            expect(sorted).toEqual(['v1.0.11', 'v1.0.10', 'v1.0.9', 'v1.0.2']);
        });
    });

    describe('Prerequisites System (BUG-017 to BUG-019)', () => {
        it('BUG-017: should detect any git installation (beta.18)', async () => {
            // Test with Homebrew git
            mockGitPath('/opt/homebrew/bin/git');
            expect(await checkGit()).toBe(true);

            // Test with Xcode git
            mockGitPath('/usr/bin/git');
            expect(await checkGit()).toBe(true);

            // Test with custom git
            mockGitPath('/custom/path/git');
            expect(await checkGit()).toBe(true);
        });

        it('BUG-018: should use correct Node for Adobe CLI (beta.13)', async () => {
            // Install multiple Node versions
            await exec('fnm install 16 18 20 22 24');
            await exec('fnm use 16'); // Active = 16 (incompatible)

            // Adobe CLI should use Node 22 (highest compatible)
            const nodeVersion = await getNodeVersionForAdobeCLI();
            expect(nodeVersion).toBe('22');
        });

        it('BUG-019: should check plugins for all Node versions (beta.12)', async () => {
            // Install plugins only on Node 18
            await exec('fnm use 18');
            await exec('aio plugins install @adobe/aio-cli-plugin-cloudmanager');

            // Switch to Node 20 (no plugins)
            await exec('fnm use 20');

            // Should still detect plugins (from Node 18 check)
            const plugins = await checkAdobePlugins();
            expect(plugins).toContain('@adobe/aio-cli-plugin-cloudmanager');
        });
    });

});
```

---

## Recommendations

### For Refactor Branch Integration

#### 1. **Accept Master Auth System Wholesale** (HIGHEST PRIORITY)
- **Reason**: Beta.34-50 is a comprehensive auth rewrite with multiple interdependent fixes
- **Includes**: All authentication bug fixes (BUG-001 to BUG-007)
- **Method**:
  ```bash
  # Option 1: Cherry-pick auth commits (if possible)
  git cherry-pick <beta.34-commit>..<beta.50-commit> -- src/utils/adobeAuthManager.ts

  # Option 2: Manual port (if conflicts)
  # Copy master's adobeAuthManager.ts to refactor branch
  # Resolve conflicts with refactor architecture
  ```
- **Effort**: 4-6 hours (testing and verification)
- **Risk**: LOW (auth system is self-contained)

#### 2. **Verify tree-sitter Packaging** (CRITICAL)
- **Reason**: Extension won't install without this fix
- **Method**:
  ```bash
  grep '"tree-sitter"' package.json
  npm run package
  unzip -l *.vsix | grep tree-sitter
  ```
- **Effort**: 30 minutes
- **Risk**: CRITICAL if missing, LOW if present

#### 3. **Review Mesh Deployment** (HIGH PRIORITY)
- **Reason**: Mesh is core feature, Node version handling critical
- **Method**: Compare mesh command execution (master vs refactor)
- **Effort**: 2 hours
- **Risk**: HIGH (breaks mesh functionality)

#### 4. **Review Component Version Tracking** (HIGH PRIORITY)
- **Reason**: Auto-update system depends on correct version tracking
- **Method**: Review version tracking end-to-end (creation, updates, comparison)
- **Effort**: 2 hours
- **Risk**: HIGH (breaks auto-update)

#### 5. **Create Comprehensive Test Suite** (RECOMMENDED)
- **Reason**: Prevent regression, ensure all fixes present
- **Method**: Implement test cases from "Testing Requirements" section
- **Effort**: 8-12 hours
- **Risk**: LOW, Benefit: HIGH (long-term stability)

#### 6. **Code Review All P1 Areas** (RECOMMENDED)
- **Reason**: Verify all critical fixes present
- **Method**: Systematic comparison (master vs refactor) for each P1 bug
- **Effort**: 4-6 hours
- **Risk**: LOW, Benefit: HIGH (confidence)

---

### Integration Phases

#### Phase 1: Critical Fixes (12-15 hours)
**Goal**: Ensure all CRITICAL and HIGH priority fixes integrated

1. **Auth system** (4-6 hours)
   - Adopt master auth system wholesale
   - Verify all auth fixes (BUG-001 to BUG-007)
   - Test authentication end-to-end

2. **tree-sitter packaging** (30 minutes)
   - Verify explicit dependency
   - Test VSIX build

3. **Mesh deployment** (2 hours)
   - Verify Node version handling
   - Test mesh operations

4. **Component system** (2 hours)
   - Verify version tracking
   - Test update checking

5. **Dashboard** (2 hours)
   - Verify mesh status detection
   - Test dashboard functionality

6. **Verification** (1-2 hours)
   - Run manual tests for all P1 fixes
   - Check for regressions

**Deliverable**: Refactor branch with all P1 fixes verified

---

#### Phase 2: Important Fixes (8-10 hours)
**Goal**: Integrate all P2 (Should Have) fixes

1. **Prerequisites system** (3-4 hours)
   - Git detection
   - Adobe CLI Node version
   - Per-node plugin checks
   - fnm reliability

2. **Update system** (2 hours)
   - Semver comparison
   - Update checker sorting
   - Repository URL

3. **Project lifecycle** (1 hour)
   - Welcome screen conflict

4. **VSIX packaging** (1 hour)
   - Verify all files included
   - Test packaging

5. **Verification** (2-3 hours)
   - Test all P2 fixes
   - Integration testing

**Deliverable**: Refactor branch with all P1+P2 fixes verified

---

#### Phase 3: Polish & Testing (8-12 hours)
**Goal**: Add test coverage and optional polish

1. **Regression test suite** (8-10 hours)
   - Implement test cases for P1 fixes
   - Implement test cases for P2 fixes
   - Set up CI/CD if needed

2. **P3 fixes (optional)** (1-2 hours)
   - Logging improvements
   - Progress label fixes

3. **Final integration test** (1-2 hours)
   - Full workflow testing
   - User acceptance testing

**Deliverable**: Production-ready refactor branch with full test coverage

---

### Total Effort Estimates

| Phase | Description | Effort | Priority |
|-------|-------------|--------|----------|
| Phase 1 | Critical Fixes (P1) | 12-15h | **MUST DO** |
| Phase 2 | Important Fixes (P2) | 8-10h | **SHOULD DO** |
| Phase 3 | Testing & Polish | 8-12h | **RECOMMENDED** |
| **TOTAL** | **Full Integration** | **28-37h** | |

**Minimum viable integration**: Phase 1 only (12-15 hours)
**Recommended integration**: Phase 1 + Phase 2 (20-25 hours)
**Complete integration**: All phases (28-37 hours)

---

## Conclusion

### Key Findings

1. **80 bug fixes** identified across 72 beta releases (52 from beta.1-50, 28 from beta.51-72)

2. **14 CRITICAL fixes** that MUST be integrated:

   **Beta 1-50 (4 CRITICAL)**:
   - Token corruption (beta.42)
   - Auth cache timeout (beta.49)
   - SDK re-initialization (beta.50)
   - tree-sitter packaging (beta.50)

   **Beta 51-72 (10 CRITICAL)**:
   - Node 14 fallback causing MODULE_NOT_FOUND (beta.51)
   - Leaky abstraction with allowed versions (beta.51)
   - Adobe CLI using Node 24 instead of 18 (beta.53)
   - Auth fails without project context (beta.53)
   - Silent failures without Developer role (beta.56)
   - fnm installed but not configured (beta.59)
   - "Can't find environment variables" error (beta.59)
   - "Starting directory does not exist" error (beta.61)
   - Homebrew install failures during prereqs (beta.61)
   - project.created.toISOString() crashes (beta.70)

3. **Three major dependency chains** in beta.51-72:
   - **Node Version Management** (beta.51-53): 3 interdependent releases, must integrate together
   - **Auth & Permissions** (beta.54-58): 5 progressive improvements, integrate as chain
   - **Terminal & Workspace** (beta.61-66): 6 iterative redesigns, integrate final state

4. **Authentication is still critical**: Beta.34-50 auth rewrite PLUS beta.54-58 permission checking enhancements

5. **Total integration effort**: 28-37 hours for production-ready refactor branch (P1 + P2 fixes from both periods)

### Biggest Risks

**1. NOT integrating authentication system** (beta.34-50):
- Token corruption (5-30% failure rate)
- Login timeouts (100% of logins after auth check)
- Slow operations (30x slower)
- Binary path failures on macOS
- Node 24 incompatibility

**2. NOT integrating Node version management** (beta.51-53):
- Node 14 fallback causing MODULE_NOT_FOUND errors
- Adobe CLI using incompatible Node 24
- Auth failures before project creation
- Unpredictable Node version selection

**3. NOT integrating Terminal management redesign** (beta.61-66):
- "Starting directory does not exist" errors
- Homebrew installation failures
- Extension Host restart required for terminals
- Workspace folder conflicts

**4. NOT integrating fnm shell configuration** (beta.59):
- Demo startup failures with "Can't find environment variables"
- Manual shell configuration required
- Poor out-of-box experience

### Recommendations

**IMMEDIATE ACTION - P1 CRITICAL FIXES** (12-18 hours):

1. **Verify authentication system** (beta.34-50): Highest priority, prevents 4 CRITICAL bugs
2. **Integrate Node version management chain** (beta.51-53): 2 hours, prevents 4 CRITICAL bugs
3. **Integrate fnm shell configuration** (beta.59): 1 hour, prevents 2 CRITICAL demo startup bugs
4. **Integrate terminal management redesign** (beta.61-66): 2 hours, prevents 2 CRITICAL prerequisite bugs
5. **Integrate permission checking** (beta.56): 2 hours, prevents 1 CRITICAL UX bug
6. **Integrate type safety fix** (beta.70): 30 minutes, prevents crashes
7. **Verify tree-sitter packaging** (beta.50): 30 minutes, prevents installation failures

**RECOMMENDED - P2 HIGH FIXES** (8-12 hours):

1. **Auth & Permissions chain** (beta.54-58): Better error messages, UX improvements
2. **Adobe CLI prerequisite checks** (beta.70-71): Accurate install status
3. **Terminal workspace improvements** (beta.62-65): No Extension Host restart needed

**TOTAL MINIMUM EFFORT**: 20-30 hours for all P1+P2 fixes from beta.1-72

---

## Appendix: All Beta Releases

### Beta 1-10: Foundation & Packaging
- **Beta 1**: VSIX packaging (node_modules, templates, icons)
- **Beta 2**: Repository URL fix
- **Beta 3**: fnm isolation fix
- **Beta 4**: fnm path verification
- **Beta 5**: Auto-update compatibility
- **Beta 6**: (chore bump)
- **Beta 7**: Semver version comparison
- **Beta 8**: Comprehensive update logging
- **Beta 9**: Bulletproof fnm reliability
- **Beta 10**: Updated extension icon

### Beta 11-20: Node & Prerequisites
- **Beta 11**: Update checker semver sorting
- **Beta 12**: Per-node plugin checks
- **Beta 13**: Adobe CLI Node version management
- **Beta 14**: Adobe CLI highest Node version
- **Beta 15**: Dynamic Node version detection
- **Beta 16**: Homebrew git requirement
- **Beta 17**: Homebrew dependency gating
- **Beta 18**: Git prerequisite + dashboard fixes + Homebrew terminal
- **Beta 19**: Mesh Node version + bulletproof rollback
- **Beta 20**: ALL mesh Node version issues

### Beta 21-30: Components & Dashboard
- **Beta 21**: Dashboard mesh status detection
- **Beta 22**: False component update notifications
- **Beta 23**: Welcome screen conflict
- **Beta 24**: Binary path caching (5-6x faster)
- **Beta 25**: Homebrew automation
- **Beta 26**: Configure UX polish
- **Beta 27**: Homebrew automation + packaging
- **Beta 28**: Component version tracking (creation)
- **Beta 29**: Git SHA detection
- **Beta 30**: Real commit SHAs + short SHA comparison

### Beta 31-40: Updates & Auth Foundation
- **Beta 31**: Visual progress indicators + debug cleanup
- **Beta 32**: Binary paths with spaces (CRITICAL)
- **Beta 33**: Node 24 compatibility
- **Beta 34**: **Auth system rewrite** (foundation)
- **Beta 35**: Auth timeout refactoring
- **Beta 36**: Auth token expiry logging
- **Beta 37**: Close panel after Homebrew
- **Beta 38**: Dedicated Homebrew terminal
- **Beta 39**: Corrupted token detection
- **Beta 40**: Post-login token inspection

### Beta 41-50: Auth Stabilization & Polish
- **Beta 41**: Adobe CLI token corruption error handling
- **Beta 42**: **Token corruption fix** (CRITICAL)
- **Beta 43**: Log cleanup + prerequisites UX + tree-sitter (first attempt)
- **Beta 44**: Log cleanup + Adobe CLI detection
- **Beta 45**: Prerequisite status messages
- **Beta 46**: Duplicate timeout message
- **Beta 47**: Org switching logs
- **Beta 48**: Emoji standardization
- **Beta 49**: **Auth cache timeout fix** (CRITICAL)
- **Beta 50**: **SDK re-init + tree-sitter packaging** (CRITICAL)

### Beta 51-72: Stabilization & UX Polish (Single Day - October 17, 2025)

#### Node Version Management (Beta 51-53)
- **Beta 51**: Remove "allowed versions" concept, enforce infrastructure-defined versions (CRITICAL)
- **Beta 52**: Consolidate adobe-cli and adobe-cli-sdk into single component
- **Beta 53**: Node version priority system - infrastructure first, even without project (CRITICAL)

#### Authentication & Permissions (Beta 54-58)
- **Beta 54**: Auth debugging (temporary)
- **Beta 55**: "No App Builder Access" error messaging
- **Beta 56**: **Developer permissions test** - definitive permission check (CRITICAL)
- **Beta 57**: Permission error UI improvements (AlertCircle icon, no retry)
- **Beta 58**: Force fresh login for permission errors

#### Prerequisites & Terminal (Beta 59-66)
- **Beta 59**: **fnm shell configuration** - actually implement shell profile setup (CRITICAL)
- **Beta 60**: Clean demo notifications (move to debug level)
- **Beta 61**: **Terminal directory fix** - safe cwd fallback to home (CRITICAL)
- **Beta 62**: Workspace folder detection for terminals
- **Beta 63**: Remove workspace addition (major simplification, -41 lines)
- **Beta 64**: Optional workspace setting (demoBuilder.addProjectToWorkspace)
- **Beta 65**: Smart project directory detection
- **Beta 66**: Delete TerminalManager (-132 lines of dead code)

#### UX Polish - Notifications (Beta 67-69, 72)
- **Beta 67**: Remove start/stop notifications
- **Beta 68**: Improve port release message
- **Beta 69**: Remove port release notification (fix flash)
- **Beta 72**: Auto-dismissing notifications (2s) instead of modal

#### Type Safety & Edge Cases (Beta 70-71)
- **Beta 70**: **Type safety fix** - Date object handling (CRITICAL) + Adobe CLI per-node checks
- **Beta 71**: Adobe CLI checked in ALL project Node versions (not just infrastructure)

---

## Bug Fix Statistics

### By Severity
- **CRITICAL**: 14 fixes (18%) - *10 added from beta.51-72*
- **HIGH**: 25 fixes (31%) - *10 added from beta.51-72*
- **MEDIUM**: 30 fixes (38%) - *8 added from beta.51-72*
- **LOW**: 11 fixes (14%) - *0 added from beta.51-72*
- **TOTAL**: 80 fixes

### By Area
- **Authentication**: 17 fixes (21%) - *5 added from beta.51-72*
- **Prerequisites**: 15 fixes (19%) - *4 added from beta.51-72*
- **Node Version Management**: 4 fixes (5%) - *NEW category from beta.51-53*
- **Terminal/Workspace**: 6 fixes (8%) - *NEW category from beta.61-66*
- **Components/Updates**: 9 fixes (11%) - *1 added from beta.51-72*
- **Logging/UX**: 11 fixes (14%) - *0 added from beta.51-72*
- **Notifications**: 6 fixes (8%) - *NEW category from beta.51-72*
- **Type Safety**: 1 fix (1%) - *NEW from beta.70*
- **Mesh**: 4 fixes (5%)
- **Build/Packaging**: 3 fixes (4%)
- **Dashboard**: 2 fixes (3%)
- **Project**: 1 fix (1%)
- **Code Quality**: 1 fix (1%) - *NEW from beta.66*

### By Integration Priority
- **P1 (MUST)**: 29 fixes (36%) - *10 added from beta.51-72*
- **P2 (Should)**: 25 fixes (31%) - *10 added from beta.51-72*
- **P3 (Nice)**: 20 fixes (25%) - *8 added from beta.51-72*
- **P4 (Optional)**: 6 fixes (8%) - *0 added from beta.51-72*

### Timeline
- **Week 1 (Beta 1-10)**: Foundation, packaging, fnm (10 fixes)
- **Week 2 (Beta 11-20)**: Node management, prerequisites (10 fixes)
- **Week 3 (Beta 21-30)**: Components, dashboard (10 fixes)
- **Week 4 (Beta 31-40)**: Auth foundation, updates (10 fixes)
- **Week 5 (Beta 41-50)**: Auth stabilization, polish (12 fixes)
- **Day 6 (Beta 51-72)**: Node version management, terminal redesign, permissions, fnm shell config (28 fixes)

---

**Report Generated**: 2025-10-18 (Updated)
**Analysis Scope**:
- **Beta 1-50**: Commits da4c9f6 to 7aedc75 (99 commits, 52 fixes)
- **Beta 51-72**: Commits 63a7325 to da0e5a7 (44 commits, 28 fixes)
**Total Commits Analyzed**: 143
**Total Bug Fixes**: 80
**Agents**: Bug Fix Cataloger (Agent 11), Beta.51-72 Analyst (Agent 14), Catalog Updater (Agent 15)
