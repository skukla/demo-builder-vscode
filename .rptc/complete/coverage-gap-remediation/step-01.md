# Step 1: Security - validateGitHubDownloadURL Tests

## Purpose

Add comprehensive test coverage for the `validateGitHubDownloadURL` function in `src/core/validation/URLValidator.ts`. This security-critical function validates that URLs are legitimate GitHub download URLs before the extension downloads updates or components. Currently at 0% coverage, this function is a security boundary that prevents:
- Malicious URL injection attacks
- Download of malicious content from spoofed domains
- SSRF attacks via update mechanism

Achieving 100% coverage ensures the security validation logic is correct and remains protected against regressions.

## Prerequisites

- [x] Read existing test patterns in `tests/core/validation/securityValidation-network.test.ts`
- [x] Understand the function signature and behavior in `src/core/validation/URLValidator.ts` (lines 30-57)
- [x] Verify import path `@/core/validation` exports `validateGitHubDownloadURL`

## Test File

`tests/core/validation/securityValidation-githubUrl.test.ts`

## Tests to Write First (RED Phase)

### Valid GitHub Download URLs

- [ ] Test: accepts standard releases download URL (github.com/owner/repo/releases/download/tag/file.zip)
  - **Given:** URL `https://github.com/adobe/demo-builder/releases/download/v1.0.0/extension.vsix`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `true`
  - **File:** `tests/core/validation/securityValidation-githubUrl.test.ts`

- [ ] Test: accepts releases download URL with complex tag names
  - **Given:** URL `https://github.com/org/repo/releases/download/v2.1.0-beta.1/file.tar.gz`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `true`

- [ ] Test: accepts githubusercontent.com download URL (raw content)
  - **Given:** URL `https://raw.githubusercontent.com/owner/repo/main/file.json`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `false` (raw.githubusercontent.com doesn't match releases pattern)

- [ ] Test: accepts objects.githubusercontent.com for release assets
  - **Given:** URL `https://objects.githubusercontent.com/releases/download/v1.0.0/file.zip`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `true` if path matches releases pattern

- [ ] Test: accepts API endpoint format (/repos/owner/repo/releases/assets/id)
  - **Given:** URL `https://api.github.com/repos/adobe/demo-builder/releases/assets/12345678`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `true`

- [ ] Test: accepts URLs with query parameters
  - **Given:** URL `https://github.com/owner/repo/releases/download/v1.0.0/file.zip?token=abc123`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `true`

- [ ] Test: accepts URLs with various file extensions
  - **Given:** URLs with `.vsix`, `.zip`, `.tar.gz`, `.exe` extensions
  - **When:** `validateGitHubDownloadURL(url)` is called for each
  - **Then:** All return `true`

### Invalid URLs - Protocol Validation

- [ ] Test: rejects HTTP URLs (not HTTPS)
  - **Given:** URL `http://github.com/owner/repo/releases/download/v1.0.0/file.zip`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `false`

- [ ] Test: rejects FTP URLs
  - **Given:** URL `ftp://github.com/owner/repo/releases/download/v1.0.0/file.zip`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `false`

- [ ] Test: rejects file:// URLs
  - **Given:** URL `file:///github.com/owner/repo/releases/download/v1.0.0/file.zip`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `false`

- [ ] Test: rejects javascript: protocol
  - **Given:** URL `javascript:alert('xss')`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `false`

- [ ] Test: rejects data: protocol
  - **Given:** URL `data:text/html,<script>alert(1)</script>`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `false`

### Invalid URLs - Domain Validation

- [ ] Test: rejects non-GitHub domains
  - **Given:** URL `https://evil.com/owner/repo/releases/download/v1.0.0/malware.zip`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `false`

- [ ] Test: rejects github.io (not github.com)
  - **Given:** URL `https://owner.github.io/releases/download/v1.0.0/file.zip`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `false`

- [ ] Test: rejects subdomains that contain but don't end with github.com
  - **Given:** URL `https://github.com.evil.com/owner/repo/releases/download/v1.0.0/file.zip`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `false`

- [ ] Test: rejects lookalike domains (githubusercontent.com typo)
  - **Given:** URL `https://githubusercontents.com/owner/repo/releases/download/v1.0.0/file.zip`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `false`

- [ ] Test: rejects IP addresses even with valid path
  - **Given:** URL `https://192.168.1.1/owner/repo/releases/download/v1.0.0/file.zip`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `false`

- [ ] Test: rejects localhost with GitHub path
  - **Given:** URL `https://localhost/owner/repo/releases/download/v1.0.0/file.zip`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `false`

### Invalid URLs - Path Pattern Validation

- [ ] Test: rejects github.com without releases path
  - **Given:** URL `https://github.com/owner/repo`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `false`

- [ ] Test: rejects github.com with blob path (not download)
  - **Given:** URL `https://github.com/owner/repo/blob/main/file.txt`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `false`

- [ ] Test: rejects github.com with releases list path (not download)
  - **Given:** URL `https://github.com/owner/repo/releases`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `false`

- [ ] Test: rejects releases path without download segment
  - **Given:** URL `https://github.com/owner/repo/releases/tag/v1.0.0`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `false`

- [ ] Test: rejects path with missing owner segment
  - **Given:** URL `https://github.com/releases/download/v1.0.0/file.zip`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `false`

- [ ] Test: rejects API endpoint with wrong path structure
  - **Given:** URL `https://api.github.com/repos/owner/releases/assets/12345`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `false`

### Edge Cases

- [ ] Test: returns false for empty string
  - **Given:** Empty string `""`
  - **When:** `validateGitHubDownloadURL("")` is called
  - **Then:** Returns `false` (caught by URL constructor)

- [ ] Test: returns false for null (type coercion)
  - **Given:** `null` cast as string
  - **When:** `validateGitHubDownloadURL(null as any)` is called
  - **Then:** Returns `false`

- [ ] Test: returns false for undefined (type coercion)
  - **Given:** `undefined` cast as string
  - **When:** `validateGitHubDownloadURL(undefined as any)` is called
  - **Then:** Returns `false`

- [ ] Test: returns false for malformed URLs
  - **Given:** Invalid URL string like `"not a url at all"`
  - **When:** `validateGitHubDownloadURL("not a url at all")` is called
  - **Then:** Returns `false` (caught by try-catch)

- [ ] Test: handles URL with special characters in path
  - **Given:** URL with encoded characters `https://github.com/owner/repo/releases/download/v1.0.0/file%20name.zip`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `true`

- [ ] Test: handles URL with port number
  - **Given:** URL `https://github.com:443/owner/repo/releases/download/v1.0.0/file.zip`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `true`

- [ ] Test: handles URL with username:password (should still validate domain/path)
  - **Given:** URL `https://user:pass@github.com/owner/repo/releases/download/v1.0.0/file.zip`
  - **When:** `validateGitHubDownloadURL(url)` is called
  - **Then:** Returns `true` (credentials don't affect hostname validation)

## Implementation Details (GREEN Phase)

### File Location

Create test file at: `tests/core/validation/securityValidation-githubUrl.test.ts`

### Import Pattern

```typescript
/**
 * Security Validation Tests - GitHub URL Validation
 *
 * Tests for validateGitHubDownloadURL function:
 * - Protocol validation (HTTPS only)
 * - Domain validation (github.com, githubusercontent.com)
 * - Path pattern validation (releases/download, repos/.../releases/assets)
 * - Edge cases and malformed inputs
 *
 * Target Coverage: 100%
 */

import { validateGitHubDownloadURL } from '@/core/validation';

describe('securityValidation - GitHub URL Validation', () => {
    // Test groups follow existing pattern
});
```

### Test Structure Pattern

Follow the existing pattern from `securityValidation-network.test.ts`:

```typescript
describe('validateGitHubDownloadURL', () => {
    describe('valid GitHub download URLs', () => {
        it('should accept standard releases download URL', () => {
            const url = 'https://github.com/adobe/demo-builder/releases/download/v1.0.0/extension.vsix';
            expect(validateGitHubDownloadURL(url)).toBe(true);
        });
        // ... more valid URL tests
    });

    describe('invalid URLs - protocol', () => {
        it('should reject HTTP URLs (not HTTPS)', () => {
            const url = 'http://github.com/owner/repo/releases/download/v1.0.0/file.zip';
            expect(validateGitHubDownloadURL(url)).toBe(false);
        });
        // ... more protocol tests
    });

    describe('invalid URLs - domain', () => {
        // ... domain validation tests
    });

    describe('invalid URLs - path pattern', () => {
        // ... path pattern tests
    });

    describe('edge cases', () => {
        // ... edge case tests
    });
});
```

## Expected Outcome

After implementing these tests:

- **validateGitHubDownloadURL function:** 0% -> 100% coverage
- **URLValidator.ts overall:** 72.91% -> 85%+ coverage
- **All branches covered:** Protocol check, domain checks (both github.com and githubusercontent.com), both regex patterns, catch block

### Branch Coverage Details

The function has the following branches to cover:
1. Protocol check: `parsedUrl.protocol !== 'https:'` (true/false)
2. Domain check: `hostname.endsWith('github.com')` (true/false)
3. Domain check: `hostname.endsWith('githubusercontent.com')` (true/false)
4. Pattern 1: Standard releases pattern match (true/false)
5. Pattern 2: API endpoint pattern match (true/false)
6. Try-catch: URL parsing success/failure

## Acceptance Criteria

- [x] All 28+ test cases pass (35 tests passing)
- [x] Function coverage at 100% (all lines executed)
- [x] Branch coverage at 100% (all conditional paths tested)
- [x] Statement coverage at 100%
- [x] Test file follows project conventions (naming, imports, structure)
- [x] No mocks required (pure function testing)
- [x] Tests are deterministic (no timing dependencies)

## Estimated Time

1-2 hours for complete implementation and verification

## Notes

### Security Importance

This function is a critical security boundary in the auto-update system. It prevents:
- **Supply chain attacks:** Ensures downloads only come from legitimate GitHub sources
- **SSRF attacks:** Prevents redirecting update downloads to internal network resources
- **Phishing attacks:** Blocks lookalike domains that could serve malicious packages

### Test Data Considerations

Use realistic URLs that match actual GitHub release patterns:
- Standard releases: `https://github.com/{owner}/{repo}/releases/download/{tag}/{file}`
- API assets: `https://api.github.com/repos/{owner}/{repo}/releases/assets/{id}`

### Regex Pattern Reference

The function uses two regex patterns:
1. `/^\/[^/]+\/[^/]+\/releases\/download\//` - Matches `/owner/repo/releases/download/`
2. `/^\/repos\/[^/]+\/[^/]+\/releases\/assets\//` - Matches `/repos/owner/repo/releases/assets/`

Tests should verify both patterns are correctly matched and that similar-but-invalid patterns are rejected.
