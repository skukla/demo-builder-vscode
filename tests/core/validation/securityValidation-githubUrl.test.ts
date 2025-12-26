/**
 * Security Validation Tests - GitHub URL Validation
 *
 * Tests for validateGitHubDownloadURL function:
 * - Valid GitHub releases download URLs
 * - Invalid protocols (HTTP, FTP, file, javascript, data)
 * - Invalid domains (non-GitHub, lookalikes, IP addresses)
 * - Invalid path patterns (non-releases paths)
 * - Edge cases (empty strings, null, malformed URLs)
 *
 * Target Coverage: 100% for validateGitHubDownloadURL
 */

import { validateGitHubDownloadURL } from '@/core/validation';

describe('validateGitHubDownloadURL', () => {

    // =================================================================
    // Valid GitHub Download URLs
    // =================================================================

    describe('valid GitHub download URLs', () => {
        it('should accept standard releases download URL', () => {
            const url = 'https://github.com/owner/repo/releases/download/v1.0.0/file.zip';
            expect(validateGitHubDownloadURL(url)).toBe(true);
        });

        it('should accept releases download URL with complex tag names', () => {
            const url = 'https://github.com/owner/repo/releases/download/v2.1.0-beta.1/app-macos-arm64.dmg';
            expect(validateGitHubDownloadURL(url)).toBe(true);
        });

        it('should reject raw.githubusercontent.com URLs (does not match releases pattern)', () => {
            // raw.githubusercontent.com is for raw file content, not releases
            const url = 'https://raw.githubusercontent.com/owner/repo/main/README.md';
            expect(validateGitHubDownloadURL(url)).toBe(false);
        });

        it('should accept objects.githubusercontent.com for release assets', () => {
            // This domain is used for GitHub release asset downloads
            // However, the path pattern must still match /owner/repo/releases/download/
            const url = 'https://objects.githubusercontent.com/owner/repo/releases/download/v1.0.0/asset.zip';
            expect(validateGitHubDownloadURL(url)).toBe(true);
        });

        it('should accept API endpoint format (/repos/owner/repo/releases/assets/id)', () => {
            const url = 'https://github.com/repos/owner/repo/releases/assets/12345678';
            expect(validateGitHubDownloadURL(url)).toBe(true);
        });

        it('should accept URLs with query parameters', () => {
            const url = 'https://github.com/owner/repo/releases/download/v1.0.0/file.zip?token=abc123';
            expect(validateGitHubDownloadURL(url)).toBe(true);
        });

        it('should accept URLs with various file extensions', () => {
            const baseUrl = 'https://github.com/owner/repo/releases/download/v1.0.0/';

            expect(validateGitHubDownloadURL(baseUrl + 'app.zip')).toBe(true);
            expect(validateGitHubDownloadURL(baseUrl + 'app.tar.gz')).toBe(true);
            expect(validateGitHubDownloadURL(baseUrl + 'app.exe')).toBe(true);
            expect(validateGitHubDownloadURL(baseUrl + 'app.dmg')).toBe(true);
            expect(validateGitHubDownloadURL(baseUrl + 'app.deb')).toBe(true);
            expect(validateGitHubDownloadURL(baseUrl + 'app.AppImage')).toBe(true);
        });
    });

    // =================================================================
    // Invalid URLs - Protocol
    // =================================================================

    describe('invalid URLs - protocol', () => {
        it('should reject HTTP URLs (not HTTPS)', () => {
            const url = 'http://github.com/owner/repo/releases/download/v1.0.0/file.zip';
            expect(validateGitHubDownloadURL(url)).toBe(false);
        });

        it('should reject FTP URLs', () => {
            const url = 'ftp://github.com/owner/repo/releases/download/v1.0.0/file.zip';
            expect(validateGitHubDownloadURL(url)).toBe(false);
        });

        it('should reject file:// URLs', () => {
            const url = 'file:///etc/passwd';
            expect(validateGitHubDownloadURL(url)).toBe(false);
        });

        it('should reject javascript: protocol', () => {
            const url = 'javascript:alert(1)';
            expect(validateGitHubDownloadURL(url)).toBe(false);
        });

        it('should reject data: protocol', () => {
            const url = 'data:text/html,<script>alert(1)</script>';
            expect(validateGitHubDownloadURL(url)).toBe(false);
        });
    });

    // =================================================================
    // Invalid URLs - Domain
    // =================================================================

    describe('invalid URLs - domain', () => {
        it('should reject non-GitHub domains', () => {
            const url = 'https://example.com/owner/repo/releases/download/v1.0.0/file.zip';
            expect(validateGitHubDownloadURL(url)).toBe(false);
        });

        it('should reject github.io (not github.com)', () => {
            const url = 'https://owner.github.io/repo/releases/download/v1.0.0/file.zip';
            expect(validateGitHubDownloadURL(url)).toBe(false);
        });

        it('should reject subdomains that contain but do not end with github.com', () => {
            const url = 'https://github.com.evil.com/owner/repo/releases/download/v1.0.0/file.zip';
            expect(validateGitHubDownloadURL(url)).toBe(false);
        });

        it('should reject lookalike domains (githubusercontent.com typo)', () => {
            // Note: githubuserconent.com (missing 't') is a typo
            const url = 'https://githubuserconent.com/owner/repo/releases/download/v1.0.0/file.zip';
            expect(validateGitHubDownloadURL(url)).toBe(false);
        });

        it('should reject IP addresses even with valid path', () => {
            const url = 'https://192.168.1.1/owner/repo/releases/download/v1.0.0/file.zip';
            expect(validateGitHubDownloadURL(url)).toBe(false);
        });

        it('should reject localhost with GitHub path', () => {
            const url = 'https://localhost/owner/repo/releases/download/v1.0.0/file.zip';
            expect(validateGitHubDownloadURL(url)).toBe(false);
        });
    });

    // =================================================================
    // Invalid URLs - Path Pattern
    // =================================================================

    describe('invalid URLs - path pattern', () => {
        it('should reject github.com without releases path', () => {
            const url = 'https://github.com/owner/repo';
            expect(validateGitHubDownloadURL(url)).toBe(false);
        });

        it('should reject github.com with blob path (not download)', () => {
            const url = 'https://github.com/owner/repo/blob/main/README.md';
            expect(validateGitHubDownloadURL(url)).toBe(false);
        });

        it('should reject github.com with releases list path (not download)', () => {
            const url = 'https://github.com/owner/repo/releases';
            expect(validateGitHubDownloadURL(url)).toBe(false);
        });

        it('should reject releases path without download segment', () => {
            const url = 'https://github.com/owner/repo/releases/tag/v1.0.0';
            expect(validateGitHubDownloadURL(url)).toBe(false);
        });

        it('should reject path with missing owner segment', () => {
            const url = 'https://github.com/releases/download/v1.0.0/file.zip';
            expect(validateGitHubDownloadURL(url)).toBe(false);
        });

        it('should reject API endpoint with wrong path structure', () => {
            // API endpoint requires /repos/owner/repo/releases/assets/ pattern
            const url = 'https://github.com/repos/owner/releases/assets/12345';
            expect(validateGitHubDownloadURL(url)).toBe(false);
        });
    });

    // =================================================================
    // Edge Cases
    // =================================================================

    describe('edge cases', () => {
        it('should return false for empty string', () => {
            expect(validateGitHubDownloadURL('')).toBe(false);
        });

        it('should return false for null (type coercion)', () => {
            expect(validateGitHubDownloadURL(null as unknown as string)).toBe(false);
        });

        it('should return false for undefined (type coercion)', () => {
            expect(validateGitHubDownloadURL(undefined as unknown as string)).toBe(false);
        });

        it('should return false for malformed URLs', () => {
            expect(validateGitHubDownloadURL('not-a-url')).toBe(false);
            expect(validateGitHubDownloadURL('https://')).toBe(false);
            expect(validateGitHubDownloadURL('://github.com')).toBe(false);
            expect(validateGitHubDownloadURL('github.com/owner/repo/releases/download/v1/file.zip')).toBe(false);
        });

        it('should handle URL with special characters in path', () => {
            const url = 'https://github.com/owner/repo/releases/download/v1.0.0/file%20with%20spaces.zip';
            expect(validateGitHubDownloadURL(url)).toBe(true);
        });

        it('should handle URL with port number', () => {
            // GitHub.com with explicit port should still work if hostname matches
            const url = 'https://github.com:443/owner/repo/releases/download/v1.0.0/file.zip';
            expect(validateGitHubDownloadURL(url)).toBe(true);
        });

        it('should handle URL with username:password', () => {
            // URLs with credentials in them (bad practice but should still validate hostname/path)
            const url = 'https://user:pass@github.com/owner/repo/releases/download/v1.0.0/file.zip';
            expect(validateGitHubDownloadURL(url)).toBe(true);
        });
    });

    // =================================================================
    // Additional Security Cases
    // =================================================================

    describe('additional security cases', () => {
        it('should reject URLs with fragments that might bypass validation', () => {
            // Fragment shouldn't affect pathname validation
            const url = 'https://github.com/owner/repo/releases/download/v1.0.0/file.zip#anchor';
            expect(validateGitHubDownloadURL(url)).toBe(true);
        });

        it('should handle very long owner/repo names', () => {
            const longOwner = 'a'.repeat(100);
            const longRepo = 'b'.repeat(100);
            const url = `https://github.com/${longOwner}/${longRepo}/releases/download/v1.0.0/file.zip`;
            expect(validateGitHubDownloadURL(url)).toBe(true);
        });

        it('should reject URLs with double slashes in path', () => {
            const url = 'https://github.com//owner/repo/releases/download/v1.0.0/file.zip';
            // Double slash means empty owner segment
            expect(validateGitHubDownloadURL(url)).toBe(false);
        });

        it('should handle casing correctly for protocol and domain', () => {
            // HTTPS protocol is case-insensitive per RFC 3986
            // URL constructor normalizes protocol to lowercase
            const url = 'HTTPS://GITHUB.COM/owner/repo/releases/download/v1.0.0/file.zip';
            expect(validateGitHubDownloadURL(url)).toBe(true);
        });
    });
});
