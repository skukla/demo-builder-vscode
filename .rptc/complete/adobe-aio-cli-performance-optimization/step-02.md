# Step 2: Implement Prerequisite Result Caching

## Purpose

Implement transparent prerequisite result caching following the existing `AuthCacheManager` pattern to eliminate redundant Adobe AIO CLI checks. Achieve 95% reduction in repeated checks (500ms-3s → <10ms cached) through in-memory Map with TTL-based expiry. Cache is automatically invalidated on installation or "Recheck" button, requiring no UI changes.

## Prerequisites

- [x] Step 1 completed (npm flags and timeout tuning in place)
- [x] Existing `AuthCacheManager` pattern reviewed (in-memory Map + TTL + timestamp-based expiry)
- [x] `timeoutConfig.ts` structure confirmed (CACHE_TTL export pattern)

## Tests to Write First

### Happy Path Tests

- [x] **Test: Cache stores prerequisite check result with TTL**
  - **Given:** Fresh `PrerequisitesCacheManager` instance
  - **When:** `setCachedResult('aio-cli', { version: '11.0.0', installed: true })` called with 5-minute TTL
  - **Then:** `getCachedResult('aio-cli')` returns stored result with correct expiry timestamp
  - **File:** `tests/unit/prerequisites/cacheManager.test.ts`

- [x] **Test: Cache hit returns result instantly (<10ms)**
  - **Given:** Cached result for 'aio-cli' stored 1 minute ago (within TTL)
  - **When:** `getCachedResult('aio-cli')` called
  - **Then:** Result returned in <10ms, no CLI execution triggered
  - **File:** `tests/unit/prerequisites/cacheManager.test.ts`

- [x] **Test: Cache miss triggers full check and caches result**
  - **Given:** No cached result for 'php'
  - **When:** `PrerequisitesManager.checkPrerequisite('php')` called
  - **Then:** Full CLI check executed, result cached for future calls
  - **File:** `tests/integration/prerequisites/endToEnd.test.ts`

### Edge Case Tests

- [x] **Test: Cache expiry triggers re-check after TTL**
  - **Given:** Cached result for 'node' stored 6 minutes ago (5-minute TTL expired)
  - **When:** `getCachedResult('node')` called
  - **Then:** Returns `undefined`, forces fresh check
  - **File:** `tests/unit/prerequisites/cacheManager.test.ts`

- [x] **Test: perNodeVersion prerequisites cached separately per version**
  - **Given:** AIO CLI checked in Node 18 and Node 20 environments
  - **When:** Cache stores results with cache keys `aio-cli:18` and `aio-cli:20`
  - **Then:** Each version's result retrieved independently, no collision
  - **File:** `tests/unit/prerequisites/cacheManager.test.ts`

- [x] **Test: Cache invalidation on "Recheck" button click**
  - **Given:** Multiple prerequisites cached with valid TTL
  - **When:** `clearAll()` called (triggered by Recheck button handler)
  - **Then:** All cached results cleared, next checks perform full CLI execution
  - **File:** `tests/integration/prerequisites/endToEnd.test.ts`

- [x] **Test: Cache invalidation on prerequisite installation**
  - **Given:** 'aio-cli' marked as not installed, cached result
  - **When:** `installPrerequisite('aio-cli')` completes successfully
  - **Then:** Cache for 'aio-cli' invalidated, next check performs fresh detection
  - **File:** `tests/integration/prerequisites/endToEnd.test.ts`

### Error Condition Tests

- [x] **Test: Cache cleared on extension reload (no persistence)**
  - **Given:** Cached results from previous session
  - **When:** Extension deactivated and reactivated
  - **Then:** Cache starts empty (no Memento persistence), all checks fresh
  - **File:** `tests/integration/prerequisites/endToEnd.test.ts`

- [x] **Test: Cache operations don't throw on empty state**
  - **Given:** Empty cache (no results stored)
  - **When:** `getCachedResult('invalid-id')` called
  - **Then:** Returns `undefined` gracefully, no errors thrown
  - **File:** `tests/unit/prerequisites/cacheManager.test.ts`

## Files to Create/Modify

- [x] `src/features/prerequisites/services/prerequisitesCacheManager.ts` - New cache manager following AuthCacheManager pattern
- [x] `src/features/prerequisites/services/types.ts` - Add `CacheEntry<T>` and `PrerequisiteCacheEntry` types
- [x] `src/features/prerequisites/services/prerequisitesManager.ts` - Integrate cache into `checkPrerequisite()` method
- [x] `src/features/prerequisites/handlers/checkHandler.ts` - Add cache invalidation on "Recheck" button
- [x] `src/features/prerequisites/handlers/installHandler.ts` - Add cache invalidation after successful installation
- [x] `src/utils/timeoutConfig.ts` - Add `CACHE_TTL.PREREQUISITE_CHECK` configuration (5 minutes default)

## Implementation Details

### RED Phase (Write Failing Tests)

```typescript
// tests/unit/prerequisites/cacheManager.test.ts
import { PrerequisitesCacheManager } from '@/features/prerequisites/services/prerequisitesCacheManager';

describe('PrerequisitesCacheManager', () => {
  let cacheManager: PrerequisitesCacheManager;

  beforeEach(() => {
    cacheManager = new PrerequisitesCacheManager();
  });

  it('should cache prerequisite check result with TTL', () => {
    // Arrange
    const result = { version: '11.0.0', installed: true, plugins: [] };

    // Act
    cacheManager.setCachedResult('aio-cli', result);
    const cached = cacheManager.getCachedResult('aio-cli');

    // Assert
    expect(cached).toEqual(result);
    expect(cached).toBeDefined();
  });

  it('should return undefined after TTL expiry', () => {
    // Arrange
    const result = { version: '11.0.0', installed: true };
    cacheManager.setCachedResult('aio-cli', result, 100); // 100ms TTL

    // Act
    const immediate = cacheManager.getCachedResult('aio-cli');

    // Wait for expiry
    jest.advanceTimersByTime(150);
    const afterExpiry = cacheManager.getCachedResult('aio-cli');

    // Assert
    expect(immediate).toBeDefined();
    expect(afterExpiry).toBeUndefined();
  });

  it('should cache per-Node-version results separately', () => {
    // Arrange
    const node18Result = { version: '11.0.0', perNodeVersion: { '18': true } };
    const node20Result = { version: '11.0.0', perNodeVersion: { '20': true } };

    // Act
    cacheManager.setCachedResult('aio-cli:18', node18Result);
    cacheManager.setCachedResult('aio-cli:20', node20Result);

    // Assert
    expect(cacheManager.getCachedResult('aio-cli:18')).toEqual(node18Result);
    expect(cacheManager.getCachedResult('aio-cli:20')).toEqual(node20Result);
  });
});
```

### GREEN Phase (Minimal Implementation)

1. **Create `prerequisitesCacheManager.ts`** following `authCacheManager.ts` pattern:

```typescript
// src/features/prerequisites/services/prerequisitesCacheManager.ts
import { getLogger } from '@/core/logging';
import { CACHE_TTL } from '@/utils/timeoutConfig';
import type { CacheEntry, PrerequisiteCacheEntry } from './types';

export class PrerequisitesCacheManager {
    private logger = getLogger();
    private cache = new Map<string, CacheEntry<PrerequisiteCacheEntry>>();

    /**
     * Get cached prerequisite result
     * @param cacheKey - Prerequisite ID or 'id:nodeVersion' for perNodeVersion checks
     */
    getCachedResult(cacheKey: string): PrerequisiteCacheEntry | undefined {
        const entry = this.cache.get(cacheKey);
        if (!entry) {
            return undefined;
        }

        const now = Date.now();
        if (now >= entry.expiry) {
            this.logger.debug(`[Prereq Cache] Cache expired for ${cacheKey}`);
            this.cache.delete(cacheKey);
            return undefined;
        }

        this.logger.debug(`[Prereq Cache] Cache HIT for ${cacheKey}`);
        return entry.data;
    }

    /**
     * Set cached prerequisite result
     * @param cacheKey - Prerequisite ID or 'id:nodeVersion' for perNodeVersion checks
     * @param result - Prerequisite check result
     * @param ttlMs - TTL in milliseconds (defaults to CACHE_TTL.PREREQUISITE_CHECK)
     */
    setCachedResult(
        cacheKey: string,
        result: PrerequisiteCacheEntry,
        ttlMs: number = CACHE_TTL.PREREQUISITE_CHECK
    ): void {
        const now = Date.now();
        this.cache.set(cacheKey, {
            data: result,
            expiry: now + ttlMs,
        });
        this.logger.debug(`[Prereq Cache] Cached result for ${cacheKey} (TTL: ${ttlMs}ms)`);
    }

    /**
     * Invalidate cache for specific prerequisite
     */
    invalidate(cacheKey: string): void {
        this.cache.delete(cacheKey);
        this.logger.debug(`[Prereq Cache] Invalidated cache for ${cacheKey}`);
    }

    /**
     * Clear all cached results (called on Recheck button)
     */
    clearAll(): void {
        this.cache.clear();
        this.logger.debug('[Prereq Cache] Cleared all cached results');
    }
}
```

2. **Update `types.ts`** to add cache types:

```typescript
// src/features/prerequisites/services/types.ts

// Add at end of file:
export interface CacheEntry<T> {
    data: T;
    expiry: number;
}

export interface PrerequisiteCacheEntry {
    version?: string;
    installed: boolean;
    plugins?: { id: string; name: string; installed: boolean }[];
    perNodeVersion?: Record<string, boolean>;
}
```

3. **Add `CACHE_TTL.PREREQUISITE_CHECK` to `timeoutConfig.ts`**:

```typescript
// src/utils/timeoutConfig.ts
export const CACHE_TTL = {
    // ... existing entries ...

    // Prerequisite caches
    PREREQUISITE_CHECK: 5 * 60 * 1000,  // 5 minutes - cached prerequisite check results
} as const;
```

4. **Integrate cache into `prerequisitesManager.ts`**:

```typescript
// src/features/prerequisites/services/prerequisitesManager.ts
import { PrerequisitesCacheManager } from './prerequisitesCacheManager';

export class PrerequisitesManager {
    private cacheManager = new PrerequisitesCacheManager();

    async checkPrerequisite(prereq: PrerequisiteDefinition): Promise<PrerequisiteStatus> {
        // Generate cache key (include Node version for perNodeVersion checks)
        const cacheKey = prereq.perNodeVersion
            ? `${prereq.id}:${process.version}`
            : prereq.id;

        // Check cache first
        const cachedResult = this.cacheManager.getCachedResult(cacheKey);
        if (cachedResult) {
            this.logger.debug(`[Prereq Check] Using cached result for ${prereq.id}`);
            return this.convertCacheToStatus(prereq, cachedResult);
        }

        // Cache miss - perform full check
        this.logger.debug(`[Prereq Check] Cache miss, performing full check for ${prereq.id}`);
        const status = await this.performFullCheck(prereq); // Existing logic

        // Cache successful result
        this.cacheManager.setCachedResult(cacheKey, {
            version: status.version,
            installed: status.installed,
            plugins: status.plugins,
        });

        return status;
    }

    private convertCacheToStatus(
        prereq: PrerequisiteDefinition,
        cached: PrerequisiteCacheEntry
    ): PrerequisiteStatus {
        return {
            id: prereq.id,
            name: prereq.name,
            description: prereq.description,
            installed: cached.installed,
            version: cached.version,
            optional: prereq.optional || false,
            canInstall: !cached.installed && !!prereq.install,
            plugins: cached.plugins,
        };
    }
}
```

5. **Add cache invalidation in `installHandler.ts`**:

```typescript
// src/features/prerequisites/handlers/installHandler.ts

async function installPrerequisite(prereqId: string): Promise<void> {
    // ... existing installation logic ...

    // Invalidate cache after successful installation
    const cacheManager = prerequisitesManager['cacheManager'];
    cacheManager.invalidate(prereqId);

    // Also invalidate perNodeVersion variants if applicable
    if (prereq.perNodeVersion) {
        const nodeVersions = await getInstalledNodeVersions();
        nodeVersions.forEach(version => {
            cacheManager.invalidate(`${prereqId}:${version}`);
        });
    }
}
```

6. **Add cache invalidation in `checkHandler.ts` (Recheck button)**:

```typescript
// src/features/prerequisites/handlers/checkHandler.ts

function handleRecheckButton(): void {
    // Clear all caches
    const cacheManager = prerequisitesManager['cacheManager'];
    cacheManager.clearAll();

    // Re-run prerequisite checks
    await checkAllPrerequisites();
}
```

### REFACTOR Phase (Improve While Tests Pass)

1. **Extract cache key generation** to avoid duplication:

```typescript
// src/features/prerequisites/services/prerequisitesManager.ts

private getCacheKey(prereq: PrerequisiteDefinition, nodeVersion?: string): string {
    if (prereq.perNodeVersion && nodeVersion) {
        return `${prereq.id}:${nodeVersion}`;
    }
    return prereq.id;
}
```

2. **Add cache statistics** for debugging:

```typescript
// src/features/prerequisites/services/prerequisitesCacheManager.ts

getStats(): { size: number; hits: number; misses: number } {
    return {
        size: this.cache.size,
        hits: this.cacheHits,
        misses: this.cacheMisses,
    };
}
```

3. **Add cache warmup** for common prerequisites:

```typescript
// src/features/prerequisites/services/prerequisitesManager.ts

async warmupCache(prereqIds: string[]): Promise<void> {
    const checks = prereqIds.map(id => this.checkPrerequisite({ id }));
    await Promise.all(checks);
    this.logger.info('[Prereq Cache] Cache warmup complete');
}
```

4. **Follow KISS principle**: Keep cache logic simple - no complex invalidation rules beyond TTL and explicit clearing.

## Expected Outcome

- **Cached checks complete in <10ms** (vs 500ms-3s for full CLI checks)
- **95% reduction** in repeated prerequisite checks during typical workflows
- **Cache transparent to users** - no UI changes, automatic invalidation on install/recheck
- **No persistence** - cache cleared on extension reload (fresh start each session)
- **AuthCacheManager pattern followed** - consistent caching approach across extension

## Acceptance Criteria

- [x] All tests passing for this step (unit + integration)
- [x] Cache hit returns result in <10ms (verified with timing logs)
- [x] Cache miss performs full check and caches result
- [x] Cache expiry works correctly (TTL enforcement)
- [x] perNodeVersion prerequisites cached separately per Node version
- [x] Cache invalidated on "Recheck" button click
- [x] Cache invalidated after successful prerequisite installation
- [x] Cache cleared on extension reload (no Memento persistence)
- [x] Code follows project style guide (matches authCacheManager.ts structure)
- [x] No debug code (console.log, debugger)
- [x] Coverage ≥ 90% for new cache manager code

## Dependencies from Other Steps

- **From Step 1:** Relies on npm flags and timeout configuration being in place (cache operates on reliable installation results)
- **For Step 3:** Provides cache foundation for parallel per-Node-version checks (reduces redundant checks during concurrent operations)

## Estimated Time

**3-4 hours**

- Create PrerequisitesCacheManager: 1 hour
- Integrate into PrerequisitesManager: 1 hour
- Add invalidation logic (install/recheck): 30 minutes
- Write unit tests: 1 hour
- Write integration tests: 30 minutes
- Refactoring and cleanup: 30 minutes
