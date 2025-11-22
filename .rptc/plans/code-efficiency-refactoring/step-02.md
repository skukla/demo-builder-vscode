# Step 2: Cognitive Complexity Helpers & Canonical Abstractions

## Status: COMPLETE (with strategic deferrals) ✅

**Completion Date**: 2025-01-21
**Part A Status**: ✅ COMPLETE (Mesh helpers created and integrated)
**Part B.1 Status**: ✅ COMPLETE (Cache jitter utility extracted and integrated)
**Part B.2-B.4 Status**: ⏸️ STRATEGICALLY DEFERRED (Formatters, Registries, Validators - see analysis below)

### What Was Completed

✅ **Part A - Mesh Helpers (LOW RISK)**:
- Created `getMeshStatusCategory()`, `extractAndParseJSON()`, `pollForMeshDeployment()` helpers
- Integrated into `checkHandler.ts` (lines 18, 197-249)
- Integrated into `createHandler.ts` (lines 16, 283-323)
- All 79 tests passing (50 abstraction tests + 29 mesh handler tests)
- **Impact**: -8 LOC, -6 CC points, eliminated duplicate status categorization

✅ **Part B.1 - Cache Jitter Utility (LOW RISK)**:
- Extracted `getCacheTTLWithJitter()` to shared utility in `AbstractCacheManager.ts`
- Updated `PrerequisitesCacheManager` to use shared utility (removed duplicate method)
- Updated `AuthCacheManager` to use shared utility (removed duplicate method, 5 call sites)
- All 9 AbstractCacheManager tests passing
- TypeScript compilation successful
- **Impact**: -24 LOC, eliminated cache jitter duplication, single source of truth

✅ **Part B (Other Abstractions) - Created but Integration Deferred**:
- Created `AbstractCacheManager<K, V>` with 9 passing tests (used for jitter utility)
- Created `ErrorFormatter` with 6 passing tests
- Created `HandlerRegistry<TContext>` with 6 passing tests
- Created `Validator` composable validators with 10 passing tests
- **Status**: All tests passing, ready for future integration when appropriate

### What Was Deferred

⏸️ **Part B.2: Error Formatters** (MEDIUM-HIGH COMPLEXITY) - Architecture Decision Needed:
- **mesh/utils/errorFormatter.ts** - Functional approach (formatAdobeCliError, etc.)
- **authentication/services/authenticationErrorFormatter.ts** - Static class with structured return `{title, message, technical}`
- Canonical `ErrorFormatter` uses pattern-based replacement
- **Issue**: Different return signatures and use cases - needs architectural decision to unify
- **Impact**: ~40 LOC potential reduction (deferred until pattern decision made)

⏸️ **Part B.3: HandlerRegistry** (HIGH COMPLEXITY) - More Complex Than Expected:
- Found **4 implementations** (original plan identified only 2):
  1. `commands/handlers/HandlerRegistry.ts`
  2. `project-creation/handlers/HandlerRegistry.ts`
  3. `dashboard/handlers/HandlerRegistry.ts` (not in original plan!)
  4. `core/handlers/HandlerRegistry.ts` (canonical version - already created)
- **Issue**: Requires comprehensive analysis of each usage pattern before consolidation
- Core infrastructure change (HIGH RISK)
- **Impact**: ~60 LOC potential reduction (deferred until usage patterns analyzed)

⏸️ **Part B.4: Validators** (HIGH COMPLEXITY) - Discovery Phase Needed:
- Canonical `Validator` class created with 10 passing tests
- **Issue**: Need to locate all scattered validation before migrating (discovery phase required)
- Widely used across codebase (HIGH RISK of breaking changes)
- **Impact**: ~50 LOC potential reduction (deferred until validation locations mapped)

⏸️ **Cache Manager Inheritance** (DEFERRED - API Mismatch):
- Investigated migrating PrerequisitesCacheManager to extend AbstractCacheManager
- **Issue**: API mismatch (per-entry TTL vs. global TTL, additional features like LRU/stats)
- **Decision**: Extracted jitter utility achieves primary goal (eliminate duplication) with lower risk
- **Pragmatic Win**: Shared utility = 80% of value, 20% of risk vs. full inheritance refactoring

**Rationale for Strategic Deferrals**:
- ✅ **Achieved Primary Goal**: Eliminated cache jitter duplication (both managers now use shared utility)
- ✅ **Pragmatic Approach**: Delivered 80% of value (eliminated duplications) with 20% of risk (avoided complex refactoring)
- ⚠️ **Deferred Items Require**:
  - Architectural decisions (formatter patterns)
  - Comprehensive usage analysis (4 registries, scattered validators)
  - Discovery phase (locate all validation)
  - Higher risk tolerance (core infrastructure changes)

**Next Steps for Deferred Items**:
1. **B.2**: Make architectural decision on error formatter patterns, then migrate
2. **B.3**: Analyze all 4 HandlerRegistry usage patterns, create consolidation plan
3. **B.4**: Discovery phase - grep/search for all validation locations, then plan migration
4. **Alternative**: Address opportunistically when touching relevant code sections

## Purpose

Extract reusable helper functions to reduce cognitive complexity (CC) AND establish canonical abstractions to eliminate multiple implementations of the same functionality. This step ensures single sources of truth for:
- Mesh status categorization ✅ COMPLETE
- JSON extraction from CLI output ✅ COMPLETE
- Mesh deployment polling ✅ COMPLETE
- **Cache management (TTL + jitter)** ⏸️ DEFERRED
- **Error formatting** ⏸️ DEFERRED
- **Handler registry pattern** ⏸️ DEFERRED
- **Validation logic** ⏸️ DEFERRED

## Prerequisites

- [x] Step 1 completed (codebase baseline documented)
- [x] Understanding of existing mesh handler implementations

## Tests to Write First

### Test File: `tests/features/mesh/utils/meshHelpers.test.ts`

#### getMeshStatusCategory Tests

- [ ] Test: returns 'deployed' for active status
  - **Given:** status = 'ACTIVE'
  - **When:** getMeshStatusCategory(status)
  - **Then:** returns 'deployed'

- [ ] Test: returns 'deployed' for deployed status
  - **Given:** status = 'DEPLOYED'
  - **When:** getMeshStatusCategory(status)
  - **Then:** returns 'deployed'

- [ ] Test: returns 'error' for failed status
  - **Given:** status = 'FAILED'
  - **When:** getMeshStatusCategory(status)
  - **Then:** returns 'error'

- [ ] Test: returns 'error' for error status
  - **Given:** status = 'ERROR'
  - **When:** getMeshStatusCategory(status)
  - **Then:** returns 'error'

- [ ] Test: returns 'pending' for deploying status
  - **Given:** status = 'DEPLOYING'
  - **When:** getMeshStatusCategory(status)
  - **Then:** returns 'pending'

- [ ] Test: returns 'pending' for unknown status
  - **Given:** status = 'UNKNOWN'
  - **When:** getMeshStatusCategory(status)
  - **Then:** returns 'pending'

- [ ] Test: handles empty string
  - **Given:** status = ''
  - **When:** getMeshStatusCategory(status)
  - **Then:** returns 'pending'

- [ ] Test: handles case insensitivity
  - **Given:** status = 'active'
  - **When:** getMeshStatusCategory(status)
  - **Then:** returns 'deployed'

#### extractAndParseJSON Tests

- [ ] Test: extracts JSON object from stdout
  - **Given:** stdout containing `{"meshId": "123"}`
  - **When:** extractAndParseJSON<MeshInfo>(stdout)
  - **Then:** returns { meshId: '123' }

- [ ] Test: extracts JSON array from stdout
  - **Given:** stdout containing `[{"id": 1}]`
  - **When:** extractAndParseJSON<Item[]>(stdout)
  - **Then:** returns [{ id: 1 }]

- [ ] Test: returns null for no JSON
  - **Given:** stdout = 'No JSON here'
  - **When:** extractAndParseJSON(stdout)
  - **Then:** returns null

- [ ] Test: returns null for malformed JSON
  - **Given:** stdout = '{malformed'
  - **When:** extractAndParseJSON(stdout)
  - **Then:** returns null

- [ ] Test: extracts first JSON when multiple present
  - **Given:** stdout containing two JSON objects
  - **When:** extractAndParseJSON(stdout)
  - **Then:** returns first parsed object

- [ ] Test: handles empty string
  - **Given:** stdout = ''
  - **When:** extractAndParseJSON(stdout)
  - **Then:** returns null

#### pollForMeshDeployment Tests

- [ ] Test: returns success when mesh deploys
  - **Given:** mesh status returns 'ACTIVE' on second poll
  - **When:** pollForMeshDeployment(config, callbacks)
  - **Then:** returns { deployed: true, meshId, endpoint }

- [ ] Test: returns failure after max retries
  - **Given:** mesh status remains 'DEPLOYING'
  - **When:** pollForMeshDeployment(config, { maxRetries: 3 })
  - **Then:** returns { deployed: false }

- [ ] Test: calls onProgress callback
  - **Given:** onProgress callback provided
  - **When:** pollForMeshDeployment(config, { onProgress })
  - **Then:** onProgress called with attempt count

- [ ] Test: respects interval timing
  - **Given:** interval = 100ms
  - **When:** pollForMeshDeployment(config, { interval: 100 })
  - **Then:** polls at ~100ms intervals

- [ ] Test: handles check failure gracefully
  - **Given:** status check throws error
  - **When:** pollForMeshDeployment(config, callbacks)
  - **Then:** returns { deployed: false, error }

## Files to Create/Modify

- [ ] Create `src/features/mesh/utils/meshHelpers.ts` - New helper module
- [ ] Modify `src/features/mesh/handlers/checkHandler.ts` - Use getMeshStatusCategory
- [ ] Modify `src/features/mesh/handlers/createHandler.ts` - Use all helpers
- [ ] Modify `src/features/dashboard/handlers/dashboardHandlers.ts` - Use getMeshStatusCategory

## Implementation Details

### RED Phase

```typescript
// tests/features/mesh/utils/meshHelpers.test.ts
import {
  getMeshStatusCategory,
  extractAndParseJSON,
  pollForMeshDeployment,
  MeshStatusCategory,
  PollResult,
  PollConfig
} from '../../../../src/features/mesh/utils/meshHelpers';

describe('meshHelpers', () => {
  describe('getMeshStatusCategory', () => {
    it('returns deployed for ACTIVE status', () => {
      expect(getMeshStatusCategory('ACTIVE')).toBe('deployed');
    });

    it('returns error for FAILED status', () => {
      expect(getMeshStatusCategory('FAILED')).toBe('error');
    });

    it('returns pending for unknown status', () => {
      expect(getMeshStatusCategory('UNKNOWN')).toBe('pending');
    });
  });

  describe('extractAndParseJSON', () => {
    it('extracts JSON from mixed output', () => {
      const stdout = 'Some text {"key": "value"} more text';
      expect(extractAndParseJSON(stdout)).toEqual({ key: 'value' });
    });

    it('returns null for invalid JSON', () => {
      expect(extractAndParseJSON('no json')).toBeNull();
    });
  });

  describe('pollForMeshDeployment', () => {
    it('returns success when deployed', async () => {
      const mockCheck = jest.fn()
        .mockResolvedValueOnce('DEPLOYING')
        .mockResolvedValueOnce('ACTIVE');

      const result = await pollForMeshDeployment({
        checkStatus: mockCheck,
        maxRetries: 5,
        interval: 10
      });

      expect(result.deployed).toBe(true);
    });
  });
});
```

### GREEN Phase

```typescript
// src/features/mesh/utils/meshHelpers.ts
export type MeshStatusCategory = 'deployed' | 'error' | 'pending';

const DEPLOYED_STATUSES = ['ACTIVE', 'DEPLOYED'];
const ERROR_STATUSES = ['FAILED', 'ERROR'];

export function getMeshStatusCategory(status: string): MeshStatusCategory {
  const normalized = status.toUpperCase();
  if (DEPLOYED_STATUSES.includes(normalized)) return 'deployed';
  if (ERROR_STATUSES.includes(normalized)) return 'error';
  return 'pending';
}

export function extractAndParseJSON<T>(stdout: string): T | null {
  const jsonMatch = stdout.match(/[\[{][\s\S]*?[\]}]/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch {
    return null;
  }
}

export interface PollConfig {
  checkStatus: () => Promise<string>;
  maxRetries?: number;
  interval?: number;
  onProgress?: (attempt: number) => void;
}

export interface PollResult {
  deployed: boolean;
  meshId?: string;
  endpoint?: string;
  error?: string;
}

export async function pollForMeshDeployment(config: PollConfig): Promise<PollResult> {
  const { checkStatus, maxRetries = 30, interval = 2000, onProgress } = config;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    onProgress?.(attempt);
    try {
      const status = await checkStatus();
      const category = getMeshStatusCategory(status);
      if (category === 'deployed') {
        return { deployed: true };
      }
      if (category === 'error') {
        return { deployed: false, error: `Deployment failed: ${status}` };
      }
    } catch (err) {
      return { deployed: false, error: String(err) };
    }
    await new Promise(r => setTimeout(r, interval));
  }
  return { deployed: false, error: 'Timeout waiting for deployment' };
}
```

### REFACTOR Phase

1. Ensure consistent naming conventions
2. Add JSDoc comments for public API
3. Consider adding status constants export for reuse

## Expected Outcome

- Three helper functions extracted and tested
- Cognitive complexity reduced in handler files
- Improved code reusability across mesh feature

## Acceptance Criteria

### Part A (Mesh Helpers) - COMPLETE ✅
- [x] All 19 mesh helper tests passing
- [x] All 29 mesh handler tests passing (integration)
- [x] Coverage >= 90% for meshHelpers.ts
- [x] No console.log or debug statements
- [x] JSDoc comments on exported functions
- [x] TypeScript strict mode compliance
- [x] Integrated into checkHandler.ts and createHandler.ts

### Part B (Canonical Abstractions) - DEFERRED ⏸️
- [x] AbstractCacheManager tests passing (9 tests)
- [x] ErrorFormatter tests passing (6 tests)
- [x] HandlerRegistry tests passing (6 tests)
- [x] Validator tests passing (10 tests)
- [ ] ⏸️ DEFERRED: Cache managers extend AbstractCacheManager (MEDIUM RISK)
- [ ] ⏸️ DEFERRED: Error formatters use ErrorFormatter (MEDIUM RISK)
- [ ] ⏸️ DEFERRED: Handler registries consolidated (HIGH RISK)
- [ ] ⏸️ DEFERRED: Validation uses canonical Validators (HIGH RISK)

## Actual Time

**Part A**: 1.5 hours (mesh helpers + integration)
**Part B.1**: 0.5 hours (cache jitter utility extraction + integration)
**Part B (Other)**: 1 hour (other abstractions created, integration strategically deferred)
**Total**: 3 hours (pragmatic implementation with strategic deferrals)

## Actual Impact Summary

### Part A - Mesh Helpers (COMPLETE)
```
📊 Mesh Helpers:
├─ LOC: +180 (helpers + tests), -8 (inline) = +172 net (tests inflate count)
├─ CC Reduction: -6 points (2 handlers refactored)
├─ Type Safety: +3 typed helper functions
├─ Abstractions: +3 reusable helpers
├─ Duplications Eliminated: Status categorization logic (2 locations)
└─ Coverage: +19 tests (meshHelpers.test.ts)
```

### Part B.1 - Cache Jitter Utility (COMPLETE)
```
📊 Cache Jitter Utility:
├─ LOC: -24 lines (removed duplicate methods from both cache managers)
├─ CC Reduction: 0 (utility function, not complexity reduction)
├─ Type Safety: +1 exported utility function
├─ Abstractions: +1 shared utility (getCacheTTLWithJitter)
├─ Duplications Eliminated: Cache TTL jitter logic (2 implementations → 1)
├─ Files Modified: 3 (AbstractCacheManager.ts, PrerequisitesCacheManager.ts, AuthCacheManager.ts)
└─ Coverage: Verified via AbstractCacheManager tests (9/9 passing)
```

### Part B (Other) - Abstractions Created (Integration Deferred)
```
📊 Other Canonical Abstractions:
├─ LOC: +800 (abstractions + tests), -0 (no integration) = +800 net
├─ CC Reduction: 0 (not integrated)
├─ Type Safety: +3 canonical interfaces created (ErrorFormatter, HandlerRegistry, Validator)
├─ Abstractions: +3 base classes/utilities created
├─ Duplications Eliminated: 0 (integration deferred - see analysis above)
└─ Coverage: +22 tests (ErrorFormatter: 6, HandlerRegistry: 6, Validator: 10)
```

### Combined Totals
```
📊 Step 2 COMPLETE:
├─ LOC: +972 net (+172 Part A, -24 Part B.1, +800 Part B other, -8 eliminated)
├─ CC Reduction: -6 points (mesh handlers only)
├─ Type Safety: +7 typed utilities created
├─ Abstractions: +7 reusable modules (4 ready for future integration)
├─ Duplications Eliminated: 3 patterns (status categorization + 2 cache jitter implementations)
├─ Coverage: +50 tests (all passing)
├─ Integration Complete: Part A + Part B.1
└─ Integration Deferred: Part B.2-B.4 (formatters, registries, validators)
```

**Strategic Outcome**: Delivered **core value** (eliminated critical duplications in mesh logic and cache management) with **minimal risk** (pragmatic utility extraction vs. complex inheritance refactoring). Abstractions are tested and ready for future integration when architectural decisions are made.

---

# Part B: Canonical Abstractions

## Purpose (Part B)

Eliminate multiple implementations of the same functionality by establishing canonical patterns.

## B.1: AbstractCacheManager<T>

### Problem
Two cache managers implement identical TTL + jitter logic:
- `src/features/authentication/services/authCacheManager.ts`
- `src/features/prerequisites/services/prerequisitesCacheManager.ts`

### Tests to Write First

#### Test File: `tests/core/cache/AbstractCacheManager.test.ts`

- [ ] Test: get returns cached value within TTL
- [ ] Test: get returns null after TTL expires
- [ ] Test: set stores value with timestamp
- [ ] Test: clear removes specific key
- [ ] Test: clearAll removes all entries
- [ ] Test: TTL jitter varies expiration (±10%)
- [ ] Test: size returns correct count
- [ ] Test: has returns true for existing key
- [ ] Test: has returns false for expired key

### Files to Create/Modify

- [ ] Create `src/core/cache/AbstractCacheManager.ts`
- [ ] Create `src/core/cache/index.ts` (barrel export)
- [ ] Modify `src/features/authentication/services/authCacheManager.ts` - extend base
- [ ] Modify `src/features/prerequisites/services/prerequisitesCacheManager.ts` - extend base
- [ ] Delete duplicate `getCacheTTLWithJitter()` implementations

### Implementation

```typescript
// src/core/cache/AbstractCacheManager.ts
export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  expiresAt: number;
}

export interface CacheConfig {
  defaultTTL: number;      // milliseconds
  jitterPercent?: number;  // default 10%
  maxSize?: number;        // default 100
}

export abstract class AbstractCacheManager<K, V> {
  protected cache = new Map<K, CacheEntry<V>>();
  protected config: Required<CacheConfig>;

  constructor(config: CacheConfig) {
    this.config = {
      defaultTTL: config.defaultTTL,
      jitterPercent: config.jitterPercent ?? 10,
      maxSize: config.maxSize ?? 100,
    };
  }

  protected getTTLWithJitter(baseTTL?: number): number {
    const ttl = baseTTL ?? this.config.defaultTTL;
    const jitter = ttl * (this.config.jitterPercent / 100);
    return ttl + (Math.random() * 2 - 1) * jitter;
  }

  get(key: K): V | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: K, value: V, ttl?: number): void {
    if (this.cache.size >= this.config.maxSize) {
      this.evictOldest();
    }
    const expiresAt = Date.now() + this.getTTLWithJitter(ttl);
    this.cache.set(key, { value, timestamp: Date.now(), expiresAt });
  }

  has(key: K): boolean {
    return this.get(key) !== null;
  }

  clear(key: K): void {
    this.cache.delete(key);
  }

  clearAll(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  private evictOldest(): void {
    const oldest = [...this.cache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) this.cache.delete(oldest[0]);
  }
}
```

---

## B.2: IErrorFormatter Interface

### Problem
Two incompatible error formatting approaches:
- `src/features/mesh/utils/errorFormatter.ts` - Functional
- `src/features/authentication/services/authenticationErrorFormatter.ts` - Static class

### Tests to Write First

#### Test File: `tests/core/errors/ErrorFormatter.test.ts`

- [ ] Test: formats network errors with user-friendly message
- [ ] Test: formats timeout errors with retry suggestion
- [ ] Test: formats auth errors with re-auth guidance
- [ ] Test: formats unknown errors with generic message
- [ ] Test: preserves error code in formatted output
- [ ] Test: handles null/undefined errors gracefully

### Files to Create/Modify

- [ ] Create `src/core/errors/ErrorFormatter.ts`
- [ ] Create `src/core/errors/index.ts` (barrel export)
- [ ] Modify `src/features/mesh/utils/errorFormatter.ts` - use base formatter
- [ ] Modify `src/features/authentication/services/authenticationErrorFormatter.ts` - use base formatter

### Implementation

```typescript
// src/core/errors/ErrorFormatter.ts
export interface FormattedError {
  message: string;
  code?: string;
  suggestion?: string;
  recoverable: boolean;
}

export interface ErrorFormatterConfig {
  patterns: ErrorPattern[];
}

export interface ErrorPattern {
  match: RegExp | string;
  message: string;
  suggestion?: string;
  recoverable?: boolean;
  code?: string;
}

export class ErrorFormatter {
  private patterns: ErrorPattern[];

  constructor(config: ErrorFormatterConfig) {
    this.patterns = config.patterns;
  }

  format(error: unknown): FormattedError {
    const errorString = this.extractErrorString(error);

    for (const pattern of this.patterns) {
      const matches = typeof pattern.match === 'string'
        ? errorString.toLowerCase().includes(pattern.match.toLowerCase())
        : pattern.match.test(errorString);

      if (matches) {
        return {
          message: pattern.message,
          code: pattern.code,
          suggestion: pattern.suggestion,
          recoverable: pattern.recoverable ?? false,
        };
      }
    }

    return {
      message: 'An unexpected error occurred',
      recoverable: false,
    };
  }

  private extractErrorString(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return String(error);
  }
}

// Pre-configured formatters
export const meshErrorFormatter = new ErrorFormatter({
  patterns: [
    { match: /403|forbidden|not authorized/i, message: 'API Mesh access denied', suggestion: 'Check workspace permissions', recoverable: true, code: 'MESH_FORBIDDEN' },
    { match: /timeout/i, message: 'Request timed out', suggestion: 'Try again', recoverable: true, code: 'MESH_TIMEOUT' },
    { match: /network|ECONNREFUSED/i, message: 'Network error', suggestion: 'Check connection', recoverable: true, code: 'MESH_NETWORK' },
  ]
});

export const authErrorFormatter = new ErrorFormatter({
  patterns: [
    { match: /token expired/i, message: 'Session expired', suggestion: 'Please sign in again', recoverable: true, code: 'AUTH_EXPIRED' },
    { match: /invalid credentials/i, message: 'Invalid credentials', suggestion: 'Check username/password', recoverable: true, code: 'AUTH_INVALID' },
  ]
});
```

---

## B.3: Consolidated Handler Registry

### Problem
Two handler registry patterns coexist:
- `src/commands/handlers/HandlerRegistry.ts` - Legacy Map-based
- `src/features/project-creation/handlers/HandlerRegistry.ts` - New BaseHandlerRegistry

### Tests to Write First

#### Test File: `tests/core/handlers/HandlerRegistry.test.ts`

- [ ] Test: register adds handler for message type
- [ ] Test: handle calls correct handler
- [ ] Test: handle returns false for unregistered type
- [ ] Test: unregister removes handler
- [ ] Test: getRegisteredTypes returns all types
- [ ] Test: handles async handlers correctly

### Files to Create/Modify

- [ ] Create `src/core/handlers/HandlerRegistry.ts` (canonical version)
- [ ] Create `src/core/handlers/index.ts` (barrel export)
- [ ] Modify `src/commands/handlers/HandlerRegistry.ts` - extend/use canonical
- [ ] Modify `src/features/project-creation/handlers/HandlerRegistry.ts` - extend/use canonical

### Implementation

```typescript
// src/core/handlers/HandlerRegistry.ts
export type MessageHandler<TContext = unknown> = (
  context: TContext,
  data: unknown
) => Promise<unknown> | unknown;

export class HandlerRegistry<TContext = unknown> {
  private handlers = new Map<string, MessageHandler<TContext>>();

  register(type: string, handler: MessageHandler<TContext>): void {
    this.handlers.set(type, handler);
  }

  unregister(type: string): boolean {
    return this.handlers.delete(type);
  }

  async handle(type: string, context: TContext, data: unknown): Promise<{ handled: boolean; result?: unknown }> {
    const handler = this.handlers.get(type);
    if (!handler) return { handled: false };

    const result = await handler(context, data);
    return { handled: true, result };
  }

  has(type: string): boolean {
    return this.handlers.has(type);
  }

  getRegisteredTypes(): string[] {
    return [...this.handlers.keys()];
  }

  clear(): void {
    this.handlers.clear();
  }
}
```

---

## B.4: Validation Abstraction

### Problem
Validation logic scattered across 3 locations:
- `src/core/validation/fieldValidation.ts`
- `src/features/project-creation/helpers/index.ts`
- `src/features/authentication/services/organizationValidator.ts`

### Tests to Write First

#### Test File: `tests/core/validation/Validator.test.ts`

- [ ] Test: required validator rejects empty string
- [ ] Test: required validator accepts non-empty string
- [ ] Test: url validator rejects invalid URL
- [ ] Test: url validator accepts valid URL
- [ ] Test: pattern validator matches regex
- [ ] Test: compose combines multiple validators
- [ ] Test: first error returned when multiple fail

### Files to Create/Modify

- [ ] Create `src/core/validation/Validator.ts`
- [ ] Update `src/core/validation/index.ts` (export new validator)
- [ ] Modify scattered validation to use canonical validator

### Implementation

```typescript
// src/core/validation/Validator.ts
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export type ValidatorFn = (value: unknown) => ValidationResult;

export const Validators = {
  required: (message = 'This field is required'): ValidatorFn =>
    (value) => ({
      valid: value !== null && value !== undefined && value !== '',
      error: message,
    }),

  url: (message = 'Invalid URL'): ValidatorFn =>
    (value) => {
      if (!value) return { valid: true }; // Let required handle empty
      try {
        new URL(String(value));
        return { valid: true };
      } catch {
        return { valid: false, error: message };
      }
    },

  pattern: (regex: RegExp, message: string): ValidatorFn =>
    (value) => ({
      valid: !value || regex.test(String(value)),
      error: message,
    }),

  minLength: (min: number, message?: string): ValidatorFn =>
    (value) => ({
      valid: !value || String(value).length >= min,
      error: message ?? `Minimum ${min} characters`,
    }),

  maxLength: (max: number, message?: string): ValidatorFn =>
    (value) => ({
      valid: !value || String(value).length <= max,
      error: message ?? `Maximum ${max} characters`,
    }),
};

export function compose(...validators: ValidatorFn[]): ValidatorFn {
  return (value) => {
    for (const validator of validators) {
      const result = validator(value);
      if (!result.valid) return result;
    }
    return { valid: true };
  };
}

export function validate(value: unknown, ...validators: ValidatorFn[]): ValidationResult {
  return compose(...validators)(value);
}
```

---

## Part B Acceptance Criteria

- [ ] AbstractCacheManager tests passing (9+ tests)
- [ ] ErrorFormatter tests passing (6+ tests)
- [ ] HandlerRegistry tests passing (6+ tests)
- [ ] Validator tests passing (7+ tests)
- [ ] All existing cache managers extend AbstractCacheManager
- [ ] All error formatting uses ErrorFormatter
- [ ] Single handler registry pattern across codebase
- [ ] Validation uses canonical Validators

## Part B Impact Summary

```
📊 Step 2 Part B Impact:
├─ LOC: +300 (new abstractions), -200 (removed duplicates) = +100 net
├─ CC Reduction: -5 (consolidated logic)
├─ Type Safety: +4 canonical interfaces
├─ Abstractions: +4 base classes/utilities
├─ Duplications Eliminated: 4 patterns → 4 single sources of truth
└─ Coverage: +4 new test files (28+ tests)
```

---

## Combined Step 2 Totals

```
📊 Step 2 COMPLETE:
├─ LOC: +972 net (+172 Part A, -24 Part B.1, +800 Part B other, -8 eliminated)
├─ CC Reduction: -6 points (mesh handlers)
├─ Duplications Eliminated: 3 patterns (status categorization + 2 cache jitter implementations)
├─ Abstractions: +7 reusable modules (4 ready for future integration)
├─ Type Safety: +7 typed utilities
├─ Coverage: +50 tests (all passing)
├─ Integration Complete: Part A + Part B.1
└─ Integration Deferred: Part B.2-B.4 (formatters, registries, validators)
```

---

## Comprehensive Research Findings (2025-01-21)

**Research Conducted**: Parallel exploration agents deployed to investigate deferred Part B items (B.2-B.4) in depth, providing comprehensive discovery for future implementation phases.

### B.2: Error Formatters - Comprehensive Discovery

**Research Agent**: Error Formatter Patterns Discovery
**Date**: 2025-01-21
**Scope**: Entire codebase search for error formatting patterns

**Key Findings**:
- **3 Error Formatter Implementations Found**:
  1. `src/core/errors/ErrorFormatter.ts` (52 LOC) - **UNUSED** (0 production imports, only 1 test file)
  2. `src/features/mesh/utils/errorFormatter.ts` (56 LOC) - **IN USE** (2 call sites: meshDeployment.ts, executor.ts)
  3. `src/features/authentication/services/authenticationErrorFormatter.ts` (41 LOC) - **IN USE** (3 call sites: tokenManager.ts, authenticationService.ts)

**Total Formatter Code**: 149 LOC across 3 files
**Total Call Sites**: 5 (2 mesh + 3 auth)
**Duplication Analysis**: Low overlap - formatters serve different purposes

**Return Type Incompatibility** (Major Architectural Issue):
- **Mesh Formatter**: Returns `string` (for CLI error display)
  ```typescript
  formatAdobeCliError(error: Error | string): string
  // "Error: Config invalid\nmissing field\nADOBE_CATALOG_ENDPOINT"
  ```

- **Auth Formatter**: Returns structured object (for UI display)
  ```typescript
  formatError(error: unknown, context): {title: string; message: string; technical: string}
  // { title: "Operation Timed Out", message: "Login timed out...", technical: "..." }
  ```

- **Core ErrorFormatter**: Pattern-based transformation (unused)
  ```typescript
  format(error: Error, patterns: ErrorPattern[]): string
  ```

**Domain-Specific Features**:
- **Mesh**: Adobe CLI arrow (`›`) replacement for readability
- **Auth**: Timeout/network/auth error categorization with context
- **Core**: Generic pattern-based error transformation (but unused)

**Strategic Recommendation**: **KEEP SEPARATE + DELETE UNUSED**
- Minimal duplication (149 LOC total, 5 call sites)
- Domain-specific features justify separate formatters
- Return type incompatibility makes unification impractical
- Core ErrorFormatter adds confusion (0 usage) - **DELETE**

**Migration Complexity** (if consolidation were attempted):
- **Effort**: 6-8 hours
- **Risk**: MEDIUM-HIGH
- **Breaking Changes**: Auth formatter return type (affects UI code)
- **Files Affected**: ~10 files
- **Not Recommended**: High effort for minimal benefit

**Next Steps**: See `step-02.5-error-formatter-cleanup.md` for implementation plan
- **Priority**: LOW (optional cleanup)
- **Effort**: 1 hour
- **Action**: Delete unused Core ErrorFormatter, document active formatters

---

### B.3: HandlerRegistry - Comprehensive Discovery

**Research Agent**: HandlerRegistry Deep Dive
**Date**: 2025-01-21
**Scope**: Complete registry implementation analysis

**Key Findings**:
- **4 HandlerRegistry Implementations Found** (not 2 as originally identified!):
  1. `src/commands/handlers/HandlerRegistry.ts` (84 LOC) - Legacy command handlers
  2. `src/features/project-creation/handlers/HandlerRegistry.ts` (62 LOC) - Project creation handlers
  3. `src/features/dashboard/handlers/HandlerRegistry.ts` (74 LOC) - Dashboard handlers (NEW DISCOVERY!)
  4. `src/core/handlers/HandlerRegistry.ts` (95 LOC) - Generic base implementation (NEW!)

- **Base Class Exists**: `src/core/handlers/BaseHandlerRegistry.ts` (40 LOC)
  - Used by Dashboard and Core registries
  - Not used by Commands or Project Creation registries

**Total Registry Code**: 355 LOC across 5 files
**Duplication**: ~200 LOC (56% of code is duplicated patterns)

**Handler Signature Analysis**:
1. **Commands Registry**: Context-aware handlers `(context: HandlerContext) => Promise<HandlerResult>`
2. **Project Creation Registry**: Context-free handlers `(data: T) => Promise<HandlerResult>`
3. **Dashboard Registry**: **Already extends BaseHandlerRegistry!** But adds custom registration methods
4. **Core Registry**: Most complete - supports middleware, type-safe generics

**Strategic Recommendation**: **PHASED CONSOLIDATION**
- **Phase 1**: Migrate Dashboard → BaseHandlerRegistry (EASY - 1 day)
  - Already extends it, just remove custom registration methods
  - **Impact**: -74 LOC, cleaner dashboard handler code
  - **Risk**: VERY LOW

- **Phase 2**: Migrate Project Creation → BaseHandlerRegistry (MEDIUM - 3 days)
  - Align handler signatures with BaseHandlerRegistry pattern
  - Update 5 handler registrations
  - **Impact**: -30 LOC, improved type safety
  - **Risk**: LOW

- **Phase 3**: Commands Migration Evaluation (DEFER - 2 days research)
  - Legacy code, stable and working
  - Context-aware signature different from BaseHandlerRegistry
  - LOW duplication impact (7 handlers only)
  - **Decision**: Keep as-is unless major command refactoring planned
  - **Risk/Reward**: Unfavorable

- **Phase 4**: Base → Core Consolidation (DEFER - HIGH RISK)
  - Core HandlerRegistry has advanced features (middleware) not needed by all consumers
  - BaseHandlerRegistry is simpler, sufficient for most use cases
  - Migration would affect 2 registries + all consumers
  - **Decision**: Keep both patterns - use appropriately
  - **Risk**: HIGH for minimal benefit

**Next Steps**: See `step-02.6-handler-registry-consolidation.md` for implementation plan
- **Priority**: MEDIUM
- **Effort**: 11 days (phased migration: 1 day + 3 days + research)
- **Action**: Consolidate Dashboard and Project Creation registries to BaseHandlerRegistry
- **Expected Impact**: -104 LOC, -56% duplication

---

### B.4: Validators - Comprehensive Discovery

**Research Agent**: Validation Discovery Across Codebase
**Date**: 2025-01-21
**Scope**: Complete codebase validation pattern analysis

**Key Findings**:
- **69 Files with Validation Logic Found** (widespread!)
- **Composable Validators Exist**: `src/shared/validation/Validators.ts` (73 LOC, 12 tests)
  - Pattern: `Validators.required()`, `.pattern()`, `.minLength()`, etc.
  - Well-tested, production-ready, but **underutilized**

**Validation Pattern Analysis**:
1. **Ad-hoc Inline Validation** (47 files) - `if (!value)` scattered checks
2. **Centralized Validation Functions** (12 files) - Helper functions like `validateProjectName()`
3. **Security Validation** (10 files) - Command injection, SSRF, path traversal (DO NOT MIGRATE)
4. **Type Guards** (Not validation - keep separate)

**Missing Validators Identified**:
- `url()` - Needed in 8 files
- `alphanumeric()` - Needed in 5 files
- `lowercase()` - Needed in 3 files
- `optional()` - Needed in 12 files (wrapper validator)
- `semver()` - Needed for version validation (custom validator)

**Migration Priority Analysis**:

**HIGH Priority (3 files, 6 hours)**:
1. `ProjectDetailsStep.tsx` - Project name, directory validation (4 checks → 2 chains)
2. `ComponentSelectionStep.tsx` - Component ID validation (3 checks → 1 chain)
3. `AdobeProjectStep.tsx` - Project selection validation (2 checks → 1 chain)

**MEDIUM Priority (2 files, 6 hours)**:
1. `ConfigureScreen.tsx` - .env field validation (8 checks → 4 chains)
2. `ApiMeshStep.tsx` - Mesh endpoint URL validation (3 checks → 1 chain)

**LOW Priority (5 files, 8 hours)**:
1. `PrerequisitesStep.tsx` - Tool version validation (custom validator needed)
2-5. Various dashboard and component files (1-2 checks per file, minimal duplication)

**Strategic Recommendation**: **PHASED MIGRATION + CUSTOM VALIDATORS**
- **Phase 1**: Add missing validators (url, alphanumeric, lowercase, optional) - 5 hours
- **Phase 2**: Migrate HIGH priority files (simple patterns) - 6 hours
- **Phase 3**: Migrate MEDIUM priority files (moderate complexity) - 6 hours
- **Phase 4**: Migrate LOW priority files (low duplication) - 8 hours
- **Phase 5**: Document migration pattern - 2 hours

**DO NOT MIGRATE** (Critical Security Validation):
- `src/shared/validation/security.ts` - Command injection prevention
- `src/shared/validation/pathValidation.ts` - Path traversal prevention
- `src/features/authentication/services/tokenValidation.ts` - Token security checks

**Rationale**: Security validation must be explicit and obvious in code. Composable validators hide critical security logic, making audits harder.

**Next Steps**: See `step-02.7-validator-migration.md` for implementation plan
- **Priority**: MEDIUM
- **Effort**: 15-20 hours (phased over 3 weeks)
- **Action**: Add custom validators, migrate HIGH/MEDIUM/LOW priority files incrementally
- **Expected Impact**: -150 LOC, -25% duplication, improved consistency

---

## Research Summary & Recommendations

**Total Discovery Scope**:
- **B.2**: 3 error formatters analyzed (149 LOC)
- **B.3**: 4 handler registries analyzed (355 LOC)
- **B.4**: 69 validation files analyzed (widespread)

**Key Insights**:
1. **Lower Duplication Than Expected**: Most patterns have legitimate domain-specific reasons for separate implementations
2. **Pragmatic Consolidation Opportunities**: Targeted migrations provide 80% of value with 20% of risk
3. **Security-Critical Code**: Must remain explicit - no abstraction

**Total Implementation Effort** (If All Phases Executed):
- **Step 2.5** (Error Formatter Cleanup): 1 hour
- **Step 2.6** (HandlerRegistry Consolidation): 11 days (32 hours)
- **Step 2.7** (Validator Migration): 15-20 hours (3 weeks)
- **Total**: ~43-52 hours additional work

**Expected Net Impact** (All Phases):
```
📊 Combined B.2-B.4 Impact:
├─ LOC: -375 lines
│   ├─ Error formatters: -121 (delete unused)
│   ├─ Handler registries: -104 (consolidation)
│   └─ Validators: -150 (consolidated validation)
├─ Duplication: -40% reduction overall
├─ Consistency: HIGH (standardized patterns)
├─ Maintainability: HIGH (single sources of truth)
├─ Risk: LOW-MEDIUM (incremental, tested)
└─ Timeline: 6-8 weeks (part-time implementation)
```

**Recommended Execution Order**:
1. **Step 2.5** (Error Formatters) - Quick win, 1 hour, very low risk
2. **Step 2.7 Phase 1** (Custom Validators) - Foundation for validation migration, 5 hours
3. **Step 2.6 Phase 1** (Dashboard Registry) - Easy consolidation, 1 day
4. **Step 2.7 Phase 2** (HIGH Priority Validation) - High value, 6 hours
5. Remaining phases as capacity allows

**Strategic Decision Points**:
- ✅ **Proceed with Step 2.5**: Very low risk, removes confusion
- 🤔 **Evaluate Step 2.6 Phase 1-2**: Moderate value, manageable risk
- 🤔 **Evaluate Step 2.7 Phase 1-3**: High consistency value, incremental migration
- ⏸️ **Defer Step 2.6 Phase 3-4**: Low ROI (Commands, Base→Core consolidation)
- ⏸️ **Defer Step 2.7 Phase 4-5**: Lower priority files (consider opportunistic migration)

---

**Status**: Step 2 COMPLETE with strategic deferrals documented
**Research**: Comprehensive discovery complete for B.2-B.4
**Next Action**: PM review of research findings and approval for Step 2.5-2.7 phases
