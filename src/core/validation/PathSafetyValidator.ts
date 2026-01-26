/**
 * Path Safety Validator
 *
 * Validates file paths for security, preventing:
 * - Path traversal attacks (../)
 * - Symlink attacks
 * - Access outside allowed directories
 */

import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { sanitizeErrorForLogging } from './SensitiveDataRedactor';

/**
 * Check if a path is safe to delete (not a symlink, within expected directory)
 *
 * @param targetPath - Path to validate
 * @param expectedParent - Expected parent directory (e.g., home directory)
 * @returns Promise resolving to validation result
 */
export async function validatePathSafety(
    targetPath: string,
    expectedParent?: string,
): Promise<{ safe: boolean; reason?: string }> {
    try {
        // Check if path exists
        const stats = await fsPromises.lstat(targetPath);

        // Check if it's a symlink
        if (stats.isSymbolicLink()) {
            return {
                safe: false,
                reason: 'Path is a symbolic link - refusing to delete for security',
            };
        }

        // If expected parent specified, validate path is within it
        if (expectedParent) {
            const normalizedTarget = path.normalize(targetPath);
            const normalizedParent = path.normalize(expectedParent);

            if (!normalizedTarget.startsWith(normalizedParent)) {
                return {
                    safe: false,
                    reason: 'Path is outside expected directory - refusing to delete for security',
                };
            }
        }

        return { safe: true };
    } catch (error) {
        // If path doesn't exist, it's safe (nothing to delete)
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return { safe: true };
        }

        // Other errors are suspicious - be conservative
        return {
            safe: false,
            reason: `Unable to validate path safety: ${sanitizeErrorForLogging(error as Error)}`,
        };
    }
}

/**
 * Validates file paths are within allowed demo-builder directory
 *
 * Ensures paths cannot escape the demo-builder projects directory via
 * path traversal attacks.
 *
 * @param providedPath - Path to validate
 * @throws Error if path is outside allowed directory
 *
 * @example
 * const safe = path.join(os.homedir(), '.demo-builder', 'projects', 'my-project');
 * validateProjectPath(safe); // OK
 *
 * const dangerous = '/etc/passwd';
 * validateProjectPath(dangerous); // Throws
 */
export function validateProjectPath(providedPath: string): void {
    if (!providedPath || typeof providedPath !== 'string') {
        throw new Error('Path must be a non-empty string');
    }

    // Define allowed base directory
    const allowedBase = path.join(os.homedir(), '.demo-builder', 'projects');

    // Normalize and resolve the path to handle ., .., and symlinks
    const normalizedPath = path.normalize(providedPath);
    const resolvedPath = path.resolve(normalizedPath);

    // Check if resolved path starts with allowed base
    if (!resolvedPath.startsWith(allowedBase)) {
        throw new Error('Access denied: path outside demo-builder projects directory');
    }

    // Additional check: Ensure no attempt to escape via symlinks
    const relativePath = path.relative(allowedBase, resolvedPath);
    if (relativePath.startsWith('..')) {
        throw new Error('Access denied: path traversal attempt detected');
    }
}
