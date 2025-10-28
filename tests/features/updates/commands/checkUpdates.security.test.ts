/**
 * Security Tests for CheckUpdatesCommand
 *
 * Tests information disclosure prevention in error messages.
 *
 * Coverage areas:
 * - Error message sanitization
 * - Sensitive data redaction
 * - Path removal from error messages
 *
 * Total tests: 2
 */

import { sanitizeErrorForLogging } from '@/core/validation/securityValidation';

describe('CheckUpdatesCommand Security - Information Disclosure Prevention', () => {
    describe('Error Message Sanitization', () => {
        it('should sanitize error messages to remove sensitive file paths', () => {
            // Arrange
            const errorWithPath = new Error('Failed to update component at /Users/admin/.ssh/id_rsa');

            // Act
            const sanitized = sanitizeErrorForLogging(errorWithPath);

            // Assert
            expect(sanitized).not.toContain('/Users/admin/.ssh/id_rsa');
            expect(sanitized).toContain('<path>');
        });

        it('should sanitize error messages to remove tokens and secrets', () => {
            // Arrange
            const errorWithToken = new Error(
                'GitHub API error: https://api.github.com/repos?token=ghp_abcdefghijklmnopqrstuvwxyz123456'
            );

            // Act
            const sanitized = sanitizeErrorForLogging(errorWithToken);

            // Assert
            expect(sanitized).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz123456');
            expect(sanitized).toContain('<redacted>');
        });
    });
});
