/**
 * VersionSatisfactionChecker
 *
 * Checks if installed Node versions satisfy required version families.
 */

import * as semver from 'semver';
import { ServiceLocator } from '@/core/di';
import { TIMEOUTS, formatDuration } from '@/core/utils';
import { DEFAULT_SHELL } from '@/types/shell';
import { Logger } from '@/types/logger';
import { parseInstalledVersions, isValidVersionFamily } from './NodeVersionParser';

interface VersionSatisfactionResult {
    satisfied: boolean;
    matchingVersion?: string;
}

/**
 * Check if ANY installed Node version satisfies the required version family
 *
 * Component-driven approach: This checks if a component's Node version requirement
 * is already satisfied by an installed version. Uses semver for flexible matching.
 *
 * @param requiredFamily - Version family (e.g., '24' for 24.x)
 * @param logger - Logger instance
 * @returns Result with satisfaction status and matching version if found
 *
 * @example
 * // Component requires Node 24
 * // Installed: Node 24.0.10, Node 18.20.0
 * await checkVersionSatisfaction('24', logger) // → { satisfied: true, matchingVersion: '24.0.10' }
 *
 * @example
 * // Component requires Node 22
 * // Installed: Node 24.0.10, Node 18.20.0
 * await checkVersionSatisfaction('22', logger) // → { satisfied: false }
 */
export async function checkVersionSatisfaction(
    requiredFamily: string,
    logger: Logger,
): Promise<VersionSatisfactionResult> {
    const startTime = Date.now();
    logger.debug(`[Version Satisfaction] Checking if Node ${requiredFamily}.x is satisfied`);

    // SECURITY: Validate requiredFamily to prevent injection (defense-in-depth)
    // Only allow digits (e.g., "18", "20", "22")
    if (!isValidVersionFamily(requiredFamily)) {
        logger.warn(`[Version Satisfaction] Invalid version family rejected: ${requiredFamily}`);
        return { satisfied: false };
    }

    try {
        const commandManager = ServiceLocator.getCommandExecutor();
        const fnmListResult = await commandManager.execute('fnm list', {
            timeout: TIMEOUTS.PREREQUISITE_CHECK,
            shell: DEFAULT_SHELL,
        });

        const installedVersions = parseInstalledVersions(fnmListResult.stdout);
        const semverRange = `${requiredFamily}.x`;

        // Check if any installed version satisfies the required family
        let matchingVersion: string | undefined;
        const satisfied = installedVersions.some(version => {
            const matches = semver.satisfies(version, semverRange);
            if (matches) {
                matchingVersion = version;
                logger.debug(`[Version Satisfaction] ✓ Node ${version} satisfies ${semverRange}`);
            }
            return matches;
        });

        const duration = Date.now() - startTime;
        if (satisfied) {
            logger.debug(`[Version Satisfaction] ✓ Node ${requiredFamily}.x satisfied in ${formatDuration(duration)}`);
        } else {
            logger.debug(`[Version Satisfaction] ✗ Node ${requiredFamily}.x NOT satisfied (${formatDuration(duration)}) - installed: ${installedVersions.join(', ')}`);
        }

        return { satisfied, matchingVersion };
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.warn(`[Version Satisfaction] Error checking Node ${requiredFamily}.x after ${formatDuration(duration)}: ${error}`);
        return { satisfied: false }; // Safe default: not satisfied
    }
}
