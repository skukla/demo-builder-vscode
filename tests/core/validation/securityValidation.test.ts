/**
 * Security Validation Tests
 *
 * Tests the security validation utilities for:
 * - Error message sanitization
 * - Path safety validation
 * - Sensitive data redaction
 *
 * Total tests: 15
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
    sanitizeErrorForLogging,
    sanitizeError,
    validatePathSafety
} from '@/core/validation/securityValidation';

// Mock fs for path safety tests
jest.mock('fs/promises');

describe('SecurityValidation', () => {
    describe('sanitizeErrorForLogging', () => {
        it('should redact Unix file paths', () => {
            const error = new Error('Failed at /Users/admin/.ssh/id_rsa');
            const sanitized = sanitizeErrorForLogging(error);

            expect(sanitized).not.toContain('/Users/admin/');
            expect(sanitized).toContain('<path>');
        });

        it('should redact Windows file paths', () => {
            const error = new Error('Failed at C:\\Users\\admin\\secrets.txt');
            const sanitized = sanitizeErrorForLogging(error);

            expect(sanitized).not.toContain('C:\\Users\\admin\\');
            expect(sanitized).toContain('<path>');
        });

        it('should redact GitHub personal access tokens', () => {
            const error = new Error('Token: ghp_1234567890abcdefghijklmnopqrstuv');
            const sanitized = sanitizeErrorForLogging(error);

            expect(sanitized).not.toContain('ghp_1234567890abcdefghijklmnopqrstuv');
            expect(sanitized).toContain('<redacted>');
        });

        it('should redact JWT tokens', () => {
            const error = new Error(
                'Auth failed: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
            );
            const sanitized = sanitizeErrorForLogging(error);

            expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
            expect(sanitized).toContain('<token>');
        });

        it('should redact Bearer tokens', () => {
            const error = new Error('Header: Bearer abc123def456');
            const sanitized = sanitizeErrorForLogging(error);

            expect(sanitized).toContain('Bearer <redacted>');
            expect(sanitized).not.toContain('abc123def456');
        });

        it('should redact API keys in JSON', () => {
            const error = new Error('Config: {"api_key": "sk-1234567890"}');
            const sanitized = sanitizeErrorForLogging(error);

            expect(sanitized).toContain('"api_key": "<redacted>"');
            expect(sanitized).not.toContain('sk-1234567890');
        });

        it('should redact tokens in URLs', () => {
            const error = new Error('Failed: https://api.example.com?access_token=secret123');
            const sanitized = sanitizeErrorForLogging(error);

            expect(sanitized).toContain('access_token=<redacted>');
            expect(sanitized).not.toContain('secret123');
        });

        it('should handle string inputs', () => {
            const message = 'Error at /Users/admin/.ssh/id_rsa';
            const sanitized = sanitizeErrorForLogging(message);

            expect(sanitized).not.toContain('/Users/admin/');
            expect(sanitized).toContain('<path>');
        });

        it('should redact multiple sensitive patterns in one message', () => {
            const error = new Error(
                'Failed at /Users/admin/.ssh/id_rsa with token ghp_abcdefghijklmnopqrstuvwxyz123456'
            );
            const sanitized = sanitizeErrorForLogging(error);

            expect(sanitized).toContain('<path>');
            expect(sanitized).toContain('<redacted>');
            expect(sanitized).not.toContain('/Users/admin/');
            expect(sanitized).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz123456');
        });
    });

    describe('sanitizeError', () => {
        it('should sanitize error message and preserve name', () => {
            const error = new Error('Token: ghp_1234567890abcdefghijklmnopqrstuv');
            error.name = 'AuthenticationError';

            const sanitized = sanitizeError(error);

            expect(sanitized.message).toContain('<redacted>');
            expect(sanitized.message).not.toContain('ghp_1234567890abcdefghijklmnopqrstuv');
            expect(sanitized.name).toBe('AuthenticationError');
        });

        it('should sanitize stack trace if present', () => {
            const error = new Error('Failed');
            error.stack = 'Error at /Users/admin/.ssh/id_rsa\n  at function()';

            const sanitized = sanitizeError(error);

            expect(sanitized.stack).toContain('<path>');
            expect(sanitized.stack).not.toContain('/Users/admin/');
        });
    });

    describe('validatePathSafety', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('should reject symlinks', async () => {
            (fs.lstat as jest.Mock) = jest.fn().mockResolvedValue({
                isSymbolicLink: () => true,
                isDirectory: () => false,
            });

            const result = await validatePathSafety('/some/path');

            expect(result.safe).toBe(false);
            expect(result.reason).toContain('symbolic link');
        });

        it('should accept regular directories', async () => {
            (fs.lstat as jest.Mock) = jest.fn().mockResolvedValue({
                isSymbolicLink: () => false,
                isDirectory: () => true,
            });

            const result = await validatePathSafety('/some/path');

            expect(result.safe).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        it('should accept non-existent paths (ENOENT)', async () => {
            const error: NodeJS.ErrnoException = new Error('ENOENT');
            error.code = 'ENOENT';
            (fs.lstat as jest.Mock) = jest.fn().mockRejectedValue(error);

            const result = await validatePathSafety('/some/path');

            expect(result.safe).toBe(true);
        });

        it('should validate path is within expected parent', async () => {
            (fs.lstat as jest.Mock) = jest.fn().mockResolvedValue({
                isSymbolicLink: () => false,
                isDirectory: () => true,
            });

            const homeDir = os.homedir();
            const safePath = path.join(homeDir, '.demo-builder');

            const result = await validatePathSafety(safePath, homeDir);

            expect(result.safe).toBe(true);
        });

        it('should reject paths outside expected parent', async () => {
            (fs.lstat as jest.Mock) = jest.fn().mockResolvedValue({
                isSymbolicLink: () => false,
                isDirectory: () => true,
            });

            const homeDir = os.homedir();
            const unsafePath = '/etc/passwd';

            const result = await validatePathSafety(unsafePath, homeDir);

            expect(result.safe).toBe(false);
            expect(result.reason).toContain('outside expected directory');
        });
    });
});
