/**
 * Field Validation Tests - Project Name
 *
 * Tests for validateProjectNameUI function.
 * Validates project name format with friendly error messages.
 *
 * Target Coverage: 90%+
 */

import { validateProjectNameUI } from '@/core/validation/fieldValidation';

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
