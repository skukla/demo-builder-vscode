/**
 * Deletes a block's code folder from the storefront checkout — the first step of
 * `remove_block_from_library`. The DA.live block list follows the storefront's code
 * (EDS-71 step 5, owner 2026-11-23: one rule, no hide list), so removing a block is
 * deleting its code; its page and row go after, and putting the code back undoes it.
 *
 * @module mcp/blockRemoval
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { isBlockName } from '@/features/eds/services/blockLibrary/blockTable';

/**
 * Throws unless `blockId` is a block name: lowercase words joined by hyphens. That rule
 * also refuses every path that could leave `blocks/` (no `.`, no `/`, no `\`).
 */
export function assertBlockName(blockId: string): void {
    if (!isBlockName(blockId)) {
        throw new Error(
            `"${blockId}" is not a block name: use the block's folder name under blocks/ `
                + '(lowercase words joined by hyphens).',
        );
    }
}

const isMissing = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';

/**
 * Deletes `<storefrontPath>/blocks/<blockId>/`. `'absent'` when there is no such folder,
 * so a block whose code is already gone is not a failure. Throws on an invalid name, or
 * when the folder exists and cannot be deleted (nothing else has been touched yet).
 */
export async function deleteBlockCode(
    storefrontPath: string,
    blockId: string,
): Promise<'deleted' | 'absent'> {
    assertBlockName(blockId);
    const blocksDir = path.join(storefrontPath, 'blocks');
    const blockDir = path.join(blocksDir, blockId);
    if (path.dirname(blockDir) !== blocksDir) {
        throw new Error(`Block folder ${blockDir} is not directly inside ${blocksDir}`);
    }
    try {
        await fsPromises.lstat(blockDir);
    } catch (error) {
        if (isMissing(error)) return 'absent';
        throw error;
    }
    await fsPromises.rm(blockDir, { recursive: true });
    return 'deleted';
}
