/**
 * Path Safety Validator
 *
 * Validates file paths for security, preventing:
 * - Path traversal attacks (../)
 * - Symlink attacks
 * - Access outside allowed directories
 */

import * as fs from 'fs';
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

// ─── Path containment (shared by VS Code handlers and standalone MCP server) ──

/**
 * Verify that `targetPath` resolves to a location inside `allowedBase`,
 * accounting for symlinks. Returns the canonical (realpath-resolved) target path.
 *
 * Three-branch resolution strategy:
 *   1. `realpath(targetPath)` succeeds → file exists, all symlinks resolved
 *   2. `realpath(targetPath)` throws ENOENT → file is new; resolve parent
 *      directory to catch intermediate symlinks, then append the leaf name
 *   3. Parent also doesn't exist → reject (cannot safely verify)
 *
 * Note: inherent TOCTOU gap between validation and use. A symlink could be
 * created after this check. Acceptable for a local desktop extension where
 * an attacker with that access has already compromised the session.
 *
 * @param targetPath - Path to validate (absolute or relative)
 * @param allowedBase - Directory the target must reside within
 * @returns The canonical resolved path
 * @throws Error if the path escapes `allowedBase` or cannot be verified
 */
export function assertPathInsideSync(targetPath: string, allowedBase: string): string {
    if (!targetPath || typeof targetPath !== 'string') {
        throw new Error('Path must be a non-empty string');
    }

    const resolved = path.resolve(path.normalize(targetPath));

    // Canonicalize the allowed base (handles macOS /tmp → /private/tmp)
    let realBase: string;
    try {
        realBase = fs.realpathSync(allowedBase);
    } catch {
        realBase = path.resolve(allowedBase);
    }

    // Branch 1: file exists — resolve all symlinks
    // Branch 2: file doesn't exist — resolve parent to catch intermediate symlinks
    // Branch 3: parent doesn't exist — reject
    let realResolved: string;
    try {
        realResolved = fs.realpathSync(resolved);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            try {
                const realParent = fs.realpathSync(path.dirname(resolved));
                realResolved = path.join(realParent, path.basename(resolved));
            } catch {
                throw new Error(`Cannot verify path safety: parent directory does not exist for ${resolved}`);
            }
        } else {
            throw error;
        }
    }

    if (!realResolved.startsWith(realBase + path.sep) && realResolved !== realBase) {
        throw new Error(`Path escapes allowed directory: ${realResolved}`);
    }

    return realResolved;
}

/**
 * Async variant of {@link assertPathInsideSync}.
 * Used by the standalone MCP server (which uses async fs throughout).
 */
export async function assertPathInside(targetPath: string, allowedBase: string): Promise<string> {
    if (!targetPath || typeof targetPath !== 'string') {
        throw new Error('Path must be a non-empty string');
    }

    const resolved = path.resolve(path.normalize(targetPath));

    let realBase: string;
    try {
        realBase = await fsPromises.realpath(allowedBase);
    } catch {
        realBase = path.resolve(allowedBase);
    }

    let realResolved: string;
    try {
        realResolved = await fsPromises.realpath(resolved);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        try {
            const realParent = await fsPromises.realpath(path.dirname(resolved));
            realResolved = path.join(realParent, path.basename(resolved));
        } catch {
            throw new Error(`Cannot verify path safety: parent directory does not exist for ${resolved}`);
        }
    }

    if (!realResolved.startsWith(realBase + path.sep) && realResolved !== realBase) {
        throw new Error(`Path escapes allowed directory: ${realResolved}`);
    }

    return realResolved;
}

// ─── Convenience wrappers ────────────────────────────────────────────────────

const PROJECTS_BASE = path.join(os.homedir(), '.demo-builder', 'projects');

/**
 * Validate that a path is inside the demo-builder projects directory.
 * Thin wrapper over {@link assertPathInsideSync} with the hardcoded base.
 *
 * @throws Error if path is outside `~/.demo-builder/projects/`
 */
export function validateProjectPath(providedPath: string): void {
    assertPathInsideSync(providedPath, PROJECTS_BASE);
}
