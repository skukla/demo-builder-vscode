/**
 * Atomic file write helper.
 *
 * @module core/utils/writeFileAtomic
 */

import * as fs from 'fs/promises';

/**
 * Write a file atomically: write the content to a sibling `.tmp` file, then
 * rename it over the target. `rename(2)` is atomic on POSIX, so concurrent
 * readers never observe a partial write and a crash mid-write leaves the
 * original file intact. The temp file is removed on failure.
 *
 * This is deliberately vscode-free (only `fs/promises`) so it can be shared by
 * the standalone, vscode-free MCP server as well as the extension's state layer.
 *
 * @param filePath - Absolute path of the file to write
 * @param content - File contents (written as UTF-8)
 */
export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
    const tempPath = `${filePath}.tmp`;

    try {
        await fs.writeFile(tempPath, content);
        await fs.rename(tempPath, filePath);
    } catch (error) {
        // Best-effort cleanup of the temp file (may not exist if write failed early).
        try {
            await fs.unlink(tempPath);
        } catch {
            // Ignore cleanup failures — surface the original error instead.
        }
        throw error;
    }
}
