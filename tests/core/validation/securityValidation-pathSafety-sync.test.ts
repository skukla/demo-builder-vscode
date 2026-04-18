/**
 * Security Validation Tests - validateProjectPath (Sync)
 *
 * Tests for the synchronous validateProjectPath function, which delegates to
 * assertPathInsideSync with the hardcoded ~/.demo-builder/projects/ base.
 *
 * The mock pattern: realpathSync is an identity function by default (returns
 * its input). Tests override per-path behavior to simulate symlinks and ENOENT.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    realpathSync: jest.fn(),
}));

import { validateProjectPath } from '@/core/validation/PathSafetyValidator';

const mockRealpathSync = fs.realpathSync as jest.MockedFunction<typeof fs.realpathSync>;

const homeDir = os.homedir();
const allowedBase = path.join(homeDir, '.demo-builder', 'projects');

/** Default: realpathSync returns the path it receives (no symlinks) */
function setupIdentityRealpath(): void {
    mockRealpathSync.mockImplementation((p) => p as string);
}

/** Simulate: target path is a symlink resolving to `target` */
function setupSymlink(symlinkPath: string, target: string): void {
    mockRealpathSync.mockImplementation((p) => {
        if (path.resolve(String(p)) === path.resolve(symlinkPath)) return target;
        return p as string;
    });
}

/** Simulate: target path throws ENOENT (doesn't exist) */
function setupEnoent(missingPath: string): void {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockRealpathSync.mockImplementation((p) => {
        if (path.resolve(String(p)) === path.resolve(missingPath)) throw enoent;
        return p as string; // base and parent resolve normally
    });
}

/** Simulate: both target AND parent throw ENOENT */
function setupParentAlsoMissing(missingPath: string): void {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    const parent = path.dirname(path.resolve(missingPath));
    mockRealpathSync.mockImplementation((p) => {
        const resolved = path.resolve(String(p));
        if (resolved === path.resolve(missingPath) || resolved === parent) throw enoent;
        return p as string;
    });
}

describe('securityValidation - validateProjectPath (sync)', () => {
    beforeEach(() => {
        mockRealpathSync.mockReset();
    });

    describe('Happy Path', () => {
        it('should accept path within allowed base', () => {
            setupIdentityRealpath();
            expect(() => validateProjectPath(path.join(allowedBase, 'my-project'))).not.toThrow();
        });

        it('should accept nested path within allowed base', () => {
            setupIdentityRealpath();
            expect(() => validateProjectPath(path.join(allowedBase, 'project', 'subdir'))).not.toThrow();
        });

        it('should accept path when target ENOENT but parent exists', () => {
            setupEnoent(path.join(allowedBase, 'new-project'));
            expect(() => validateProjectPath(path.join(allowedBase, 'new-project'))).not.toThrow();
        });
    });

    describe('Symlink Attack Detection', () => {
        it('should reject symlink resolving outside allowed base', () => {
            setupSymlink(path.join(allowedBase, 'evil'), '/etc');
            expect(() => validateProjectPath(path.join(allowedBase, 'evil'))).toThrow(/escapes allowed directory/i);
        });

        it('should reject symlink pointing to home directory root', () => {
            setupSymlink(path.join(allowedBase, 'sneaky'), homeDir);
            expect(() => validateProjectPath(path.join(allowedBase, 'sneaky'))).toThrow(/escapes allowed directory/i);
        });

        it('should reject symlink pointing to parent of allowed base', () => {
            setupSymlink(path.join(allowedBase, 'escape'), path.join(homeDir, '.demo-builder'));
            expect(() => validateProjectPath(path.join(allowedBase, 'escape'))).toThrow(/escapes allowed directory/i);
        });
    });

    describe('Path Traversal Prevention', () => {
        it('should reject path outside allowed base', () => {
            setupIdentityRealpath();
            expect(() => validateProjectPath('/etc/passwd')).toThrow(/escapes allowed directory/i);
        });

        it('should reject path traversal with .. even when ENOENT', () => {
            const traversalPath = path.join(allowedBase, '..', '..', '..', 'etc');
            setupEnoent(traversalPath);
            expect(() => validateProjectPath(traversalPath)).toThrow(/escapes allowed directory/i);
        });

        it('should reject when both target and parent do not exist', () => {
            setupParentAlsoMissing(path.join(allowedBase, 'deep', 'nested', 'path'));
            expect(() => validateProjectPath(path.join(allowedBase, 'deep', 'nested', 'path'))).toThrow(/Cannot verify path safety/i);
        });
    });

    describe('Input Validation', () => {
        it('should reject empty string', () => {
            expect(() => validateProjectPath('')).toThrow(/non-empty string/i);
        });

        it('should reject non-string input', () => {
            expect(() => validateProjectPath(null as unknown as string)).toThrow(/non-empty string/i);
        });

        it('should re-throw non-ENOENT errors from realpathSync', () => {
            mockRealpathSync.mockImplementation((p) => {
                if (String(p).includes('my-project')) throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
                return p as string;
            });
            expect(() => validateProjectPath(path.join(allowedBase, 'my-project'))).toThrow(/EACCES/);
        });
    });
});
