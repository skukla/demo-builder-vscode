/**
 * Prerequisite Handlers - Shared Types and Utilities
 *
 * Common types, interfaces, and utility functions used across
 * prerequisite handler modules.
 */

import type { PrerequisiteDefinition } from '../services/PrerequisitesManager';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { ServiceLocator } from '@/core/di';
import { TIMEOUTS, formatDuration } from '@/core/utils';
import { ComponentSelection } from '@/types/components';
import { isTimeout, toAppError } from '@/types/errors';
import { DEFAULT_SHELL } from '@/types/shell';
import { toError } from '@/types/typeGuards';

/**
 * Type alias for Node version mapping (major version → component name)
 */
export type NodeVersionMapping = Record<string, string>;

/**
 * Check if node version mapping has any entries
 *
 * Extracts the common pattern `Object.keys(nodeVersionMapping).length > 0`
 * to a semantic helper for better readability and consistency.
 *
 * @param mapping - Node version mapping object
 * @returns true if the mapping has at least one entry
 */
export function hasNodeVersions(mapping: NodeVersionMapping): boolean {
    return Object.keys(mapping).length > 0;
}

/**
 * Get sorted array of Node major versions from mapping
 *
 * @param mapping - Node version mapping object
 * @returns Array of major version strings, sorted ascending (e.g., ['18', '20', '24'])
 */
export function getNodeVersionKeys(mapping: NodeVersionMapping): string[] {
    return Object.keys(mapping).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

/**
 * Get Node versions that require a specific plugin
 *
 * Filters the nodeVersionMapping to find which Node versions are used by
 * components that require this plugin (via requiredFor array).
 *
 * @param nodeVersionMapping - Mapping of Node major version to component ID
 * @param requiredForComponents - Array of component IDs that require this plugin
 * @param _dependencies - Unused parameter kept for API compatibility
 * @returns Array of Node major versions that need this plugin installed
 *
 * @example
 * // Plugin required by 'eds' component, which uses Node 18
 * const versions = getPluginNodeVersions(
 *     { '18': 'eds', '20': 'commerce-paas' },
 *     ['eds']
 * );
 * // Returns: ['18']
 */
export function getPluginNodeVersions(
    nodeVersionMapping: NodeVersionMapping,
    requiredForComponents: string[],
    _dependencies?: string[],
): string[] {
    const pluginNodeVersions: string[] = [];

    // Check component matches in nodeVersionMapping
    for (const [nodeVersion, componentId] of Object.entries(nodeVersionMapping)) {
        if (requiredForComponents.includes(componentId)) {
            pluginNodeVersions.push(nodeVersion);
        }
    }

    return pluginNodeVersions;
}

/**
 * Format progress message for prerequisite checking
 *
 * For Node.js with multiple required versions, shows which versions are being checked.
 * Example: "Checking Node.js (v20, v24)..."
 *
 * SOP §2: Extracted helper for progress message generation
 *
 * @param prereq - The prerequisite definition
 * @param nodeVersionMapping - Node version mapping (major version → component name)
 * @returns Progress message string
 */
export function formatProgressMessage(
    prereq: PrerequisiteDefinition,
    nodeVersionMapping: NodeVersionMapping,
): string {
    // For Node.js with multiple required versions, show which versions
    if (prereq.id === 'node' && hasNodeVersions(nodeVersionMapping)) {
        const versions = getNodeVersionKeys(nodeVersionMapping);
        if (versions.length > 1) {
            return `Checking ${prereq.name} (v${versions.join(', v')})...`;
        }
    }
    return `Checking ${prereq.name}...`;
}

/**
 * Format version suffix for prerequisite installation log
 *
 * For Node.js with multiple installed versions, shows all versions.
 * Example: ": v20.19.5, v24.0.0"
 *
 * SOP §2: Extracted helper for version display generation
 *
 * @param prereq - The prerequisite definition
 * @param nodeVersionStatus - Array of node version status entries
 * @param defaultVersion - Default single version to show if not multi-version
 * @returns Version suffix string (includes leading colon and space)
 */
export function formatVersionSuffix(
    prereq: PrerequisiteDefinition,
    nodeVersionStatus: Array<{ version: string; installed: boolean }> | undefined,
    defaultVersion?: string,
): string {
    // For Node.js with multiple versions, show all installed versions
    if (prereq.id === 'node' && nodeVersionStatus && nodeVersionStatus.length > 1) {
        const installedVersions = nodeVersionStatus
            .filter(v => v.installed)
            .map(v => v.version.replace('Node ', 'v'));
        if (installedVersions.length > 0) {
            return `: ${installedVersions.join(', ')}`;
        }
    }
    // Default: show single version
    return defaultVersion ? `: ${defaultVersion}` : '';
}

/**
 * Determine prerequisite status based on installation state
 *
 * @param installed - Whether the prerequisite is installed
 * @param optional - Whether the prerequisite is optional
 * @returns Status: 'success' if installed, 'warning' if optional and missing, 'error' if required and missing
 */
export function determinePrerequisiteStatus(
    installed: boolean,
    optional: boolean,
): 'success' | 'error' | 'warning' {
    if (installed) return 'success';
    return optional ? 'warning' : 'error';
}

/**
 * Generate user-friendly status message for a prerequisite
 *
 * @param prereqName - Name of the prerequisite
 * @param installed - Whether the prerequisite is installed
 * @param version - Detected version (if any)
 * @param perNodeVariantMissing - Whether a per-node-version variant is missing
 * @param missingVariantMajors - Array of Node major versions where the tool is missing
 * @returns User-friendly status message
 */
export function getPrerequisiteStatusMessage(
    prereqName: string,
    installed: boolean,
    version?: string,
    perNodeVariantMissing?: boolean,
    missingVariantMajors?: string[],
): string {
    if (perNodeVariantMissing && missingVariantMajors && missingVariantMajors.length > 0) {
        return `${prereqName} is missing in Node ${missingVariantMajors.join(', ')}`;
    }
    if (installed) {
        return version ? `${prereqName} is installed: ${version}` : `${prereqName} is installed`;
    }
    return `${prereqName} is not installed`;
}

/**
 * Per-node-version status entry
 */
export interface PerNodeVersionStatusEntry {
    version: string;
    major: string;
    component: string;
    installed: boolean;
}

/**
 * Get display message for prerequisite based on installation state
 *
 * SOP §3: Extracted nested ternary to named helper
 *
 * @param prereqName - Name of the prerequisite
 * @param isPerNodeVersion - Whether this is a per-node-version prerequisite
 * @param perNodeVersionStatus - Array of per-node version status entries
 * @param perNodeVariantMissing - Whether a per-node-version variant is missing
 * @param missingVariantMajors - Array of Node major versions where the tool is missing
 * @param installed - Whether the prerequisite is installed
 * @param version - Detected version (if any)
 * @returns User-friendly display message
 */
export function getPrerequisiteDisplayMessage(
    prereqName: string,
    isPerNodeVersion: boolean,
    perNodeVersionStatus: PerNodeVersionStatusEntry[],
    perNodeVariantMissing: boolean,
    missingVariantMajors: string[],
    installed: boolean,
    version?: string,
): string {
    // Per-node-version with installed versions: show "Installed for versions:"
    if (isPerNodeVersion && perNodeVersionStatus && perNodeVersionStatus.length > 0) {
        return 'Installed for versions:';
    }
    // Per-node-version with missing variants: show detailed missing message
    if (isPerNodeVersion && perNodeVariantMissing) {
        return `${prereqName} is missing in Node ${missingVariantMajors.join(', ')}. Plugin status will be checked after CLI is installed.`;
    }
    // Standard case: use status message
    return getPrerequisiteStatusMessage(prereqName, installed, version);
}

/**
 * Helper to extract component selection parameters for registry manager calls
 */
function getComponentSelectionParams(
    selection: ComponentSelection,
): [string | undefined, string | undefined, string[] | undefined, string[] | undefined, string[] | undefined] {
    return [
        selection.frontend,
        selection.backend,
        selection.dependencies,
        selection.integrations,
        selection.appBuilder,
    ];
}

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
        const params = getComponentSelectionParams(context.sharedState.currentComponentSelection);
        const mapping = await registryManager.getNodeVersionToComponentMapping(...params);

        return mapping;
    } catch (error) {
        // INTENTIONALLY RETURNS EMPTY: If component registry fails to load,
        // prerequisites check proceeds without Node version mapping. This is
        // acceptable because Node versions will still be detected via system
        // check - we just lose the component-to-version association display.
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
        const params = getComponentSelectionParams(context.sharedState.currentComponentSelection);
        const mapping = await registryManager.getRequiredNodeVersions(...params);
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
        // INTENTIONALLY RETURNS EMPTY: Same graceful degradation as getNodeVersionMapping.
        // If we can't determine required versions, prerequisites check falls back to
        // default behavior (checking system Node only).
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

    const states = context.sharedState.currentPrerequisiteStates;
    if (!states) {
        return false;
    }

    return prereq.depends.every((depId: string) => {
        for (const entry of states.values()) {
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
    perNodeVersionStatus: { version: string; major: string; component: string; installed: boolean }[];
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

    const perNodeVersionStatus: { version: string; major: string; component: string; installed: boolean }[] = [];
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
            context.logger.debug(`[Prerequisites] Node ${major} not installed, skipping ${prereq.name} check for this version`);
            return createVersionStatus(major, false);
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

            // CRITICAL BUG FIX: Check exit code to determine command success
            // Exit code 0 = success, non-zero = failure (e.g., 127 = command not found)
            // Previously used try-catch which incorrectly treated non-zero exit codes as success
            if (result.code === 0) {
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
    context.logger.debug(`[Prerequisites] Parallel check for ${prereq.name} across ${nodeVersions.length} Node versions completed in ${formatDuration(duration)}`);

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

/**
 * Handle prerequisite check errors with consistent logging and UI updates
 *
 * Extracts the common error handling pattern from checkHandler and continueHandler.
 * Handles both timeout errors and general check failures with appropriate logging
 * to all channels (logger, stepLogger, debugLogger) and sends status to UI.
 *
 * @param context - Handler context with logging and messaging capabilities
 * @param prereq - The prerequisite that failed to check
 * @param index - Index of the prerequisite in the list (for UI updates)
 * @param error - The error that occurred during checking
 * @param isRecheck - Whether this is a recheck (affects log messages)
 */
export async function handlePrerequisiteCheckError(
    context: HandlerContext,
    prereq: PrerequisiteDefinition,
    index: number,
    error: unknown,
    isRecheck = false,
): Promise<void> {
    const errorMessage = toError(error).message;
    const isTimeoutErr = isTimeout(toAppError(error));
    const checkType = isRecheck ? 're-check' : 'check';

    // Log to all appropriate channels
    if (isTimeoutErr) {
        context.logger.warn(`[Prerequisites] ${prereq.name} ${checkType} timed out after ${TIMEOUTS.PREREQUISITE_CHECK / 1000}s`);
        context.stepLogger?.log('prerequisites', `⏱️ ${prereq.name} ${checkType} timed out (${TIMEOUTS.PREREQUISITE_CHECK / 1000}s)`, 'warn');
        context.debugLogger.debug(`[Prerequisites] ${isRecheck ? 'Re-check' : 'Check'} timeout details:`, {
            prereq: prereq.id,
            timeout: TIMEOUTS.PREREQUISITE_CHECK,
            error: errorMessage,
        });
    } else {
        context.logger.error(`[Prerequisites] Failed to ${checkType} ${prereq.name}:`, error as Error);
        context.stepLogger?.log('prerequisites', `✗ ${prereq.name} ${checkType} failed: ${errorMessage}`, 'error');
        context.debugLogger.debug(`[Prerequisites] ${isRecheck ? 'Re-check' : 'Check'} failure details:`, {
            prereq: prereq.id,
            error,
        });
    }

    // Send error status to UI
    await context.sendMessage('prerequisite-status', {
        index,
        name: prereq.name,
        status: 'error',
        description: prereq.description,
        required: !prereq.optional,
        installed: false,
        message: isTimeoutErr
            ? `Check timed out after ${TIMEOUTS.PREREQUISITE_CHECK / 1000} seconds. Click Recheck to try again.`
            : `Failed to check: ${errorMessage}`,
        canInstall: false,
    });
}
