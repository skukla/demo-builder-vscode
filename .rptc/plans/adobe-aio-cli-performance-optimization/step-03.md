# Step 3: Parallel Per-Node-Version Checking

## Purpose

Transform `checkPerNodeVersionStatus` in `shared.ts` to use `Promise.all` for concurrent Node version checks while maintaining existing `fnm exec` isolation. Keep main prerequisite checking sequential (correct approach per research). Expected impact: 50-66% faster multi-version checks (3 sequential checks at 1-2s each = 3-6s total → 1 concurrent batch at 1-2s).

**Why Step 3**: Builds on Step 1 (reliable fast npm operations) and Step 2 (transparent caching) to parallelize the last sequential bottleneck - per-Node-version checking within a single prerequisite.

## Prerequisites

- [x] Step 1 completed (npm flags and timeout tuning provide fast base operations)
- [x] Step 2 completed (caching reduces redundant checks during parallel execution)
- [ ] `src/features/prerequisites/handlers/shared.ts` structure reviewed (lines 101-179)
- [ ] Existing `NodeVersionManager.execWithVersion` pattern understood (fnm exec isolation)
- [ ] Research findings confirmed (Promise.all safe for isolated fnm exec calls)

## Tests to Write First

### Happy Path Tests

- [ ] **Test: Parallel Node version checks faster than sequential**
  - **Given:** Adobe AIO CLI prerequisite with `perNodeVersion: true` and 3 required Node versions (18, 20, 24)
  - **When:** `checkPerNodeVersionStatus` executes checks for all 3 versions
  - **Then:** Total execution time is ≤2s (vs 3-6s sequential baseline)
  - **Then:** All 3 version results returned correctly (installed status, version strings)
  - **File:** `tests/unit/prerequisites/parallelExecution.test.ts`

- [ ] **Test: Parallel checks maintain isolation per Node version**
  - **Given:** Node 18, 20, 24 installed with AIO CLI versions 10.0.0, 11.0.0, 11.0.0 respectively
  - **When:** `checkPerNodeVersionStatus` runs parallel checks
  - **Then:** Each result reflects correct Node-specific version (no cross-contamination)
  - **File:** `tests/unit/prerequisites/parallelExecution.test.ts`

- [ ] **Test: Cache integration with parallel checks**
  - **Given:** Cached result exists for Node 18 AIO CLI check (from previous run)
  - **When:** Parallel checks run for Node 18, 20, 24
  - **Then:** Node 18 check uses cache (skips fnm exec), Node 20/24 execute in parallel
  - **Then:** Total time reduced by ~33% (1 cached + 2 parallel vs 3 parallel)
  - **File:** `tests/integration/prerequisites/parallelWithCache.test.ts`

### Edge Case Tests

- [ ] **Test: Mixed success/failure in parallel checks**
  - **Given:** Node 18 has AIO CLI installed, Node 20/24 do not
  - **When:** Parallel checks execute
  - **Then:** All checks complete without blocking on failures
  - **Then:** Results correctly show Node 18 installed: true, Node 20/24 installed: false
  - **File:** `tests/unit/prerequisites/parallelExecution.test.ts`

- [ ] **Test: Parallel checks with varying execution times**
  - **Given:** Mock Node 18 check takes 500ms, Node 20 takes 1500ms, Node 24 takes 800ms
  - **When:** Parallel checks execute
  - **Then:** Total time ≈ 1500ms (max, not sum of 2800ms)
  - **Then:** Results maintain correct order in returned array
  - **File:** `tests/unit/prerequisites/parallelExecution.test.ts`

- [ ] **Test: Single Node version degrades gracefully (no parallel overhead)**
  - **Given:** Only Node 18 required by components
  - **When:** `checkPerNodeVersionStatus` called with single-element array
  - **Then:** Single check executes (no parallel overhead)
  - **Then:** Performance equivalent to baseline
  - **File:** `tests/unit/prerequisites/parallelExecution.test.ts`

### Error Condition Tests

- [ ] **Test: One check timeout doesn't block other parallel checks**
  - **Given:** Node 18 check times out after 10s, Node 20/24 succeed in 1s
  - **When:** Parallel checks execute with independent timeout handling
  - **Then:** Node 20/24 results returned after 1s (not blocked by Node 18 timeout)
  - **Then:** Node 18 result shows installed: false with timeout error
  - **File:** `tests/unit/prerequisites/parallelExecution.test.ts`

- [ ] **Test: fnm exec failures isolated to specific Node version**
  - **Given:** Node 20 not installed (fnm exec fails), Node 18/24 installed
  - **When:** Parallel checks execute
  - **Then:** Node 18/24 succeed, Node 20 fails independently
  - **Then:** Error logged for Node 20 only (no cascade failure)
  - **File:** `tests/unit/prerequisites/parallelExecution.test.ts`

## Files to Create/Modify

- [ ] `src/features/prerequisites/handlers/shared.ts` - Modify `checkPerNodeVersionStatus` function (lines 101-179) to use `Promise.all`
- [ ] `tests/unit/prerequisites/parallelExecution.test.ts` - Unit tests for parallel execution logic
- [ ] `tests/integration/prerequisites/parallelWithCache.test.ts` - Integration test for parallel + cache interaction

## Implementation Details

### RED Phase (Write Failing Tests)

**Unit Tests** (`tests/unit/prerequisites/parallelExecution.test.ts`):

```typescript
import { checkPerNodeVersionStatus } from '@/features/prerequisites/handlers/shared';
import { ServiceLocator } from '@/core/di';

describe('Parallel Per-Node-Version Checking', () => {
  let mockContext: any;
  let mockNodeManager: any;

  beforeEach(() => {
    mockContext = {
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    };

    mockNodeManager = {
      list: jest.fn().mockResolvedValue(['v18.18.0', 'v20.10.0', 'v24.0.0']),
      execWithVersion: jest.fn(),
    };

    jest.spyOn(ServiceLocator, 'getNodeVersionManager').mockReturnValue(mockNodeManager);
  });

  it('should execute parallel checks faster than sequential baseline', async () => {
    // Arrange
    const prereq = {
      id: 'aio-cli',
      name: 'Adobe I/O CLI',
      perNodeVersion: true,
      check: {
        command: 'aio --version',
        parseVersion: '@adobe/aio-cli/(\\S+)',
      },
    };

    // Simulate 1 second per check (3s total sequential, ~1s parallel)
    mockNodeManager.execWithVersion.mockImplementation(() =>
      new Promise((resolve) =>
        setTimeout(() => resolve({ stdout: '@adobe/aio-cli/11.0.0', stderr: '', code: 0 }), 1000)
      )
    );

    // Act
    const startTime = Date.now();
    const result = await checkPerNodeVersionStatus(prereq, ['18', '20', '24'], mockContext);
    const duration = Date.now() - startTime;

    // Assert
    expect(duration).toBeLessThan(2000); // Should be ~1s (parallel) not ~3s (sequential)
    expect(result.perNodeVersionStatus).toHaveLength(3);
    expect(mockNodeManager.execWithVersion).toHaveBeenCalledTimes(3);
  });

  it('should maintain Node version isolation (no cross-contamination)', async () => {
    // Arrange
    const prereq = {
      id: 'aio-cli',
      name: 'Adobe I/O CLI',
      perNodeVersion: true,
      check: {
        command: 'aio --version',
        parseVersion: '@adobe/aio-cli/(\\S+)',
      },
    };

    // Different versions per Node major
    mockNodeManager.execWithVersion
      .mockResolvedValueOnce({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', code: 0 }) // Node 18
      .mockResolvedValueOnce({ stdout: '@adobe/aio-cli/11.0.0', stderr: '', code: 0 }) // Node 20
      .mockResolvedValueOnce({ stdout: '@adobe/aio-cli/11.0.0', stderr: '', code: 0 }); // Node 24

    // Act
    const result = await checkPerNodeVersionStatus(prereq, ['18', '20', '24'], mockContext);

    // Assert
    expect(result.perNodeVersionStatus[0].component).toBe('10.0.0'); // Node 18
    expect(result.perNodeVersionStatus[1].component).toBe('11.0.0'); // Node 20
    expect(result.perNodeVersionStatus[2].component).toBe('11.0.0'); // Node 24
  });

  it('should handle mixed success/failure without blocking', async () => {
    // Arrange
    const prereq = {
      id: 'aio-cli',
      name: 'Adobe I/O CLI',
      perNodeVersion: true,
      check: { command: 'aio --version' },
    };

    mockNodeManager.execWithVersion
      .mockResolvedValueOnce({ stdout: '@adobe/aio-cli/11.0.0', stderr: '', code: 0 }) // Node 18 success
      .mockRejectedValueOnce(new Error('Command not found')) // Node 20 failure
      .mockResolvedValueOnce({ stdout: '@adobe/aio-cli/11.0.0', stderr: '', code: 0 }); // Node 24 success

    // Act
    const result = await checkPerNodeVersionStatus(prereq, ['18', '20', '24'], mockContext);

    // Assert
    expect(result.perNodeVersionStatus[0].installed).toBe(true); // Node 18
    expect(result.perNodeVersionStatus[1].installed).toBe(false); // Node 20
    expect(result.perNodeVersionStatus[2].installed).toBe(true); // Node 24
    expect(result.missingVariantMajors).toEqual(['20']);
  });
});
```

**Integration Tests** (`tests/integration/prerequisites/parallelWithCache.test.ts`):

```typescript
import { checkPerNodeVersionStatus } from '@/features/prerequisites/handlers/shared';
import { PrerequisitesCacheManager } from '@/features/prerequisites/services/prerequisitesCacheManager';

describe('Parallel Execution with Cache Integration', () => {
  it('should use cache for some versions while parallelizing others', async () => {
    // Arrange
    const cacheManager = new PrerequisitesCacheManager();
    const prereq = {
      id: 'aio-cli',
      name: 'Adobe I/O CLI',
      perNodeVersion: true,
      check: { command: 'aio --version' },
    };

    // Pre-cache Node 18 result
    cacheManager.setCachedResult('aio-cli:18', {
      version: '11.0.0',
      installed: true,
    });

    // Act - Node 18 uses cache, Node 20/24 execute in parallel
    const startTime = Date.now();
    const result = await checkPerNodeVersionStatus(prereq, ['18', '20', '24'], mockContext);
    const duration = Date.now() - startTime;

    // Assert
    expect(duration).toBeLessThan(1500); // Cache hit + 2 parallel checks
    expect(result.perNodeVersionStatus[0].installed).toBe(true); // Node 18 from cache
  });
});
```

### GREEN Phase (Minimal Implementation)

**Modify `src/features/prerequisites/handlers/shared.ts` (lines 101-179)**:

```typescript
/**
 * Check per-node-version prerequisite status
 *
 * For prerequisites that must be installed per Node version (like Adobe I/O CLI),
 * checks which Node versions have it installed using parallel execution.
 */
export async function checkPerNodeVersionStatus(
    prereq: import('@/features/prerequisites/services/PrerequisitesManager').PrerequisiteDefinition,
    nodeVersions: string[],
    context: HandlerContext,
): Promise<{
    perNodeVersionStatus: { version: string; component: string; installed: boolean }[];
    perNodeVariantMissing: boolean;
    missingVariantMajors: string[];
}> {
    if (!prereq.perNodeVersion || nodeVersions.length === 0) {
        return {
            perNodeVersionStatus: [],
            perNodeVariantMissing: false,
            missingVariantMajors: [],
        };
    }

    const nodeManager = ServiceLocator.getNodeVersionManager();

    // CRITICAL: Get list of actually installed Node versions FIRST
    // This prevents false positives when fnm falls back to other versions
    const installedVersions = await nodeManager.list();
    const installedMajors = new Set<string>();
    for (const version of installedVersions) {
        const match = /v?(\d+)/.exec(version);
        if (match) {
            installedMajors.add(match[1]);
        }
    }

    // OPTIMIZATION: Use Promise.all for parallel Node version checks
    // Research confirmed: fnm exec provides complete isolation, safe to parallelize
    const checkPromises = nodeVersions.map(async (major) => {
        // Check if this Node version is actually installed
        if (!installedMajors.has(major)) {
            context.logger.debug(`[Prerequisites] Node ${major} not installed, skipping ${prereq.name} check for this version`);
            return {
                version: `Node ${major}`,
                component: '',
                installed: false,
                major, // For missingVariantMajors tracking
            };
        }

        try {
            // Node version is installed - now check if the tool is installed for it
            // Use NodeVersionManager for bulletproof Node version isolation
            // Executes command with specific Node version using fnm exec
            const result = await nodeManager.execWithVersion(
                major,
                prereq.check.command,
                {
                    timeout: TIMEOUTS.PREREQUISITE_CHECK,
                    enhancePath: true, // For aio-cli and other npm-installed tools
                },
            );
            const stdout = result.stdout;

            // Parse CLI version if regex provided
            let cliVersion = '';
            if (prereq.check.parseVersion) {
                try {
                    const match = new RegExp(prereq.check.parseVersion).exec(stdout);
                    if (match) cliVersion = match[1] || '';
                } catch {
                    // Ignore regex parse errors
                }
            }

            return {
                version: `Node ${major}`,
                component: cliVersion,
                installed: true,
                major,
            };
        } catch (error) {
            context.logger.debug(`[Prerequisites] Check failed for ${prereq.name} on Node ${major}:`, error);
            return {
                version: `Node ${major}`,
                component: '',
                installed: false,
                major,
            };
        }
    });

    // Wait for all parallel checks to complete
    const results = await Promise.all(checkPromises);

    // Build final result structures
    const perNodeVersionStatus: { version: string; component: string; installed: boolean }[] = [];
    const missingVariantMajors: string[] = [];

    for (const result of results) {
        perNodeVersionStatus.push({
            version: result.version,
            component: result.component,
            installed: result.installed,
        });

        if (!result.installed) {
            missingVariantMajors.push(result.major);
        }
    }

    return {
        perNodeVersionStatus,
        perNodeVariantMissing: missingVariantMajors.length > 0,
        missingVariantMajors,
    };
}
```

### REFACTOR Phase (Improve While Tests Pass)

**Optional Optimizations**:

1. **Extract parallel check logic** to separate helper function for testability:

```typescript
async function checkSingleNodeVersion(
    prereq: PrerequisiteDefinition,
    major: string,
    nodeManager: NodeVersionManager,
    context: HandlerContext,
): Promise<{ version: string; component: string; installed: boolean; major: string }> {
    try {
        const result = await nodeManager.execWithVersion(
            major,
            prereq.check.command,
            {
                timeout: TIMEOUTS.PREREQUISITE_CHECK,
                enhancePath: true,
            },
        );

        let cliVersion = '';
        if (prereq.check.parseVersion) {
            try {
                const match = new RegExp(prereq.check.parseVersion).exec(result.stdout);
                if (match) cliVersion = match[1] || '';
            } catch {
                // Ignore regex parse errors
            }
        }

        return {
            version: `Node ${major}`,
            component: cliVersion,
            installed: true,
            major,
        };
    } catch (error) {
        context.logger.debug(`[Prerequisites] Check failed for ${prereq.name} on Node ${major}:`, error);
        return {
            version: `Node ${major}`,
            component: '',
            installed: false,
            major,
        };
    }
}
```

2. **Add performance logging** to track parallel execution time:

```typescript
const startTime = Date.now();
const results = await Promise.all(checkPromises);
const duration = Date.now() - startTime;
context.logger.debug(
    `[Prerequisites] Parallel checks for ${prereq.name} completed in ${duration}ms ` +
    `(${nodeVersions.length} versions)`
);
```

3. **Follow KISS principle**: Keep parallel logic simple - no complex batching or rate limiting needed (fnm exec isolation sufficient).

## Expected Outcome

After completing this step:

**Functionality Working**:
- Per-Node-version checks execute concurrently using `Promise.all`
- 3 Node versions (18, 20, 24) checked in ~1-2s (vs 3-6s sequential baseline)
- Existing `fnm exec` isolation maintained (no cross-contamination)
- Mixed success/failure handled gracefully (no blocking)
- Cache integration working (cached versions skip execution)

**Tests Passing**:
- Unit tests: Parallel execution faster than sequential (1 test)
- Unit tests: Node version isolation maintained (1 test)
- Unit tests: Mixed success/failure handling (1 test)
- Unit tests: Varying execution times (1 test)
- Unit tests: Single version graceful degradation (1 test)
- Unit tests: Timeout isolation (1 test)
- Unit tests: fnm exec failure isolation (1 test)
- Integration tests: Parallel + cache interaction (1 test)

**Observable Impact**:
- **50-66% reduction** in multi-version prerequisite checks:
  - 3 Node versions sequential: 3-6 seconds
  - 3 Node versions parallel: 1-2 seconds
- Main prerequisite checking remains sequential (correct by design)
- Cache hits further reduce parallel execution time (1 cached + 2 parallel)

## Acceptance Criteria

- [ ] All unit tests passing (parallel execution logic)
- [ ] All integration tests passing (parallel + cache interaction)
- [ ] `checkPerNodeVersionStatus` uses `Promise.all` for parallel execution
- [ ] Node version isolation maintained (fnm exec pattern preserved)
- [ ] Mixed success/failure handled without blocking
- [ ] Timeout in one check doesn't block others
- [ ] Cache integration working correctly (cached checks skip execution)
- [ ] Manual testing confirms 50-66% faster multi-version checks
- [ ] Code follows project style guide (ESLint, Prettier)
- [ ] No debug code (console.log, debugger statements)
- [ ] Coverage ≥ 85% for modified code

## Dependencies from Other Steps

**From Step 1**: Relies on reduced timeout (10s) and npm performance flags for fast base operations
**From Step 2**: Benefits from caching (cached checks skip parallel execution, further speed improvement)
**For Step 4**: Provides parallel operations that need enhanced progress visibility

## Estimated Time

**2-3 hours**

**Breakdown**:
- Write unit tests: 1 hour
- Write integration tests: 30 minutes
- Implement Promise.all refactor: 45 minutes
- Manual testing and verification: 30 minutes
- Performance benchmarking: 15 minutes
- Refactoring (optional): 30 minutes

---

**Next Step**: Step 4 - Enhanced progress visibility for concurrent operations
