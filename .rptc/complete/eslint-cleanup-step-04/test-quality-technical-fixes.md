# TEST QUALITY FIXES - TECHNICAL IMPLEMENTATION GUIDE

## Issue 1: React 19 State Batching - useVSCodeRequest Tests

### Problem
Four describe blocks and one individual test are skipped due to React 19 state batching behavior in test environments. This affects error handling, state reset, typed responses, and callback stability testing.

### Root Cause
React 19 doesn't commit state updates before errors propagate in test environments:
```typescript
// In production: setError, setLoading updates are committed
// In test: updates may not be committed before error throws
setError(error);  // Not committed yet
throw error;      // Error thrown immediately
```

### Solution Options

#### Option A: Use waitFor() with Different Assertion Timing
```typescript
it('should handle error and update state', async () => {
  const mockError = new Error('Request failed');
  requestSpy.mockRejectedValue(mockError);
  
  const { result } = renderHook(() => useVSCodeRequest('test-request'));
  
  // Execute and catch the error
  let caughtError: Error | null = null;
  await act(async () => {
    try {
      await result.current.execute();
    } catch (e) {
      caughtError = e;
    }
  });
  
  // Assert error was caught
  expect(caughtError).toEqual(mockError);
  
  // Wait for state to settle with longer timeout
  await waitFor(() => {
    expect(result.current.error).toEqual(mockError);
    expect(result.current.loading).toBe(false);
  }, { timeout: 1000 });
});
```

#### Option B: Use flushSync (if available)
```typescript
import { flushSync } from 'react';

it('should handle error and update state', async () => {
  const mockError = new Error('Request failed');
  requestSpy.mockRejectedValue(mockError);
  
  const { result } = renderHook(() => useVSCodeRequest('test-request'));
  
  try {
    await act(async () => {
      await result.current.execute();
    });
  } catch (e) {
    // Error caught - now check state
    flushSync(() => {});
  }
  
  expect(result.current.error).toEqual(mockError);
  expect(result.current.loading).toBe(false);
});
```

#### Option C: Upgrade React Testing Library
```typescript
// Use latest @testing-library/react with better async handling
// npm update @testing-library/react

// Also update jest setup to use React 19 compatible async handling
```

### Recommended Fix
Use Option A (waitFor with error catching) as it:
1. Doesn't require React internals (flushSync)
2. Works with current React Testing Library
3. Matches production behavior (state eventually updates)
4. Is well-documented pattern

### Implementation Steps
1. Un-skip describe.skip('failed request') at line 137
2. Un-skip it.skip('resets error state') at line 296
3. Un-skip describe.skip('typed responses') at line 355
4. Un-skip describe.skip('callback stability') at line 380
5. Update assertions to use waitFor() with proper timing
6. Test locally with `npm test useVSCodeRequest`

### Estimated Effort: 4-6 hours

---

## Issue 2: Reduce Mocking in Service Tests

### Problem
authenticationService.test.ts mocks 7 dependencies at module level, testing mocks instead of behavior.

### Current (Bad) Pattern
```typescript
jest.mock('@/core/logging');
jest.mock('@/features/authentication/services/authCacheManager');
jest.mock('@/features/authentication/services/tokenManager');
// ... 4 more mocks

describe('AuthenticationService', () => {
  it('checks auth', async () => {
    // Service uses mocks, not real dependencies
    // Test passes even if real dependencies would fail
    expect(mockTokenManager.isTokenValid).toHaveBeenCalled();
    // No assertion on what isTokenValid actually returns
  });
});
```

### Recommended Pattern
```typescript
// Mock ONLY external systems (file I/O, network, CLI)
jest.mock('@/core/shell/commandExecutor');

// Import real implementations of internal services
import { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import { TokenManager } from '@/features/authentication/services/tokenManager';

describe('AuthenticationService', () => {
  let authService: AuthenticationService;
  let cacheManager: AuthCacheManager;
  let tokenManager: TokenManager;
  
  beforeEach(() => {
    // Create real instances
    cacheManager = new AuthCacheManager();
    tokenManager = new TokenManager(mockCommandExecutor);
    
    // Inject real dependencies
    authService = new AuthenticationService(
      cacheManager,
      tokenManager,
      mockCommandExecutor
    );
  });
  
  it('should return false when token is invalid', async () => {
    mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
      stdout: 'Invalid token',
      code: 401
    });
    
    const result = await authService.isAuthenticatedQuick();
    
    // Assert actual behavior, not mock calls
    expect(result).toBe(false);
    expect(cacheManager.getCachedAuthStatus()).toEqual({
      isAuthenticated: false,
      isExpired: true
    });
  });
});
```

### Benefits
1. Tests actual integration between services
2. Catches refactoring bugs automatically
3. Real behavior is verified
4. Fewer mock setup lines (less code to maintain)
5. Faster test development (fewer mocks to configure)

### Implementation Strategy
1. Identify internal vs external dependencies
   - External: FileSystem, OS, Network, CLI
   - Internal: Services, managers, utilities
2. Keep mocks only for external systems
3. Use real implementations for internal services
4. Run tests - they'll fail initially, then fix implementation or tests
5. Document the pattern in TESTING.md

### File-by-File Priority
1. authenticationService.test.ts (40 tests, 87 mock assertions) - HIGHEST
2. adobeEntityService.test.ts (60 tests, 66 mock assertions)
3. authenticationHandlers.test.ts (72 tests, 65 mock assertions)
4. meshDeployer.test.ts (48 tests, 26 mock assertions)
5. prerequisitesManager.test.ts (TBD - check if exists)

### Estimated Effort: 3-4 days per file (reduce mocking)

---

## Issue 3: Split Large Test Files

### Problem
authenticationHandlers.test.ts is 1,384 lines with 72 tests. Difficult to:
- Navigate and find specific tests
- Understand test intent without reading full file
- Modify tests without affecting unrelated tests
- Debug test failures (too much context)

### Target Structure
```
Before:
tests/features/authentication/handlers/authenticationHandlers.test.ts (1,384 lines, 72 tests)

After:
tests/features/authentication/handlers/
├── handleCheckAuth.test.ts (200 lines, 18 tests)
├── handleAuthenticate.test.ts (400 lines, 44 tests)
│   ├── happyPath.test.ts (150 lines, 10 tests)
│   ├── deferredValidation.test.ts (120 lines, 8 tests)
│   ├── errorHandling.test.ts (100 lines, 5 tests)
│   └── edgeCases.test.ts (150 lines, 21 tests)
└── shared/
    └── setupMocks.ts (100 lines of reusable mock factories)
```

### Refactoring Steps

1. **Identify natural test groupings** from current describe blocks
   ```typescript
   describe('handleCheckAuth') - 18 tests → separate file
   describe('handleAuthenticate') - 44 tests → split further
     - happy path (10 tests)
     - deferred validation (8 tests)
     - error handling (5 tests)
     - edge cases (21 tests)
   ```

2. **Extract shared mocks into utilities**
   ```typescript
   // tests/features/authentication/handlers/shared/setupMocks.ts
   export function createMockHandlerContext(
     overrides?: Partial<HandlerContext>
   ): jest.Mocked<HandlerContext> {
     return { ... };
   }
   ```

3. **Create individual test files**
   ```typescript
   // tests/features/authentication/handlers/handleCheckAuth.test.ts
   import { createMockHandlerContext } from './shared/setupMocks';
   
   describe('handleCheckAuth', () => {
     let mockContext: jest.Mocked<HandlerContext>;
     
     beforeEach(() => {
       mockContext = createMockHandlerContext();
     });
     
     it('should check auth...', async () => { ... });
   });
   ```

4. **Split handleAuthenticate into 4 files**
   - Keep happy path together (10 tests, one behavior area)
   - Group deferred validation tests (8 tests, specific feature)
   - Group error scenarios (5 tests, error paths)
   - Group edge cases (21 tests, various edge conditions)

### Benefits
- Each file <300 lines
- Clear test purpose visible in filename
- Easy to find and fix failing tests
- Easier to understand test intent
- Can run specific test group easily

### Tools to Help
```bash
# Extract test blocks into new files
# Use editor's "extract to file" feature
# Or use awk/sed to split test blocks

# Example: Extract describe block to new file
sed -n '/^  describe.*handleCheckAuth/,/^  });/p' authenticationHandlers.test.ts > handleCheckAuth.test.ts
```

### Estimated Effort: 2-3 days for authenticationHandlers.test.ts

---

## Issue 4: Type Safety - Eliminate "as any"

### Problem
320 instances of `as any` bypass TypeScript type checking.

### Pattern: Current (Bad)
```typescript
const mockCommandExecutor = {
    execute: jest.fn(),
} as unknown as CommandExecutor;  // MISSING properties not caught

interface TestContext {
    data: any;  // No type safety
}
```

### Pattern: Recommended
```typescript
// Create properly typed mock factory
function createMockCommandExecutor(
  overrides?: Partial<CommandExecutor>
): jest.Mocked<CommandExecutor> {
  return {
    executeAdobeCLI: jest.fn(),
    execute: jest.fn(),
    executeCommand: jest.fn(),
    executeWithNodeVersion: jest.fn(),
    testCommand: jest.fn(),
    getNodeVersionForComponent: jest.fn(),
    getCachedBinaryPath: jest.fn(),
    invalidateBinaryPathCache: jest.fn(),
    getCachedNodeVersion: jest.fn(),
    invalidateNodeVersionCache: jest.fn(),
    // All required properties present!
    ...overrides,
  };
}

// Usage - fully typed!
const mockExecutor = createMockCommandExecutor({
  execute: jest.fn().mockResolvedValue({ ... })
});
// TypeScript will error if properties don't match
```

### Implementation Strategy

1. **Create mock factory file**
   ```typescript
   // tests/helpers/mocks/commandExecutor.mock.ts
   export function createMockCommandExecutor(...): jest.Mocked<CommandExecutor> {
     return { ... };
   }
   ```

2. **Find/Replace pattern**
   ```bash
   # Find all "as any" in tests
   grep -r "as any" tests/ --include="*.ts" --include="*.tsx"
   
   # Replace with factory function
   # sed -i 's/} as unknown as CommandExecutor/createMockCommandExecutor()/g'
   ```

3. **When "as any" is necessary**
   ```typescript
   // ONLY when absolutely necessary, explain why:
   const partialMock = {
       // incomplete implementation
   } as any; // Type ignored: Testing partial mock behavior in error scenario
   ```

4. **Use Partial<T> for incomplete mocks**
   ```typescript
   // Better than "as any"
   const mockContext: Partial<HandlerContext> = {
       logger: {
           debug: jest.fn(),
       },
   };
   
   // Pass with type assertion only where needed
   functionThatNeedsContext(mockContext as HandlerContext);
   ```

### Priority Files (Most "as any" usage)
1. authenticationHandlers.test.ts
2. adobeEntityService.test.ts
3. authenticationService.test.ts
4. meshDeployer.test.ts
5. webviewCommunicationManager.test.ts

### Estimated Effort: 2-3 days (create factories and replace)

---

## Issue 5: Replace Weak Assertions (92 instances)

### Pattern: Current (Bad)
```typescript
// These pass with wrong values that happen to be truthy
expect(result.current.loading).toBeTruthy();  // Could be 1, "yes", true
expect(result.current.data).toBeDefined();     // Doesn't check value
expect(screen.getByRole('button')).toBeInTheDocument();  // Doesn't check content
```

### Pattern: Recommended
```typescript
// Specific value assertions
expect(result.current.loading).toBe(true);  // Only true passes
expect(result.current.data).toEqual({ id: '123', name: 'Test' });  // Specific value
expect(screen.getByRole('button')).toHaveTextContent('Click Me');  // Specific behavior
```

### Find/Replace Guide
```bash
# Find weak assertions
grep -r "toBeTruthy\|toBeFalsy\|toBeDefined" tests/ --include="*.ts"

# Replace patterns (be careful - review each)
# This requires manual review since context matters

# Example replacements:
# expect(x).toBeTruthy()       → expect(x).toBe(true) or expect(x).toEqual(expectedValue)
# expect(x).toBeFalsy()        → expect(x).toBe(false) or expect(x).toEqual(expectedValue)
# expect(x).toBeDefined()      → expect(x).not.toBeNull() or expect(x).toEqual(value)
```

### Implementation Strategy
1. Create list of 92 weak assertions (run: `grep -r "toBeTruthy\|toBeFalsy\|toBeDefined" tests/ | head -50`)
2. For each assertion, determine correct assertion type:
   - Boolean values: Use `toBe(true)` or `toBe(false)`
   - Object values: Use `toEqual(expectedObject)`
   - String values: Use `toBe(expectedString)`
   - Undefined check: Use `toBeUndefined()` or `toBeDefined()`
3. Update assertions one file at a time
4. Run tests to verify no breaking changes

### Tool to Find Weak Assertions
```typescript
// Create test lint rule or add to eslint config
{
  "rules": {
    "jest/no-truthy-falsy": "warn",
    "jest/expect-expect": ["warn", { "assertFunctionNames": ["expect"] }]
  }
}
```

### Estimated Effort: 2-3 days (manual review required)

---

## Issue 6: Establish Mock Factory Library

### Create: `tests/helpers/mocks/index.ts`
```typescript
// Centralized mock factories
export { createMockCommandExecutor } from './commandExecutor.mock';
export { createMockLogger } from './logger.mock';
export { createMockHandlerContext } from './handlerContext.mock';
export { createMockAuthenticationService } from './authenticationService.mock';

// Helper for creating consistent mock implementations
export function createMockAsyncFunction<T>(value: T) {
  return jest.fn().mockResolvedValue(value);
}

export function createMockRejectingFunction(error: Error) {
  return jest.fn().mockRejectedValue(error);
}
```

### Create: `tests/helpers/mocks/commandExecutor.mock.ts`
```typescript
import type { CommandExecutor, CommandResult } from '@/core/shell';

export function createMockCommandExecutor(
  overrides?: Partial<CommandExecutor>
): jest.Mocked<CommandExecutor> {
  return {
    execute: jest.fn(),
    executeAdobeCLI: jest.fn(),
    executeCommand: jest.fn(),
    executeWithNodeVersion: jest.fn(),
    testCommand: jest.fn(),
    getNodeVersionForComponent: jest.fn(),
    getCachedBinaryPath: jest.fn(),
    invalidateBinaryPathCache: jest.fn(),
    getCachedNodeVersion: jest.fn(),
    invalidateNodeVersionCache: jest.fn(),
    executeExclusive: jest.fn(),
    executeSequence: jest.fn(),
    executeParallel: jest.fn(),
    queueCommand: jest.fn(),
    commandExists: jest.fn(),
    isPortAvailable: jest.fn(),
    pollUntilCondition: jest.fn(),
    waitForFileSystem: jest.fn(),
    dispose: jest.fn(),
    ...overrides,
  };
}
```

### Benefits
- Consistent mock implementations across test suite
- Type-safe (TypeScript ensures all properties present)
- Single source of truth (change once, affects all tests)
- Faster test development (reuse factories)
- Easier to maintain (update once for interface changes)

### Estimated Effort: 1-2 days to create initial factories

---

## Summary of Technical Fixes

| Issue | Effort | Impact | Priority |
|-------|--------|--------|----------|
| React 19 Tests | 4-6 hrs | Critical (functional gap) | URGENT |
| Mock Reduction | 3-4 days | High (integration bugs) | HIGH |
| Split Files | 2-3 days | High (maintainability) | HIGH |
| Type Safety | 2-3 days | High (refactoring safety) | HIGH |
| Assertions | 2-3 days | Medium (test quality) | MEDIUM |
| Mock Factories | 1-2 days | High (maintenance) | MEDIUM |

**Total Estimated Effort: 2-3 weeks for critical/high-priority items**

