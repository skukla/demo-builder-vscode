/**
 * Prerequisite Handlers - Shared Types and Utilities
 *
 * Common types, interfaces, and utility functions used across
 * prerequisite handler modules.
 */

import { ServiceLocator } from '../../../services/serviceLocator';
import { TIMEOUTS } from '@/utils/timeoutConfig';
import { HandlerContext } from '../../../commands/handlers/HandlerContext';

/**
 * Get Node version mapping from component selection
 *
 * Returns a map of Node major versions to component names that require them.
 */
export async function getNodeVersionMapping(
    context: HandlerContext,
): Promise<Record<string, string>> {
    if (!context.sharedState.currentComponentSelection) {
        return {};
    }

    try {
        const { ComponentRegistryManager } = await import('@/features/components/services/componentRegistry');
        const registryManager = new ComponentRegistryManager(context.context.extensionPath);
        return await registryManager.getNodeVersionToComponentMapping(
            context.sharedState.currentComponentSelection.frontend,
            context.sharedState.currentComponentSelection.backend,
            context.sharedState.currentComponentSelection.dependencies,
            context.sharedState.currentComponentSelection.externalSystems,
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
 */
export async function getRequiredNodeVersions(context: HandlerContext): Promise<string[]> {
    if (!context.sharedState.currentComponentSelection) {
        return [];
    }

    try {
        const { ComponentRegistryManager } = await import('@/features/components/services/componentRegistry');
        const registryManager = new ComponentRegistryManager(context.context.extensionPath);
        const mapping = await registryManager.getRequiredNodeVersions(
            context.sharedState.currentComponentSelection.frontend,
            context.sharedState.currentComponentSelection.backend,
            context.sharedState.currentComponentSelection.dependencies,
            context.sharedState.currentComponentSelection.externalSystems,
            context.sharedState.currentComponentSelection.appBuilder,
        );
        return Array.from(mapping);
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
    prereq: import('@/features/prerequisites/services/prerequisitesManager').PrerequisiteDefinition,
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
 */
export async function checkPerNodeVersionStatus(
    prereq: import('@/features/prerequisites/services/prerequisitesManager').PrerequisiteDefinition,
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

    for (const major of nodeVersions) {
        try {
            let stdout: string;

            if (prereq.id === 'aio-cli') {
                // Use direct fnm exec to avoid eval "$(fnm env)" wrapper that can hang
                const result = await commandManager.execute(
                    `fnm exec --using=${major} ${prereq.check.command}`,
                    {
                        enhancePath: true,
                        timeout: TIMEOUTS.PREREQUISITE_CHECK,
                    },
                );
                stdout = result.stdout;
            } else {
                // Other prerequisites use standard Node version switching
                const result = await commandManager.execute(prereq.check.command, {
                    useNodeVersion: major,
                    timeout: TIMEOUTS.PREREQUISITE_CHECK,
                });
                stdout = result.stdout;
            }

            // Parse CLI version if regex provided
            let cliVersion = '';
            if (prereq.check.parseVersion) {
                try {
                    const match = new RegExp(prereq.check.parseVersion).exec(stdout);
                    if (match) cliVersion = match[1] || '';
                } catch {
                    // Ignore regex parse errors
                }
            }
            perNodeVersionStatus.push({ version: `Node ${major}`, component: cliVersion, installed: true });
        } catch {
            missingVariantMajors.push(major);
            perNodeVersionStatus.push({ version: `Node ${major}`, component: '', installed: false });
        }
    }

    return {
        perNodeVersionStatus,
        perNodeVariantMissing: missingVariantMajors.length > 0,
        missingVariantMajors,
    };
}
