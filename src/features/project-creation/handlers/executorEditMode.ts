/**
 * Project Creation — edit-mode helpers.
 *
 * The atomic-swap machinery: components install into `components.tmp` first,
 * and only after every install succeeds are they swapped into production —
 * preserving the originals on failure. Extracted from `executor.ts`
 * (2026-08-23 god-file decomposition); behavior unchanged.
 *
 * @module features/project-creation/handlers/executorEditMode
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import type { ProgressTracker } from './shared';
import type { HandlerContext } from '@/types/handlers';

/**
 * Load existing project state for edit mode, used to preserve the original
 * creation date. Failures are non-fatal (logged, returns undefined).
 */
async function loadExistingProjectForEdit(
    projectPath: string,
    context: HandlerContext,
): Promise<import('@/types/base').Project | undefined> {
    context.logger.info(`[Project Edit] Editing existing project at: ${projectPath}`);
    try {
        const existingProject =
            (await context.stateManager.loadProjectFromPath(projectPath)) ?? undefined;
        if (existingProject) {
            context.logger.debug(
                '[Project Edit] Loaded existing project state for creation date preservation',
            );
        }
        return existingProject;
    } catch (error) {
        context.logger.warn(
            `[Project Edit] Could not load existing project state: ${(error as Error).message}`,
        );
        return undefined;
    }
}

/**
 * Prepare the temporary components directory used for the edit-mode atomic swap.
 *
 * Components are installed here first; only after all install successfully are
 * they swapped into production, preserving the originals on failure. Any stale
 * temp directory from a previous failed attempt is removed first.
 *
 * @returns The temp components directory path.
 */
async function prepareEditModeTempDir(
    projectPath: string,
    context: HandlerContext,
): Promise<string> {
    const tempComponentsDir = path.join(projectPath, 'components.tmp');

    // Clean up any stale temp directory from previous failed attempts
    const tempDirExists = await fsPromises
        .access(tempComponentsDir)
        .then(() => true)
        .catch(() => false);
    if (tempDirExists) {
        context.logger.info('[Project Edit] Cleaning up stale temporary components directory');
        await fsPromises.rm(tempComponentsDir, { recursive: true, force: true });
    }

    context.logger.info(
        '[Project Edit] Will install components to temporary directory for atomic swap',
    );
    return tempComponentsDir;
}

/**
 * Perform atomic component swap for edit mode.
 */
async function performAtomicComponentSwap(
    context: HandlerContext,
    project: import('@/types/base').Project,
    projectPath: string,
    progressTracker: ProgressTracker,
): Promise<void> {
    progressTracker('Applying Changes', 71, 'Swapping components...');
    context.logger.info('[Project Edit] Swapping temporary components with production');

    try {
        await swapComponentsDirectory(projectPath, context.logger);

        if (!project.componentInstances || Object.keys(project.componentInstances).length === 0) {
            context.logger.error('[Project Edit] No component instances found after swap');
            throw new Error('Component swap completed but no components found in project state');
        }

        const tempComponentsPath = path.join(projectPath, 'components.tmp');
        const productionComponentsPath = path.join(projectPath, 'components');

        for (const [compId, instance] of Object.entries(project.componentInstances)) {
            if (instance.path && instance.path.startsWith(tempComponentsPath)) {
                const relativePath = path.relative(tempComponentsPath, instance.path);
                const oldPath = instance.path;
                instance.path = path.join(productionComponentsPath, relativePath);
                context.logger.debug(
                    `[Project Edit] Updated path for ${compId}: ${oldPath} → ${instance.path}`,
                );
            }
        }

        await context.stateManager.saveProject(project);
        context.logger.info('[Project Edit] Component swap completed successfully');
    } catch (error) {
        context.logger.error('[Project Edit] Failed to swap components', error as Error);
        throw new Error(
            `Failed to apply component changes: ${(error as Error).message}. ` +
                `The project's original components have been preserved.`,
        );
    }
}

/**
 * Atomically swap temporary components directory with production directory.
 * Uses rename which is atomic on POSIX filesystems (macOS/Linux).
 *
 * Sequence:
 * 1. Rename components → components.backup
 * 2. Rename components.tmp → components
 * 3. Delete components.backup
 *
 * On failure: Attempt to restore from backup
 */
async function swapComponentsDirectory(
    projectPath: string,
    logger: import('@/types/logger').Logger,
): Promise<void> {
    const componentsDir = path.join(projectPath, 'components');
    const tempDir = path.join(projectPath, 'components.tmp');
    const backupDir = path.join(projectPath, 'components.backup');

    logger.debug('[Project Edit] Starting atomic component swap');

    // Pre-flight: Clean up stale backup directory from previous failed attempts
    const staleBackupExists = await fsPromises
        .access(backupDir)
        .then(() => true)
        .catch(() => false);
    if (staleBackupExists) {
        logger.warn('[Project Edit] Found stale backup directory from previous attempt, removing');
        await fsPromises.rm(backupDir, { recursive: true, force: true });
    }

    try {
        // Step 1: Backup existing components (if they exist)
        const componentsExist = await fsPromises
            .access(componentsDir)
            .then(() => true)
            .catch(() => false);
        if (componentsExist) {
            logger.debug('[Project Edit] Backing up existing components');
            await fsPromises.rename(componentsDir, backupDir);
        }

        // Step 2: Promote temp to production (atomic rename)
        logger.debug('[Project Edit] Promoting temporary components to production');
        await fsPromises.rename(tempDir, componentsDir);

        // Step 3: Remove backup on success
        if (componentsExist) {
            logger.debug('[Project Edit] Removing backup components');
            await fsPromises.rm(backupDir, { recursive: true, force: true });
        }

        logger.debug('[Project Edit] Component swap completed successfully');
    } catch (error) {
        // Rollback: If rename failed and backup exists, restore it
        logger.error('[Project Edit] Component swap failed, attempting rollback', error as Error);

        const backupExists = await fsPromises
            .access(backupDir)
            .then(() => true)
            .catch(() => false);
        const componentsExists = await fsPromises
            .access(componentsDir)
            .then(() => true)
            .catch(() => false);

        // If backup exists and components doesn't, restore backup
        if (backupExists && !componentsExists) {
            try {
                await fsPromises.rename(backupDir, componentsDir);
                logger.info('[Project Edit] Restored components from backup');
            } catch (restoreError) {
                logger.error('[Project Edit] Failed to restore backup', restoreError as Error);
                throw new Error(
                    `Component swap failed and rollback failed. ` +
                        `Original components may be at: ${backupDir}. ` +
                        `Error: ${(error as Error).message}`,
                );
            }
        }

        // Clean up temp dir if it still exists
        const tempExists = await fsPromises
            .access(tempDir)
            .then(() => true)
            .catch(() => false);
        if (tempExists) {
            try {
                await fsPromises.rm(tempDir, { recursive: true, force: true });
                logger.debug('[Project Edit] Cleaned up temporary directory');
            } catch (cleanupError) {
                logger.warn(
                    '[Project Edit] Failed to clean up temporary directory',
                    cleanupError as Error,
                );
                // Non-fatal - continue with the original error
            }
        }

        throw error;
    }
}

export { loadExistingProjectForEdit, prepareEditModeTempDir, performAtomicComponentSwap };
