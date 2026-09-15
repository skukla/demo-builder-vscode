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

/** Read each preserved file that exists; a missing one is skipped, not an error. */
export async function backupPreservedFiles(
    repoDir: string,
    preserveFiles: string[],
    logger: Logger,
): Promise<Map<string, string>> {
    const backups = new Map<string, string>();

    for (const filePath of preserveFiles) {
        const fullPath = path.join(repoDir, filePath);
        try {
            const content = await fs.readFile(fullPath, 'utf-8');
            backups.set(filePath, content);
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
    backups: Map<string, string>,
    logger: Logger,
): Promise<void> {
    for (const [filePath, content] of backups) {
        const fullPath = path.join(repoDir, filePath);
        try {
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, content, 'utf-8');
            logger.debug(`[TemplateSync] Restored ${filePath}`);
        } catch (error) {
            logger.warn(`[TemplateSync] Failed to restore ${filePath}: ${(error as Error).message}`);
        }
    }
}
