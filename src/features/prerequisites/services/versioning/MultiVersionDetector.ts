/**
 * MultiVersionDetector
 *
 * Detects and manages multiple Node.js versions installed via fnm.
 */

import { buildMajorToFullVersionMap, parseMajorVersions } from './NodeVersionParser';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { fnmStoreProcessEnv } from '@/core/shell/nodeStore';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { Logger } from '@/types/logger';

export interface NodeVersionStatus {
    version: string;
    component: string;
    installed: boolean;
}

/**
 * `fnm list` against Demo Builder's own Node store (PR-1a): the one reader of what
 * is installed. Every check asks the store, because every install lands there; the
 * user's own fnm answering would report a Node the store does not have.
 */
export async function readStoreFnmList(commandManager: Pick<CommandExecutor, 'execute'>): Promise<string> {
    const { stdout } = await commandManager.execute('fnm list', {
        timeout: TIMEOUTS.PREREQUISITE_CHECK,
        shell: DEFAULT_SHELL, // Add shell context for fnm availability (fixes ENOENT errors)
        env: fnmStoreProcessEnv(),
    });
    return stdout;
}

/** The Node majors in Demo Builder's store, ascending. */
export async function listStoreMajors(commandManager: Pick<CommandExecutor, 'execute'>): Promise<string[]> {
    return parseMajorVersions(await readStoreFnmList(commandManager));
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
        const majorToFullVersion = buildMajorToFullVersionMap(await readStoreFnmList(commandManager));

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
        return await listStoreMajors(commandManager);
    } catch (error) {
        logger.warn(`[Prerequisites] Could not get installed Node versions: ${error}`);
        return [];
    }
}
