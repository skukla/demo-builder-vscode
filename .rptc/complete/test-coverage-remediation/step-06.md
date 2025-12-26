# Step 6: Expand fnm/environmentSetup Tests

## Status

- [ ] Tests Written (RED)
- [ ] Implementation Verified (GREEN)
- [ ] Refactored (REFACTOR)
- [ ] Step Complete

## Overview

**Purpose:** Add missing tests to `tests/core/shell/environmentSetup-nodeVersion.test.ts` to cover fnm path discovery gaps, FNM_DIR environment variable support for Adobe CLI scanning, PATH caching edge cases, and the `which` fallback command.

**Current Coverage:** ~50-60%
**Target Coverage:** 80%+

**Prerequisites:**
- [ ] Steps 1-2 complete (blocking fixes)
- [ ] Tests in `environmentSetup-pathDiscovery.test.ts` passing

## Missing Coverage Analysis

Based on source code analysis of `src/core/shell/environmentSetup.ts`:

### 1. fnm Path Discovery Gaps (`findFnmPath()`)

**Common paths checked (lines 131-136):**
```typescript
const commonPaths = [
    '/opt/homebrew/bin/fnm',                    // Apple Silicon
    '/usr/local/bin/fnm',                       // Intel Mac
    path.join(homeDir, '.local/bin/fnm'),       // Manual install
    path.join(homeDir, '.fnm/fnm'),             // fnm self-install <- NOT TESTED
];
```

**Coverage status in pathDiscovery tests:**
- Apple Silicon: Covered
- Intel Mac: Covered
- Manual install: Covered
- **fnm self-install (~/.fnm/fnm): NOT COVERED**

### 2. `which` Fallback Command (lines 147-158)

```typescript
// Fallback: check PATH using 'which' command
try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const result = execSync(`${which} fnm`, { ... });
    const fnmPath = result.trim().split('\n')[0];
    if (fnmPath && fsSync.existsSync(fnmPath)) {
        this.cachedFnmPath = fnmPath;
        return fnmPath;
    }
}
```

**Coverage status:**
- Error case (command not found): Covered
- **Success case (fnm found in PATH): NOT COVERED**
- **Path validation after which command: NOT COVERED**

### 3. FNM_DIR for Adobe CLI Scanning (`findAdobeCLINodeVersion()`)

**Lines 281-283:**
```typescript
const fnmBase = process.env.FNM_DIR
    ? path.join(process.env.FNM_DIR, 'node-versions')
    : path.join(homeDir, '.local/share/fnm/node-versions');
```

**Coverage status:**
- FNM_DIR tested in `findNpmGlobalPaths()` (pathDiscovery tests)
- **FNM_DIR in `findAdobeCLINodeVersion()`: NOT COVERED**

### 4. Caching Edge Cases

**Coverage gaps:**
- **Cache persistence across multiple calls with different failure scenarios**
- **Cache invalidation behavior (none expected, but should verify)**

---

## Tests to Write First

### Test Group 1: fnm Self-Install Path Discovery

- [ ] **Test: should find fnm in self-install location (~/.fnm/fnm)**
  - **Given:** fnm is installed at `~/.fnm/fnm` (fnm's default self-install location)
  - **When:** `findFnmPath()` is called
  - **Then:** Returns the self-install path
  - **File:** `tests/core/shell/environmentSetup-pathDiscovery.test.ts`
  - **Rationale:** This is the 4th path in commonPaths array and is untested

### Test Group 2: `which` Fallback Command Success

- [ ] **Test: should find fnm via which command when not in common locations**
  - **Given:** fnm is NOT in any common locations
  - **And:** fnm IS available via `which fnm` returning `/custom/path/fnm`
  - **And:** The returned path exists on disk
  - **When:** `findFnmPath()` is called
  - **Then:** Returns `/custom/path/fnm`
  - **File:** `tests/core/shell/environmentSetup-pathDiscovery.test.ts`
  - **Rationale:** Tests the fallback mechanism for non-standard installations

- [ ] **Test: should reject which result if path doesn't exist (security)**
  - **Given:** fnm is NOT in common locations
  - **And:** `which fnm` returns `/fake/path/fnm`
  - **And:** The returned path does NOT exist on disk
  - **When:** `findFnmPath()` is called
  - **Then:** Returns null (security: PATH manipulation protection)
  - **File:** `tests/core/shell/environmentSetup-pathDiscovery.test.ts`
  - **Rationale:** Verifies security check on line 155

- [ ] **Test: should handle which command returning multiple paths (first line used)**
  - **Given:** fnm is NOT in common locations
  - **And:** `which fnm` returns multiple paths (one per line)
  - **And:** The first path exists
  - **When:** `findFnmPath()` is called
  - **Then:** Returns only the first path
  - **File:** `tests/core/shell/environmentSetup-pathDiscovery.test.ts`
  - **Rationale:** Tests line 153: `.split('\n')[0]`

### Test Group 3: FNM_DIR for Adobe CLI Scanning

- [ ] **Test: should respect FNM_DIR when scanning for Adobe CLI installation**
  - **Given:** `FNM_DIR` environment variable is set to `/custom/fnm`
  - **And:** Adobe CLI is installed at `/custom/fnm/node-versions/v18.0.0/installation/bin/aio`
  - **And:** No infrastructure-defined version exists
  - **When:** `findAdobeCLINodeVersion()` is called
  - **Then:** Returns '18' (found in custom FNM_DIR)
  - **File:** `tests/core/shell/environmentSetup-nodeVersion.test.ts`
  - **Rationale:** Bug Fix #7 - FNM_DIR support must work for Adobe CLI scanning

- [ ] **Test: should use default fnm path when FNM_DIR is not set for Adobe CLI scanning**
  - **Given:** `FNM_DIR` environment variable is NOT set
  - **And:** Adobe CLI is installed at `~/.local/share/fnm/node-versions/v20.0.0/installation/bin/aio`
  - **And:** No infrastructure-defined version exists
  - **When:** `findAdobeCLINodeVersion()` is called
  - **Then:** Returns '20' (found in default fnm location)
  - **File:** `tests/core/shell/environmentSetup-nodeVersion.test.ts`
  - **Rationale:** Ensures default path works when env var not set

### Test Group 4: Cache Behavior Edge Cases

- [ ] **Test: should cache null result and not retry path discovery**
  - **Given:** fnm is not installed anywhere
  - **And:** `findFnmPath()` has been called once (returning null)
  - **When:** `findFnmPath()` is called again
  - **Then:** Returns null without checking file system again
  - **File:** `tests/core/shell/environmentSetup-pathDiscovery.test.ts`
  - **Rationale:** Verifies cache behavior for null results (lines 163-165)

- [ ] **Test: should cache Adobe CLI version null result**
  - **Given:** No Adobe CLI is installed anywhere
  - **And:** `findAdobeCLINodeVersion()` has been called once (returning null)
  - **When:** `findAdobeCLINodeVersion()` is called again
  - **Then:** Returns null without rescanning directories
  - **File:** `tests/core/shell/environmentSetup-nodeVersion.test.ts`
  - **Rationale:** Verifies cache behavior for null Adobe CLI version results

---

## Files to Create/Modify

### Modify: `tests/core/shell/environmentSetup-pathDiscovery.test.ts`

Add new test cases to existing `findFnmPath` describe block:

**New Tests:**
- [ ] fnm self-install path test
- [ ] `which` fallback success test
- [ ] `which` path validation security test
- [ ] `which` multiple paths test
- [ ] Cache null result test

### Modify: `tests/core/shell/environmentSetup-nodeVersion.test.ts`

Add new test cases to existing `findAdobeCLINodeVersion` describe block:

**New Tests:**
- [ ] FNM_DIR environment variable support test
- [ ] Default fnm path fallback test
- [ ] Cache null Adobe CLI version test

---

## Implementation Details

### RED Phase (Write Failing Tests)

**1. Add fnm self-install path test (pathDiscovery):**

```typescript
it('should find fnm in self-install location', () => {
    const selfInstallPath = path.join(mockHomeDir, '.fnm/fnm');
    mockFnmInstallation(selfInstallPath);

    const result = environmentSetup.findFnmPath();

    expect(result).toBe(selfInstallPath);
});
```

**2. Add `which` fallback tests (pathDiscovery):**

```typescript
it('should find fnm via which command when not in common locations', () => {
    const { execSync } = require('child_process');
    const customPath = '/custom/path/fnm';

    // No common paths exist
    (fsSync.existsSync as jest.Mock).mockImplementation((checkPath: string) => {
        // Only the custom path exists
        return checkPath === customPath;
    });

    // which command returns custom path
    (execSync as jest.Mock).mockReturnValue(customPath + '\n');

    const result = environmentSetup.findFnmPath();

    expect(result).toBe(customPath);
});

it('should reject which result if path does not exist (security)', () => {
    const { execSync } = require('child_process');

    // No paths exist (including the which result)
    (fsSync.existsSync as jest.Mock).mockReturnValue(false);

    // which command returns a path
    (execSync as jest.Mock).mockReturnValue('/fake/path/fnm\n');

    const result = environmentSetup.findFnmPath();

    expect(result).toBeNull();
});

it('should use first line from which command with multiple results', () => {
    const { execSync } = require('child_process');
    const firstPath = '/first/fnm';
    const secondPath = '/second/fnm';

    // Only first path exists
    (fsSync.existsSync as jest.Mock).mockImplementation((checkPath: string) => {
        return checkPath === firstPath;
    });

    // which returns multiple paths
    (execSync as jest.Mock).mockReturnValue(`${firstPath}\n${secondPath}\n`);

    const result = environmentSetup.findFnmPath();

    expect(result).toBe(firstPath);
});
```

**3. Add FNM_DIR Adobe CLI tests (nodeVersion):**

```typescript
it('should respect FNM_DIR when scanning for Adobe CLI installation', async () => {
    const customFnmDir = '/custom/fnm';
    process.env.FNM_DIR = customFnmDir;

    // No infrastructure version
    (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);

    const fnmBase = path.join(customFnmDir, 'node-versions');
    const aioPath = path.join(fnmBase, 'v18.0.0/installation/bin/aio');

    (fsSync.existsSync as jest.Mock).mockImplementation((checkPath: string) => {
        return checkPath === fnmBase || checkPath === aioPath;
    });

    (fsSync.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === fnmBase) {
            return ['v18.0.0'];
        }
        return [];
    });

    const result = await environmentSetup.findAdobeCLINodeVersion();

    expect(result).toBe('18');

    delete process.env.FNM_DIR;
});
```

**4. Add cache null result tests:**

```typescript
// pathDiscovery.test.ts
it('should cache null result and not retry path discovery', () => {
    const { execSync } = require('child_process');

    // Nothing exists
    (fsSync.existsSync as jest.Mock).mockReturnValue(false);
    (execSync as jest.Mock).mockImplementation(() => {
        throw new Error('Command not found');
    });

    // First call
    const result1 = environmentSetup.findFnmPath();
    expect(result1).toBeNull();

    // Clear mock call counts
    (fsSync.existsSync as jest.Mock).mockClear();
    (execSync as jest.Mock).mockClear();

    // Second call - should use cache
    const result2 = environmentSetup.findFnmPath();
    expect(result2).toBeNull();

    // Should not have checked file system again
    expect(fsSync.existsSync).not.toHaveBeenCalled();
    expect(execSync).not.toHaveBeenCalled();
});
```

### GREEN Phase (Verify Implementation)

These tests should pass against the existing implementation in `src/core/shell/environmentSetup.ts`. No source code changes expected.

**Verification steps:**
1. Run tests: `npm run test:file -- tests/core/shell/environmentSetup-pathDiscovery.test.ts`
2. Run tests: `npm run test:file -- tests/core/shell/environmentSetup-nodeVersion.test.ts`
3. Verify all new tests pass

### REFACTOR Phase

After tests pass:
1. Review test organization - group related tests
2. Extract common mock setup to test utilities if repeated
3. Add `@group fnm` comments for test categorization
4. Ensure no console.log statements in tests

---

## Expected Outcome

After completing this step:
- [ ] fnm self-install path (`~/.fnm/fnm`) is tested
- [ ] `which` fallback command success path is tested
- [ ] `which` result validation (security check) is tested
- [ ] `which` multi-line output handling is tested
- [ ] FNM_DIR environment variable works for Adobe CLI scanning
- [ ] Cache behavior for null results is verified
- [ ] Total test count increases by 8-9 tests
- [ ] Coverage for `findFnmPath()` reaches 90%+
- [ ] Coverage for `findAdobeCLINodeVersion()` reaches 85%+

## Acceptance Criteria

- [ ] All new tests pass
- [ ] No existing tests broken
- [ ] Tests use Given-When-Then pattern in comments
- [ ] Tests use checkbox format for TDD tracking
- [ ] Mock setup is clean and minimal
- [ ] Environment variable cleanup in afterEach/finally blocks
- [ ] Coverage goal met: 80%+ for environmentSetup module

## Estimated Time

**2-3 hours**
- Writing tests: 1.5 hours
- Verification and debugging: 0.5 hours
- Refactoring and cleanup: 0.5 hours

---

## Test Utilities Reference

Use existing utilities from `tests/core/shell/environmentSetup.testUtils.ts`:

```typescript
import {
    createEnvironmentSetup,
    mockFnmInstallation,
    resetAllMocks,
    mockLogger
} from './environmentSetup.testUtils';
```

**Available helpers:**
- `createEnvironmentSetup(mockHomeDir)` - Creates fresh instance with reset caches
- `mockFnmInstallation(path)` - Mocks fnm at specific path
- `resetAllMocks()` - Clears all mock state
- `mockLogger` - Mock logger instance

---

## Dependencies on Other Steps

| Step | Dependency Type | Details |
|------|-----------------|---------|
| Step 1 | Blocking | Import path fixes must be complete |
| Step 2 | Blocking | Type definitions must be correct |
| Step 7 | None | FNM_DIR tests here enable Step 7 |

---

## Notes

1. **Environment Variable Cleanup**: Always use `delete process.env.FNM_DIR` in cleanup to avoid test pollution
2. **Mock Reset**: Call `resetAllMocks()` in `beforeEach` to ensure clean state
3. **Cache Reset**: Create fresh `EnvironmentSetup` instance per test via `createEnvironmentSetup()`
4. **Platform Handling**: The `which` vs `where` command differs by platform (line 148); tests mock `execSync` so platform doesn't matter

---

_Step generated by Step Generator Sub-Agent_
_Step 6 of 8 in Test Coverage Remediation plan_

---

**Step Status:** ✅ COMPLETE (2025-12-24)

**Completion Summary:**
- Added 6 new tests to `environmentSetup-pathDiscovery.test.ts` (11 to 17 total)
- Added 3 new tests to `environmentSetup-nodeVersion.test.ts` (9 to 12 total)
- All 29 environmentSetup tests passing (17 + 12)
- Coverage areas added:
  - fnm self-install path (~/.fnm/fnm)
  - `which` fallback command success path
  - `which` path validation security check
  - `which` multi-line output handling
  - FNM_DIR environment variable for Adobe CLI scanning
  - Default fnm path fallback
  - Cache null result behavior (fnm path and Adobe CLI version)

**New Tests:**
1. `should find fnm in self-install location (~/.fnm/fnm)`
2. `should find fnm via which command when not in common locations`
3. `should reject which result if path does not exist (security)`
4. `should use first line from which command with multiple results`
5. `should cache null result and not retry path discovery`
6. `should respect FNM_DIR when scanning for Adobe CLI installation`
7. `should use default fnm path when FNM_DIR is not set for Adobe CLI scanning`
8. `should cache null Adobe CLI version result`

**Files Modified:**
- `tests/core/shell/environmentSetup-pathDiscovery.test.ts` (+6 tests)
- `tests/core/shell/environmentSetup-nodeVersion.test.ts` (+3 tests)

**Next Step:** Step 7 - FNM_DIR + installHandler Tests
