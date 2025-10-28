/**
 * Prerequisite Handlers - Shared Types and Utilities
 *
 * Common types, interfaces, and utility functions used across
 * prerequisite handler modules.
 */

import { ServiceLocator } from '@/core/di';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { HandlerContext } from '@/features/project-creation/handlers/HandlerContext';

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
        const { ComponentRegistryManager } = await import('../../components/services/ComponentRegistryManager');
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
        const { ComponentRegistryManager } = await import('../../components/services/ComponentRegistryManager');
        const registryManager = new ComponentRegistryManager(context.context.extensionPath);
        const mapping = await registryManager.getRequiredNodeVersions(
            context.sharedState.currentComponentSelection.frontend,
            context.sharedState.currentComponentSelection.backend,
            context.sharedState.currentComponentSelection.dependencies,
            context.sharedState.currentComponentSelection.externalSystems,
            context.sharedState.currentComponentSelection.appBuilder,
        );
        // Sort versions in ascending order (18, 20, 24) for predictable installation order
        return Array.from(mapping).sort((a, b) => parseInt(a) - parseInt(b));
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
    const nodeManager = ServiceLocator.getNodeVersionManager();

    // CRITICAL: Get list of actually installed Node versions FIRST
    // This prevents false positives when fnm falls back to other versions
    const installedVersions = await nodeManager.list();
    const installedMajors = new Set<string>();
    for (const version of installedVersions) {
        const match = /v?(\d+)/.exec(version);
        if (match) {
            installedMajors.add(match[1]);
        }
    }

    for (const major of nodeVersions) {
        // Check if this Node version is actually installed
        if (!installedMajors.has(major)) {
            // Node version not installed - tool cannot be installed for this version
            context.logger.debug(`[Prerequisites] Node ${major} not installed, skipping ${prereq.name} check for this version`);
            missingVariantMajors.push(major);
            perNodeVersionStatus.push({ version: `Node ${major}`, component: '', installed: false });
            continue;
        }

        try {
            // Node version is installed - now check if the tool is installed for it
            // Use NodeVersionManager for bulletproof Node version isolation
            // Executes command with specific Node version using fnm exec
            const result = await nodeManager.execWithVersion(
                major,
                prereq.check.command,
                {
                    timeout: TIMEOUTS.PREREQUISITE_CHECK,
                    enhancePath: true, // For aio-cli and other npm-installed tools
                },
            );
            const stdout = result.stdout;

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
