/**
 * Field Validation Tests - Commerce URL
 *
 * Tests for validateCommerceUrlUI function.
 * Validates URL format with friendly error messages.
 *
 * Target Coverage: 90%+
 */

import { validateCommerceUrlUI } from '@/core/validation/fieldValidation';

describe('validateCommerceUrlUI', () => {
    describe('valid inputs', () => {
        it('should accept valid HTTPS URLs', () => {
            const result = validateCommerceUrlUI('https://example.com');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });

        it('should accept valid HTTP URLs', () => {
            const result = validateCommerceUrlUI('http://example.com');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });

        it('should accept URLs with paths', () => {
            const result = validateCommerceUrlUI('https://example.com/store/path');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });

        it('should accept URLs with query parameters', () => {
            const result = validateCommerceUrlUI('https://example.com?key=value&other=param');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });

        it('should accept URLs with ports', () => {
            const result = validateCommerceUrlUI('https://example.com:8080');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });

        it('should accept URLs with subdomains', () => {
            const result = validateCommerceUrlUI('https://store.example.com');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });

        it('should accept URLs with authentication', () => {
            const result = validateCommerceUrlUI('https://user:pass@example.com');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });

        it('should accept URLs with fragments', () => {
            const result = validateCommerceUrlUI('https://example.com/page#section');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });
    });

    describe('empty/optional field', () => {
        it('should accept empty strings (optional field)', () => {
            const result = validateCommerceUrlUI('');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });

        it('should accept whitespace-only strings (optional field)', () => {
            const result = validateCommerceUrlUI('   ');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });

        it('should accept strings with only tabs', () => {
            const result = validateCommerceUrlUI('\t\t');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });
    });

    describe('invalid protocol', () => {
        it('should reject URLs without protocol', () => {
            const result = validateCommerceUrlUI('example.com');
            expect(result.isValid).toBe(false);
            expect(result.message).toBe('Invalid URL format. Must start with http:// or https://');
        });

        it('should reject URLs with javascript protocol', () => {
            const result = validateCommerceUrlUI('javascript:alert(1)');
            expect(result.isValid).toBe(false);
            expect(result.message).toBe('Invalid URL format. Must start with http:// or https://');
        });

        it('should reject URLs with file protocol', () => {
            const result = validateCommerceUrlUI('file:///etc/passwd');
            expect(result.isValid).toBe(false);
            expect(result.message).toBe('Invalid URL format. Must start with http:// or https://');
        });

        it('should reject URLs with ftp protocol', () => {
            const result = validateCommerceUrlUI('ftp://example.com');
            expect(result.isValid).toBe(false);
            expect(result.message).toBe('Invalid URL format. Must start with http:// or https://');
        });

        it('should reject URLs with data protocol', () => {
            const result = validateCommerceUrlUI('data:text/html,<script>alert(1)</script>');
            expect(result.isValid).toBe(false);
            expect(result.message).toBe('Invalid URL format. Must start with http:// or https://');
        });

        it('should reject URLs with mailto protocol', () => {
            const result = validateCommerceUrlUI('mailto:test@example.com');
            expect(result.isValid).toBe(false);
            expect(result.message).toBe('Invalid URL format. Must start with http:// or https://');
        });
    });

    describe('malformed URLs', () => {
        it('should reject completely invalid URLs', () => {
            const result = validateCommerceUrlUI('not a url');
            expect(result.isValid).toBe(false);
            expect(result.message).toBe('Invalid URL format. Must start with http:// or https://');
        });

        it('should reject URLs with spaces', () => {
            const result = validateCommerceUrlUI('https://example .com');
            expect(result.isValid).toBe(false);
            expect(result.message).toBe('Invalid URL format. Must start with http:// or https://');
        });

        it('should reject URLs with invalid characters', () => {
            const result = validateCommerceUrlUI('https://exam ple.com');
            expect(result.isValid).toBe(false);
            expect(result.message).toBe('Invalid URL format. Must start with http:// or https://');
        });

        it('should reject URLs without domain', () => {
            const result = validateCommerceUrlUI('https://');
            expect(result.isValid).toBe(false);
            expect(result.message).toBe('Invalid URL format. Must start with http:// or https://');
        });

        it('should reject partial URLs', () => {
            const result = validateCommerceUrlUI('http:/');
            expect(result.isValid).toBe(false);
            expect(result.message).toBe('Invalid URL format. Must start with http:// or https://');
        });
    });

    describe('localhost and private IPs', () => {
        it('should accept localhost (no SSRF protection in UI validation)', () => {
            const result = validateCommerceUrlUI('https://localhost');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });

        it('should accept 127.0.0.1', () => {
            const result = validateCommerceUrlUI('https://127.0.0.1');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });

        it('should accept private IP ranges', () => {
            const result = validateCommerceUrlUI('https://192.168.1.1');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });
    });

    describe('XSS attempts', () => {
        it('should reject script injection attempts', () => {
            const result = validateCommerceUrlUI('<script>alert("xss")</script>');
            expect(result.isValid).toBe(false);
            expect(result.message).toBe('Invalid URL format. Must start with http:// or https://');
        });

        it('should reject javascript: in URL', () => {
            const result = validateCommerceUrlUI('javascript:void(0)');
            expect(result.isValid).toBe(false);
            expect(result.message).toBe('Invalid URL format. Must start with http:// or https://');
        });
    });

    describe('edge cases', () => {
        it('should handle URLs with unusual ports', () => {
            const result = validateCommerceUrlUI('https://example.com:65535');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });

        it('should handle URLs with IPv6', () => {
            const result = validateCommerceUrlUI('https://[::1]');
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });

        it('should handle very long URLs', () => {
            const longPath = 'a'.repeat(1000);
            const result = validateCommerceUrlUI(`https://example.com/${longPath}`);
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });

        it('should handle URLs with many query parameters', () => {
            const params = Array.from({ length: 50 }, (_, i) => `key${i}=value${i}`).join('&');
            const result = validateCommerceUrlUI(`https://example.com?${params}`);
            expect(result.isValid).toBe(true);
            expect(result.message).toBe('');
        });

        it('should handle URLs with control characters', () => {
            // URL() constructor accepts null bytes in path - this is implementation-specific
            const result = validateCommerceUrlUI('https://example.com/test\x00');
            // Just verify it doesn't crash - behavior may vary
            expect(result).toBeDefined();
        });
    });

    describe('common mistakes', () => {
        it('should reject URL with typo in protocol', () => {
            const result = validateCommerceUrlUI('htps://example.com');
            expect(result.isValid).toBe(false);
            expect(result.message).toBe('Invalid URL format. Must start with http:// or https://');
        });

        it('should reject URL with single slash', () => {
            const result = validateCommerceUrlUI('https:/example.com');
            expect(result.isValid).toBe(false);
            // Error message depends on URL constructor behavior
            expect(result.message).toContain('URL');
        });

        it('should reject URL with missing colon', () => {
            const result = validateCommerceUrlUI('https//example.com');
            expect(result.isValid).toBe(false);
            expect(result.message).toBe('Invalid URL format. Must start with http:// or https://');
        });
    });
});
