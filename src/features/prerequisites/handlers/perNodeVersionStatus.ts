/**
 * Prerequisite Handlers - per-Node-version install check
 *
 * For tools installed once per Node major (Adobe I/O CLI), runs the tool's
 * check command under each required major and reports which have it.
 */

import { ServiceLocator } from '@/core/di/serviceLocator';
import { toolInstalledUnder } from '@/core/shell/ensureNodeVersion';
import { formatDuration } from '@/core/utils/timeFormatting';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { listStoreMajors } from '@/features/prerequisites/services/versioning/MultiVersionDetector';
import { HandlerContext } from '@/types/handlers';

/**
 * Check per-node-version prerequisite status
 *
 * For prerequisites that must be installed per Node version (like Adobe I/O CLI),
 * checks which Node versions have it installed.
 *
 * Component-driven approach: Tools like Adobe CLI adapt to the Node version they're
 * installed under. This function verifies that each required Node version has the
 * tool installed in its context.
 *
 * @param prereq - Prerequisite definition with perNodeVersion flag
 * @param nodeVersions - Array of Node major versions to check (e.g., ['18', '20', '24'])
 * @param context - Handler context with logger
 * @returns Status object with per-version installation details
 *
 * @example
 * // Check if Adobe CLI is installed for Node 18, 20, and 24
 * const result = await checkPerNodeVersionStatus(
 *     aioCliPrereq,
 *     ['18', '20', '24'],
 *     context
 * );
 * // Returns:
 * // {
 * //   perNodeVersionStatus: [
 * //     { version: 'Node 18', component: '10.0.0', installed: true },
 * //     { version: 'Node 20', component: '', installed: false },
 * //     { version: 'Node 24', component: '10.0.0', installed: true }
 * //   ],
 * //   perNodeVariantMissing: true,
 * //   missingVariantMajors: ['20']
 * // }
 */
export async function checkPerNodeVersionStatus(
    prereq: import('@/features/prerequisites/services/PrerequisitesManager').PrerequisiteDefinition,
    nodeVersions: string[],
    // Narrowed to the one field this reads, so PrerequisitesManager's minimal
    // context calls it without a widening cast.
    context: Pick<HandlerContext, 'logger'>,
): Promise<{
    perNodeVersionStatus: {
        version: string;
        major: string;
        component: string;
        installed: boolean;
    }[];
    perNodeVariantMissing: boolean;
    missingVariantMajors: string[];
}> {
    if (!prereq.perNodeVersion || nodeVersions.length === 0) {
        return {
            perNodeVersionStatus: [],
            perNodeVariantMissing: false,
            missingVariantMajors: [],
        };
    }

    const perNodeVersionStatus: {
        version: string;
        major: string;
        component: string;
        installed: boolean;
    }[] = [];
    const missingVariantMajors: string[] = [];
    const commandManager = ServiceLocator.getCommandExecutor();

    // CRITICAL: Get list of actually installed Node versions FIRST
    // This prevents false positives when fnm falls back to other versions
    const installedMajors = new Set(await listStoreMajors(commandManager));

    // Helper to create version status object
    const createVersionStatus = (major: string, installed: boolean, component = '') => ({
        major,
        version: `Node ${major}`,
        component,
        installed,
        isMissing: !installed,
    });

    // Check all Node versions in parallel using Promise.all
    // Performance: ~50-66% faster than sequential (3 sequential @ 1-2s each = 3-6s → 1 parallel batch @ 1-2s)
    // Each check maintains isolation via fnm exec with specific Node version
    const startTime = Date.now();
    const checkPromises = nodeVersions.map(async (major) => {
        // Scenario 1: Node version not installed on system
        // Skip checking the tool if Node itself isn't installed for this major version
        if (!installedMajors.has(major)) {
            context.logger.debug(
                `[Prerequisites] Node ${major} not installed, skipping ${prereq.name} check for this version`,
            );
            return createVersionStatus(major, false);
        }

        try {
            // Node version is installed - now check if the tool is installed for it
            // Use fnm exec for bulletproof Node version isolation
            const result = await commandManager.execute(prereq.check.command, {
                useNodeVersion: major,
                timeout: TIMEOUTS.PREREQUISITE_CHECK,
            });

            // CRITICAL BUG FIX: Check exit code to determine command success
            // Exit code 0 = success, non-zero = failure (e.g., 127 = command not found)
            // Previously used try-catch which incorrectly treated non-zero exit codes as success
            // A 0 can come from a copy under ANOTHER Node on the PATH, so it counts only
            // when the tool sits beside THIS Node (PR-1a: the one answer the ensure uses).
            const binary = prereq.check.command.trim().split(/\s+/)[0];
            if (result.code === 0 && (await toolInstalledUnder(commandManager, major, binary))) {
                // Scenario 2: Tool is installed and working
                // Parse CLI version if regex provided
                let cliVersion = '';
                if (prereq.check.parseVersion) {
                    try {
                        const match = new RegExp(prereq.check.parseVersion).exec(result.stdout);
                        if (match) cliVersion = match[1] || '';
                    } catch {
                        // Ignore regex parse errors
                    }
                }

                return createVersionStatus(major, true, cliVersion);
            } else {
                // Scenario 3: Command executed but failed (non-zero exit code)
                // Tool is not installed or encountered an error
                return createVersionStatus(major, false);
            }
        } catch {
            // Scenario 4: Process error (ENOENT, timeout, etc.)
            // Different from non-zero exit codes - these are execution failures
            return createVersionStatus(major, false);
        }
    });

    // Wait for all checks to complete in parallel
    const results = await Promise.all(checkPromises);
    const duration = Date.now() - startTime;
    context.logger.debug(
        `[Prerequisites] Parallel check for ${prereq.name} across ${nodeVersions.length} Node versions completed in ${formatDuration(duration)}`,
    );

    // Process results to build status arrays
    for (const result of results) {
        perNodeVersionStatus.push({
            version: result.version,
            major: result.major,
            component: result.component,
            installed: result.installed,
        });
        if (result.isMissing) {
            missingVariantMajors.push(result.major);
        }
    }

    return {
        perNodeVersionStatus,
        perNodeVariantMissing: missingVariantMajors.length > 0,
        missingVariantMajors,
    };
}
