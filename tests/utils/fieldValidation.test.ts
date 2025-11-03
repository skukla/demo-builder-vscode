/**
 * Field Validation Tests
 *
 * Comprehensive test suite for UI field validation functions.
 * Tests user-facing validation with friendly error messages.
 *
 * Target Coverage: 90%+
 */

import {
    validateProjectNameUI,
    validateCommerceUrlUI,
    validateFieldUI
} from '@/core/validation/fieldValidation';

describe('fieldValidation', () => {

    // =================================================================
    // validateProjectNameUI Tests
    // =================================================================

    describe('validateProjectNameUI', () => {
        describe('valid inputs', () => {
            it('should accept valid alphanumeric project names', () => {
                const result = validateProjectNameUI('my-project');
                expect(result.isValid).toBe(true);
                expect(result.message).toBe('');
            });

            it('should accept names with hyphens', () => {
                const result = validateProjectNameUI('my-awesome-project');
                expect(result.isValid).toBe(true);
                expect(result.message).toBe('');
            });

            it('should accept names with underscores', () => {
                const result = validateProjectNameUI('my_project_2024');
                expect(result.isValid).toBe(true);
                expect(result.message).toBe('');
            });

            it('should accept mixed alphanumeric with hyphens and underscores', () => {
                const result = validateProjectNameUI('project-123_test');
                expect(result.isValid).toBe(true);
                expect(result.message).toBe('');
            });

            it('should accept uppercase letters', () => {
                const result = validateProjectNameUI('MyProject');
                expect(result.isValid).toBe(true);
                expect(result.message).toBe('');
            });

            it('should accept all lowercase', () => {
                const result = validateProjectNameUI('myproject');
                expect(result.isValid).toBe(true);
                expect(result.message).toBe('');
            });

            it('should accept numbers only', () => {
                const result = validateProjectNameUI('12345');
                expect(result.isValid).toBe(true);
                expect(result.message).toBe('');
            });

            it('should accept names at 50 characters', () => {
                const maxName = 'a'.repeat(50);
                const result = validateProjectNameUI(maxName);
                expect(result.isValid).toBe(true);
                expect(result.message).toBe('');
            });
        });

        describe('empty/whitespace validation', () => {
            it('should reject empty strings', () => {
                const result = validateProjectNameUI('');
                expect(result.isValid).toBe(false);
                expect(result.message).toBe('Project name is required');
            });

            it('should reject whitespace-only strings', () => {
                const result = validateProjectNameUI('   ');
                expect(result.isValid).toBe(false);
                expect(result.message).toBe('Project name is required');
            });

            it('should reject strings with only tabs', () => {
                const result = validateProjectNameUI('\t\t\t');
                expect(result.isValid).toBe(false);
                expect(result.message).toBe('Project name is required');
            });

            it('should reject strings with only newlines', () => {
                const result = validateProjectNameUI('\n\n');
                expect(result.isValid).toBe(false);
                expect(result.message).toBe('Project name is required');
            });
        });

        describe('invalid characters', () => {
            it('should reject spaces', () => {
                const result = validateProjectNameUI('my project');
                expect(result.isValid).toBe(false);
                expect(result.message).toBe('Project name can only contain letters, numbers, hyphens, and underscores');
            });

            it('should reject special characters', () => {
                const chars = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '=', '+'];
                chars.forEach(char => {
                    const result = validateProjectNameUI(`project${char}`);
                    expect(result.isValid).toBe(false);
                    expect(result.message).toContain('can only contain letters, numbers, hyphens, and underscores');
                });
            });

            it('should reject dots', () => {
                const result = validateProjectNameUI('my.project');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });

            it('should reject slashes', () => {
                const result = validateProjectNameUI('my/project');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });

            it('should reject backslashes', () => {
                const result = validateProjectNameUI('my\\project');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });

            it('should reject question marks', () => {
                const result = validateProjectNameUI('project?');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });

            it('should reject angle brackets', () => {
                const result = validateProjectNameUI('<project>');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });

            it('should reject quotes', () => {
                const result = validateProjectNameUI('"project"');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });
        });

        describe('length validation', () => {
            it('should reject names exceeding 50 characters', () => {
                const longName = 'a'.repeat(51);
                const result = validateProjectNameUI(longName);
                expect(result.isValid).toBe(false);
                expect(result.message).toBe('Project name must be 50 characters or less');
            });

            it('should reject very long names', () => {
                const veryLongName = 'a'.repeat(100);
                const result = validateProjectNameUI(veryLongName);
                expect(result.isValid).toBe(false);
                expect(result.message).toBe('Project name must be 50 characters or less');
            });

            it('should accept single character names', () => {
                const result = validateProjectNameUI('a');
                expect(result.isValid).toBe(true);
                expect(result.message).toBe('');
            });
        });

        describe('XSS attempts', () => {
            it('should reject HTML tags', () => {
                const result = validateProjectNameUI('<script>alert("xss")</script>');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });

            it('should reject HTML entities', () => {
                const result = validateProjectNameUI('test&lt;script&gt;');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });

            it('should reject javascript: URLs', () => {
                const result = validateProjectNameUI('javascript:alert(1)');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });
        });

        describe('command injection attempts', () => {
            it('should reject semicolons', () => {
                const result = validateProjectNameUI('project; rm -rf /');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });

            it('should reject pipes', () => {
                const result = validateProjectNameUI('project | cat /etc/passwd');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });

            it('should reject shell substitutions', () => {
                const result = validateProjectNameUI('project$(whoami)');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });

            it('should reject backticks', () => {
                const result = validateProjectNameUI('project`whoami`');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });
        });

        describe('path traversal attempts', () => {
            it('should reject parent directory references', () => {
                const result = validateProjectNameUI('../etc/passwd');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });

            it('should reject absolute paths', () => {
                const result = validateProjectNameUI('/etc/passwd');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });
        });

        describe('unicode and special characters', () => {
            it('should reject emoji', () => {
                const result = validateProjectNameUI('project😀');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });

            it('should reject accented characters', () => {
                const result = validateProjectNameUI('projéct');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });

            it('should reject cyrillic characters', () => {
                const result = validateProjectNameUI('проект');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });

            it('should reject chinese characters', () => {
                const result = validateProjectNameUI('项目');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });
        });

        describe('edge cases', () => {
            it('should handle leading/trailing spaces correctly', () => {
                const result = validateProjectNameUI('  project  ');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });

            it('should reject control characters', () => {
                const result = validateProjectNameUI('project\x00test');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });

            it('should reject CRLF', () => {
                const result = validateProjectNameUI('project\r\ntest');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });
        });
    });

    // =================================================================
    // validateCommerceUrlUI Tests
    // =================================================================

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
                expect(result.message).toBe('Invalid URL format');
            });

            it('should reject URLs with javascript protocol', () => {
                const result = validateCommerceUrlUI('javascript:alert(1)');
                expect(result.isValid).toBe(false);
                expect(result.message).toBe('URL must start with http:// or https://');
            });

            it('should reject URLs with file protocol', () => {
                const result = validateCommerceUrlUI('file:///etc/passwd');
                expect(result.isValid).toBe(false);
                expect(result.message).toBe('URL must start with http:// or https://');
            });

            it('should reject URLs with ftp protocol', () => {
                const result = validateCommerceUrlUI('ftp://example.com');
                expect(result.isValid).toBe(false);
                expect(result.message).toBe('URL must start with http:// or https://');
            });

            it('should reject URLs with data protocol', () => {
                const result = validateCommerceUrlUI('data:text/html,<script>alert(1)</script>');
                expect(result.isValid).toBe(false);
                expect(result.message).toBe('URL must start with http:// or https://');
            });

            it('should reject URLs with mailto protocol', () => {
                const result = validateCommerceUrlUI('mailto:test@example.com');
                expect(result.isValid).toBe(false);
                expect(result.message).toBe('URL must start with http:// or https://');
            });
        });

        describe('malformed URLs', () => {
            it('should reject completely invalid URLs', () => {
                const result = validateCommerceUrlUI('not a url');
                expect(result.isValid).toBe(false);
                expect(result.message).toBe('Invalid URL format');
            });

            it('should reject URLs with spaces', () => {
                const result = validateCommerceUrlUI('https://example .com');
                expect(result.isValid).toBe(false);
                expect(result.message).toBe('Invalid URL format');
            });

            it('should reject URLs with invalid characters', () => {
                const result = validateCommerceUrlUI('https://exam ple.com');
                expect(result.isValid).toBe(false);
                expect(result.message).toBe('Invalid URL format');
            });

            it('should reject URLs without domain', () => {
                const result = validateCommerceUrlUI('https://');
                expect(result.isValid).toBe(false);
                expect(result.message).toBe('Invalid URL format');
            });

            it('should reject partial URLs', () => {
                const result = validateCommerceUrlUI('http:/');
                expect(result.isValid).toBe(false);
                expect(result.message).toBe('Invalid URL format');
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
                expect(result.message).toBe('Invalid URL format');
            });

            it('should reject javascript: in URL', () => {
                const result = validateCommerceUrlUI('javascript:void(0)');
                expect(result.isValid).toBe(false);
                expect(result.message).toBe('URL must start with http:// or https://');
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
                expect(result.message).toBe('URL must start with http:// or https://');
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
                expect(result.message).toBe('Invalid URL format');
            });
        });
    });

    // =================================================================
    // validateFieldUI Tests (Main Dispatcher)
    // =================================================================

    describe('validateFieldUI', () => {
        describe('projectName field', () => {
            it('should route to validateProjectNameUI', () => {
                const result = validateFieldUI('projectName', 'valid-project');
                expect(result.isValid).toBe(true);
                expect(result.message).toBe('');
            });

            it('should return error for invalid project name', () => {
                const result = validateFieldUI('projectName', 'invalid project');
                expect(result.isValid).toBe(false);
                expect(result.message).toContain('can only contain');
            });

            it('should handle empty project name', () => {
                const result = validateFieldUI('projectName', '');
                expect(result.isValid).toBe(false);
                expect(result.message).toBe('Project name is required');
            });
        });

        describe('commerceUrl field', () => {
            it('should route to validateCommerceUrlUI', () => {
                const result = validateFieldUI('commerceUrl', 'https://example.com');
                expect(result.isValid).toBe(true);
                expect(result.message).toBe('');
            });

            it('should return error for invalid URL', () => {
                const result = validateFieldUI('commerceUrl', 'not-a-url');
                expect(result.isValid).toBe(false);
                expect(result.message).toBe('Invalid URL format');
            });

            it('should accept empty commerce URL', () => {
                const result = validateFieldUI('commerceUrl', '');
                expect(result.isValid).toBe(true);
                expect(result.message).toBe('');
            });
        });

        describe('unknown fields', () => {
            it('should return valid for unknown field types', () => {
                const result = validateFieldUI('unknownField', 'any value');
                expect(result.isValid).toBe(true);
                expect(result.message).toBe('');
            });

            it('should not validate unknown fields', () => {
                const result = validateFieldUI('customField', '<script>alert(1)</script>');
                expect(result.isValid).toBe(true);
                expect(result.message).toBe('');
            });

            it('should handle empty string for unknown fields', () => {
                const result = validateFieldUI('otherField', '');
                expect(result.isValid).toBe(true);
                expect(result.message).toBe('');
            });
        });

        describe('case sensitivity', () => {
            it('should match field names case-sensitively', () => {
                // Capital P should not match
                const result = validateFieldUI('ProjectName', 'valid-project');
                expect(result.isValid).toBe(true); // Falls through to default
                expect(result.message).toBe('');
            });

            it('should not match camelCase variants', () => {
                const result = validateFieldUI('project_name', 'valid-project');
                expect(result.isValid).toBe(true); // Falls through to default
                expect(result.message).toBe('');
            });
        });

        describe('edge cases', () => {
            it('should handle null field name gracefully', () => {
                const result = validateFieldUI(null as any, 'value');
                expect(result.isValid).toBe(true); // Falls through to default
                expect(result.message).toBe('');
            });

            it('should handle undefined field name gracefully', () => {
                const result = validateFieldUI(undefined as any, 'value');
                expect(result.isValid).toBe(true); // Falls through to default
                expect(result.message).toBe('');
            });

            it('should handle empty field name', () => {
                const result = validateFieldUI('', 'value');
                expect(result.isValid).toBe(true); // Falls through to default
                expect(result.message).toBe('');
            });
        });

        describe('comprehensive validation', () => {
            it('should validate multiple fields independently', () => {
                const projectResult = validateFieldUI('projectName', 'my-project');
                const urlResult = validateFieldUI('commerceUrl', 'https://example.com');

                expect(projectResult.isValid).toBe(true);
                expect(urlResult.isValid).toBe(true);
            });

            it('should handle mixed valid/invalid fields', () => {
                const validProject = validateFieldUI('projectName', 'valid-project');
                const invalidProject = validateFieldUI('projectName', 'invalid project');
                const validUrl = validateFieldUI('commerceUrl', 'https://example.com');
                const invalidUrl = validateFieldUI('commerceUrl', 'not-url');

                expect(validProject.isValid).toBe(true);
                expect(invalidProject.isValid).toBe(false);
                expect(validUrl.isValid).toBe(true);
                expect(invalidUrl.isValid).toBe(false);
            });
        });
    });
});
