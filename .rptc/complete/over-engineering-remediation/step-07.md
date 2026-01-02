# Step 7: Abstract Cache Manager Removal

## Purpose

Remove the `AbstractCacheManager` base class and inline cache functionality into concrete implementations. The abstract class adds ~30 lines of boilerplate for only 2 implementations, and the `getKey()` abstract method is always just `key.toString()`.

**Why This Matters:** Abstractions should prove their worth through 3+ implementations (Rule of Three). With only 2 implementations and trivial abstract method, this abstraction adds complexity without benefit.

## Current State Analysis

### Problem: Unnecessary Abstraction Layer

```
src/core/cache/
├── AbstractCacheManager.ts           (138 lines) - abstract base class
└── index.ts                          (exports)

Implementations:
├── src/features/authentication/services/authCacheManager.ts (~316 lines, uses AbstractCacheManager)
├── src/features/prerequisites/services/prerequisitesCacheManager.ts (~200 lines, uses AbstractCacheManager)
```

### Root Cause: Premature Generalization

**The Abstract Class:**
```typescript
export abstract class AbstractCacheManager<K, V> {
    private cache: Map<string, CacheEntry<V>> = new Map();

    protected abstract getKey(key: K): string;  // Always just key.toString()!

    set(key: K, value: V): void { /* standard map logic */ }
    get(key: K): V | undefined { /* standard map logic */ }
    has(key: K): boolean { /* standard logic */ }
    delete(key: K): void { /* standard logic */ }
    clear(): void { /* standard logic */ }
}
```

**Implementations Just Pass Through:**
```typescript
class AuthCacheManager extends AbstractCacheManager<string, AuthData> {
    protected getKey(key: string): string {
        return key;  // Trivial!
    }
}

class PrerequisitesCacheManager extends AbstractCacheManager<PrerequisiteKey, boolean> {
    protected getKey(key: PrerequisiteKey): string {
        return `${key.name}-${key.version}`;  // Simple concatenation
    }
}
```

### Target State

```
src/core/cache/
├── cacheUtils.ts                     (~40 lines) - shared utility functions
└── index.ts                          (exports)

Each cache implementation uses inline Map with shared utilities:
├── src/features/authentication/services/authCache.ts (~100 lines, no inheritance)
├── src/features/prerequisites/services/prerequisitesCache.ts (~80 lines, no inheritance)
```

## Prerequisites

- [ ] All 267 tests passing before starting
- [ ] Understand both cache implementations
- [ ] Identify truly shared logic (TTL with jitter)

## Tests to Write First (RED Phase)

### Test Scenario 1: Shared Cache Utilities

**Given:** Cache utility functions (no class)
**When:** Using TTL and jitter calculations
**Then:** Functions work correctly

```typescript
// tests/core/cache/cacheUtils.test.ts
describe('Cache Utilities', () => {
  describe('getCacheTTLWithJitter', () => {
    it('should add jitter to base TTL', () => {
      const baseTTL = 300000; // 5 minutes
      const jitterPercent = 10;

      // Run multiple times to verify randomness
      const results = Array.from({ length: 100 }, () =>
        getCacheTTLWithJitter(baseTTL, jitterPercent)
      );

      // All results should be within ±10% of base
      const min = baseTTL * 0.9;
      const max = baseTTL * 1.1;
      expect(results.every(r => r >= min && r <= max)).toBe(true);

      // Should have variation (not all same)
      const unique = new Set(results);
      expect(unique.size).toBeGreaterThan(1);
    });

    it('should return base TTL when jitter is 0', () => {
      expect(getCacheTTLWithJitter(300000, 0)).toBe(300000);
    });
  });

  describe('isExpired', () => {
    it('should return false for future expiry', () => {
      const entry = { value: 'test', expiresAt: Date.now() + 10000 };
      expect(isExpired(entry)).toBe(false);
    });

    it('should return true for past expiry', () => {
      const entry = { value: 'test', expiresAt: Date.now() - 1 };
      expect(isExpired(entry)).toBe(true);
    });
  });

  describe('createCacheEntry', () => {
    it('should create entry with correct expiry', () => {
      const value = { data: 'test' };
      const ttl = 5000;

      const entry = createCacheEntry(value, ttl);

      expect(entry.value).toBe(value);
      expect(entry.expiresAt).toBeCloseTo(Date.now() + ttl, -2);
    });
  });
});
```

### Test Scenario 2: Auth Cache Without Inheritance

**Given:** AuthCache using inline Map
**When:** Caching auth data
**Then:** All operations work correctly

```typescript
// tests/features/authentication/services/authCache.test.ts
describe('AuthCache - No Inheritance', () => {
  let cache: AuthCache;

  beforeEach(() => {
    cache = new AuthCache({ ttlMs: 300000, jitterPercent: 10 });
  });

  describe('organizations', () => {
    it('should cache and retrieve organizations', () => {
      const orgs = [{ id: 'org1', name: 'Test Org' }];
      cache.setOrganizations(orgs);

      expect(cache.getOrganizations()).toEqual(orgs);
    });

    it('should return undefined for expired entries', () => {
      const orgs = [{ id: 'org1' }];
      cache.setOrganizations(orgs);

      // Fast-forward time past TTL
      jest.advanceTimersByTime(400000);

      expect(cache.getOrganizations()).toBeUndefined();
    });
  });

  describe('projects', () => {
    it('should cache projects by org ID', () => {
      const projects = [{ id: 'proj1', title: 'Test' }];
      cache.setProjects('org1', projects);

      expect(cache.getProjects('org1')).toEqual(projects);
      expect(cache.getProjects('org2')).toBeUndefined();
    });
  });

  describe('invalidation', () => {
    it('should invalidate projects when org changes', () => {
      cache.setProjects('org1', [{ id: 'proj1' }]);
      cache.setWorkspaces('org1', 'proj1', [{ id: 'ws1' }]);

      cache.invalidateForOrg('org1');

      expect(cache.getProjects('org1')).toBeUndefined();
      expect(cache.getWorkspaces('org1', 'proj1')).toBeUndefined();
    });
  });
});
```

### Test Scenario 3: Prerequisites Cache Without Inheritance

**Given:** PrerequisitesCache using inline Map
**When:** Caching prerequisite check results
**Then:** All operations work correctly

```typescript
// tests/features/prerequisites/services/prerequisitesCache.test.ts
describe('PrerequisitesCache - No Inheritance', () => {
  let cache: PrerequisitesCache;

  beforeEach(() => {
    cache = new PrerequisitesCache({ ttlMs: 300000, jitterPercent: 10 });
  });

  describe('check results', () => {
    it('should cache prerequisite check results', () => {
      cache.setCheckResult('node', '20', true);

      expect(cache.getCheckResult('node', '20')).toBe(true);
    });

    it('should cache version-specific results separately', () => {
      cache.setCheckResult('node', '18', true);
      cache.setCheckResult('node', '20', false);

      expect(cache.getCheckResult('node', '18')).toBe(true);
      expect(cache.getCheckResult('node', '20')).toBe(false);
    });
  });

  describe('TTL enforcement', () => {
    it('should expire entries after TTL', () => {
      cache.setCheckResult('fnm', 'latest', true);

      jest.advanceTimersByTime(400000);

      expect(cache.getCheckResult('fnm', 'latest')).toBeUndefined();
    });
  });

  describe('cache limits', () => {
    it('should enforce maximum cache size', () => {
      // Add 150 entries (over 100 limit)
      for (let i = 0; i < 150; i++) {
        cache.setCheckResult(`tool${i}`, 'v1', true);
      }

      // Should have evicted oldest entries
      expect(cache.size()).toBeLessThanOrEqual(100);
    });
  });
});
```

## Files to Modify

### Files to Delete (2 files, ~140 LOC)

```
src/core/cache/
├── AbstractCacheManager.ts           (DELETE - 138 lines)
└── index.ts                          (REFACTOR - update exports)
```

### Files to Create (1 file)

```
src/core/cache/
└── cacheUtils.ts                     (NEW - ~40 lines, shared utilities)
```

### Files to Refactor (2 files)

```
src/features/authentication/services/authCacheManager.ts
  → REFACTOR to src/features/authentication/services/authCache.ts (~100 lines)
  → Remove inheritance, use inline Map

src/features/prerequisites/services/prerequisitesCacheManager.ts
  → REFACTOR to src/features/prerequisites/services/prerequisitesCache.ts (~80 lines)
  → Remove inheritance, use inline Map
```

## Implementation Details

### RED Phase

1. Create `tests/core/cache/cacheUtils.test.ts`
2. Update auth cache tests for new structure
3. Update prerequisites cache tests for new structure
4. Tests will fail (implementations still use abstract class)

### GREEN Phase

**Step 1: Create Shared Utilities**

```typescript
// src/core/cache/cacheUtils.ts

/**
 * Cache entry with expiration tracking
 */
export interface CacheEntry<V> {
    value: V;
    expiresAt: number;
}

/**
 * Configuration for cache behavior
 */
export interface CacheConfig {
    ttlMs: number;
    jitterPercent?: number;
}

/**
 * Add random jitter to TTL to prevent timing-based cache enumeration.
 * SECURITY: Randomizes cache expiry to make timing attacks infeasible.
 */
export function getCacheTTLWithJitter(baseTTL: number, jitterPercent: number = 10): number {
    if (jitterPercent === 0) return baseTTL;

    const jitter = jitterPercent / 100;
    const min = Math.floor(baseTTL * (1 - jitter));
    const max = Math.floor(baseTTL * (1 + jitter));
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Check if a cache entry has expired
 */
export function isExpired<V>(entry: CacheEntry<V>): boolean {
    return Date.now() > entry.expiresAt;
}

/**
 * Create a new cache entry with TTL
 */
export function createCacheEntry<V>(value: V, ttlMs: number): CacheEntry<V> {
    return {
        value,
        expiresAt: Date.now() + ttlMs,
    };
}
```

**Step 2: Refactor Auth Cache (No Inheritance)**

```typescript
// src/features/authentication/services/authCache.ts

import { CacheConfig, getCacheTTLWithJitter, isExpired, createCacheEntry, CacheEntry } from '@/core/cache/cacheUtils';
import { Organization, Project, Workspace } from './types';

/**
 * Authentication cache - stores orgs, projects, workspaces.
 * No abstract base class - just a Map with domain-specific methods.
 */
export class AuthCache {
    private orgs: CacheEntry<Organization[]> | null = null;
    private projects = new Map<string, CacheEntry<Project[]>>();
    private workspaces = new Map<string, CacheEntry<Workspace[]>>();

    private readonly ttlMs: number;
    private readonly jitterPercent: number;

    constructor(config: CacheConfig) {
        this.ttlMs = config.ttlMs;
        this.jitterPercent = config.jitterPercent ?? 0;
    }

    private getTTL(): number {
        return getCacheTTLWithJitter(this.ttlMs, this.jitterPercent);
    }

    // Organizations
    setOrganizations(orgs: Organization[]): void {
        this.orgs = createCacheEntry(orgs, this.getTTL());
    }

    getOrganizations(): Organization[] | undefined {
        if (!this.orgs || isExpired(this.orgs)) {
            this.orgs = null;
            return undefined;
        }
        return this.orgs.value;
    }

    // Projects (keyed by orgId)
    setProjects(orgId: string, projects: Project[]): void {
        this.projects.set(orgId, createCacheEntry(projects, this.getTTL()));
    }

    getProjects(orgId: string): Project[] | undefined {
        const entry = this.projects.get(orgId);
        if (!entry || isExpired(entry)) {
            this.projects.delete(orgId);
            return undefined;
        }
        return entry.value;
    }

    // Workspaces (keyed by orgId:projectId)
    setWorkspaces(orgId: string, projectId: string, workspaces: Workspace[]): void {
        const key = `${orgId}:${projectId}`;
        this.workspaces.set(key, createCacheEntry(workspaces, this.getTTL()));
    }

    getWorkspaces(orgId: string, projectId: string): Workspace[] | undefined {
        const key = `${orgId}:${projectId}`;
        const entry = this.workspaces.get(key);
        if (!entry || isExpired(entry)) {
            this.workspaces.delete(key);
            return undefined;
        }
        return entry.value;
    }

    // Invalidation
    invalidateForOrg(orgId: string): void {
        this.projects.delete(orgId);
        for (const key of this.workspaces.keys()) {
            if (key.startsWith(`${orgId}:`)) {
                this.workspaces.delete(key);
            }
        }
    }

    invalidateForProject(orgId: string, projectId: string): void {
        this.workspaces.delete(`${orgId}:${projectId}`);
    }

    clear(): void {
        this.orgs = null;
        this.projects.clear();
        this.workspaces.clear();
    }
}
```

**Step 3: Refactor Prerequisites Cache (No Inheritance)**

```typescript
// src/features/prerequisites/services/prerequisitesCache.ts

import { CacheConfig, getCacheTTLWithJitter, isExpired, createCacheEntry, CacheEntry } from '@/core/cache/cacheUtils';

const MAX_CACHE_SIZE = 100;

/**
 * Prerequisites check result cache.
 * Caches whether specific tool/version combinations are installed.
 */
export class PrerequisitesCache {
    private cache = new Map<string, CacheEntry<boolean>>();

    private readonly ttlMs: number;
    private readonly jitterPercent: number;

    constructor(config: CacheConfig) {
        this.ttlMs = config.ttlMs;
        this.jitterPercent = config.jitterPercent ?? 0;
    }

    private getTTL(): number {
        return getCacheTTLWithJitter(this.ttlMs, this.jitterPercent);
    }

    private getKey(tool: string, version: string): string {
        return `${tool}-${version}`;
    }

    setCheckResult(tool: string, version: string, result: boolean): void {
        // LRU eviction if cache is full
        if (this.cache.size >= MAX_CACHE_SIZE) {
            const oldest = this.cache.keys().next().value;
            if (oldest) this.cache.delete(oldest);
        }

        const key = this.getKey(tool, version);
        this.cache.set(key, createCacheEntry(result, this.getTTL()));
    }

    getCheckResult(tool: string, version: string): boolean | undefined {
        const key = this.getKey(tool, version);
        const entry = this.cache.get(key);

        if (!entry || isExpired(entry)) {
            this.cache.delete(key);
            return undefined;
        }

        return entry.value;
    }

    invalidate(tool: string, version: string): void {
        this.cache.delete(this.getKey(tool, version));
    }

    invalidateTool(tool: string): void {
        for (const key of this.cache.keys()) {
            if (key.startsWith(`${tool}-`)) {
                this.cache.delete(key);
            }
        }
    }

    clear(): void {
        this.cache.clear();
    }

    size(): number {
        return this.cache.size;
    }
}
```

**Step 4: Update Exports**

```typescript
// src/core/cache/index.ts
export {
    getCacheTTLWithJitter,
    isExpired,
    createCacheEntry,
    type CacheEntry,
    type CacheConfig,
} from './cacheUtils';
```

### REFACTOR Phase

1. Delete AbstractCacheManager.ts
2. Update all imports from old cache managers
3. Rename files (authCacheManager → authCache, etc.)
4. Run full test suite
5. Update barrel exports

## Migration Path

### Step-by-Step

1. Create `cacheUtils.ts` with shared functions
2. Refactor `AuthCache` to use utilities (no inheritance)
3. Refactor `PrerequisitesCache` to use utilities (no inheritance)
4. Update imports across codebase
5. Delete `AbstractCacheManager.ts`

### Import Updates

```typescript
// Before
import { AbstractCacheManager, CacheConfig } from '@/core/cache';

class MyCache extends AbstractCacheManager<string, Data> {
    protected getKey(key: string): string { return key; }
}

// After
import { CacheConfig, getCacheTTLWithJitter, isExpired, createCacheEntry } from '@/core/cache';

class MyCache {
    private cache = new Map<string, CacheEntry<Data>>();
    // Direct Map usage with utility functions
}
```

## Expected Outcome

After this step:

1. **LOC Reduction:** ~140 lines removed (abstract class)
2. **File Reduction:** 1 file deleted, 1 new utility file (~40 lines)
3. **Abstraction Layers:** 1 abstract class → 0 (just utility functions)
4. **Simplicity:** Cache implementations are self-contained

## Acceptance Criteria

- [ ] All 267 existing tests pass
- [ ] New utility function tests pass
- [ ] Auth cache works without inheritance
- [ ] Prerequisites cache works without inheritance
- [ ] TTL and jitter behavior preserved
- [ ] LRU eviction preserved in prerequisites cache
- [ ] TypeScript compilation succeeds

## Dependencies from Other Steps

**Step 5 (Auth Service Consolidation):** If done first, Step 5 creates `authCache.ts` which this step also creates. Coordinate to avoid conflicts.

**Otherwise independent** - Can be done in parallel with steps 1-4 or 6.

## Risk Assessment

### Risk: Breaking Cache Behavior

- **Likelihood:** Low (same logic, different structure)
- **Impact:** Medium (cache issues cause stale data)
- **Mitigation:** Preserve exact TTL/jitter logic; comprehensive tests

### Risk: Missing LRU Eviction

- **Likelihood:** Low (explicitly handled in prerequisites cache)
- **Impact:** Low (cache grows slightly larger)
- **Mitigation:** Port size limit and eviction from existing implementation

## Notes

### Why Abstract Class Was Wrong Here

Abstract classes are appropriate when:
1. ✅ Multiple implementations exist
2. ❌ Implementations share **significant** complex logic
3. ❌ Abstract methods provide meaningful extension points

In this case:
- Only 2 implementations
- Shared logic is trivial (Map operations)
- `getKey()` abstract method is always `key.toString()` or simple concatenation

### Composition Over Inheritance

The refactored approach uses composition (utility functions) rather than inheritance:

**Inheritance Problems:**
- Forces class hierarchy
- All implementations must extend base
- Changes to base affect all children
- Abstract methods add ceremony

**Composition Benefits:**
- Functions can be used anywhere
- No forced structure
- Changes are localized
- Simpler to understand

### Security Preservation

The jitter functionality is a security feature (prevents timing-based cache enumeration). It must be preserved in the refactoring:

```typescript
// Preserved in cacheUtils.ts
export function getCacheTTLWithJitter(baseTTL: number, jitterPercent: number = 10): number {
    // SECURITY: Randomizes cache expiry to prevent timing attacks
    // ...
}
```

Both refactored caches use this function, maintaining the security benefit.

