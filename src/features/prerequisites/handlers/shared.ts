/**
 * Prerequisite Handlers - Shared Types and Utilities
 *
 * Common types, interfaces, and utility functions used across
 * prerequisite handler modules.
 */

import { ServiceLocator } from '@/core/di';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { DEFAULT_SHELL } from '@/types/shell';
import { HandlerContext } from '@/features/project-creation/handlers/HandlerContext';

/**
 * Get Node version mapping from component selection
 *
 * Returns a map of Node major versions to component names that require them.
 * Component-driven approach: versions are determined by what components need.
 *
 * @param context - Handler context with component selection
 * @returns Mapping of Node major version to component name (e.g., {'18': 'frontend', '20': 'backend'})
 *
 * @example
 * // User selected:
 * // - frontend: citisignal-nextjs (requires Node 18)
 * // - backend: commerce-paas (requires Node 20)
 * const mapping = await getNodeVersionMapping(context);
 * // Returns: { '18': 'citisignal-nextjs', '20': 'commerce-paas' }
 */
export async function getNodeVersionMapping(
    context: HandlerContext,
): Promise<Record<string, string>> {
    if (!context.sharedState.currentComponentSelection) {
        return {};
    }

    try {
        const { ComponentRegistryManager } = await import('../../components/services/ComponentRegistryManager');
        const registryManager = new ComponentRegistryManager(context.context.extensionPath);
        return await registryManager.getNodeVersionToComponentMapping(
            context.sharedState.currentComponentSelection.frontend,
            context.sharedState.currentComponentSelection.backend,
            context.sharedState.currentComponentSelection.dependencies,
            context.sharedState.currentComponentSelection.integrations,
            context.sharedState.currentComponentSelection.appBuilder,
        );
    } catch (error) {
        context.logger.warn('Failed to get Node version mapping:', error as Error);
        return {};
    }
}

/**
 * Get required Node versions from component selection
 *
 * Returns array of Node major versions required by selected components.
 * Component-driven approach: versions determined by what components need.
 */
export async function getRequiredNodeVersions(context: HandlerContext): Promise<string[]> {
    if (!context.sharedState.currentComponentSelection) {
        context.debugLogger.debug('[Prerequisites] No component selection - no Node versions required', {
            hasSelection: false,
        });
        return [];
    }

    try {
        const { ComponentRegistryManager } = await import('../../components/services/ComponentRegistryManager');
        const registryManager = new ComponentRegistryManager(context.context.extensionPath);
        const mapping = await registryManager.getRequiredNodeVersions(
            context.sharedState.currentComponentSelection.frontend,
            context.sharedState.currentComponentSelection.backend,
            context.sharedState.currentComponentSelection.dependencies,
            context.sharedState.currentComponentSelection.integrations,
            context.sharedState.currentComponentSelection.appBuilder,
        );
        // Sort versions in ascending order (18, 20, 24) for predictable installation order
        const sortedVersions = Array.from(mapping).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

        context.debugLogger.debug('[Prerequisites] Detected component Node requirements', {
            frontend: context.sharedState.currentComponentSelection.frontend,
            backend: context.sharedState.currentComponentSelection.backend,
            dependencies: context.sharedState.currentComponentSelection.dependencies,
            integrations: context.sharedState.currentComponentSelection.integrations,
            appBuilder: context.sharedState.currentComponentSelection.appBuilder,
            totalVersions: sortedVersions.length,
            versions: sortedVersions,
        });

        return sortedVersions;
    } catch {
        return [];
    }
}

/**
 * Check if all dependencies for a prerequisite are installed
 *
 * Used to gate installation until dependencies are satisfied.
 */
export function areDependenciesInstalled(
    prereq: import('../services/PrerequisitesManager').PrerequisiteDefinition,
    context: HandlerContext,
): boolean {
    if (!prereq.depends || prereq.depends.length === 0) {
        return true;
    }

    return prereq.depends.every((depId: string) => {
        for (const entry of context.sharedState.currentPrerequisiteStates!.values()) {
            if (entry.prereq.id === depId) {
                // Special handling: if dependency is Node and required majors missing, treat as not installed
                if (depId === 'node' && entry.nodeVersionStatus && entry.nodeVersionStatus.length > 0) {
                    const missing = entry.nodeVersionStatus.some((v: { version: string; component: string; installed: boolean }) => !v.installed);
                    if (missing) return false;
                }
                return !!entry.result?.installed;
            }
        }
        return false;
    });
}

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
    context: HandlerContext,
): Promise<{
    perNodeVersionStatus: { version: string; component: string; installed: boolean }[];
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

    const perNodeVersionStatus: { version: string; component: string; installed: boolean }[] = [];
    const missingVariantMajors: string[] = [];
    const commandManager = ServiceLocator.getCommandExecutor();

    // CRITICAL: Get list of actually installed Node versions FIRST
    // This prevents false positives when fnm falls back to other versions
    const fnmListResult = await commandManager.execute('fnm list', {
        timeout: TIMEOUTS.PREREQUISITE_CHECK,
        shell: DEFAULT_SHELL, // Add shell context for fnm availability (fixes ENOENT errors)
    });
    const installedVersions = fnmListResult.stdout.trim().split('\n').filter(v => v.trim());
    const installedMajors = new Set<string>();
    for (const version of installedVersions) {
        const match = /v?(\d+)/.exec(version);
        if (match) {
            installedMajors.add(match[1]);
        }
    }

    // Check all Node versions in parallel using Promise.all
    // Performance: ~50-66% faster than sequential (3 sequential @ 1-2s each = 3-6s → 1 parallel batch @ 1-2s)
    // Each check maintains isolation via fnm exec with specific Node version
    const startTime = Date.now();
    const checkPromises = nodeVersions.map(async (major) => {
        // Check if this Node version is actually installed
        if (!installedMajors.has(major)) {
            // Node version not installed - tool cannot be installed for this version
            context.logger.debug(`[Prerequisites] Node ${major} not installed, skipping ${prereq.name} check for this version`);
            return {
                major,
                version: `Node ${major}`,
                component: '',
                installed: false,
                isMissing: true,
            };
        }

        try {
            // Node version is installed - now check if the tool is installed for it
            // Use fnm exec for bulletproof Node version isolation
            const result = await commandManager.execute(
                prereq.check.command,
                {
                    useNodeVersion: major,
                    timeout: TIMEOUTS.PREREQUISITE_CHECK,
                },
            );

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

            return {
                major,
                version: `Node ${major}`,
                component: cliVersion,
                installed: true,
                isMissing: false,
            };
        } catch {
            return {
                major,
                version: `Node ${major}`,
                component: '',
                installed: false,
                isMissing: true,
            };
        }
    });

    // Wait for all checks to complete in parallel
    const results = await Promise.all(checkPromises);
    const duration = Date.now() - startTime;
    context.logger.debug(`[Prerequisites] Parallel check for ${prereq.name} across ${nodeVersions.length} Node versions completed in ${duration}ms`);

    // Process results to build status arrays
    for (const result of results) {
        perNodeVersionStatus.push({
            version: result.version,
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
