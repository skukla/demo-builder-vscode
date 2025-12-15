/**
 * Security Validation Tests - Network Security
 *
 * Tests for network security and data sanitization:
 * - Access token validation (JWT)
 * - URL validation and SSRF protection
 * - Error message sanitization
 * - Token and path redaction
 *
 * Target Coverage: 90%+
 */

import {
    validateAccessToken,
    validateURL,
    sanitizeErrorForLogging
} from '@/core/validation';

describe('securityValidation - Network Security', () => {

    // =================================================================
    // validateAccessToken Tests
    // =================================================================

    describe('validateAccessToken', () => {
        describe('valid tokens', () => {
            it('should accept valid JWT tokens', () => {
                const validJWT = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.signature';
                expect(() => validateAccessToken(validJWT)).not.toThrow();
            });

            it('should accept tokens with dots, hyphens, underscores', () => {
                const token = 'eyJ' + 'a'.repeat(50) + '.' + 'b'.repeat(50) + '.' + 'c'.repeat(50);
                expect(() => validateAccessToken(token)).not.toThrow();
            });

            it('should accept tokens at minimum length (50)', () => {
                const minToken = 'eyJ' + 'a'.repeat(47);
                expect(() => validateAccessToken(minToken)).not.toThrow();
            });

            it('should accept tokens at maximum length (5000)', () => {
                const maxToken = 'eyJ' + 'a'.repeat(4997);
                expect(() => validateAccessToken(maxToken)).not.toThrow();
            });
        });

        describe('command injection attacks', () => {
            it('should reject tokens with semicolons', () => {
                // Token must be 50+ chars to pass length check
                const malicious = 'eyJ' + 'a'.repeat(47) + '; rm -rf /';
                expect(() => validateAccessToken(malicious))
                    .toThrow(/illegal characters/);
            });

            it('should reject tokens with shell metacharacters', () => {
                // Tokens must be 50+ chars to pass length check
                const token1 = 'eyJ' + 'a'.repeat(47) + '$(whoami)';
                const token2 = 'eyJ' + 'a'.repeat(47) + '`whoami`';
                const token3 = 'eyJ' + 'a'.repeat(47) + ' | cat /etc/passwd';
                expect(() => validateAccessToken(token1))
                    .toThrow(/illegal characters/);
                expect(() => validateAccessToken(token2))
                    .toThrow(/illegal characters/);
                expect(() => validateAccessToken(token3))
                    .toThrow(/illegal characters/);
            });

            it('should reject tokens with quotes', () => {
                // Tokens must be 50+ chars to pass length check
                const token1 = 'eyJ' + 'a'.repeat(47) + '"test"';
                const token2 = 'eyJ' + 'a'.repeat(47) + "'test'";
                expect(() => validateAccessToken(token1))
                    .toThrow(/illegal characters/);
                expect(() => validateAccessToken(token2))
                    .toThrow(/illegal characters/);
            });

            it('should reject tokens with spaces', () => {
                // Token must be 50+ chars to pass length check
                const tokenWithSpace = 'eyJ' + 'a'.repeat(47) + ' test';
                expect(() => validateAccessToken(tokenWithSpace))
                    .toThrow(/illegal characters/);
            });

            it('should reject tokens with backslashes', () => {
                // Token must be 50+ chars to pass length check
                const tokenWithBackslash = 'eyJ' + 'a'.repeat(47) + '\\test';
                expect(() => validateAccessToken(tokenWithBackslash))
                    .toThrow(/illegal characters/);
            });
        });

        describe('format validation', () => {
            it('should reject tokens not starting with eyJ', () => {
                const invalid = 'abc' + 'a'.repeat(100);
                expect(() => validateAccessToken(invalid))
                    .toThrow(/must be a valid JWT token/);
            });

            it('should reject tokens too short', () => {
                const short = 'eyJhbGci';
                expect(() => validateAccessToken(short))
                    .toThrow(/length must be between 50 and 5000/);
            });

            it('should reject tokens too long', () => {
                const long = 'eyJ' + 'a'.repeat(4999); // Total 5002 chars
                expect(() => validateAccessToken(long))
                    .toThrow(/length must be between 50 and 5000/);
            });
        });

        describe('edge cases', () => {
            it('should reject empty strings', () => {
                expect(() => validateAccessToken(''))
                    .toThrow(/must be a non-empty string/);
            });

            it('should reject null/undefined', () => {
                expect(() => validateAccessToken(null as any))
                    .toThrow(/must be a non-empty string/);
                expect(() => validateAccessToken(undefined as any))
                    .toThrow(/must be a non-empty string/);
            });

            it('should reject non-string values', () => {
                expect(() => validateAccessToken(123 as any))
                    .toThrow(/must be a non-empty string/);
            });
        });
    });

    // =================================================================
    // validateURL Tests (SSRF Protection)
    // =================================================================

    describe('validateURL', () => {
        describe('valid URLs', () => {
            it('should accept HTTPS URLs by default', () => {
                expect(() => validateURL('https://example.com')).not.toThrow();
                expect(() => validateURL('https://api.adobe.com/data')).not.toThrow();
                expect(() => validateURL('https://subdomain.example.com/path')).not.toThrow();
            });

            it('should accept HTTP when explicitly allowed', () => {
                expect(() => validateURL('http://example.com', ['http', 'https'])).not.toThrow();
            });

            it('should accept URLs with query parameters', () => {
                expect(() => validateURL('https://example.com/path?key=value')).not.toThrow();
            });

            it('should accept URLs with ports', () => {
                expect(() => validateURL('https://example.com:8080/path')).not.toThrow();
            });
        });

        describe('protocol validation', () => {
            it('should reject HTTP by default', () => {
                expect(() => validateURL('http://example.com'))
                    .toThrow(/protocol must be one of: https/);
            });

            it('should reject dangerous protocols', () => {
                expect(() => validateURL('javascript:alert(1)'))
                    .toThrow(/protocol must be one of/);
                expect(() => validateURL('file:///etc/passwd'))
                    .toThrow(/protocol must be one of/);
                expect(() => validateURL('ftp://example.com'))
                    .toThrow(/protocol must be one of/);
                expect(() => validateURL('data:text/html,<script>alert(1)</script>'))
                    .toThrow(/protocol must be one of/);
            });
        });

        describe('SSRF protection - localhost', () => {
            it('should reject localhost hostname', () => {
                expect(() => validateURL('https://localhost'))
                    .toThrow(/localhost are not allowed/);
                expect(() => validateURL('https://localhost:3000'))
                    .toThrow(/localhost are not allowed/);
            });

            it('should reject 127.0.0.1', () => {
                expect(() => validateURL('https://127.0.0.1'))
                    .toThrow(/localhost are not allowed/);
                expect(() => validateURL('https://127.0.0.1:8080'))
                    .toThrow(/localhost are not allowed/);
            });

            it('should reject IPv6 localhost', () => {
                // IPv6 localhost is checked with specific ::1 pattern
                expect(() => validateURL('https://[::1]'))
                    .toThrow(/localhost/);
            });

            it('should reject loopback IPs', () => {
                expect(() => validateURL('https://127.0.0.2'))
                    .toThrow(/local\/private networks are not allowed/);
                expect(() => validateURL('https://127.255.255.255'))
                    .toThrow(/local\/private networks are not allowed/);
            });
        });

        describe('SSRF protection - private networks', () => {
            it('should reject 10.0.0.0/8 private range', () => {
                expect(() => validateURL('https://10.0.0.1'))
                    .toThrow(/local\/private networks are not allowed/);
                expect(() => validateURL('https://10.255.255.255'))
                    .toThrow(/local\/private networks are not allowed/);
            });

            it('should reject 192.168.0.0/16 private range', () => {
                expect(() => validateURL('https://192.168.0.1'))
                    .toThrow(/local\/private networks are not allowed/);
                expect(() => validateURL('https://192.168.255.255'))
                    .toThrow(/local\/private networks are not allowed/);
            });

            it('should reject 172.16.0.0/12 private range', () => {
                expect(() => validateURL('https://172.16.0.1'))
                    .toThrow(/local\/private networks are not allowed/);
                expect(() => validateURL('https://172.31.255.255'))
                    .toThrow(/local\/private networks are not allowed/);
            });

            it('should accept 172.15.x.x (not in private range)', () => {
                expect(() => validateURL('https://172.15.0.1')).not.toThrow();
            });

            it('should accept 172.32.x.x (not in private range)', () => {
                expect(() => validateURL('https://172.32.0.1')).not.toThrow();
            });

            it('should reject link-local addresses', () => {
                expect(() => validateURL('https://169.254.0.1'))
                    .toThrow(/local\/private networks are not allowed/);
                // 169.254.169.254 is checked first by link-local, then by metadata
                expect(() => validateURL('https://169.254.169.254'))
                    .toThrow(/(local\/private networks|cloud metadata endpoints)/);
            });
        });

        describe('SSRF protection - cloud metadata', () => {
            it('should reject AWS metadata endpoint', () => {
                // 169.254.169.254 gets caught by link-local check first
                expect(() => validateURL('https://169.254.169.254'))
                    .toThrow(/(local\/private networks|cloud metadata endpoints)/);
            });

            it('should reject IPv6 metadata endpoint', () => {
                // [fd00:ec2::254] is caught by IPv6 private range check first
                expect(() => validateURL('https://[fd00:ec2::254]'))
                    .toThrow(/(private IPv6|cloud metadata endpoints)/);
            });
        });

        describe('SSRF protection - IPv6', () => {
            it('should reject private IPv6 ranges', () => {
                // Note: URL() constructor normalizes IPv6 hostnames (strips brackets)
                // For fc00::/7, the hostname becomes "fc00::1" (no brackets)
                // Our check uses hostname.startsWith which works for these cases
                expect(() => validateURL('https://[fc00::1]'))
                    .toThrow(/private IPv6/);
                expect(() => validateURL('https://[fd00::1]'))
                    .toThrow(/private IPv6/);
                // fe80::/10 requires special bracket handling in URL
                expect(() => validateURL('https://[fe80::1]'))
                    .toThrow(/private IPv6/);
            });
        });

        describe('edge cases', () => {
            it('should reject empty strings', () => {
                expect(() => validateURL(''))
                    .toThrow(/must be a non-empty string/);
            });

            it('should reject null/undefined', () => {
                expect(() => validateURL(null as any))
                    .toThrow(/must be a non-empty string/);
                expect(() => validateURL(undefined as any))
                    .toThrow(/must be a non-empty string/);
            });

            it('should reject malformed URLs', () => {
                expect(() => validateURL('not-a-url'))
                    .toThrow(/Invalid URL/);
                expect(() => validateURL('ht!tp://example.com'))
                    .toThrow(/Invalid URL/);
            });

            it('should handle URLs without protocol', () => {
                expect(() => validateURL('example.com'))
                    .toThrow(/Invalid URL/);
            });
        });

        describe('XSS protection', () => {
            it('should reject javascript: URLs', () => {
                expect(() => validateURL('javascript:void(0)'))
                    .toThrow(/protocol must be one of/);
                expect(() => validateURL('javascript:alert(document.cookie)'))
                    .toThrow(/protocol must be one of/);
            });

            it('should reject data: URLs', () => {
                expect(() => validateURL('data:text/html,<script>alert(1)</script>'))
                    .toThrow(/protocol must be one of/);
            });
        });
    });

    // =================================================================
    // sanitizeErrorForLogging Tests
    // =================================================================

    describe('sanitizeErrorForLogging', () => {
        describe('path sanitization', () => {
            it('should sanitize Unix absolute paths', () => {
                const error = new Error('Failed at /Users/admin/.ssh/id_rsa');
                const sanitized = sanitizeErrorForLogging(error);
                expect(sanitized).toContain('<path>/');
                expect(sanitized).not.toContain('/Users/admin/.ssh/');
            });

            it('should sanitize Windows absolute paths', () => {
                const error = new Error('Failed at C:\\Users\\Admin\\Documents\\secret.txt');
                const sanitized = sanitizeErrorForLogging(error);
                expect(sanitized).toContain('<path>\\');
                expect(sanitized).not.toContain('C:\\Users\\Admin\\');
            });

            it('should sanitize multiple paths in same message', () => {
                const error = new Error('Copy from /home/user/src to /var/www/dest');
                const sanitized = sanitizeErrorForLogging(error);
                expect(sanitized).not.toContain('/home/user/');
                expect(sanitized).not.toContain('/var/www/');
                expect(sanitized).toContain('<path>/');
            });
        });

        describe('token sanitization', () => {
            it('should sanitize JWT tokens', () => {
                const error = new Error('Auth failed with token eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123');
                const sanitized = sanitizeErrorForLogging(error);
                expect(sanitized).toContain('<redacted>');
                expect(sanitized).not.toContain('eyJhbGciOiJ');
            });

            it('should sanitize base64 strings', () => {
                const error = new Error('Failed with key: YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=');
                const sanitized = sanitizeErrorForLogging(error);
                expect(sanitized).toContain('<redacted>');
                expect(sanitized).not.toContain('YWJjZGVmZ2hpamtsbW5vcHFy');
            });

            it('should sanitize API keys', () => {
                const error = new Error('API key abc123def456ghi789jkl012 is invalid');
                const sanitized = sanitizeErrorForLogging(error);
                expect(sanitized).toContain('<redacted>');
                expect(sanitized).not.toContain('abc123def456ghi789jkl012');
            });

            it('should not over-sanitize short strings', () => {
                const error = new Error('Failed with code abc123');
                const sanitized = sanitizeErrorForLogging(error);
                // Short strings (< 20 chars) should not be redacted
                expect(sanitized).toContain('abc123');
            });
        });

        describe('environment variable sanitization', () => {
            it('should sanitize environment variables', () => {
                const error = new Error('Failed: API_KEY=secret123 TOKEN=abc456');
                const sanitized = sanitizeErrorForLogging(error);
                expect(sanitized).toContain('API_KEY=<redacted>');
                expect(sanitized).toContain('TOKEN=<redacted>');
                expect(sanitized).not.toContain('secret123');
                expect(sanitized).not.toContain('abc456');
            });

            it('should sanitize quoted environment variables', () => {
                const error = new Error('Config: DATABASE_URL="postgresql://user:pass@host/db"');
                const sanitized = sanitizeErrorForLogging(error);
                expect(sanitized).toContain('DATABASE_URL=<redacted>');
                expect(sanitized).not.toContain('user:pass@host');
            });
        });

        describe('stack trace sanitization', () => {
            it('should remove stack traces', () => {
                const error = new Error('Main error\n    at function1 (/path/to/file.ts:10:5)\n    at function2 (/path/to/other.ts:20:10)');
                const sanitized = sanitizeErrorForLogging(error);
                expect(sanitized).toBe('Main error');
                expect(sanitized).not.toContain('at function1');
                expect(sanitized).not.toContain('at function2');
            });

            it('should keep only first line of multiline errors', () => {
                const error = new Error('Error line 1\nError line 2\nError line 3');
                const sanitized = sanitizeErrorForLogging(error);
                expect(sanitized).toBe('Error line 1');
                expect(sanitized).not.toContain('Error line 2');
            });
        });

        describe('string input', () => {
            it('should handle string errors', () => {
                const sanitized = sanitizeErrorForLogging('Failed at /home/user/file with token abc123def456ghi789jkl012');
                expect(sanitized).toContain('<path>/');
                expect(sanitized).toContain('<redacted>');
                expect(sanitized).not.toContain('/home/user/');
            });
        });

        describe('edge cases', () => {
            it('should handle empty error messages', () => {
                const error = new Error('');
                const sanitized = sanitizeErrorForLogging(error);
                expect(sanitized).toBe('');
            });

            it('should handle errors with only whitespace', () => {
                const error = new Error('   \n\t  ');
                const sanitized = sanitizeErrorForLogging(error);
                expect(sanitized.trim()).toBe('');
            });

            it('should handle complex mixed content', () => {
                const error = new Error('Auth failed at /home/user/.config with token eyJhbGci123456789012 and API_KEY=secret');
                const sanitized = sanitizeErrorForLogging(error);
                expect(sanitized).not.toContain('/home/user/');
                expect(sanitized).not.toContain('eyJhbGci123456789012'); // Token must be 20+ chars to be redacted
                expect(sanitized).not.toContain('secret');
                expect(sanitized).toContain('<path>/');
                expect(sanitized).toContain('<redacted>');
            });
        });

        describe('null byte attacks', () => {
            it('should handle null bytes in error messages', () => {
                const error = new Error('Test\0message');
                const sanitized = sanitizeErrorForLogging(error);
                // Null bytes don't split lines in JavaScript strings
                expect(sanitized).toContain('Test');
            });
        });

        describe('CRLF injection', () => {
            it('should handle CRLF in error messages', () => {
                const error = new Error('Test\r\nInjected line');
                const sanitized = sanitizeErrorForLogging(error);
                // Takes only first line
                expect(sanitized).toContain('Test');
                expect(sanitized).not.toContain('Injected line');
            });
        });
    });
});
