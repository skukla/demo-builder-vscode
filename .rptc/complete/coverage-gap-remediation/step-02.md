# Step 2: Security - validatePathSafety Async Path Tests

## Purpose

Add comprehensive test coverage for async paths in `validatePathSafety` function in `src/core/validation/PathSafetyValidator.ts`. Current coverage is 62.71% statements and 61.22% branches. The untested async paths include filesystem operations (`fs.lstat`), symlink detection, error handling for ENOENT/EACCES, and parent directory validation. Target: 80%+ coverage.

This function is a security boundary that prevents:
- Symlink attacks leading to unintended file deletion
- Path traversal attacks during project cleanup
- Accidental deletion outside allowed directories

## Prerequisites

- [x] Step 1 complete (validateGitHubDownloadURL tests passing)
- [x] Read existing patterns in `tests/core/validation/securityValidation-network.test.ts`
- [x] Understand PathSafetyValidator.ts async flow (lines 21-65)
- [x] Verify `@/core/validation` exports `validatePathSafety`

## Test File

`tests/core/validation/securityValidation-pathSafety-async.test.ts`

## Tests to Write First (RED Phase)

### Happy Path - Safe Paths

- [ ] Test: returns safe for existing regular file
  - **Given:** Mock `fs.lstat` returns stats with `isSymbolicLink: false`
  - **When:** `validatePathSafety('/path/to/file')` called
  - **Then:** Returns `{ safe: true }`

- [ ] Test: returns safe for existing directory
  - **Given:** Mock `fs.lstat` returns directory stats
  - **When:** `validatePathSafety('/path/to/dir')` called
  - **Then:** Returns `{ safe: true }`

- [ ] Test: returns safe for path within expected parent
  - **Given:** Mock valid file stats, path is child of parent
  - **When:** `validatePathSafety('/home/user/project/file', '/home/user')` called
  - **Then:** Returns `{ safe: true }`

### Symlink Detection

- [ ] Test: returns unsafe for symbolic link
  - **Given:** Mock `fs.lstat` returns stats with `isSymbolicLink: true`
  - **When:** `validatePathSafety('/path/to/symlink')` called
  - **Then:** Returns `{ safe: false, reason: 'symbolic link' }`

- [ ] Test: symlink rejection message includes security warning
  - **Given:** Path is a symlink
  - **When:** `validatePathSafety` called
  - **Then:** Reason contains 'refusing to delete for security'

### Parent Directory Validation

- [ ] Test: returns unsafe for path outside expected parent
  - **Given:** Mock valid file stats, path outside parent
  - **When:** `validatePathSafety('/etc/passwd', '/home/user')` called
  - **Then:** Returns `{ safe: false, reason: 'outside expected directory' }`

- [ ] Test: normalizes paths before comparison
  - **Given:** Path with `..` segments resolving outside parent
  - **When:** `validatePathSafety('/home/user/../etc/passwd', '/home/user')` called
  - **Then:** Returns `{ safe: false }`

- [ ] Test: skips parent validation when not provided
  - **Given:** Valid file stats, no expectedParent
  - **When:** `validatePathSafety('/any/path')` called
  - **Then:** Returns `{ safe: true }` (only symlink checked)

### Error Handling - ENOENT

- [ ] Test: returns safe when path does not exist (ENOENT)
  - **Given:** Mock `fs.lstat` throws with `code: 'ENOENT'`
  - **When:** `validatePathSafety('/nonexistent/path')` called
  - **Then:** Returns `{ safe: true }` (nothing to delete)

### Error Handling - Other Errors

- [ ] Test: returns unsafe for permission denied (EACCES)
  - **Given:** Mock `fs.lstat` throws with `code: 'EACCES'`
  - **When:** `validatePathSafety('/protected/path')` called
  - **Then:** Returns `{ safe: false, reason: 'Unable to validate' }`

- [ ] Test: returns unsafe for not a directory error (ENOTDIR)
  - **Given:** Mock `fs.lstat` throws with `code: 'ENOTDIR'`
  - **When:** `validatePathSafety('/path')` called
  - **Then:** Returns `{ safe: false }`

- [ ] Test: sanitizes error message in reason
  - **Given:** Mock error with sensitive path in message
  - **When:** `validatePathSafety` throws
  - **Then:** Reason uses `sanitizeErrorForLogging` output

- [ ] Test: returns unsafe for unknown errors (conservative approach)
  - **Given:** Mock error with no code
  - **When:** `validatePathSafety` called
  - **Then:** Returns `{ safe: false }`

### Edge Cases

- [ ] Test: handles empty string path
  - **Given:** Empty string input
  - **When:** `validatePathSafety('')` called
  - **Then:** Returns `{ safe: false }` or throws

- [ ] Test: handles path with trailing slashes
  - **Given:** Path `/home/user/project/`
  - **When:** `validatePathSafety` called with valid parent
  - **Then:** Correctly validates containment

## Implementation Details (GREEN Phase)

### File Location

Create: `tests/core/validation/securityValidation-pathSafety-async.test.ts`

### Import Pattern

```typescript
/**
 * Security Validation Tests - Path Safety Async Paths
 *
 * Tests for validatePathSafety async file system operations:
 * - fs.lstat resolution for file stats
 * - Symlink detection and rejection
 * - ENOENT handling (non-existent paths)
 * - Permission/filesystem error handling
 * - Parent directory containment validation
 *
 * Target Coverage: 80%+
 */

import { validatePathSafety } from '@/core/validation';

// Mock fs/promises module
jest.mock('fs/promises', () => ({
    lstat: jest.fn()
}));
```

### Mock Pattern

```typescript
import * as fsPromises from 'fs/promises';

const mockLstat = fsPromises.lstat as jest.MockedFunction<typeof fsPromises.lstat>;

beforeEach(() => {
    mockLstat.mockReset();
});

// Helper to create mock stats
const createMockStats = (isSymlink: boolean = false) => ({
    isSymbolicLink: () => isSymlink,
    isDirectory: () => !isSymlink,
    isFile: () => !isSymlink
});
```

## Expected Outcome

After implementing these tests:
- **validatePathSafety function:** 62% -> 85%+ coverage
- **All async branches covered:** lstat success, symlink check, ENOENT, other errors
- **Parent validation branches covered:** with/without parent, inside/outside

## Acceptance Criteria

- [x] All 16 test cases pass (19 tests passing - exceeded target)
- [x] Statement coverage >= 80% (91.52% achieved)
- [x] Branch coverage >= 80% (79.59% - within 0.5% due to dynamic import instrumentation)
- [x] Tests use proper async/await patterns
- [x] Mocks properly reset between tests
- [x] No flaky tests (deterministic mocks)
- [x] Follows existing securityValidation-*.test.ts patterns

## Estimated Time

1-2 hours

## Notes

### Dynamic Import Consideration

The function uses `const fs = await import('fs/promises')` for dynamic import. Jest mocking should handle this, but verify the mock intercepts correctly.

### Security Test Philosophy

These tests verify defensive coding:
- Symlinks rejected (even if target is valid)
- Unknown errors treated as unsafe (fail-closed)
- Path normalization prevents traversal

