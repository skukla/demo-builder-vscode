/**
 * Security Validation Tests - validateProjectPath (Sync)
 *
 * Tests for the synchronous validateProjectPath function:
 * - Lexical path validation (resolve + startsWith)
 * - Symlink resolution via realpathSync
 * - ENOENT fallback for non-existent paths
 * - Input validation (empty, non-string)
 *
 * Target Coverage: 90%+
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Mock fs module for realpathSync
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    realpathSync: jest.fn(),
}));

import { validateProjectPath } from '@/core/validation/PathSafetyValidator';

const mockRealpathSync = fs.realpathSync as jest.MockedFunction<typeof fs.realpathSync>;

describe('securityValidation - validateProjectPath (sync)', () => {
    const homeDir = os.homedir();
    const allowedBase = path.join(homeDir, '.demo-builder', 'projects');

    beforeEach(() => {
        mockRealpathSync.mockReset();
    });

    // =================================================================
    // Happy Path - Valid Paths
    // =================================================================

    describe('Happy Path - Valid Paths', () => {
        it('should accept path within allowed base when realpathSync confirms', () => {
            const validPath = path.join(allowedBase, 'my-project');
            // realpathSync returns the same path (no symlink)
            mockRealpathSync.mockReturnValue(validPath);

            expect(() => validateProjectPath(validPath)).not.toThrow();
        });

        it('should accept nested path within allowed base', () => {
            const validPath = path.join(allowedBase, 'my-project', 'subdir');
            mockRealpathSync.mockReturnValue(validPath);

            expect(() => validateProjectPath(validPath)).not.toThrow();
        });

        it('should accept path when realpathSync throws ENOENT (path does not exist yet)', () => {
            const newProjectPath = path.join(allowedBase, 'new-project');
            // realpathSync throws ENOENT for non-existent path
            const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
            enoentError.code = 'ENOENT';
            mockRealpathSync.mockImplementation(() => { throw enoentError; });

            // Should fall back to lexical check, which passes
            expect(() => validateProjectPath(newProjectPath)).not.toThrow();
        });
    });

    // =================================================================
    // Symlink Attack Detection
    // =================================================================

    describe('Symlink Attack Detection', () => {
        it('should reject path that resolves via symlink to outside allowed base', () => {
            const symlinkPath = path.join(allowedBase, 'evil');
            // realpathSync reveals the symlink target is /etc
            mockRealpathSync.mockReturnValue('/etc');

            expect(() => validateProjectPath(symlinkPath)).toThrow(
                'Access denied: path outside demo-builder projects directory',
            );
        });

        it('should reject symlink pointing to home directory root', () => {
            const symlinkPath = path.join(allowedBase, 'sneaky');
            mockRealpathSync.mockReturnValue(homeDir);

            expect(() => validateProjectPath(symlinkPath)).toThrow(
                'Access denied: path outside demo-builder projects directory',
            );
        });

        it('should reject symlink pointing to parent of allowed base', () => {
            const symlinkPath = path.join(allowedBase, 'escape');
            const parent = path.join(homeDir, '.demo-builder');
            mockRealpathSync.mockReturnValue(parent);

            expect(() => validateProjectPath(symlinkPath)).toThrow(
                'Access denied: path outside demo-builder projects directory',
            );
        });
    });

    // =================================================================
    // Path Traversal Prevention
    // =================================================================

    describe('Path Traversal Prevention', () => {
        it('should reject path outside allowed base (no symlink involved)', () => {
            const dangerousPath = '/etc/passwd';
            // realpathSync confirms /etc/passwd
            mockRealpathSync.mockReturnValue('/etc/passwd');

            expect(() => validateProjectPath(dangerousPath)).toThrow(
                'Access denied: path outside demo-builder projects directory',
            );
        });

        it('should reject path traversal with .. even when ENOENT', () => {
            // path.resolve normalizes the traversal: allowedBase/../../../etc => /etc
            const traversalPath = path.join(allowedBase, '..', '..', '..', 'etc');
            const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
            enoentError.code = 'ENOENT';
            mockRealpathSync.mockImplementation(() => { throw enoentError; });

            expect(() => validateProjectPath(traversalPath)).toThrow(
                'Access denied: path outside demo-builder projects directory',
            );
        });
    });

    // =================================================================
    // Input Validation
    // =================================================================

    describe('Input Validation', () => {
        it('should throw for empty string', () => {
            expect(() => validateProjectPath('')).toThrow(
                'Path must be a non-empty string',
            );
        });

        it('should throw for non-string input', () => {
            expect(() => validateProjectPath(null as unknown as string)).toThrow(
                'Path must be a non-empty string',
            );
        });

        it('should throw for undefined input', () => {
            expect(() => validateProjectPath(undefined as unknown as string)).toThrow(
                'Path must be a non-empty string',
            );
        });
    });

    // =================================================================
    // Edge Cases
    // =================================================================

    describe('Edge Cases', () => {
        it('should handle realpathSync throwing non-ENOENT error by re-throwing', () => {
            const validLookingPath = path.join(allowedBase, 'project');
            const eaccesError = new Error('EACCES') as NodeJS.ErrnoException;
            eaccesError.code = 'EACCES';
            mockRealpathSync.mockImplementation(() => { throw eaccesError; });

            // Non-ENOENT errors should propagate (conservative - deny access)
            expect(() => validateProjectPath(validLookingPath)).toThrow('EACCES');
        });

        it('should call realpathSync with the resolved path', () => {
            const validPath = path.join(allowedBase, 'my-project');
            mockRealpathSync.mockReturnValue(validPath);

            validateProjectPath(validPath);

            expect(mockRealpathSync).toHaveBeenCalledWith(
                path.resolve(path.normalize(validPath)),
            );
        });
    });
});
