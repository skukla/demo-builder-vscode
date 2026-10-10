/**
 * MultiVersionDetector
 *
 * Detects and manages multiple Node.js versions installed via fnm.
 */

import { buildMajorToFullVersionMap } from './NodeVersionParser';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { listNodeFolderMajors, readNodeFolderList } from '@/core/shell/nodeFolder';
import { Logger } from '@/types/logger';

export interface NodeVersionStatus {
    version: string;
    component: string;
    installed: boolean;
}

/**
 * Check multiple Node versions against installed versions
 * @param versionToComponentMapping - Map of version family to component name
 * @param logger - Logger instance
 * @returns Array of version status objects
 */
export async function checkMultipleNodeVersions(
    versionToComponentMapping: Record<string, string>,
    commandManager: CommandExecutor,
    logger: Logger,
): Promise<NodeVersionStatus[]> {
    const results: NodeVersionStatus[] = [];

    try {
        const majorToFullVersion = buildMajorToFullVersionMap(await readNodeFolderList(commandManager));

        // Check each required version
        for (const [version, componentName] of Object.entries(versionToComponentMapping)) {
            const fullVersion = majorToFullVersion.get(version);
            results.push({
                version: fullVersion ? `Node ${fullVersion}` : `Node ${version}`,
                component: componentName,
                installed: majorToFullVersion.has(version),
            });
        }

    } catch (error) {
        logger.warn(`Could not check installed Node versions: ${error}`);
        // Return all as not installed if we can't check
        for (const [version, componentName] of Object.entries(versionToComponentMapping)) {
            results.push({
                version: `Node ${version}`,
                component: componentName,
                installed: false,
            });
        }
    }

    return results;
}

/**
 * Get installed Node major versions (e.g., ['18', '20', '24'])
 * Used for checking perNodeVersion prerequisites against all installed Node versions
 * @param logger - Logger instance
 * @returns Array of Node major versions
 */
export async function getInstalledNodeVersions(
    commandManager: CommandExecutor,
    logger: Logger,
): Promise<string[]> {
    try {
        return await listNodeFolderMajors(commandManager);
    } catch (error) {
        logger.warn(`[Prerequisites] Could not get installed Node versions: ${error}`);
        return [];
    }
}
