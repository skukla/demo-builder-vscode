# Beta Analysis: Enhancements & Performance Catalog (Beta 1-72)

## Executive Summary

**Analysis Period**: Commits da4c9f6 to da0e5a7 (144 commits across 72 beta releases)

**UPDATE**: This catalog has been updated to include 16 new enhancements from beta.51-72 (October 17, 2025). See "NEW: Enhancements from Beta.51-72" section below for details.

### Key Metrics
- **Total commits analyzed**: 144 (100 from beta.1-50 + 44 from beta.51-72)
- **Enhancement commits**: 32 (explicitly labeled)
- **Total enhancements identified**: 83 (67 from beta.1-50 + 16 from beta.51-72)
- **Performance optimizations**: 12 (up to 30x speedup)
- **New features**: 18
- **UX improvements**: 27 (+4 from beta.51-72)
- **Developer experience improvements**: 8
- **Reliability improvements**: 10 (+4 from beta.51-72)
- **Code quality improvements**: 8 (NEW from beta.51-72)

### CRITICAL Updates from Beta.51-72
**4 P1-CRITICAL enhancements MUST be integrated:**
1. **E068**: Node Version Priority System - Prevents Node 14/24 fallback errors
2. **E070**: Developer Permission Verification - Prevents silent permission failures
3. **E071**: fnm Shell Configuration - Prevents environment variable errors
4. **E074**: Type Safety (Date Handling) - Prevents extension crashes

**2 P2-HIGH enhancements strongly recommended:**
1. **E072**: Terminal Working Directory Safety - Prevents terminal creation errors
2. **E075**: Adobe CLI Per-Node Checks - Accurate prerequisite status

### Top Performance Gains
1. **SDK Integration** (beta.34): 30x faster auth operations (9s → 0.3s)
2. **Binary Path Caching** (beta.24): 5-6x faster CLI commands (5-6s → <1s)
3. **fnm exec Isolation** (beta.9): Eliminated version conflicts and ESM errors
4. **Dynamic Node Detection** (beta.15): Auto-detects working Node versions
5. **Node Version Priority System** (beta.51-53): Prevents fallback to incompatible versions
6. **Timeout Centralization** (beta.35): Unified 21 timeouts into single config

### Quick Win Highlights

**NEW: Beta.51-72 Critical Fixes** (Must Integrate - 4 P1-CRITICAL):
- **Node Version Priority System** (E068) - Prevents auth failures from Node 14/24 fallback
- **Developer Permission Verification** (E070) - Prevents silent failures for users without proper role
- **fnm Shell Configuration** (E071) - Prevents "environment variables not found" errors
- **Type Safety - Date Handling** (E074) - Prevents extension crashes from date serialization

**Original Beta.1-50 Quick Wins** (High Value + Easy Integration):
- **SDK integration** (2-3 hours) - 30x speedup
- **Binary path caching** (1-2 hours) - 5-6x speedup
- **Symbol standardization** (30-60 min) - 85% log reduction
- **Timeout centralization** (2-3 hours) - Better maintainability
- **fnm path caching** (1 hour) - Eliminates duplicate logs

## Quick Reference Matrix

| ID | Beta | Category | Value | Effort | Summary | Performance Impact | Priority |
|----|------|----------|-------|--------|---------|-------------------|----------|
| P01 | 34 | Performance | HIGH | EASY | Adobe CLI SDK integration | 30x faster (9s→0.3s) | P1 |
| P02 | 24 | Performance | HIGH | EASY | Binary path caching | 5-6x faster (5s→<1s) | P1 |
| P03 | 9 | Reliability | HIGH | MODERATE | fnm exec isolation | 100% reliability | P2 |
| P04 | 15 | Performance | HIGH | EASY | Dynamic Node detection | Auto-selects working version | P1 |
| P05 | 35 | DX | MEDIUM | EASY | Timeout centralization | Maintainability | P4 |
| P06 | beta.10 | Performance | LOW | EASY | fnm path caching | Eliminates duplicate logs | P4 |
| P07 | Post-50 | Performance | MEDIUM | EASY | Multi-version optimization | Faster installs | P4 |
| P08 | Post-50 | UX | MEDIUM | EASY | Progress label pattern | Clearer progress | P4 |
| P09 | Post-50 | Reliability | MEDIUM | EASY | Exit code detection | Better error detection | P4 |
| P10 | Post-50 | UX | LOW | EASY | Sort Node versions | Better display | P5 |
| F01 | 25-27 | Feature | HIGH | MODERATE | Homebrew automation | 5-10 min time saved | P2 |
| F02 | 38 | Feature | MEDIUM | EASY | Dedicated Homebrew terminal | Cleaner UX | P4 |
| F03 | 34 | Feature | HIGH | HARD | Explicit Node version system | Better version control | P3 |
| F04 | 30 | Feature | MEDIUM | MODERATE | Component version tracking | Update detection | P2 |
| F05 | 33 | Feature | LOW | EASY | Node 24 support | Future compatibility | P4 |
| F06 | 31 | Feature | MEDIUM | EASY | Visual update progress | Better feedback | P4 |
| F07 | 11 | Feature | LOW | EASY | Semver update comparison | Correct beta ordering | P4 |
| F08 | 31 | Feature | LOW | EASY | Update notification UX | Better notifications | P5 |
| F09 | 8 | Feature | LOW | EASY | Update logging | Better visibility | P5 |
| F10 | 5 | Feature | MEDIUM | EASY | Duplicate update prevention | Prevents spam | P4 |
| U01 | 43-48 | UX | MEDIUM | EASY | Symbol standardization | 85% log reduction | P4 |
| U02 | Post-50 | UX | MEDIUM | EASY | Progress label refinement | Clearer milestones | P4 |
| U03 | 44 | UX | HIGH | EASY | Log cleanup | 85% log reduction | P1 |
| U04 | 37 | UX | LOW | EASY | Close panel after install | Better cleanup | P5 |
| U05 | 31 | UX | LOW | EASY | Update notification title | Better readability | P5 |
| U06 | 24 | UX | MEDIUM | EASY | Improved auth UI | Better feedback | P4 |
| R01 | 9 | Reliability | HIGH | MODERATE | fnm exec isolation | Prevents conflicts | P2 |
| R02 | 5-6 | Reliability | MEDIUM | EASY | fnm path verification | Correct detection | P4 |
| R03 | 13-15 | Reliability | HIGH | MODERATE | Adobe CLI version mgmt | Prevents ESM errors | P2 |
| R04 | Post-50 | Reliability | MEDIUM | EASY | Exit code detection | Better status | P4 |
| R05 | 35 | Reliability | MEDIUM | MODERATE | Auth token management | Prevents corruption | P2 |
| R06 | 39-42 | Reliability | MEDIUM | MODERATE | Token corruption handling | Auto-recovery | P2 |

---

## Performance Optimizations (12 total)

### ENHANCEMENT-P01: Adobe CLI SDK Integration (30x speedup)
- **Beta**: 34 (commit a940610)
- **Files**: src/utils/adobeAuthManager.ts, package.json
- **Category**: Performance
- **Value**: HIGH
- **Effort**: EASY
- **Integration Priority**: P1

**Description**:
Integrated @adobe/aio-lib-console SDK for high-performance Adobe I/O operations, replacing slow Adobe CLI shell commands with direct SDK API calls.

**Performance Impact**:
- **Before**: 9+ seconds per auth check (Adobe CLI shell command)
- **After**: 0.3 seconds per auth check (SDK direct API call)
- **Improvement**: 30x faster
- **Operations Affected**: Auth checks, organization listing, project listing, workspace listing
- **User Impact**: Instant auth validation vs multi-second delays, dashboard loads in 5s instead of 30s+

**Implementation**:
```typescript
// BEFORE (9+ seconds)
const result = await executeAdobeCLI('aio console org list --json');

// AFTER (0.3 seconds)
const sdkClient = await sdk.init(accessToken, 'aio-cli-console-auth');
const sdkResult = await sdkClient.getOrganizations();
```

**Key Features**:
- Async SDK initialization (non-blocking, 5s timeout)
- Graceful CLI fallback when SDK unavailable
- Token fetched from CLI config (avoids browser launches)
- Used for getOrganizations(), getProjects(), getWorkspaces()
- 30-second auth status caching to avoid redundant calls

**Dependencies**:
- Requires @adobe/aio-lib-console-sdk package
- Requires valid Adobe CLI access token
- SDK re-initialization after login (beta.50 fix)

**Integration Strategy**:
1. **Priority**: P1 (HIGH value + EASY integration)
2. **Method**:
   - Add SDK package to dependencies
   - Implement SDK initialization wrapper in auth manager
   - Replace CLI org/project/workspace listings with SDK calls
   - Add graceful fallback to CLI if SDK fails
3. **Verification**:
   - Benchmark auth check performance (should be <1s)
   - Test org/project selection speed
   - Verify 30x improvement in dashboard load
4. **Effort**: 2-3 hours (if auth system compatible)

**Refactor Branch Check**:
```bash
# Check if SDK is present
grep -n "@adobe/aio-lib-console" package.json
grep -n "sdkClient" src/utils/adobeAuthManager.ts
```

**Test Case**:
```typescript
it('should check auth in <1 second using SDK', async () => {
  const start = Date.now();
  const orgs = await authManager.getOrganizations();
  const duration = Date.now() - start;
  expect(duration).toBeLessThan(1000);
  expect(orgs.length).toBeGreaterThan(0);
});
```

**Risk**: LOW (well-tested over 16 beta releases, from beta.34-50)

**Related Enhancements**:
- Pairs with P02 (binary caching) for complete performance solution
- Requires R05 (auth token management) for stability

---

### ENHANCEMENT-P02: Binary Path Caching (5-6x speedup)
- **Beta**: 24 (commit ed5f57a)
- **Files**: src/utils/externalCommandManager.ts
- **Category**: Performance
- **Value**: HIGH
- **Effort**: EASY
- **Integration Priority**: P1

**Description**:
Cache binary paths (fnm, aio, node) after first lookup instead of searching PATH on every command. Reduces overhead from ~5-6 seconds to <1 second per command by eliminating `fnm exec` initialization overhead.

**Performance Impact**:
- **Before**: 5-6 seconds per command (fnm exec overhead: shell spawn + fnm init + Node resolution + PATH setup)
- **After**: <1 second per command (direct binary execution with cached paths)
- **Improvement**: 5-6x faster
- **Operations Affected**: All Adobe CLI commands, fnm commands, Node commands
- **User Impact**: Auth checks 5x faster, dashboard loads 6x faster, mesh operations 5x faster

**Root Cause Analysis**:
Every `aio` command was using `fnm exec --using=24 -- aio config get ...`, which:
1. Spawns a new shell
2. Initializes fnm environment
3. Resolves Node version
4. Sets up PATH
5. **THEN** runs the actual command

This added **5-6 seconds of overhead PER COMMAND**. With multiple commands in sequence (auth checks, mesh status, config reads), users experienced 15-30 second delays.

**Implementation**:
```typescript
// Cache for binary paths (session-level)
private cachedBinaryPath: string | undefined;
private cachedNodePath: string | undefined;
private cachedAdobeCLINodeVersion: string | undefined;

async executeAdobeCLI(command: string, options: ExecuteOptions = {}): Promise<ExecuteResult> {
  const nodeVersion = options.nodeVersion || 24;

  // One-time cache population (5-6s cost once per session)
  if (!this.cachedBinaryPath || this.cachedAdobeCLINodeVersion !== String(nodeVersion)) {
    const nodePathResult = await this.execute(
      `fnm exec --using=${nodeVersion} -- which node`,
      { timeout: TIMEOUTS.BINARY_PATH_CACHE }
    );
    const aioPathResult = await this.execute(
      `fnm exec --using=${nodeVersion} -- which aio`,
      { timeout: TIMEOUTS.BINARY_PATH_CACHE }
    );

    this.cachedNodePath = nodePathResult.stdout.trim();
    this.cachedBinaryPath = aioPathResult.stdout.trim();
    this.cachedAdobeCLINodeVersion = String(nodeVersion);
  }

  // All subsequent commands use cached paths (<1s)
  const fullCommand = `${this.cachedNodePath} ${this.cachedBinaryPath} ${command}`;
  return await this.execute(fullCommand, options);
}
```

**Key Features**:
- Per-Node-version caching (different cache for Node 18, 20, 22, 24)
- Automatic cache invalidation when Node version changes
- Fallback to `fnm exec` if caching fails
- Session-persistent cache (until extension reload)

**Measured Results** (from beta.24 release notes):
```
Authentication Checks:
Before: isAuthenticatedQuick took 26,694ms (2 commands × 5s + retries)
After:  isAuthenticatedQuick took <2,000ms  (2 commands × <1s)

Dashboard Load:
Before: 30+ seconds (auth check + mesh status + org verification)
After:  5 seconds (one-time cache + fast commands)

Configure Screen:
Before: 25+ seconds to verify authentication
After:  <2 seconds
```

**Dependencies**: None (standalone optimization)

**Integration Strategy**:
1. **Priority**: P1 (HIGH value + EASY integration)
2. **Method**:
   - Add binary path cache fields to ExternalCommandManager
   - Wrap all `fnm exec` calls with cache lookup
   - Clear cache on Node version change
   - Add cache timeout/invalidation logic
3. **Verification**:
   - Benchmark Adobe CLI command overhead (before/after)
   - Test cache invalidation when switching Node versions
   - Verify 5-6x improvement in command execution
4. **Effort**: 1-2 hours

**Refactor Branch Check**:
```bash
# Check if binary caching exists
grep -n "cachedBinaryPath" src/utils/externalCommandManager.ts
grep -n "BINARY_PATH_CACHE" src/utils/timeoutConfig.ts
```

**Test Case**:
```typescript
it('should cache binary paths for 5-6x performance', async () => {
  // First call (cache miss, slow)
  const start1 = Date.now();
  await commandManager.executeAdobeCLI('config get token');
  const duration1 = Date.now() - start1;

  // Second call (cache hit, fast)
  const start2 = Date.now();
  await commandManager.executeAdobeCLI('config get expiry');
  const duration2 = Date.now() - start2;

  expect(duration2).toBeLessThan(duration1 / 5); // 5x faster
  expect(duration2).toBeLessThan(1000); // <1 second
});
```

**Risk**: LOW (simple caching pattern, well-tested over 26 betas)

**Additional Improvements** (from beta.24):
- Increased `CONFIG_READ` timeout: 5s → 10s (safety margin)
- Prioritized timeout retries for initial fnm initialization
- Automatic fallback to `fnm exec` if caching fails

**Related Enhancements**:
- Pairs with P01 (SDK integration) for complete performance solution
- Builds on R01 (fnm exec isolation) for reliable Node version management

---

### ENHANCEMENT-P03: fnm exec Isolation (100% reliability)
- **Beta**: 9 (commit 01b94d6)
- **Files**: src/utils/externalCommandManager.ts
- **Category**: Reliability + Performance
- **Value**: HIGH
- **Effort**: MODERATE
- **Integration Priority**: P2

**Description**:
Replace `fnm use` with `fnm exec` for true Node version isolation. Guarantees fnm takes precedence over nvm/system Node, preventing version conflicts and ESM errors.

**Problem Solved**:
Users with multiple Node version managers (fnm + nvm) would have aio-cli detected from the wrong Node manager, causing:
- `ERR_REQUIRE_ESM` errors (Node v14 doesn't support ES modules)
- `MODULE_NOT_FOUND: 'node:util'` errors (node: prefix requires Node v16+)
- Version conflicts between user's shell Node and extension's Node

**Before**:
```bash
# fnm use changes global shell Node version
fnm use 20
aio --version  # Might still use nvm Node if nvm is higher in PATH
```

**After**:
```bash
# fnm exec guarantees isolated execution
fnm exec --using=20 -- aio --version  # Always uses fnm Node 20
```

**Performance Impact**:
- **Reliability**: 100% (eliminates version conflicts)
- **Side Effect**: 5-6s overhead per command (fixed in P02 with binary caching)
- **User Impact**: No more ESM errors, consistent Node version usage

**Implementation**:
```typescript
// BEFORE (unreliable)
async executeAdobeCLI(command: string): Promise<ExecuteResult> {
  return this.execute(`aio ${command}`); // Uses whatever Node is in PATH
}

// AFTER (reliable)
async executeAdobeCLI(command: string, options: ExecuteOptions = {}): Promise<ExecuteResult> {
  const nodeVersion = options.nodeVersion || 20;
  return this.execute(`fnm exec --using=${nodeVersion} -- aio ${command}`);
}
```

**Key Features**:
- True isolation: fnm exec spawns subprocess with fnm-managed Node only
- No PATH pollution: doesn't affect user's shell environment
- Version guarantee: always uses specified Node version
- Compatible with nvm: coexists peacefully with other Node managers

**Dependencies**:
- Requires fnm installed
- Works best with P02 (binary caching) to eliminate 5-6s overhead

**Integration Strategy**:
1. **Priority**: P2 (HIGH value + MODERATE effort)
2. **Method**:
   - Replace all `aio` command executions with `fnm exec --using=X -- aio`
   - Add Node version parameter to executeAdobeCLI()
   - Update all callers to specify Node version
   - Test with both fnm-only and fnm+nvm scenarios
3. **Verification**:
   - Test with nvm installed alongside fnm
   - Verify aio-cli uses fnm Node, not nvm Node
   - Check for ESM errors (should be eliminated)
4. **Effort**: 3-4 hours (requires updating all Adobe CLI call sites)

**Refactor Branch Check**:
```bash
# Check if fnm exec is used
grep -n "fnm exec" src/utils/externalCommandManager.ts
grep -n "executeAdobeCLI" src/utils/externalCommandManager.ts | head -5
```

**Test Case**:
```typescript
it('should isolate Node version with fnm exec', async () => {
  // Even with nvm in PATH, should use fnm Node
  const result = await commandManager.executeAdobeCLI('node --version', { nodeVersion: 20 });

  // Should be fnm-managed Node 20, not nvm Node
  expect(result.stdout).toContain('v20.');

  // Verify fnm isolation
  const whichNode = await commandManager.execute('fnm exec --using=20 -- which node');
  expect(whichNode.stdout).toContain('fnm');
  expect(whichNode.stdout).not.toContain('nvm');
});
```

**Risk**: MEDIUM (requires careful migration of all Adobe CLI call sites, 5-6s overhead until P02 is integrated)

**Related Enhancements**:
- **Must pair with P02** (binary caching) to eliminate 5-6s overhead
- Enables P04 (dynamic Node detection)
- Foundation for F03 (explicit Node version system)

---

### ENHANCEMENT-P04: Dynamic Node Version Detection (auto-selects working version)
- **Beta**: 15 (commit 9d07fcd)
- **Files**: src/utils/prerequisitesManager.ts
- **Category**: Performance + Reliability
- **Value**: HIGH
- **Effort**: EASY
- **Integration Priority**: P1

**Description**:
Dynamically detect highest Node version with working aio-cli installation. Tests each Node version by actually running `aio --version`, automatically selecting the best version.

**Problem Solved**:
Extension had hardcoded Node version assumptions. Users might have aio-cli installed only on Node 18, but extension expected Node 20, causing detection failures.

**Before**:
```typescript
// Hardcoded assumption
const nodeVersion = 20;
const result = await executeAdobeCLI('--version', { nodeVersion }); // Fails if not installed on Node 20
```

**After**:
```typescript
// Dynamic detection
const nodeVersions = [24, 22, 20, 18];
for (const version of nodeVersions) {
  const result = await executeAdobeCLI('--version', { nodeVersion: version });
  if (result.code === 0) {
    detectedVersion = version; // Found working version!
    break;
  }
}
```

**Performance Impact**:
- **Reliability**: 100% (finds working Node version automatically)
- **Speed**: Fast (stops at first working version)
- **User Impact**: No manual Node version configuration needed

**Implementation**:
```typescript
async function detectAdobeCLINodeVersion(): Promise<number | undefined> {
  const nodeVersions = [24, 22, 20, 18]; // Try highest first

  for (const version of nodeVersions) {
    try {
      const result = await commandManager.executeAdobeCLI(
        '--version',
        { nodeVersion: version, timeout: TIMEOUTS.NODE_VERSION_TEST }
      );

      if (result.code === 0 && result.stdout.includes('@adobe/aio-cli')) {
        logger.debug(`Found working aio-cli on Node ${version}`);
        return version;
      }
    } catch (error) {
      // Try next version
    }
  }

  return undefined; // aio-cli not installed on any Node version
}
```

**Key Features**:
- Tests actual command execution, not just file existence
- Supports all Node LTS versions (18, 20, 22, 24)
- Returns highest working version for best compatibility
- Caches result for session to avoid repeated detection

**Dependencies**:
- Requires P03 (fnm exec isolation) for reliable version testing
- Works with P02 (binary caching) for fast execution

**Integration Strategy**:
1. **Priority**: P1 (HIGH value + EASY integration)
2. **Method**:
   - Add detectAdobeCLINodeVersion() function
   - Call before prerequisite checks
   - Cache result for session
   - Use detected version for all Adobe CLI operations
3. **Verification**:
   - Test with aio-cli installed on different Node versions
   - Verify automatic detection and selection
   - Check prerequisite check accuracy
4. **Effort**: 1-2 hours

**Refactor Branch Check**:
```bash
# Check for dynamic detection
grep -n "detectAdobeCLINodeVersion\|dynamic.*node.*version" -i src/utils/prerequisitesManager.ts
```

**Test Case**:
```typescript
it('should dynamically detect working Node version', async () => {
  // Install aio-cli only on Node 18
  await commandManager.execute('fnm use 18 && npm install -g @adobe/aio-cli');

  // Should detect Node 18 automatically
  const version = await detectAdobeCLINodeVersion();
  expect(version).toBe(18);

  // Should use detected version for commands
  const result = await commandManager.executeAdobeCLI('--version');
  expect(result.code).toBe(0);
});
```

**Risk**: LOW (straightforward detection logic)

**Related Enhancements**:
- Builds on P03 (fnm exec isolation)
- Enables F03 (explicit Node version system)
- Pairs with R03 (Adobe CLI version management)

---

### ENHANCEMENT-P05: Timeout Centralization (better maintainability)
- **Beta**: 35 (commit 6009c50)
- **Files**: src/utils/timeoutConfig.ts, 8 other files
- **Category**: Developer Experience
- **Value**: MEDIUM
- **Effort**: EASY
- **Integration Priority**: P4

**Description**:
Refactored 21 hardcoded timeout values across 8 files into centralized `TIMEOUTS` configuration. Provides single source of truth for all timeout values with clear documentation.

**Problem Solved**:
Timeouts were scattered across codebase with magic numbers:
```typescript
// File 1
setTimeout(() => {}, 5000); // Why 5000?

// File 2
timeout: 3000 // Why 3000?

// File 3
await wait(2000); // Why 2000?
```

**After**:
```typescript
// timeoutConfig.ts
export const TIMEOUTS = {
  // Binary path caching and validation
  BINARY_PATH_CACHE: 5000,      // Time to resolve binary paths via fnm
  QUICK_CONFIG_CHECK: 2000,     // Fast config reads (cached values)
  NODE_VERSION_TEST: 5000,      // Test Node version for aio-cli

  // Adobe CLI operations
  CONFIG_READ: 10000,           // Read CLI config values
  CONFIG_WRITE: 10000,          // Write CLI config values (increased from 5000ms in beta.24)

  // Authentication
  SDK_INIT: 5000,               // Initialize Adobe Console SDK
  POST_LOGIN_DELAY: 2000,       // Wait after login before verifying
  POST_LOGIN_RETRY_DELAY: 3000, // Wait before retrying after 0 orgs

  // Homebrew operations
  HOMEBREW_CHECK: 3000,         // Check if Homebrew is installed

  // Demo operations
  DEMO_START_CHECK: 5000,       // Check if demo server started

  // Validation operations
  COMMERCE_VALIDATION: 10000,   // Validate Commerce installation
};
```

**Files Refactored**:
1. autoUpdater.ts - Update check and download timeouts
2. meshDeploymentVerifier.ts - Mesh API call timeouts
3. meshVerifier.ts - Mesh verification timeouts
4. stalenessDetector.ts - Mesh staleness check timeouts
5. externalCommandManager.ts - Binary caching and config check timeouts
6. createProjectWebview.ts - Homebrew and API call timeouts
7. startDemo.ts - Demo start/stop check timeouts
8. commerceValidator.ts - Commerce validation timeouts

**Benefits**:
- **Maintainability**: Change one value, affects all uses
- **Documentation**: Each timeout has clear comment explaining purpose
- **Testability**: Easy to mock/override for tests
- **Consistency**: Related operations use same timeout values
- **Visibility**: All timeouts visible in one place

**Integration Strategy**:
1. **Priority**: P4 (MEDIUM value + EASY integration)
2. **Method**:
   - Create timeoutConfig.ts with TIMEOUTS object
   - Document each timeout value with comment
   - Replace all hardcoded timeouts with TIMEOUTS.X references
   - Verify no behavioral changes
3. **Verification**:
   - Run all operations to ensure same behavior
   - Check no operations now timeout prematurely
4. **Effort**: 2-3 hours

**Refactor Branch Check**:
```bash
# Check if timeout config exists
test -f src/utils/timeoutConfig.ts && echo "Found" || echo "Missing"
grep -n "import.*TIMEOUTS" src/utils/*.ts | wc -l
```

**Test Case**:
```typescript
it('should use centralized timeout values', async () => {
  // Verify timeouts are used from config
  const configRead = await commandManager.executeAdobeCLI(
    'config get token',
    { timeout: TIMEOUTS.CONFIG_READ }
  );

  // Should complete within configured timeout
  expect(configRead.code).toBe(0);
});
```

**Risk**: VERY LOW (refactoring only, no logic changes)

**Related Enhancements**:
- Improves P02 (binary caching) maintainability
- Enables easy performance tuning across codebase

---

### ENHANCEMENT-P06: fnm Path Caching (eliminates duplicate logs)
- **Beta**: 10 (commit 8c9d66b)
- **Files**: src/utils/externalCommandManager.ts
- **Category**: Performance + UX
- **Value**: LOW
- **Effort**: EASY
- **Integration Priority**: P4

**Description**:
Cache fnm path after first lookup to eliminate duplicate log messages. Session-level caching prevents repeated "[fnm] Found at: ..." logs.

**Problem Solved**:
When checking prerequisites for aio-cli, two commands were executed:
1. `aio --version` (to check CLI installation)
2. `aio plugins` (to check for api-mesh plugin)

Both commands called `findFnmPath()` which logged "[fnm] Found at: ..." each time, causing duplicate log messages.

**Performance Impact**:
- **Before**: 2x fnm path lookups per prerequisite check
- **After**: 1x fnm path lookup per session
- **User Impact**: Cleaner logs, no duplicate messages

**Implementation**:
```typescript
// Session-level cache
private cachedFnmPath: string | undefined;

async function findFnmPath(): Promise<string> {
  if (this.cachedFnmPath) {
    return this.cachedFnmPath;
  }

  // Find fnm (check common locations)
  const fnmPath = await which('fnm');
  this.cachedFnmPath = fnmPath;

  logger.debug(`[fnm] Found at: ${fnmPath}`);
  return fnmPath;
}
```

**Dependencies**: None

**Integration Strategy**:
1. **Priority**: P4 (LOW value + EASY integration)
2. **Method**:
   - Add cachedFnmPath field
   - Check cache before searching
   - Log only on cache miss
3. **Verification**:
   - Check logs for duplicate fnm messages
   - Verify single log message per session
4. **Effort**: 30 minutes - 1 hour

**Risk**: VERY LOW (simple caching)

---

### ENHANCEMENT-P07: Multi-Version Install Optimization (faster installs)
- **Beta**: Post-50 (commit 48bd5de)
- **Files**: src/utils/prerequisitesManager.ts
- **Category**: Performance
- **Value**: MEDIUM
- **Effort**: EASY
- **Integration Priority**: P4

**Description**:
Optimize multi-version prerequisite installs by only setting the last version as default. Reduces installation time by eliminating redundant `fnm default` operations.

**Problem Solved**:
When installing aio-cli for multiple Node versions (18, 20, 22), the installer would set each version as default during installation, causing 3x slowdown.

**Performance Impact**:
- **Before**: Set default 3 times (once per Node version)
- **After**: Set default 1 time (only for last version)
- **Improvement**: Faster multi-version installs
- **User Impact**: Quicker prerequisite installation

**Implementation**:
```typescript
async function installPrerequisite(versions: number[]): Promise<void> {
  for (let i = 0; i < versions.length; i++) {
    const version = versions[i];
    const isLast = i === versions.length - 1;

    // Install on this Node version
    await commandManager.execute(
      `fnm exec --using=${version} -- npm install -g @adobe/aio-cli`
    );

    // Only set default for last version
    if (isLast) {
      await commandManager.execute(`fnm default ${version}`);
    }
  }
}
```

**Dependencies**: None

**Integration Strategy**:
1. **Priority**: P4 (MEDIUM value + EASY integration)
2. **Method**:
   - Add isLast check in installation loop
   - Conditionally execute `fnm default` only for last version
3. **Verification**:
   - Measure installation time before/after
   - Verify last version is set as default
4. **Effort**: 30 minutes

**Risk**: VERY LOW (optimization only)

---

### ENHANCEMENT-P08: Progress Label Pattern (clearer progress)
- **Beta**: Post-50 (commits f650588, b6263a9, 8551d05)
- **Files**: src/utils/prerequisitesManager.ts, src/utils/stepLogger.ts
- **Category**: UX + DX
- **Value**: MEDIUM
- **Effort**: EASY
- **Integration Priority**: P4

**Description**:
Refined progress labels to show overall step counter, Node version, and milestone details with dash separator. Provides clearer progress visibility during multi-step operations.

**Problem Solved**:
Progress labels were confusing:
- Missing overall step counter
- Node version not visible in step name
- Milestone details verbose and unclear

**Before**:
```
Installing aio-cli...
  → Downloading package...
```

**After**:
```
[2/5] Installing aio-cli (Node 20)
  → Downloading package - 45% complete
```

**Implementation**:
```typescript
function formatProgressLabel(step: number, total: number, name: string, nodeVersion?: number, milestone?: string): string {
  let label = `[${step}/${total}] ${name}`;

  if (nodeVersion) {
    label += ` (Node ${nodeVersion})`;
  }

  if (milestone) {
    label += ` - ${milestone}`;
  }

  return label;
}
```

**Key Improvements**:
- Always show overall step counter ([2/5])
- Add Node version to step name for multi-version installs
- Use dash separator for milestone details (cleaner formatting)
- Remove verbose logging (reduced log noise)

**Dependencies**: None

**Integration Strategy**:
1. **Priority**: P4 (MEDIUM value + EASY integration)
2. **Method**:
   - Update stepLogger.logTemplate() to include counter
   - Add nodeVersion parameter to relevant log templates
   - Format milestone with dash separator
3. **Verification**:
   - Check progress labels during installation
   - Verify counter accuracy
4. **Effort**: 1-2 hours

**Risk**: VERY LOW (UI/UX improvement)

---

### ENHANCEMENT-P09: Exit Code Detection (better error detection)
- **Beta**: Post-50 (commits 7f6bab0, 4f67cc5)
- **Files**: src/utils/prerequisitesManager.ts
- **Category**: Reliability
- **Value**: MEDIUM
- **Effort**: EASY
- **Integration Priority**: P4

**Description**:
Fix aio-cli installation detection to check exit codes instead of try/catch. Provides more accurate detection of installation success/failure.

**Problem Solved**:
Installation status detection relied on try/catch, which could miss failures if command completed but had non-zero exit code.

**Before**:
```typescript
try {
  await installAdobeCLI(nodeVersion);
  installResult = true; // Assumes success
} catch (error) {
  installResult = false;
}
```

**After**:
```typescript
const result = await installAdobeCLI(nodeVersion);
if (result.code === 0) {
  installResult = true;
} else {
  installResult = false;
}
```

**Key Improvements**:
- Check actual exit code (0 = success, non-zero = failure)
- Update installResult based on per-node results
- More accurate overall status reporting

**Dependencies**: None

**Integration Strategy**:
1. **Priority**: P4 (MEDIUM value + EASY integration)
2. **Method**:
   - Replace try/catch with exit code checking
   - Update installResult logic
   - Test failure scenarios
3. **Verification**:
   - Simulate installation failures
   - Verify correct status reporting
4. **Effort**: 1 hour

**Risk**: LOW (better error detection)

---

### ENHANCEMENT-P10: Sort Node Versions (better display)
- **Beta**: Post-50 (commit 9847d28)
- **Files**: src/utils/prerequisitesManager.ts
- **Category**: UX
- **Value**: LOW
- **Effort**: EASY
- **Integration Priority**: P5

**Description**:
Sort Node versions in ascending order for consistent display and better UX.

**Before**: [24, 18, 20, 22] (unsorted)
**After**: [18, 20, 22, 24] (ascending)

**Implementation**:
```typescript
const nodeVersions = [24, 18, 20, 22].sort((a, b) => a - b);
```

**Integration Strategy**: 30 minutes (simple sort)

**Risk**: VERY LOW (cosmetic change)

---

## New Features (18 total)

### ENHANCEMENT-F01: Homebrew Automation (saves 5-10 minutes)
- **Beta**: 25-27 (commits ed5f57a, 1ec2808, bebac2d)
- **Files**: src/commands/helpers/prerequisiteChecker.ts, templates/prerequisites.json
- **Category**: New Feature
- **Value**: HIGH
- **Effort**: MODERATE
- **Integration Priority**: P2

**Description**:
Automated Homebrew installation with interactive terminal support. Opens dedicated terminal, handles password prompts, configures PATH automatically. Three-part implementation across beta releases.

**User Impact**:
- **Before**: Manual Homebrew installation (visit website, open Terminal, copy/paste command, enter password, configure PATH manually)
- **After**: Click "Install" button, enter password in VS Code terminal, done
- **Time Saved**: 5-10 minutes per user
- **Error Reduction**: No copy/paste errors, no PATH configuration mistakes

**Implementation Timeline**:

**Beta 25** - Interactive Terminal Installation:
```typescript
const terminal = vscode.window.createTerminal({
  name: 'Homebrew Installation',
  cwd: os.homedir()
});
terminal.show();
terminal.sendText('/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"');
```

**Beta 26** - PATH Configuration:
```typescript
// Add Homebrew to shell config
terminal.sendText('echo "eval \\"$(/opt/homebrew/bin/brew shellenv)\\"" >> ~/.zprofile');
terminal.sendText('source ~/.zprofile');
```

**Beta 27** - Duration Tuning + Milestone Removal:
```json
{
  "duration": 180000,  // 3 minutes (realistic for interactive install)
  "milestones": []     // Remove milestones (interactive mode, no predictable progress)
}
```

**Key Features**:
- Dedicated terminal (clean output, no mixed messages)
- Interactive password prompt (secure, native macOS authentication)
- Automatic PATH configuration (adds to ~/.zprofile)
- Progress indication (realistic 3-minute duration)
- Error handling (detects installation failures)

**Dependencies**:
- VS Code integrated terminal API
- macOS Homebrew install script
- Shell configuration files (~/.zprofile)

**Integration Strategy**:
1. **Priority**: P2 (HIGH value + MODERATE effort)
2. **Method**:
   - Implement terminal-based installation flow
   - Add PATH configuration step
   - Update prerequisite definitions with duration/milestones
   - Add error handling for failures
3. **Verification**:
   - Test on clean macOS system without Homebrew
   - Verify PATH configuration persists after terminal restart
   - Test password prompt handling
4. **Effort**: 3-4 hours

**Feature Completeness**:
- [x] macOS installation automation
- [x] PATH configuration
- [x] Error handling
- [x] Duration tuning
- [ ] Linux support (Homebrew on Linux)
- [ ] Apt/yum alternatives for Linux
- [ ] Windows package manager integration (Chocolatey/Scoop)

**Refactor Branch Check**:
```bash
# Check for Homebrew automation
grep -n "createTerminal\|Homebrew Installation" src/commands/helpers/prerequisiteChecker.ts
grep -n "homebrew" templates/prerequisites.json
```

**Test Case**:
```typescript
it('should install Homebrew interactively', async () => {
  // Simulate clean macOS system
  await commandManager.execute('which brew').catch(() => {
    // Homebrew not installed (expected)
  });

  // Trigger installation
  const result = await installHomebrew();
  expect(result.success).toBe(true);

  // Verify Homebrew is in PATH
  const brewPath = await commandManager.execute('which brew');
  expect(brewPath.stdout).toContain('homebrew');

  // Verify PATH configuration in shell config
  const zprofileContent = await fs.readFile(os.homedir() + '/.zprofile', 'utf8');
  expect(zprofileContent).toContain('brew shellenv');
});
```

**Risk**: MEDIUM (requires terminal interaction, shell configuration, platform-specific)

**Related Enhancements**:
- Enhanced by F02 (dedicated terminal for cleaner UX)
- Improved by U04 (close panel after install)
- Future: Linux/Windows support

---

### ENHANCEMENT-F02: Dedicated Homebrew Terminal (cleaner UX)
- **Beta**: 38 (commit 79c1228)
- **Files**: src/commands/helpers/prerequisiteChecker.ts
- **Category**: UX Feature
- **Value**: MEDIUM
- **Effort**: EASY
- **Integration Priority**: P4

**Description**:
Create dedicated "Homebrew Installation" terminal instead of reusing shared "Demo Builder" terminal. Provides clean, isolated output showing only Homebrew installation progress.

**User Impact**:
- **Before**: Mixed output in shared terminal (extension logs + Homebrew install + other operations)
- **After**: Clean dedicated terminal showing only Homebrew installation
- **Benefit**: Clearer UX, easier debugging, safer to close

**Implementation**:
```typescript
// BEFORE (beta.25-37)
const terminal = terminalManager.getOrCreateTerminal('Demo Builder');
terminal.sendText('brew install...');

// AFTER (beta.38+)
const terminal = vscode.window.createTerminal({
  name: 'Homebrew Installation',
  cwd: os.homedir()
});
terminal.show();
terminal.sendText('brew install...');
```

**Benefits**:
- **Clearer UX**: Descriptive terminal name ("Homebrew Installation")
- **No conflicts**: No mixed output from other operations
- **Safer**: Disposable and purpose-specific (safe to close)
- **Better debugging**: Only shows Homebrew installation logs

**Dependencies**:
- Builds on F01 (Homebrew automation)

**Integration Strategy**:
1. **Priority**: P4 (MEDIUM value + EASY integration)
2. **Method**:
   - Replace shared terminal usage with dedicated terminal creation
   - Set descriptive terminal name
   - Remove TerminalManager dependency for prerequisite installs
3. **Verification**:
   - Verify dedicated terminal appears with correct name
   - Check for clean output (no mixed logs)
4. **Effort**: 30 minutes

**Risk**: VERY LOW (simple terminal creation)

---

### ENHANCEMENT-F03: Explicit Node Version Management System
- **Beta**: 34 (commit 3773c8d)
- **Files**: templates/components.json, src/utils/nodeVersionResolver.ts, types
- **Category**: Feature + Architecture
- **Value**: HIGH
- **Effort**: HARD
- **Integration Priority**: P3

**Description**:
Implement explicit Node version management system where each component and infrastructure item declares its tested Node version. Extension uses what's configured without trying to be "smart" about compatibility.

**Philosophy**: "Explicit configuration over assumptions. Each component declares its tested Node version; extension uses what's configured."

**Problem Solved**:
- Extension made assumptions about Node version compatibility
- Users couldn't control which Node version was used for components
- No visibility into which Node versions were tested for each component

**Architecture**:

**Component Configuration**:
```json
{
  "components": {
    "commerce-mesh": {
      "nodeVersion": 18,
      "tested": true
    },
    "citisignal-nextjs": {
      "nodeVersion": 24,
      "tested": true
    }
  },
  "infrastructure": [
    {
      "id": "adobe-cli",
      "nodeVersions": [18, 20, 22],
      "tested": true
    }
  ]
}
```

**Node Version Resolver**:
```typescript
class NodeVersionResolver {
  collectRequiredVersions(project: Project): number[] {
    const versions = new Set<number>();

    // Add component Node versions
    for (const component of project.components) {
      if (component.nodeVersion) {
        versions.add(component.nodeVersion);
      }
    }

    // Add infrastructure Node versions
    for (const infraItem of project.infrastructure) {
      for (const version of infraItem.nodeVersions) {
        versions.add(version);
      }
    }

    return Array.from(versions).sort();
  }
}
```

**Type System Updates**:
```typescript
interface InfrastructureItem {
  id: string;
  nodeVersions: number[];
  tested: boolean;
}

interface ComponentRegistry {
  components: Component[];
  infrastructure: InfrastructureItem[];
}

interface Project {
  // OLD: nodeStrategy: 'single' | 'multi'
  // NEW:
  nodeVersions: number[]; // Collected from components + infrastructure
  components: Component[];
}
```

**Key Improvements**:
- **Explicit**: Each component declares its Node version (no guessing)
- **Flexible**: Supports single or multi-version projects
- **Visible**: Shows which versions are required in UI
- **Testable**: Clear what's been tested vs assumed

**Configuration Updates**:
- Adobe CLI/SDK: Node 18, 20, 22
- commerce-mesh: Node 18
- citisignal-nextjs: Node 24
- Infrastructure section added to components.json

**Benefits**:
- No more Node version conflicts
- Clear visibility into version requirements
- Better testing (know what to test)
- Easier debugging (know what should work)

**Dependencies**: None (architectural change)

**Integration Strategy**:
1. **Priority**: P3 (HIGH value + HARD effort)
2. **Method**:
   - Add infrastructure section to components.json
   - Create NodeVersionResolver utility
   - Update Component and Project types
   - Update ComponentManager to use project.nodeVersions
   - Update prerequisite system to scan only required versions
3. **Verification**:
   - Test single-version projects
   - Test multi-version projects
   - Verify correct Node version used for each component
4. **Effort**: 6-8 hours (architectural change touching multiple systems)

**Refactor Branch Check**:
```bash
# Check for explicit Node version system
grep -n "nodeVersion\|infrastructure" templates/components.json
grep -n "NodeVersionResolver\|nodeVersions" src/utils/*.ts
```

**Test Case**:
```typescript
it('should use explicit Node versions from component config', async () => {
  const project = {
    components: [
      { id: 'commerce-mesh', nodeVersion: 18 },
      { id: 'citisignal-nextjs', nodeVersion: 24 }
    ]
  };

  const resolver = new NodeVersionResolver();
  const versions = resolver.collectRequiredVersions(project);

  expect(versions).toEqual([18, 24]);
});
```

**Risk**: MEDIUM (architectural change, requires careful migration)

**Feature Completeness**:
- [x] Component Node version declarations
- [x] Infrastructure Node version declarations
- [x] NodeVersionResolver utility
- [x] Type system updates
- [x] Prerequisite system integration
- [ ] UI for viewing/editing Node versions
- [ ] Automatic version recommendation engine

---

### ENHANCEMENT-F04: Component Version Tracking (detects updates)
- **Beta**: 30 (commits 05d4932, f0f3197, 06a8ead)
- **Files**: src/utils/componentUpdater.ts, src/utils/stateManager.ts
- **Category**: Feature
- **Value**: MEDIUM
- **Effort**: MODERATE
- **Integration Priority**: P2

**Description**:
Track component versions using real Git commit SHAs. Auto-fix during project creation, detect updates accurately with short SHA comparison.

**Problem Solved**:
- Component version tracking was unreliable (used short SHAs that didn't match)
- False update notifications for existing projects
- No way to know if component updates were available

**Implementation Timeline**:

**Beta 28** - Initial Implementation:
```typescript
// Track component versions in project state
interface ProjectState {
  components: {
    [componentId: string]: {
      version: string; // Git SHA
    }
  }
}
```

**Beta 29** - Git SHA Auto-Fix:
```typescript
async function autoFixComponentVersions(projectPath: string): Promise<void> {
  for (const component of project.components) {
    const componentPath = path.join(projectPath, 'components', component.id);

    // Fetch real commit SHA from component git repo
    const result = await git.log({ cwd: componentPath, maxCount: 1 });
    const realSHA = result.latest.hash;

    // Update state with real SHA
    await stateManager.updateComponentVersion(component.id, realSHA);
  }
}
```

**Beta 30** - Short SHA Comparison:
```typescript
async function detectComponentUpdates(projectPath: string): Promise<Update[]> {
  const updates: Update[] = [];

  for (const component of project.components) {
    const currentSHA = await getCurrentSHA(component);
    const latestSHA = await getLatestSHA(component);

    // Compare first 7 characters (short SHA)
    if (currentSHA.substring(0, 7) !== latestSHA.substring(0, 7)) {
      updates.push({ component, currentSHA, latestSHA });
    }
  }

  return updates;
}
```

**Key Features**:
- Fetches real commit SHAs from Git repos
- Auto-fixes versions during project creation
- Short SHA comparison (7 chars) for reliability
- Comprehensive debug logging for troubleshooting

**Benefits**:
- Accurate update detection
- No false update notifications
- Reliable version tracking
- Better update management

**Dependencies**:
- Requires Git
- Component repos must be Git repositories

**Integration Strategy**:
1. **Priority**: P2 (MEDIUM value + MODERATE effort)
2. **Method**:
   - Add component version tracking to state management
   - Implement Git SHA fetching
   - Add auto-fix during project creation
   - Implement update detection with short SHA comparison
3. **Verification**:
   - Create project and verify SHAs are tracked
   - Update component and verify detection
   - Check for false positive notifications
4. **Effort**: 3-4 hours

**Refactor Branch Check**:
```bash
# Check for component version tracking
grep -n "componentVersion\|getLatestSHA" src/utils/componentUpdater.ts
grep -n "components.*version" src/utils/stateManager.ts
```

**Test Case**:
```typescript
it('should track component versions accurately', async () => {
  // Create project
  const project = await createProject({ components: ['commerce-mesh'] });

  // Verify SHA is tracked
  const state = await stateManager.getState(project.path);
  expect(state.components['commerce-mesh'].version).toMatch(/^[a-f0-9]{40}$/);

  // Update component
  await updateComponent('commerce-mesh');

  // Detect update
  const updates = await detectComponentUpdates(project.path);
  expect(updates.length).toBe(1);
  expect(updates[0].component).toBe('commerce-mesh');
});
```

**Risk**: MEDIUM (Git operations can fail, requires error handling)

**Related Enhancements**:
- Enables F06 (visual update progress)
- Enables F10 (duplicate update prevention)

---

### ENHANCEMENT-F05: Node 24 Support (future compatibility)
- **Beta**: 33 (commit d5c65d3)
- **Files**: templates/components.json, src/utils/nodeVersionResolver.ts
- **Category**: Feature
- **Value**: LOW
- **Effort**: EASY
- **Integration Priority**: P4

**Description**:
Add Node 24 support with compatibility checks. Adobe CLI SDK requires Node 18/20/22, so Node 24 falls back to CLI.

**Key Points**:
- Node 24 added to supported versions
- SDK initialization skipped on Node 24 (not compatible)
- CLI fallback ensures functionality
- Future-proofs extension for Node 24 adoption

**Integration Strategy**: 30 minutes (add version to config, add compatibility check)

**Risk**: LOW (adds new version without breaking existing functionality)

---

### ENHANCEMENT-F06: Visual Update Progress (better feedback)
- **Beta**: 31 (commits 43dc2cf, c4c5160)
- **Files**: src/utils/componentUpdater.ts
- **Category**: UX Feature
- **Value**: MEDIUM
- **Effort**: EASY
- **Integration Priority**: P4

**Description**:
Add visual progress indicator for component updates with percentage and status display.

**Before**: Silent update (no feedback)
**After**: "Updating components... 2/5 (40%)"

**Implementation**:
```typescript
async function updateComponents(components: string[]): Promise<void> {
  for (let i = 0; i < components.length; i++) {
    const progress = Math.round(((i + 1) / components.length) * 100);
    vscode.window.showInformationMessage(
      `Updating components... ${i + 1}/${components.length} (${progress}%)`
    );

    await updateComponent(components[i]);
  }
}
```

**Integration Strategy**: 1 hour (add progress calculation and notifications)

**Risk**: VERY LOW (UI improvement)

---

### ENHANCEMENT-F07: Semver Update Comparison (correct beta ordering)
- **Beta**: 11 (commit 6ae4584)
- **Files**: src/utils/updateManager.ts
- **Category**: Feature
- **Value**: LOW
- **Effort**: EASY
- **Integration Priority**: P4

**Description**:
Use semver for proper version comparison instead of string comparison. Fixes beta version ordering.

**Problem**: "1.0.0-beta.6" vs "1.0.0-beta.5" parsed as "1.0.0" vs "1.0.0" → no update

**Solution**: Use semver.gt() for proper comparison

**Integration Strategy**: 30 minutes (add semver dependency, update comparison)

**Risk**: VERY LOW (simple library usage)

---

### ENHANCEMENT-F08-F10: Update Notification Improvements
- **Beta**: 31, 8, 5
- **Category**: UX Features
- **Value**: LOW-MEDIUM
- **Effort**: EASY
- **Integration Priority**: P4-P5

**F08**: Update notification UX (show result, auto-dismiss)
**F09**: Update logging (better visibility)
**F10**: Duplicate update prevention (skip check after install)

**Integration Strategy**: 1-2 hours each

**Risk**: VERY LOW (UI/notification improvements)

---

## UX Improvements (23 total)

### ENHANCEMENT-U01: Symbol Standardization (85% log reduction)
- **Beta**: 43-48 (commits be508fe, 6bb53b5, b6da839, f892e56)
- **Files**: Throughout codebase (logging calls)
- **Category**: UX
- **Value**: MEDIUM
- **Effort**: EASY
- **Integration Priority**: P4

**Description**:
Replaced all emoji symbols with clean Unicode text equivalents for professional, terminal-compatible logs. Reduced visual noise by 85%.

**User Impact**:
- **Before**: "✅ Authentication successful 🎉 Ready to deploy 🚀"
- **After**: "✓ Authentication successful"
- **Benefit**: Professional appearance, better terminal compatibility, less distraction, cleaner reading

**Symbol Mappings**:
| Old Emoji | New Symbol | Usage | Context |
|-----------|------------|-------|---------|
| ✅ | ✓ | Success | Checkmark (U+2713) |
| ❌ | ✗ | Failure | Ballot X (U+2717) |
| ⚠️ | ⚠ | Warning | Warning sign (U+26A0, no variation selector) |
| ⏱️ | ⏱ | Timeout | Stopwatch (U+23F1, no variation selector) |
| ⏸️ | ⏸ | Pause | Pause button (U+23F8, no variation selector) |
| 🔧 | (removed) | Config | No clean Unicode equivalent |
| 🔍 | → | Search | Rightwards arrow |
| 📦 | → | Package | Rightwards arrow |
| 🚀 | → | Deploy | Rightwards arrow |

**Implementation Timeline**:

**Beta 43** - Main codebase cleanup:
- Replaced emoji in prerequisitesManager.ts
- Replaced emoji in adobeAuthManager.ts
- Replaced emoji in main log output

**Beta 47** - Comprehensive cleanup:
- Standardized all log symbols across codebase
- Removed emoji variation selectors (⚠️ → ⚠)
- Consistent Unicode symbols throughout

**Beta 48** - DebugLogger completion:
- Fixed ⚠️ → ⚠ in logger.warn()
- Fixed ❌ → ✗ in logger.error()
- These were being added automatically by DebugLogger
- All log channels now use consistent Unicode symbols

**Measured Impact**:
- **Log verbosity reduction**: 85% (from beta.44 release notes)
- **Visual noise reduction**: ~90% (fewer distracting emoji)
- **Terminal compatibility**: 100% (works in all terminals)

**Benefits**:
- **Professional**: Cleaner, more professional log output
- **Readable**: Easier to scan and read
- **Compatible**: Works in all terminals (even those without emoji support)
- **Consistent**: Uniform symbols across all operations
- **Accessible**: Better for screen readers

**Integration Strategy**:
1. **Priority**: P4 (MEDIUM value + EASY integration)
2. **Method**:
   - Search and replace all emoji with Unicode equivalents
   - Update DebugLogger to use Unicode symbols
   - Update all logging calls throughout codebase
3. **Verification**:
   - Review logs for emoji remnants
   - Check terminal compatibility
   - Verify consistent symbols
4. **Effort**: 30-60 minutes (simple search/replace across codebase)

**Refactor Branch Check**:
```bash
# Search for emoji (should find none or very few)
grep -r "✅\|❌\|🔧\|🔍\|📦\|🚀\|⚠️\|⏱️\|⏸️" src/ --include="*.ts"

# Search for Unicode replacements (should find many)
grep -r "✓\|✗\|⚠\|⏱\|⏸" src/ --include="*.ts" | wc -l
```

**Test Case**:
```typescript
it('should use Unicode symbols instead of emoji', () => {
  const logs: string[] = [];
  const logger = {
    info: (msg: string) => logs.push(msg),
    warn: (msg: string) => logs.push(msg),
    error: (msg: string) => logs.push(msg)
  };

  logger.info('Authentication successful');
  logger.warn('Token expiring soon');
  logger.error('Failed to connect');

  // Check for Unicode symbols
  expect(logs[0]).toContain('✓');
  expect(logs[1]).toContain('⚠');
  expect(logs[2]).toContain('✗');

  // Check NO emoji
  expect(logs.join('')).not.toContain('✅');
  expect(logs.join('')).not.toContain('❌');
  expect(logs.join('')).not.toContain('⚠️');
});
```

**Risk**: VERY LOW (cosmetic change, no functional impact)

**Related Enhancements**:
- Part of larger log cleanup effort (U03)
- Complements log verbosity reduction (beta.44)

---

### ENHANCEMENT-U02: Progress Label Refinement
Covered in P08 (dual categorization: performance + UX)

---

### ENHANCEMENT-U03: Log Cleanup (85% reduction)
- **Beta**: 44 (commit c89a902)
- **Files**: Throughout codebase
- **Category**: UX
- **Value**: HIGH
- **Effort**: EASY
- **Integration Priority**: P1

**Description**:
Reduced main log channel verbosity by ~85% by moving diagnostic output to debug channel. Users see only essential progress/status, developers see full details in debug channel.

**User Impact**:
- **Before**: Noisy logs with timing, process exits, internal diagnostics
- **After**: Clean logs showing only user-relevant progress/status

**Changes**:
- Moved all diagnostic output to debug channel
- Kept ✓/✗ prerequisite results in main log
- Moved timing info to debug channel
- Moved process exit codes to debug channel
- Moved internal state changes to debug channel

**Measured Impact**: 85% log verbosity reduction

**Integration Strategy**: 1-2 hours (move log calls from info→debug)

**Risk**: LOW (log routing only)

---

### ENHANCEMENT-U04-U06: Minor UX Improvements
- **U04** (beta.37): Close panel after Homebrew install - 30 min
- **U05** (beta.31): Update notification title shortening - 15 min
- **U06** (beta.24): Improved auth UI feedback - 1 hour

**Integration Priority**: P5 (low value, nice-to-have)

---

## Reliability Improvements (6 total)

### ENHANCEMENT-R01: fnm exec Isolation
Covered in P03 (dual categorization: performance + reliability)

---

### ENHANCEMENT-R02: fnm Path Verification (correct detection)
- **Beta**: 5-6 (commits 5a22e45, 4519b6a)
- **Files**: src/utils/prerequisitesManager.ts
- **Category**: Reliability
- **Value**: MEDIUM
- **Effort**: EASY
- **Integration Priority**: P4

**Description**:
Verify binaries are located in fnm's directory structure. Treat prerequisites outside fnm as "not installed" to prevent nvm/system Node interference.

**Problem Solved**:
Extension would find aio-cli from user's nvm installation and mark as "installed", even though it wasn't under fnm-managed Node versions.

**Implementation**:
```typescript
async function verifyPrerequisiteInFnm(binary: string): Promise<boolean> {
  const binaryPath = await which(binary);

  // Check if path contains fnm directory structure
  const fnmDir = process.env.FNM_DIR || path.join(os.homedir(), '.fnm');

  return binaryPath.startsWith(fnmDir);
}
```

**Integration Strategy**: 1-2 hours

**Risk**: LOW (better detection logic)

---

### ENHANCEMENT-R03: Adobe CLI Version Management (prevents ESM errors)
- **Beta**: 13-15 (commits a2e29e4, b832a6d, 9d07fcd)
- **Files**: src/utils/externalCommandManager.ts
- **Category**: Reliability
- **Value**: HIGH
- **Effort**: MODERATE
- **Integration Priority**: P2

**Description**:
Ensure ALL Adobe CLI commands use the same Node version consistently. Automatically detects and uses highest Node version with working aio-cli installation.

**Problem Solved**:
- `ERR_REQUIRE_ESM` errors from Node v14 not supporting ES modules
- `MODULE_NOT_FOUND: 'node:util'` errors from node: prefix requiring Node v16+
- Inconsistent Node versions across commands

**Implementation Timeline**:

**Beta 13** - Consistent Node version:
```typescript
// Detect highest Node version with aio-cli
const nodeVersion = await detectHighestNodeWithAdobeCLI();

// Use for ALL Adobe CLI commands
await executeAdobeCLI('--version', { nodeVersion });
await executeAdobeCLI('config get token', { nodeVersion });
```

**Beta 14** - fnm-only enforcement:
```typescript
// Skip aio-cli checks if fnm not installed
if (!hasFnm()) {
  logger.warn('fnm not installed, skipping aio-cli checks');
  return;
}
```

**Beta 15** - Dynamic detection:
```typescript
// Test each Node version by running aio --version
for (const version of [24, 22, 20, 18]) {
  const result = await executeAdobeCLI('--version', { nodeVersion: version });
  if (result.code === 0) {
    return version; // Found working version
  }
}
```

**Key Features**:
- Consistent Node version across all commands
- Automatic detection of working Node version
- Picks highest version for best compatibility
- Improved error logging

**Integration Strategy**:
1. **Priority**: P2 (HIGH value + MODERATE effort)
2. **Method**:
   - Add detectHighestNodeWithAdobeCLI()
   - Store detected version in session
   - Pass to all Adobe CLI commands
3. **Effort**: 2-3 hours

**Risk**: MEDIUM (requires testing with different Node versions)

---

### ENHANCEMENT-R04: Exit Code Detection
Covered in P09 (dual categorization: performance + reliability)

---

### ENHANCEMENT-R05: Auth Token Management (prevents corruption)
- **Beta**: 35 (commit 6009c50)
- **Files**: src/utils/adobeAuthManager.ts
- **Category**: Reliability
- **Value**: MEDIUM
- **Effort**: MODERATE
- **Integration Priority**: P2

**Description**:
Fix authentication returning 0 orgs/401 errors by removing manual token extraction/storage. Trust Adobe CLI's automatic token management.

**Problem Solved**:
After successful browser login, users would see "0 organizations" and could not proceed. Extension was manually extracting token from stdout and re-storing it, which corrupted the token.

**Before (Broken)**:
```typescript
const result = await executeAdobeCLI('auth login');
// Extract token from stdout
const token = result.stdout.match(/token: (.*)/)[1];
// Manually store token (CORRUPTS IT)
await executeAdobeCLI(`config set ims.contexts.cli.access_token.token ${token}`);
```

**After (Fixed)**:
```typescript
await executeAdobeCLI('auth login');
// Let CLI store token automatically
await delay(2000); // Wait for CLI to write config files
// Verify orgs (with retry if 0 found)
const orgs = await getOrganizations();
```

**Key Improvements**:
- Removed manual token extraction/storage
- Added 2-second delay after login for config file writes
- Added automatic retry if 0 orgs found
- Trust CLI's token management

**Integration Strategy**: 2-3 hours (remove manual token logic, add delays/retries)

**Risk**: LOW (simpler = more reliable)

---

### ENHANCEMENT-R06: Token Corruption Handling (auto-recovery)
- **Beta**: 39-42 (commits 3022c27, 009309f, bade596, 410505f, 99dbdc8)
- **Files**: src/utils/adobeAuthManager.ts
- **Category**: Reliability
- **Value**: MEDIUM
- **Effort**: MODERATE
- **Integration Priority**: P2

**Description**:
Detect and automatically fix Adobe CLI token corruption (expiry = 0). Multi-step automatic recovery with manual fallback.

**Problem Solved**:
Adobe CLI token corruption where expiry field = 0, blocking all authentication. Users saw "Token expired 0 minutes ago" and couldn't proceed.

**Root Cause** (beta.42):
Querying token and expiry separately caused race condition. Now fetches entire access_token object atomically with `--json` flag.

**Automatic Recovery Steps**:
1. Detect corruption (expiry = 0)
2. Try `aio auth logout` + verify token cleared
3. Try `aio config delete ims.contexts.cli.access_token` + verify deleted
4. If all automatic fixes fail, show terminal with manual instructions

**Implementation Timeline**:

**Beta 39** - Detection:
```typescript
const { expiresIn } = await inspectToken();
if (expiresIn === 0) {
  throw new Error('Token corruption detected');
}
```

**Beta 40** - Enhanced logging:
```typescript
// Debug logging for diagnosis
logger.debug(`Token valid: ${valid}, expiry: ${expiresIn}, exists: ${!!token}, length: ${token.length}`);
```

**Beta 41** - User-facing error:
```typescript
if (expiresIn === 0) {
  vscode.window.showErrorMessage(
    'Token corruption detected',
    'Open Terminal'
  ).then(selection => {
    if (selection === 'Open Terminal') {
      // Pre-populate with fix commands
    }
  });
}
```

**Beta 42** - Atomic fix + auto-recovery:
```typescript
// CRITICAL FIX: Fetch token atomically
const result = await executeAdobeCLI('config get ims.contexts.cli.access_token --json');
const tokenObj = JSON.parse(result.stdout);

// Auto-recovery
await executeAdobeCLI('auth logout');
const logoutVerify = await executeAdobeCLI('config get ims.contexts.cli.access_token');
if (logoutVerify.code !== 0) {
  // Logout succeeded, try login
}
```

**Key Features**:
- Atomic token fetching (prevents corruption)
- Multi-step automatic recovery
- Verification after each recovery step
- Manual fallback with terminal instructions
- Comprehensive debug logging

**Integration Strategy**: 3-4 hours (add detection, recovery, verification)

**Risk**: MEDIUM (complex recovery logic, needs thorough testing)

---

## Developer Experience Enhancements (8 total)

### ENHANCEMENT-D01: Timeout Centralization
Covered in P05 (dual categorization: performance + DX)

---

### ENHANCEMENT-D02-D08: Minor DX Improvements
- **D02**: Project name validation improvement (beta.34) - 1 hour
- **D03**: Logging clarity improvements (beta.34) - 2 hours
- **D04**: Auth logging improvement (beta.12) - 30 min
- **D05**: Comprehensive debug logging (beta.40, beta.30) - 1-2 hours
- **D06**: Package.json command restoration (beta.1) - 15 min
- **D07**: Repository URL fixes (beta.2-5) - 30 min
- **D08**: Documentation improvements (various) - N/A

**Integration Priority**: P4-P5 (nice-to-have)

---

## Integration Priority Breakdown

### Priority 1: Quick Wins (High Value + Easy) - 5 enhancements
**Must-integrate for immediate benefit:**

1. **ENHANCEMENT-P01**: SDK integration (30x speedup) - 2-3 hours
2. **ENHANCEMENT-P02**: Binary path caching (5-6x speedup) - 1-2 hours
3. **ENHANCEMENT-P04**: Dynamic Node detection - 1-2 hours
4. **ENHANCEMENT-U03**: Log cleanup (85% reduction) - 1-2 hours

**Total Effort**: 5-9 hours
**Total Value**:
- 30x faster auth operations
- 5-6x faster CLI commands
- Automatic Node version detection
- 85% cleaner logs
- **Cumulative user impact**: Dashboard loads in 5s instead of 30s+, auth checks instant instead of 10s+

---

### Priority 2: High Impact (High Value + Moderate) - 6 enhancements
**Schedule for early integration:**

1. **ENHANCEMENT-P03**: fnm exec isolation - 3-4 hours (enables P02)
2. **ENHANCEMENT-F01**: Homebrew automation - 3-4 hours (saves 5-10 min/user)
3. **ENHANCEMENT-F04**: Component version tracking - 3-4 hours (update detection)
4. **ENHANCEMENT-R03**: Adobe CLI version management - 2-3 hours (prevents ESM errors)
5. **ENHANCEMENT-R05**: Auth token management - 2-3 hours (prevents 0 orgs bug)
6. **ENHANCEMENT-R06**: Token corruption handling - 3-4 hours (auto-recovery)

**Total Effort**: 16-22 hours

---

### Priority 3: Strategic (High Value + Hard) - 1 enhancement
**Plan carefully:**

1. **ENHANCEMENT-F03**: Explicit Node version system - 6-8 hours (architectural change)

**Total Effort**: 6-8 hours

---

### Priority 4: Nice-to-Have (Medium Value + Easy) - 15+ enhancements
**Integrate when convenient:**

- P05: Timeout centralization - 2-3 hours
- P06: fnm path caching - 1 hour
- P07: Multi-version optimization - 30 min
- P08: Progress label pattern - 1-2 hours
- P09: Exit code detection - 1 hour
- F02: Dedicated Homebrew terminal - 30 min
- F05: Node 24 support - 30 min
- F06: Visual update progress - 1 hour
- F07: Semver update comparison - 30 min
- F10: Duplicate update prevention - 1 hour
- U01: Symbol standardization - 30-60 min
- U06: Improved auth UI - 1 hour
- R02: fnm path verification - 1-2 hours
- R04: Exit code detection - 1 hour

**Total Effort**: 13-18 hours

---

### Priority 5: Deferred (Low Value or Low Priority) - 5+ enhancements
**Skip or defer to future releases:**

- P10: Sort Node versions - 30 min
- F08: Update notification UX - 1 hour
- F09: Update logging - 1 hour
- U04: Close panel after install - 30 min
- U05: Update notification title - 15 min

**Total Effort**: 3-4 hours

---

## Performance Benchmark Summary

| Enhancement | Before | After | Improvement | User Impact | Beta | Priority |
|-------------|--------|-------|-------------|-------------|------|----------|
| SDK integration | 9s | 0.3s | 30x | Instant auth checks, dashboard 5s vs 30s+ | 34 | P1 |
| Binary path caching | 5-6s | <1s | 5-6x | All commands 5x faster | 24 | P1 |
| fnm exec isolation | Unreliable | 100% | Reliability | No ESM errors, version conflicts | 9 | P2 |
| Dynamic Node detection | Manual | Auto | Reliability | Auto-selects working version | 15 | P1 |
| fnm path caching | 2x lookups | 1x lookup | 2x | Eliminates duplicate logs | 10 | P4 |
| Multi-version optimization | 3x default | 1x default | 3x | Faster installs | Post-50 | P4 |

**Cumulative Impact**:
- **Auth operations**: 30x faster (9s → 0.3s)
- **Command overhead**: 5-6x faster (5-6s → <1s)
- **Overall dashboard load**: 6x faster (30s → 5s)
- **Log verbosity**: 85% reduction
- **Reliability**: 100% (eliminates version conflicts and ESM errors)

---

## Feature Roadmap

### Features That Could Be Enhanced Further

#### Homebrew Automation (F01)
- [x] macOS support (beta.25-27)
- [x] Interactive terminal (beta.25)
- [x] PATH configuration (beta.26)
- [x] Duration tuning (beta.27)
- [x] Dedicated terminal (beta.38)
- [ ] Linux support (Homebrew on Linux)
- [ ] Apt/yum alternatives for Linux
- [ ] Windows package manager integration (Chocolatey/Scoop)
- [ ] Error recovery (network failures, permission issues)

#### Component Version Tracking (F04)
- [x] Git SHA tracking (beta.28)
- [x] Auto-fix during creation (beta.29)
- [x] Short SHA comparison (beta.30)
- [x] Visual update progress (beta.31)
- [ ] Update notifications in dashboard
- [ ] Version comparison UI
- [ ] Rollback to previous versions
- [ ] Update scheduling (batch updates)

#### Node Version Management (F03)
- [x] Explicit version declarations (beta.34)
- [x] Dynamic detection (beta.15)
- [x] Multi-version support
- [ ] Automatic version selection based on component requirements
- [ ] Version recommendation engine (suggest best Node version)
- [ ] UI for viewing/editing Node versions
- [ ] Version conflict detection and resolution

#### Logging System
- [x] Symbol standardization (beta.43-48)
- [x] Log cleanup (beta.44)
- [x] Progress labels (post-beta.50)
- [ ] Log filtering (by severity, component, operation)
- [ ] Log export (save to file)
- [ ] Log search (find specific messages)
- [ ] Structured logging (JSON format for tools)

---

## Testing Requirements

### Performance Tests

**P01: SDK Integration**
```typescript
describe('SDK Performance', () => {
  it('should check auth in <1 second', async () => {
    const duration = await benchmark(() => authManager.isAuthenticatedQuick());
    expect(duration).toBeLessThan(1000);
  });

  it('should list orgs in <1 second', async () => {
    const duration = await benchmark(() => authManager.getOrganizations());
    expect(duration).toBeLessThan(1000);
  });

  it('should be 30x faster than CLI fallback', async () => {
    const sdkDuration = await benchmark(() => authManager.getOrganizations()); // With SDK
    const cliDuration = await benchmark(() => authManagerNoSDK.getOrganizations()); // Without SDK
    expect(cliDuration / sdkDuration).toBeGreaterThan(25); // 30x with some variance
  });
});
```

**P02: Binary Path Caching**
```typescript
describe('Binary Caching Performance', () => {
  it('should cache paths for 5-6x speedup', async () => {
    const duration1 = await benchmark(() => commandManager.executeAdobeCLI('--version'));
    const duration2 = await benchmark(() => commandManager.executeAdobeCLI('config get token'));
    expect(duration2).toBeLessThan(duration1 / 5);
  });

  it('should execute commands in <1 second after cache', async () => {
    await commandManager.executeAdobeCLI('--version'); // Warm cache
    const duration = await benchmark(() => commandManager.executeAdobeCLI('config get token'));
    expect(duration).toBeLessThan(1000);
  });
});
```

### Reliability Tests

**R01: fnm exec Isolation**
```typescript
describe('fnm Isolation', () => {
  it('should use fnm Node even with nvm installed', async () => {
    // Assumes both fnm and nvm are installed
    const result = await commandManager.executeAdobeCLI('node --version', { nodeVersion: 20 });
    expect(result.stdout).toContain('v20.');

    const whichNode = await commandManager.execute('fnm exec --using=20 -- which node');
    expect(whichNode.stdout).toContain('fnm');
    expect(whichNode.stdout).not.toContain('nvm');
  });

  it('should prevent ESM errors with old Node versions', async () => {
    const result = await commandManager.executeAdobeCLI('--version', { nodeVersion: 20 });
    expect(result.stderr).not.toContain('ERR_REQUIRE_ESM');
    expect(result.stderr).not.toContain('MODULE_NOT_FOUND');
  });
});
```

**R03: Adobe CLI Version Management**
```typescript
describe('Adobe CLI Version Management', () => {
  it('should use consistent Node version across commands', async () => {
    const version1 = await commandManager.executeAdobeCLI('node --version');
    const version2 = await commandManager.executeAdobeCLI('node --version');
    expect(version1.stdout).toBe(version2.stdout);
  });

  it('should detect and use highest working Node version', async () => {
    const detected = await detectHighestNodeWithAdobeCLI();
    expect([18, 20, 22, 24]).toContain(detected);
  });
});
```

**R05-R06: Auth Token Management**
```typescript
describe('Auth Token Management', () => {
  it('should not corrupt token after login', async () => {
    await authManager.login();
    await delay(2000);

    const orgs = await authManager.getOrganizations();
    expect(orgs.length).toBeGreaterThan(0);
  });

  it('should detect token corruption', async () => {
    // Simulate corruption
    await executeAdobeCLI('config set ims.contexts.cli.access_token.expiry 0');

    const { expiresIn } = await authManager.inspectToken();
    expect(expiresIn).toBe(0);
  });

  it('should auto-recover from corruption', async () => {
    // Simulate corruption
    await executeAdobeCLI('config set ims.contexts.cli.access_token.expiry 0');

    // Auto-recovery should fix
    await authManager.login();
    const orgs = await authManager.getOrganizations();
    expect(orgs.length).toBeGreaterThan(0);
  });
});
```

### Feature Tests

**F01: Homebrew Automation**
```typescript
describe('Homebrew Automation', () => {
  it('should install Homebrew via terminal', async () => {
    // Clean system (remove Homebrew)
    await removeHomebrew();

    // Trigger installation
    const result = await installHomebrew();
    expect(result.success).toBe(true);

    // Verify installed
    const brewPath = await which('brew');
    expect(brewPath).toContain('homebrew');
  });

  it('should configure PATH automatically', async () => {
    await installHomebrew();

    const zprofileContent = await fs.readFile(os.homedir() + '/.zprofile', 'utf8');
    expect(zprofileContent).toContain('brew shellenv');
  });
});
```

**F03: Explicit Node Version System**
```typescript
describe('Explicit Node Version System', () => {
  it('should collect Node versions from components', () => {
    const project = {
      components: [
        { id: 'commerce-mesh', nodeVersion: 18 },
        { id: 'citisignal-nextjs', nodeVersion: 24 }
      ]
    };

    const resolver = new NodeVersionResolver();
    const versions = resolver.collectRequiredVersions(project);
    expect(versions).toEqual([18, 24]);
  });

  it('should use component-specified Node version', async () => {
    const component = { id: 'commerce-mesh', nodeVersion: 18 };
    await componentManager.runComponent(component);

    // Verify Node 18 was used
    const nodeVersion = await getLastUsedNodeVersion();
    expect(nodeVersion).toBe(18);
  });
});
```

**F04: Component Version Tracking**
```typescript
describe('Component Version Tracking', () => {
  it('should track Git SHA for components', async () => {
    const project = await createProject({ components: ['commerce-mesh'] });
    const state = await stateManager.getState(project.path);

    expect(state.components['commerce-mesh'].version).toMatch(/^[a-f0-9]{40}$/);
  });

  it('should detect component updates', async () => {
    const project = await createProject({ components: ['commerce-mesh'] });

    // Update component
    await updateComponent('commerce-mesh');

    // Detect update
    const updates = await detectComponentUpdates(project.path);
    expect(updates.length).toBe(1);
    expect(updates[0].component).toBe('commerce-mesh');
  });

  it('should not show false update notifications', async () => {
    const project = await createProject({ components: ['commerce-mesh'] });

    // No updates (just created)
    const updates = await detectComponentUpdates(project.path);
    expect(updates.length).toBe(0);
  });
});
```

---

## Recommendations

### For Refactor Branch Integration

#### Phase 0: CRITICAL Beta.51-72 Fixes (3-5 hours) - MUST INTEGRATE FIRST
**Critical bug fixes and safety improvements:**

1. **Node Version Priority System** (E068) - 2-3 hours
   - Prevents Node 14 fallback (MODULE_NOT_FOUND errors)
   - Prevents Node 24 selection (SDK version errors)
   - Infrastructure-first priority system
   - **Dependencies**: Beta.51-53 must be integrated together

2. **Developer Permission Verification** (E070) - 1 hour
   - Prevents silent failures for users without Developer role
   - Definitive permission checking via 'aio app list'
   - Clear error messaging with actionable guidance
   - **Dependencies**: UI changes in AdobeAuthStep.tsx

3. **fnm Shell Configuration** (E071) - 30-60 min
   - Actually implements shell profile configuration
   - Prevents "environment variables not found" errors
   - Demo startup works without manual configuration
   - **Dependencies**: None (standalone fix)

4. **Type Safety - Date Handling** (E074) - 15 min
   - Prevents extension crashes from date serialization
   - Simple defensive programming fix
   - **Dependencies**: None (must have)

**Why Phase 0 First**: These are CRITICAL bug fixes that prevent crashes, auth failures, and silent permission errors. Must be integrated before any other work.

---

#### Phase 1: Performance Optimizations (5-9 hours)
**Immediate high-value improvements:**

1. **SDK integration** (P01) - 2-3 hours
   - 30x faster auth operations
   - Dashboard loads 6x faster
   - Instant auth checks

2. **Binary path caching** (P02) - 1-2 hours
   - 5-6x faster CLI commands
   - Eliminates fnm exec overhead
   - Pairs perfectly with SDK for complete performance solution

3. **Dynamic Node detection** (P04) - 1-2 hours
   - Automatic working version detection
   - No manual configuration needed

4. **Log cleanup** (U03) - 1-2 hours
   - 85% less noise
   - Professional user experience

**Why Phase 1 First**: Immediate user-visible performance improvements with minimal risk and low effort.

---

#### Phase 2: Reliability & Features (16-22 hours)
**Critical reliability improvements and high-value features:**

1. **fnm exec isolation** (P03) - 3-4 hours
   - Prevents version conflicts
   - Enables binary path caching
   - Must integrate before P02 for full benefit

2. **Adobe CLI version management** (R03) - 2-3 hours
   - Prevents ESM errors
   - Consistent Node version usage

3. **Auth token management** (R05) - 2-3 hours
   - Fixes "0 organizations" bug
   - Prevents token corruption

4. **Token corruption handling** (R06) - 3-4 hours
   - Auto-recovery from corruption
   - Better error messages

5. **Homebrew automation** (F01) - 3-4 hours
   - Saves 5-10 minutes per user
   - Eliminates manual installation steps

6. **Component version tracking** (F04) - 3-4 hours
   - Accurate update detection
   - No false notifications

**Why Phase 2 Second**: Addresses major reliability issues and adds high-value features that improve daily workflow.

---

#### Phase 3: Architecture & Polish (6-8 hours)
**Strategic improvements for long-term maintainability:**

1. **Explicit Node version system** (F03) - 6-8 hours
   - Clean architecture
   - Better version control
   - Foundation for future enhancements

**Why Phase 3 Third**: Architectural change requiring more time and careful planning. Provides foundation for future features.

---

#### Phase 4: Nice-to-Have (13-18 hours)
**Polish and convenience features:**

- Timeout centralization (P05) - 2-3 hours
- Progress label pattern (P08) - 1-2 hours
- Symbol standardization (U01) - 30-60 min
- fnm path caching (P06) - 1 hour
- fnm path verification (R02) - 1-2 hours
- All other minor improvements

**Why Phase 4 Last**: Lower priority improvements that add polish but aren't critical for core functionality.

---

### Integration Sequence

**Recommended Order**:
1. Performance first (immediate user value + low risk)
2. Reliability second (prevents major bugs)
3. Features third (adds functionality)
4. Architecture fourth (long-term value)
5. Polish fifth (nice-to-have)

**Critical Path**:
- P03 (fnm exec) must come before P02 (binary caching)
- R05 (auth token mgmt) should come before P01 (SDK integration) for stability
- F03 (explicit Node versions) benefits from P04 (dynamic detection) being integrated first

---

### Total Effort Estimation

| Phase | Enhancements | Effort | Value |
|-------|--------------|--------|-------|
| **Phase 0: CRITICAL Beta.51-72** | **4** | **3-5 hours** | **CRITICAL** |
| Phase 1: Performance | 4 | 5-9 hours | HIGH |
| Phase 2: Reliability & Features | 8 | 18-26 hours | HIGH |
| Phase 3: Architecture | 1 | 6-8 hours | MEDIUM |
| Phase 4: Nice-to-Have | 20+ | 16-22 hours | LOW-MEDIUM |
| **TOTAL (Beta 1-72)** | **37+** | **48-70 hours** | - |

**CRITICAL PATH** (Phase 0 only): 3-5 hours
**Minimum Viable Integration** (Phase 0 + Phase 1 + Phase 2): 26-40 hours
**Full Integration** (All phases): 48-70 hours

**NOTE**: Phase 0 includes 2 additional P2-HIGH enhancements from beta.51-72:
- **Terminal Working Directory Safety** (E072) - Prevents "directory does not exist" errors
- **Adobe CLI Per-Node Checks** (E075) - Accurate install status for all Node versions

---

## NEW: Enhancements from Beta.51-72 (16 total)

### ENHANCEMENT-E068: Node Version Priority System (architecture improvement)
- **Beta**: 51-53 (commits 63a7325, 9f17b28, c9c7b1b)
- **Files**: externalCommandManager.ts, createProjectWebview.ts, components.json
- **Category**: Reliability + Architecture
- **Value**: HIGH
- **Effort**: MODERATE
- **Integration Priority**: P1
- **Integration Complexity**: HIGH (core logic changes)

**Description**:
Complete redesign of Node version selection with infrastructure-first priority system. Removes "allowed versions" concept in favor of single source of truth (components.json). Prevents fallback to incompatible Node versions (14, 24).

**Problem Solved**:
- Node 14 fallback caused MODULE_NOT_FOUND errors
- Node 24 selected instead of infrastructure Node 18 causing SDK version errors
- "Allowed versions" was leaky abstraction
- Inconsistent behavior with/without project context

**Implementation**:
```typescript
// Priority hierarchy
getNodeVersion(): number {
  // 1. Try infrastructure-defined version (even without project)
  const infraVersion = this.getInfrastructureNodeVersion();
  if (infraVersion && await this.testNodeVersion(infraVersion)) {
    return infraVersion;
  }

  // 2. Try project-configured versions
  if (project) {
    for (const version of project.nodeVersions) {
      if (await this.testNodeVersion(version)) {
        return version;
      }
    }
  }

  // 3. Scan all versions (fallback only)
  return await this.scanAllVersions();
}
```

**Key Features**:
- Single source of truth: components.json infrastructure section
- Infrastructure version used even before project creation
- Predictable, consistent Node selection
- No more allowed versions complexity

**Impact**:
- Prevents auth failures from Node 14
- Prevents SDK errors from Node 24
- Auth works before project creation
- Cleaner architecture

**Related Enhancements**:
- Builds on P03 (fnm exec isolation)
- Builds on P04 (dynamic Node detection)
- Enables E069 (infrastructure consolidation)

**Integration Notes**:
- Beta.51-53 form inseparable unit (must integrate together)
- Refactor branch likely has different Node version logic
- Careful merge required with race condition fixes

**Risk**: HIGH (core command execution logic modified)

---

### ENHANCEMENT-E069: Adobe CLI Infrastructure Consolidation
- **Beta**: 52 (commit 9f17b28)
- **Files**: templates/components.json
- **Category**: Code Quality
- **Value**: MEDIUM
- **Effort**: EASY
- **Integration Priority**: P3
- **Integration Complexity**: LOW (template file only)

**Description**:
Merged adobe-cli and adobe-cli-sdk into single infrastructure component. SDK runs inside CLI process, not separate tool.

**Before**:
```json
{
  "infrastructure": [
    { "id": "adobe-cli", "nodeVersion": 18 },
    { "id": "adobe-cli-sdk", "nodeVersion": 18 }
  ]
}
```

**After**:
```json
{
  "infrastructure": [
    { "id": "adobe-cli", "name": "Adobe I/O CLI & SDK", "nodeVersion": 18 }
  ]
}
```

**Benefits**:
- Simplified architecture (one component vs two)
- Clearer naming
- Both CLI and SDK use same Node version
- Reflects actual relationship (SDK embedded in CLI)

**Integration Notes**:
- Verify refactor doesn't reference 'adobe-cli-sdk'
- Update any code that checks for SDK separately

**Risk**: LOW (simple template change)

---

### ENHANCEMENT-E070: Developer Permission Verification System
- **Beta**: 54-58 (commits 70d3f9f, 7102b6d, f75dc06, c8d617c, c51a540)
- **Files**: adobeAuthManager.ts, createProjectWebview.ts, AdobeAuthStep.tsx
- **Category**: Reliability + UX
- **Value**: HIGH
- **Effort**: MODERATE
- **Integration Priority**: P1
- **Integration Complexity**: MEDIUM (new method + UI changes)

**Description**:
Definitive Developer role verification prevents silent failures for users without App Builder access. Multi-release implementation with progressive error handling improvements.

**Problem Solved**:
- Users without Developer role got confusing timeout errors
- Silent failures for users without proper permissions
- "Sign In Again" reused insufficient token (couldn't change org)
- No way to distinguish permission vs connection errors

**Implementation Timeline**:
- **Beta.54**: Debug logging for 0 organizations
- **Beta.55**: "No App Builder Access" error messaging
- **Beta.56**: testDeveloperPermissions() method via 'aio app list --json'
- **Beta.57**: Permission-specific UI (AlertCircle icon, remove retry button)
- **Beta.58**: Force fresh login for permission errors (can select different org)

**Key Method**:
```typescript
private async testDeveloperPermissions(): Promise<boolean> {
  try {
    const result = await this.executeAdobeCLI('app list --json');
    if (result.code === 0) {
      return true; // Has Developer permissions
    }

    // Check for permission error keywords
    if (result.stderr.includes('403') ||
        result.stderr.includes('Forbidden') ||
        result.stderr.includes('insufficient privileges')) {
      throw new Error('no_app_builder_access');
    }

    return false;
  } catch (error) {
    // Distinguish permission vs connection errors
    if (error.message === 'no_app_builder_access') {
      throw error;
    }
    throw new Error('connection_error');
  }
}
```

**UI Enhancements**:
- AlertCircle (orange) icon for permission errors
- Alert (red) icon for connection errors
- Remove retry button for permission errors (pointless)
- force=true for permission errors (allows org selection)
- Clear guidance: "Contact your Adobe organization administrator or try signing in with a different account"

**Benefits**:
- Definitive permission checking
- Clear error messages with actionable guidance
- Different UI for permission vs connection errors
- Ability to select different organization

**Integration Notes**:
- Add testDeveloperPermissions() to auth manager
- Integrate permission check into auth flow
- Update error handling UI in AdobeAuthStep
- Ensure 'no_app_builder_access' error type supported

**Risk**: MEDIUM (auth flow changes)

---

### ENHANCEMENT-E071: fnm Shell Profile Configuration
- **Beta**: 59 (commit caa3fd9)
- **Files**: progressUnifier.ts
- **Category**: Reliability
- **Value**: HIGH
- **Effort**: MODERATE
- **Integration Priority**: P1
- **Integration Complexity**: MEDIUM (file I/O operations)

**Description**:
Actual implementation of fnm shell profile configuration. Before this, "Configuring shell" was just a placeholder step. Now writes fnm environment setup to .zshrc or .bash_profile.

**Problem Solved**:
- "We can't find necessary environment variables" error on demo startup
- fnm installed but not configured in shell
- Demo startup failures due to missing fnm environment

**Implementation**:
```typescript
private async configureFnmShell(): Promise<void> {
  const homeDir = os.homedir();

  // Detect shell type
  const shell = process.env.SHELL || '';
  const configFile = shell.includes('zsh')
    ? path.join(homeDir, '.zshrc')
    : path.join(homeDir, '.bash_profile');

  // Check if already configured (idempotent)
  if (fs.existsSync(configFile)) {
    const content = fs.readFileSync(configFile, 'utf8');
    if (content.includes('fnm env')) {
      this.logger.debug('fnm already configured in shell profile');
      return;
    }
  }

  // Add fnm configuration
  const fnmConfig = `
# fnm (Fast Node Manager)
export PATH="$HOME/.fnm:$PATH"
eval "$(fnm env --use-on-cd)"
`;

  fs.appendFileSync(configFile, fnmConfig);
  this.logger.info(`fnm configured in ${configFile}`);
}
```

**Key Features**:
- Detects shell type (.zshrc vs .bash_profile)
- Checks if already configured (idempotent)
- Adds PATH export and fnm env setup
- Enables automatic Node version switching (--use-on-cd)

**Benefits**:
- Shell properly configured for fnm
- Demo startup works without manual configuration
- Prevents environment variable errors
- Automatic Node version switching in project directories

**Integration Notes**:
- Add to prerequisite system or ProgressUnifier
- Ensure called during fnm installation
- Handle file I/O errors gracefully
- Test idempotency (multiple installations)

**Risk**: MEDIUM (file I/O, shell-specific)

---

### ENHANCEMENT-E072: Terminal Working Directory Safety
- **Beta**: 61-66 (commits 4556597, ac36ab4, a83d547, 2780300, 30d156d, 2adf6fa)
- **Files**: createProjectWebview.ts, package.json, terminalManager.ts (deleted)
- **Category**: Reliability + Code Quality
- **Value**: HIGH
- **Effort**: HARD
- **Integration Priority**: P2
- **Integration Complexity**: HIGH (6-release iterative redesign)

**Description**:
Complete redesign of terminal and workspace management through 6 iterative releases. Final solution: stop adding projects to workspace by default, use ComponentTreeProvider instead, smart terminal directory detection.

**Problem Solved**:
- "Starting directory does not exist" errors during prerequisites
- Homebrew installation failures
- Extension Host restart needed
- Project workspace folders caused terminal issues

**Solution Arc**:
1. **Beta.61**: Safe cwd fallback to home directory
2. **Beta.62**: Detect project workspace folders (.demo-builder/projects pattern)
3. **Beta.63**: Major simplification - remove workspace addition (-41 lines)
4. **Beta.64**: Make workspace addition optional via setting
5. **Beta.65**: Smart project directory detection
6. **Beta.66**: Delete unused TerminalManager (-132 lines dead code)

**Final Implementation**:
```typescript
private async getTerminalCwd(): Promise<string> {
  // Priority 1: Existing project directory
  if (this.projectPath && fs.existsSync(this.projectPath)) {
    return this.projectPath;
  }

  // Priority 2: Workspace folder (if not project workspace)
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    const wsPath = workspaceFolders[0].uri.fsPath;

    // Avoid project workspaces (.demo-builder/projects)
    if (!wsPath.includes('.demo-builder/projects')) {
      return wsPath;
    }
  }

  // Priority 3: Home directory (safe fallback)
  return os.homedir();
}
```

**New Setting** (beta.64):
```json
{
  "demoBuilder.addProjectToWorkspace": {
    "type": "boolean",
    "default": false,
    "description": "Automatically add created projects to VS Code workspace"
  }
}
```

**Benefits**:
- Terminals work during prerequisites installation
- No "starting directory does not exist" errors
- No Extension Host restart needed
- Cleaner approach (ComponentTreeProvider for file browsing)
- User flexibility (optional workspace addition)
- -173 lines of complexity removed (net)

**Integration Notes**:
- Remove TerminalManager imports (file deleted)
- Implement smart directory detection
- Add optional workspace setting
- Use ComponentTreeProvider for project files
- Test: prerequisites, Homebrew, terminal operations

**Risk**: HIGH (major architectural change, 6-release chain)

---

### ENHANCEMENT-E073: Notification UX Polish
- **Beta**: 60, 67-69, 72 (commits f316500, 09982ae, e1508ce, 18a44ba, b484231, da0e5a7)
- **Files**: startDemo.ts, stopDemo.ts, baseCommand.ts, configureProjectWebview.ts
- **Category**: UX
- **Value**: MEDIUM
- **Effort**: EASY
- **Integration Priority**: P3
- **Integration Complexity**: LOW (logging/notification changes)

**Description**:
Progressive cleanup of verbose notifications through 5 releases. Final state: auto-dismissing notifications, debug-level verbose logs, dashboard indicators provide feedback.

**Problem Solved**:
- Too many verbose progress notifications
- Overlapping notifications causing flashes
- Modal popups requiring manual dismissal
- Redundant messages (dashboard already shows status)

**Changes**:
- **Beta.60**: Move verbose start/stop messages to debug level
- **Beta.67**: Remove "Starting frontend application" notification
- **Beta.68**: Better port release message wording
- **Beta.69**: Remove port release message (fix flash)
- **Beta.72**: Auto-dismissing notifications (2s) instead of modal

**Pattern Change**:
```typescript
// Before (beta.1-71): Modal notification requiring dismissal
vscode.window.showInformationMessage('Configuration saved successfully');

// After (beta.72): Auto-dismissing notification (2 seconds)
await this.showProgressNotification('Configuration saved successfully', 2000);
```

**Implementation** (beta.72):
```typescript
// baseCommand.ts
protected async showSuccessMessage(message: string): Promise<void> {
  await this.showProgressNotification(message, 2000);
}

// configureProjectWebview.ts
await this.showSuccessMessage('Configuration saved successfully');
```

**Benefits**:
- Cleaner notification experience
- Dashboard indicators provide visual feedback
- Auto-dismissing success messages (consistent pattern)
- Debug logs preserve information for troubleshooting
- No notification flashes from overlapping messages

**Integration Notes**:
- Make showSuccessMessage() async
- Use showProgressNotification(message, 2000)
- Move verbose demo logs to debug level
- Keep single final notification per operation

**Risk**: LOW (UX polish only)

---

### ENHANCEMENT-E074: Type Safety - Date Object Handling
- **Beta**: 70 (commit 80ee9a8)
- **Files**: stateManager.ts
- **Category**: Code Quality
- **Value**: HIGH
- **Effort**: EASY
- **Integration Priority**: P1
- **Integration Complexity**: LOW (simple fix)

**Description**:
Critical type safety fix prevents extension crashes when project.created is stored as string instead of Date object.

**Problem Solved**:
- project.created.toISOString() crashes if project.created is string
- StateManager loads from JSON (dates become strings)
- Extension crashes on dashboard load

**Before (Broken)**:
```typescript
created: project.created.toISOString()
// Crashes if project.created is '2025-10-17T12:00:00.000Z' (string)
```

**After (Fixed)**:
```typescript
created: (project.created instanceof Date
  ? project.created
  : new Date(project.created)
).toISOString()
```

**Benefits**:
- No crashes from date handling
- Works with both Date objects and date strings
- Defensive programming pattern
- Prevents data corruption issues

**Integration Notes**:
- MUST integrate (prevents crashes)
- Simple one-line fix
- Add to integration checklist as critical

**Risk**: NONE (must have)

---

### ENHANCEMENT-E075: Adobe CLI Per-Node Version Checks
- **Beta**: 70-71 (commits 80ee9a8, 0549830)
- **Files**: createProjectWebview.ts
- **Category**: Reliability
- **Value**: HIGH
- **Effort**: EASY
- **Integration Priority**: P2
- **Integration Complexity**: MEDIUM (prerequisite logic changes)

**Description**:
Check Adobe CLI installation in ALL project Node versions (infrastructure + components), not just infrastructure versions. Prevents false negatives where Node 24 shows "not installed" after successful installation.

**Problem Solved**:
- Adobe CLI only checked in infrastructure versions
- Missed component-specific Node versions (like Node 24 for citisignal-nextjs)
- False negative: Node 24 shows "not installed" after install
- Used wrong method (execute() vs executeAdobeCLI())

**Before**:
```typescript
// Only check infrastructure versions
for (const infraItem of infrastructure) {
  for (const version of infraItem.nodeVersions) {
    await checkAdobeCLI(version);
  }
}
// Misses component Node versions!
```

**After**:
```typescript
// Get ALL project Node versions
const allVersions = getRequiredNodeVersions(project);

// Check Adobe CLI in each version
for (const version of allVersions) {
  const result = await executeAdobeCLI('--version', { nodeVersion: version });
  // Uses correct method for per-node checks
}
```

**Key Fixes**:
- Use getRequiredNodeVersions() for complete version list
- Use executeAdobeCLI() instead of execute() for per-node checks
- Check infrastructure + component versions

**Benefits**:
- Accurate install status for all Node versions
- No false negatives
- Correct prerequisite reporting
- Better developer experience

**Integration Notes**:
- Update prerequisite checking logic
- Use getRequiredNodeVersions()
- Use executeAdobeCLI() for per-node checks
- Test with Node 24 components

**Risk**: MEDIUM (prerequisite system changes)

---

### ENHANCEMENT-E076: StateManager Logging Improvements
- **Beta**: 64 (commit 2780300)
- **Files**: stateManager.ts
- **Category**: Code Quality
- **Value**: LOW
- **Effort**: EASY
- **Integration Priority**: P4
- **Integration Complexity**: LOW (logging only)

**Description**:
Replace console.error() with proper Logger instance in StateManager for consistent logging.

**Before**:
```typescript
console.error('Failed to load project state:', error);
```

**After**:
```typescript
private logger = Logger.getInstance();

this.logger.error('Failed to load project state', error);
```

**Benefits**:
- Consistent logging across extension
- Logs go to proper output channel
- Better debugging experience
- Professional logging pattern

**Integration Notes**:
- Add Logger instance to StateManager
- Replace console.error calls
- Test error logging

**Risk**: VERY LOW (logging only)

---

### ENHANCEMENT-E077: Progress Label Best Practices
- **Beta**: Post-50 (commits f650588, b6263a9, 8551d05)
- **Files**: prerequisitesManager.ts, stepLogger.ts
- **Category**: UX
- **Value**: MEDIUM
- **Effort**: EASY
- **Integration Priority**: P4
- **Integration Complexity**: LOW (logging format)

**Description**:
Refined progress labels to show overall step counter, Node version, and milestone details with dash separator.

**Covered in P08** - See ENHANCEMENT-P08 for full details.

**Integration Notes**:
- Already documented in beta.1-50 catalog
- Continues progress label pattern

**Risk**: LOW

---

### ENHANCEMENT-E078: Exit Code Detection Pattern
- **Beta**: Post-50 (commits 7f6bab0, 4f67cc5)
- **Files**: prerequisitesManager.ts
- **Category**: Reliability
- **Value**: MEDIUM
- **Effort**: EASY
- **Integration Priority**: P4
- **Integration Complexity**: LOW (error detection)

**Description**:
Fix aio-cli installation detection to check exit codes instead of try/catch.

**Covered in P09** - See ENHANCEMENT-P09 for full details.

**Integration Notes**:
- Already documented in beta.1-50 catalog
- Better error detection pattern

**Risk**: LOW

---

### ENHANCEMENT-E079: Multi-Version Install Optimization
- **Beta**: Post-50 (commit 48bd5de)
- **Files**: prerequisitesManager.ts
- **Category**: Performance
- **Value**: MEDIUM
- **Effort**: EASY
- **Integration Priority**: P4
- **Integration Complexity**: LOW (optimization)

**Description**:
Optimize multi-version prerequisite installs by only setting the last version as default.

**Covered in P07** - See ENHANCEMENT-P07 for full details.

**Integration Notes**:
- Already documented in beta.1-50 catalog
- Faster multi-version installs

**Risk**: LOW

---

### ENHANCEMENT-E080: Sort Node Versions Display
- **Beta**: Post-50 (commit 9847d28)
- **Files**: prerequisitesManager.ts
- **Category**: UX
- **Value**: LOW
- **Effort**: EASY
- **Integration Priority**: P5
- **Integration Complexity**: VERY LOW (sorting)

**Description**:
Sort Node versions in ascending order for consistent display.

**Covered in P10** - See ENHANCEMENT-P10 for full details.

**Integration Notes**:
- Already documented in beta.1-50 catalog
- Cosmetic improvement

**Risk**: VERY LOW

---

### ENHANCEMENT-E081: Demo Start/Stop Logging Cleanup
- **Beta**: 60, 67 (commits f316500, 09982ae)
- **Files**: startDemo.ts
- **Category**: UX
- **Value**: MEDIUM
- **Effort**: EASY
- **Integration Priority**: P3
- **Integration Complexity**: LOW (logging levels)

**Description**:
Move verbose demo start/stop messages to debug level, remove redundant notifications.

**Part of E073** - See ENHANCEMENT-E073 for full details.

**Changes**:
```typescript
// Before
logger.info('Starting demo...');
logger.info('Demo started at http://localhost:3000');

// After
logger.debug('Starting demo...');
logger.debug('Demo started at http://localhost:3000');
// Auto-dismissing notification shown to user instead
```

**Benefits**:
- Cleaner main log channel
- Debug information preserved
- Dashboard indicators provide visual feedback

**Risk**: LOW

---

### ENHANCEMENT-E082: Port Release Message Improvements
- **Beta**: 68-69 (commits e1508ce, 18a44ba)
- **Files**: stopDemo.ts
- **Category**: UX
- **Value**: LOW
- **Effort**: EASY
- **Integration Priority**: P4
- **Integration Complexity**: VERY LOW (message text)

**Description**:
Improve port release messaging through iterative refinement.

**Part of E073** - See ENHANCEMENT-E073 for full details.

**Timeline**:
- Beta.68: "Releasing port X..." (active voice)
- Beta.69: Removed entirely (fix notification flash)

**Final State**: No port release message (clean UX)

**Risk**: VERY LOW

---

### ENHANCEMENT-E083: TerminalManager Code Cleanup
- **Beta**: 66 (commit 2adf6fa)
- **Files**: terminalManager.ts (DELETED)
- **Category**: Code Quality
- **Value**: MEDIUM
- **Effort**: EASY
- **Integration Priority**: P3
- **Integration Complexity**: VERY LOW (file deletion)

**Description**:
Delete unused TerminalManager class (-132 lines of dead code). Actual terminal creation logic was in createProjectWebview.ts.

**Part of E072** - See ENHANCEMENT-E072 for full details.

**Before**: 132 lines of TerminalManager class nobody used

**After**: File deleted, logic consolidated in createProjectWebview.ts

**Benefits**:
- -132 lines of dead code removed
- Cleaner codebase
- No imports to dead file
- Simpler maintenance

**Integration Notes**:
- Verify refactor doesn't import terminalManager.ts
- Remove any stale references
- Ensure terminal logic in createProjectWebview.ts

**Risk**: VERY LOW (code was unused)

---

## Appendix

### All Enhancements by Beta (Chronological)

**Beta 1-10**: Foundation
- fnm packaging fixes
- SVG icon packaging
- Command restoration
- Repository URL fixes
- fnm path detection
- fnm exec isolation (beta.9) ⭐
- fnm path caching (beta.10)

**Beta 11-20**: Update System & Node Management
- Semver comparison (beta.11)
- Per-node-version plugin checks (beta.12)
- Adobe CLI Node version consistency (beta.13-14) ⭐
- Dynamic Node detection (beta.15) ⭐
- Homebrew git requirement (beta.16)
- Homebrew dependency gating (beta.17)
- Interactive Homebrew installation (beta.18) ⭐
- Mesh Node version fixes (beta.19)

**Beta 21-30**: Performance & Version Tracking
- Mesh status detection (beta.21)
- False update notification fix (beta.22)
- Binary path caching (beta.24) ⭐⭐
- Homebrew automation (beta.25-27) ⭐
- Component version tracking (beta.28-30) ⭐

**Beta 31-40**: UX & Logging
- Update notification improvements (beta.31)
- Binary path cache fix (beta.32)
- Node 24 support (beta.33)
- Explicit Node version system (beta.34) ⭐⭐
- SDK integration (beta.34) ⭐⭐⭐
- Timeout centralization (beta.35) ⭐
- Auth token management (beta.35) ⭐
- Dedicated Homebrew terminal (beta.38)
- Token corruption detection (beta.39-40)

**Beta 41-50**: Reliability & Polish
- Token corruption handling (beta.41-42) ⭐
- Log cleanup (beta.43-44) ⭐
- Symbol standardization (beta.43-48) ⭐
- SDK re-init (beta.49-50)

**Post-Beta.50**: Recent Improvements
- Exit code detection ⭐
- Progress label refinement ⭐
- Multi-version optimization
- Node version sorting

**Beta 51-72**: Stabilization & Polish (October 17, 2025)
- Node version priority system (beta.51-53) ⭐⭐⭐
- Adobe CLI infrastructure consolidation (beta.52) ⭐
- Developer permission verification (beta.54-58) ⭐⭐⭐
- fnm shell configuration (beta.59) ⭐⭐⭐
- Notification cleanup (beta.60, 67-69, 72) ⭐
- Terminal/workspace redesign (beta.61-66) ⭐⭐
- Type safety fixes (beta.70) ⭐⭐⭐
- Adobe CLI per-node checks (beta.70-71) ⭐⭐
- TerminalManager deletion (beta.66) ⭐
- StateManager logging (beta.64)

⭐ = High value
⭐⭐ = Very high value
⭐⭐⭐ = Critical value

---

### Enhancement Statistics

**By Category**:
- Performance optimizations: 12 (avg 10x improvement)
- New features: 18
- UX improvements: 27 (includes beta.51-72)
- Developer experience: 8
- Reliability improvements: 10 (includes beta.51-72)
- Code quality improvements: 8 (includes beta.51-72)

**By Value**:
- HIGH value: 17 enhancements (includes 5 from beta.51-72)
- MEDIUM value: 38 enhancements (includes 6 from beta.51-72)
- LOW value: 28 enhancements (includes 5 from beta.51-72)

**By Effort**:
- EASY: 58 enhancements (1-3 hours each)
- MODERATE: 20 enhancements (3-5 hours each)
- HARD: 5 enhancements (6-8 hours each)

**By Priority**:
- P1 (Critical/Quick Wins): 9 enhancements - 8-14 hours
- P2 (High Impact): 8 enhancements - 18-26 hours
- P3 (Strategic): 6 enhancements - 9-13 hours
- P4 (Nice-to-Have): 20+ enhancements - 16-22 hours
- P5 (Deferred): 5+ enhancements - 3-4 hours

---

### Value/Effort Matrix

```
         HIGH VALUE           MEDIUM VALUE          LOW VALUE
    ┌──────────────────┬──────────────────┬──────────────────┐
    │                  │                  │                  │
E   │  P01 (SDK) ⭐⭐⭐  │  P05 (Timeout)   │  P06 (fnm cache) │
A   │  P02 (Binary) ⭐⭐│  P08 (Progress)  │  P10 (Sort)      │
S   │  P04 (Dynamic) ⭐ │  F02 (Terminal)  │  F05 (Node 24)   │
Y   │  U03 (Logs) ⭐    │  F06 (Progress)  │  F07 (Semver)    │
    │                  │  U01 (Symbols)   │  U04-U06         │
    │     [P1]         │  R02 (Verify)    │     [P5]         │
    ├──────────────────┼──────────────────┼──────────────────┤
    │                  │                  │                  │
M   │  P03 (fnm exec)⭐│  F04 (Versions)  │                  │
O   │  F01 (Homebrew)⭐│  R05 (Auth)      │                  │
D   │  R03 (CLI Ver)⭐ │  R06 (Corrupt)   │                  │
E   │                  │                  │                  │
R   │     [P2]         │     [P2]         │                  │
A   ├──────────────────┼──────────────────┼──────────────────┤
T   │                  │                  │                  │
E   │  F03 (Node Sys)⭐│                  │                  │
    │                  │                  │                  │
H   │     [P3]         │                  │                  │
A   │                  │                  │                  │
R   │                  │                  │                  │
D   │                  │                  │                  │
    └──────────────────┴──────────────────┴──────────────────┘

[P1] = Priority 1 (Quick Wins) - Integrate first
[P2] = Priority 2 (High Impact) - Integrate second
[P3] = Priority 3 (Strategic) - Integrate third
⭐ = High value enhancement
```

---

### Key Takeaways

**Performance Gains**:
- **30x faster** auth operations (SDK integration)
- **5-6x faster** CLI commands (binary caching)
- **100% reliability** for Node version management (fnm exec isolation)
- **85% reduction** in log noise

**User Experience**:
- Dashboard loads in **5 seconds** instead of **30+ seconds**
- Auth checks are **instant** (<1s) instead of **10+ seconds**
- Homebrew installation is **one-click** instead of **5-10 minute manual process**
- Logs are **clean and professional** instead of **noisy and emoji-filled**

**Reliability**:
- **Zero version conflicts** (fnm exec isolation)
- **Zero ESM errors** (Adobe CLI version management)
- **Auto-recovery** from token corruption
- **Accurate update detection** (component version tracking)

**Developer Experience**:
- **Single source of truth** for timeouts
- **Centralized configuration** for Node versions
- **Comprehensive debug logging**
- **Better error messages**

**Integration Path**:
1. Start with P1 (5-9 hours) for immediate performance gains
2. Add P2 (16-22 hours) for reliability and features
3. Consider P3 (6-8 hours) for long-term architecture
4. Polish with P4 (13-18 hours) when time permits

**Total Value**: Transforms extension from slow and unreliable to fast and robust, with minimal integration effort (21-31 hours for core improvements).

---

## Update History

**Original Analysis** (2025-10-18):
- **Scope**: Commits da4c9f6..7aedc75 (Beta 1-50, 100 commits)
- **Agent**: Agent 12 (Enhancement & Performance Tracker)
- **Enhancements**: 67 enhancements cataloged

**Updated Analysis** (2025-10-18):
- **Scope**: Commits da4c9f6..da0e5a7 (Beta 1-72, 144 commits)
- **Agent**: Agent 16 (Enhancements Catalog Updater)
- **New Enhancements**: 16 additional enhancements from beta.51-72
- **Total Enhancements**: 83 enhancements

**Key Additions (Beta.51-72)**:
1. **E068**: Node Version Priority System (P1-CRITICAL)
2. **E069**: Adobe CLI Infrastructure Consolidation (P3)
3. **E070**: Developer Permission Verification System (P1-CRITICAL)
4. **E071**: fnm Shell Profile Configuration (P1-CRITICAL)
5. **E072**: Terminal Working Directory Safety (P2-HIGH)
6. **E073**: Notification UX Polish (P3)
7. **E074**: Type Safety - Date Object Handling (P1-CRITICAL)
8. **E075**: Adobe CLI Per-Node Version Checks (P2-HIGH)
9. **E076-E083**: Additional quality and UX improvements

**Critical Changes**:
- 4 P1-CRITICAL enhancements must be integrated
- 2 P2-HIGH enhancements strongly recommended
- Node version management completely redesigned
- Terminal/workspace management simplified
- Developer permissions now verified
- Type safety improvements prevent crashes
