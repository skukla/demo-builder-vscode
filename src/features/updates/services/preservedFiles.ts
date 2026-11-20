/**
 * The files a template sync keeps from the SC's repository.
 *
 * Read before the template's content lands and written back after it, so a
 * storefront keeps its own `fstab.yaml` and `config.json` (and any extras the caller
 * names). Split from `templateSyncService.ts`, which owns the clone and the git steps.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Logger } from '@/types/logger';

/** Every file under `dir`, as paths relative to `repoDir`. */
async function filesUnder(repoDir: string, dir: string): Promise<string[]> {
    const entries = await fs.readdir(path.join(repoDir, dir), { withFileTypes: true });
    const nested = await Promise.all(
        entries.map((entry) => {
            const relative = path.join(dir, entry.name);
            return entry.isDirectory() ? filesUnder(repoDir, relative) : Promise.resolve([relative]);
        }),
    );
    return nested.flat();
}

/** A preserved path's files and their bytes: the file itself, or every file in a folder. */
async function readPreserved(repoDir: string, preserved: string): Promise<Array<[string, Buffer]>> {
    try {
        return [[preserved, await fs.readFile(path.join(repoDir, preserved))]];
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EISDIR') throw error;
        const files = await filesUnder(repoDir, preserved);
        return Promise.all(files.map(async (file): Promise<[string, Buffer]> => [file, await fs.readFile(path.join(repoDir, file))]));
    }
}

/**
 * Read each preserved path that exists; a missing one is skipped, not an error. A folder is kept
 * whole, every file in it (an installed block library's `blocks/<id>`, kept through a replace;
 * owner walk 2026-11-19). Bytes, not text, so an image comes back as it went.
 */
export async function backupPreservedFiles(
    repoDir: string,
    preserveFiles: string[],
    logger: Logger,
): Promise<Map<string, Buffer>> {
    const backups = new Map<string, Buffer>();

    for (const filePath of preserveFiles) {
        try {
            for (const [file, content] of await readPreserved(repoDir, filePath)) backups.set(file, content);
            logger.debug(`[TemplateSync] Backed up ${filePath}`);
        } catch {
            logger.debug(`[TemplateSync] File ${filePath} not found, skipping backup`);
        }
    }

    return backups;
}

/** Write each backup back, creating its directory first; a failed write is warned about. */
export async function restorePreservedFiles(
    repoDir: string,
    backups: Map<string, Buffer>,
    logger: Logger,
): Promise<void> {
    for (const [filePath, content] of backups) {
        const fullPath = path.join(repoDir, filePath);
        try {
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, content);
            logger.debug(`[TemplateSync] Restored ${filePath}`);
        } catch (error) {
            logger.warn(`[TemplateSync] Failed to restore ${filePath}: ${(error as Error).message}`);
        }
    }
}

/**
 * Remove each of `files` the backup did not hold. The SC's repository did not have
 * it, so the template's copy does not stay either: a replace keeps the label folder
 * as the storefront had it (EDS-53).
 */
export async function removeFilesNotBackedUp(
    repoDir: string,
    files: readonly string[],
    backups: Map<string, Buffer>,
    logger: Logger,
): Promise<void> {
    for (const filePath of files) {
        if (backups.has(filePath)) continue;
        await fs.rm(path.join(repoDir, filePath), { force: true });
        logger.debug(`[TemplateSync] Kept ${filePath} absent`);
    }
}
