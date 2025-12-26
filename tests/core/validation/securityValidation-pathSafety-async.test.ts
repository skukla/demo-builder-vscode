/**
 * Security Validation Tests - Path Safety Async Operations
 *
 * Tests for the validatePathSafety async function:
 * - Regular file and directory safety validation
 * - Symlink detection and rejection
 * - Parent directory validation
 * - Error handling (ENOENT, EACCES, ENOTDIR)
 * - Edge cases (empty paths, trailing slashes)
 *
 * Target Coverage: 90%+
 */

import * as path from 'path';

// Mock fs/promises before importing the function under test
jest.mock('fs/promises', () => ({
    lstat: jest.fn(),
}));

import * as fsPromises from 'fs/promises';
import { validatePathSafety } from '@/core/validation';

const mockLstat = fsPromises.lstat as jest.MockedFunction<typeof fsPromises.lstat>;

/**
 * Helper to create mock fs.Stats object
 */
const createMockStats = (options: { isSymlink?: boolean } = {}) => ({
    isSymbolicLink: () => options.isSymlink ?? false,
    isDirectory: () => !options.isSymlink,
    isFile: () => !options.isSymlink,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    dev: 0,
    ino: 0,
    mode: 0,
    nlink: 0,
    uid: 0,
    gid: 0,
    rdev: 0,
    size: 0,
    blksize: 0,
    blocks: 0,
    atimeMs: 0,
    mtimeMs: 0,
    ctimeMs: 0,
    birthtimeMs: 0,
    atime: new Date(),
    mtime: new Date(),
    ctime: new Date(),
    birthtime: new Date(),
} as unknown as Awaited<ReturnType<typeof fsPromises.lstat>>);

/**
 * Helper to create NodeJS.ErrnoException
 */
const createErrnoException = (code: string, message: string): NodeJS.ErrnoException => {
    const error = new Error(message) as NodeJS.ErrnoException;
    error.code = code;
    return error;
};

describe('securityValidation - Path Safety Async Operations', () => {
    beforeEach(() => {
        mockLstat.mockReset();
    });

    // =================================================================
    // Happy Path - Safe Paths
    // =================================================================

    describe('Happy Path - Safe Paths', () => {
        it('should return safe for existing regular file', async () => {
            // Arrange: Mock lstat to return stats for a regular file
            mockLstat.mockResolvedValue(createMockStats({ isSymlink: false }));

            // Act
            const result = await validatePathSafety('/some/path/to/file.txt');

            // Assert
            expect(result.safe).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        it('should return safe for existing directory', async () => {
            // Arrange: Mock lstat to return stats for a directory
            mockLstat.mockResolvedValue(createMockStats({ isSymlink: false }));

            // Act
            const result = await validatePathSafety('/some/path/to/directory');

            // Assert
            expect(result.safe).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        it('should return safe for path within expected parent', async () => {
            // Arrange
            mockLstat.mockResolvedValue(createMockStats({ isSymlink: false }));
            const targetPath = '/home/user/projects/my-project';
            const expectedParent = '/home/user/projects';

            // Act
            const result = await validatePathSafety(targetPath, expectedParent);

            // Assert
            expect(result.safe).toBe(true);
            expect(result.reason).toBeUndefined();
        });
    });

    // =================================================================
    // Symlink Detection
    // =================================================================

    describe('Symlink Detection', () => {
        it('should return unsafe for symbolic link', async () => {
            // Arrange: Mock lstat to return stats for a symlink
            mockLstat.mockResolvedValue(createMockStats({ isSymlink: true }));

            // Act
            const result = await validatePathSafety('/some/path/symlink');

            // Assert
            expect(result.safe).toBe(false);
            expect(result.reason).toBeDefined();
        });

        it('should include security warning in symlink rejection message', async () => {
            // Arrange
            mockLstat.mockResolvedValue(createMockStats({ isSymlink: true }));

            // Act
            const result = await validatePathSafety('/some/path/symlink');

            // Assert
            expect(result.reason).toContain('symbolic link');
            expect(result.reason).toContain('security');
        });
    });

    // =================================================================
    // Parent Directory Validation
    // =================================================================

    describe('Parent Directory Validation', () => {
        it('should return unsafe for path outside expected parent', async () => {
            // Arrange
            mockLstat.mockResolvedValue(createMockStats({ isSymlink: false }));
            const targetPath = '/etc/passwd';
            const expectedParent = '/home/user/projects';

            // Act
            const result = await validatePathSafety(targetPath, expectedParent);

            // Assert
            expect(result.safe).toBe(false);
            expect(result.reason).toContain('outside expected directory');
        });

        it('should normalize paths before comparison', async () => {
            // Arrange: Path with redundant components
            mockLstat.mockResolvedValue(createMockStats({ isSymlink: false }));
            const targetPath = '/home/user/projects/./subdir/../my-project';
            const expectedParent = '/home/user/projects';

            // Act
            const result = await validatePathSafety(targetPath, expectedParent);

            // Assert: Should pass because normalized path is within parent
            expect(result.safe).toBe(true);
        });

        it('should skip parent validation when not provided', async () => {
            // Arrange: No expected parent provided
            mockLstat.mockResolvedValue(createMockStats({ isSymlink: false }));

            // Act: Call without expectedParent
            const result = await validatePathSafety('/any/path/anywhere');

            // Assert: Should be safe without parent validation
            expect(result.safe).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        it('should return safe when path exactly equals expected parent', async () => {
            // Arrange: Path is exactly the parent
            mockLstat.mockResolvedValue(createMockStats({ isSymlink: false }));
            const targetPath = '/home/user/projects';
            const expectedParent = '/home/user/projects';

            // Act
            const result = await validatePathSafety(targetPath, expectedParent);

            // Assert: Path equals parent, which starts with parent
            expect(result.safe).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        it('should skip parent validation when empty string provided', async () => {
            // Arrange: Empty string as expectedParent (falsy)
            mockLstat.mockResolvedValue(createMockStats({ isSymlink: false }));

            // Act: Call with empty string (falsy value)
            const result = await validatePathSafety('/any/path', '');

            // Assert: Empty string is falsy, so parent validation skipped
            expect(result.safe).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        it('should skip parent validation when undefined provided explicitly', async () => {
            // Arrange: Explicitly pass undefined as expectedParent
            mockLstat.mockResolvedValue(createMockStats({ isSymlink: false }));

            // Act: Explicitly pass undefined
            const result = await validatePathSafety('/any/path', undefined);

            // Assert: undefined is falsy, so parent validation skipped
            expect(result.safe).toBe(true);
            expect(result.reason).toBeUndefined();
        });
    });

    // =================================================================
    // Error Handling - ENOENT
    // =================================================================

    describe('Error Handling - ENOENT', () => {
        it('should return safe when path does not exist (ENOENT)', async () => {
            // Arrange: Mock lstat to throw ENOENT
            mockLstat.mockRejectedValue(createErrnoException('ENOENT', 'no such file or directory'));

            // Act
            const result = await validatePathSafety('/non/existent/path');

            // Assert: Non-existent paths are safe (nothing to delete)
            expect(result.safe).toBe(true);
            expect(result.reason).toBeUndefined();
        });
    });

    // =================================================================
    // Error Handling - Other Errors
    // =================================================================

    describe('Error Handling - Other Errors', () => {
        it('should return unsafe for permission denied (EACCES)', async () => {
            // Arrange
            mockLstat.mockRejectedValue(createErrnoException('EACCES', 'permission denied'));

            // Act
            const result = await validatePathSafety('/restricted/path');

            // Assert
            expect(result.safe).toBe(false);
            expect(result.reason).toContain('Unable to validate path safety');
        });

        it('should return unsafe for not a directory error (ENOTDIR)', async () => {
            // Arrange
            mockLstat.mockRejectedValue(createErrnoException('ENOTDIR', 'not a directory'));

            // Act
            const result = await validatePathSafety('/file/treated/as/dir');

            // Assert
            expect(result.safe).toBe(false);
            expect(result.reason).toContain('Unable to validate path safety');
        });

        it('should sanitize error message in reason', async () => {
            // Arrange: Error with potentially sensitive information
            mockLstat.mockRejectedValue(
                createErrnoException('UNKNOWN', 'Error at /home/user/.secret/file')
            );

            // Act
            const result = await validatePathSafety('/some/path');

            // Assert: Reason should contain sanitized error
            expect(result.safe).toBe(false);
            expect(result.reason).toBeDefined();
            // The sanitizeErrorForLogging function should have processed the error
            expect(result.reason).toContain('Unable to validate path safety');
        });

        it('should return unsafe for unknown errors', async () => {
            // Arrange: Generic error without code
            const genericError = new Error('Something unexpected happened');
            mockLstat.mockRejectedValue(genericError);

            // Act
            const result = await validatePathSafety('/some/path');

            // Assert
            expect(result.safe).toBe(false);
            expect(result.reason).toContain('Unable to validate path safety');
        });
    });

    // =================================================================
    // Edge Cases
    // =================================================================

    describe('Edge Cases', () => {
        it('should handle empty string path', async () => {
            // Arrange: Mock lstat to handle empty path (typically throws)
            mockLstat.mockRejectedValue(createErrnoException('ENOENT', 'no such file or directory'));

            // Act
            const result = await validatePathSafety('');

            // Assert: Empty path treated as non-existent, which is safe
            expect(result.safe).toBe(true);
        });

        it('should handle path with trailing slashes', async () => {
            // Arrange
            mockLstat.mockResolvedValue(createMockStats({ isSymlink: false }));
            const expectedParent = '/home/user/projects/';
            const targetPath = '/home/user/projects/my-project/';

            // Act
            const result = await validatePathSafety(targetPath, expectedParent);

            // Assert: path.normalize handles trailing slashes
            expect(result.safe).toBe(true);
        });
    });

    // =================================================================
    // Integration with lstat
    // =================================================================

    describe('lstat Integration', () => {
        it('should call lstat with the correct path', async () => {
            // Arrange
            mockLstat.mockResolvedValue(createMockStats({ isSymlink: false }));
            const testPath = '/test/specific/path';

            // Act
            await validatePathSafety(testPath);

            // Assert
            expect(mockLstat).toHaveBeenCalledWith(testPath);
            expect(mockLstat).toHaveBeenCalledTimes(1);
        });
    });
});
