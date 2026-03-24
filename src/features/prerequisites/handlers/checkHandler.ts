/**
 * Prerequisite Check Handler
 *
 * Handles the check-prerequisites message:
 * - Loads prerequisite definitions from config
 * - Checks each prerequisite with multi-version Node.js support
 * - Sends status updates to UI with progress tracking
 */

import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getNodeVersionMapping, getNodeVersionIdMapping, checkPerNodeVersionStatus, areDependenciesInstalled, handlePrerequisiteCheckError, determinePrerequisiteStatus, getPrerequisiteDisplayMessage, formatProgressMessage, formatVersionSuffix, hasNodeVersions, getNodeVersionKeys, getPluginNodeVersions } from '@/features/prerequisites/handlers/shared';
import type { PrerequisiteDefinition, PrerequisiteStatus } from '@/features/prerequisites/services/PrerequisitesManager';
import stacksConfig from '@/features/project-creation/config/stacks.json';
import { ErrorCode } from '@/types/errorCodes';
import type { PrerequisiteCheckState } from '@/types/handlers';
import { SimpleResult } from '@/types/results';
import type { Stack } from '@/types/stacks';
import { toError } from '@/types/typeGuards';

// Import stack config for direct lookup

/**
 * Look up a stack by ID from the stacks configuration
 * This is the source of truth for frontend/backend/dependencies
 */
function getStackById(stackId: string): Stack | undefined {
    return (stacksConfig.stacks as Stack[]).find(s => s.id === stackId);
}

/**
 * Summary of a prerequisite check result for UI display
 */
interface PrerequisiteSummary {
    id: number;
    name: string;
    required: boolean;
    installed: boolean;
    version?: string;
    canInstall: boolean;
}

/**
 * Transform prerequisite state to summary object for UI
 *
 * SOP §6: Extracted 6-property callback to named transformation
 *
 * @param id - The prerequisite index
 * @param state - The prerequisite check state
 * @returns Summary object for UI consumption
 */
function toPrerequisiteSummary(
    id: number,
    state: PrerequisiteCheckState,
): PrerequisiteSummary {
    return {
        id,
        name: state.prereq.name,
        required: !state.prereq.optional,
        installed: state.result.installed,
        version: state.result.version,
        canInstall: state.result.canInstall,
    };
}

/**
 * Resolve the required Node major versions for a per-node-version prerequisite.
 * Checks the prereq's requiredFor, falls back to plugin requiredFor, then all Node versions.
 */
function resolveRequiredMajors(
    prereq: { requiredFor?: string[]; plugins?: { requiredFor?: string[] }[] },
    nodeVersionMapping: Record<string, string>,
    nodeVersionIdMapping: Record<string, string>,
): string[] {
    let requiredForComponents: string[] | undefined = prereq.requiredFor;
    if ((!requiredForComponents || requiredForComponents.length === 0) && prereq.plugins) {
        const allPluginRequired = prereq.plugins
            .filter(p => p.requiredFor && p.requiredFor.length > 0)
            .flatMap(p => p.requiredFor ?? []);
        if (allPluginRequired.length > 0) {
            requiredForComponents = [...new Set(allPluginRequired)];
        }
    }

    return requiredForComponents && requiredForComponents.length > 0
        ? getPluginNodeVersions(nodeVersionIdMapping, requiredForComponents)
        : getNodeVersionKeys(nodeVersionMapping);
}

/**
 * Build per-node-version status when the main tool is NOT installed.
 * Populates all required majors as "not installed".
 */
function buildUninstalledPerNodeStatus(
    requiredMajors: string[],
): { perNodeVersionStatus: { version: string; major: string; component: string; installed: boolean }[]; missingVariantMajors: string[] } {
    const perNodeVersionStatus = requiredMajors.map(major => ({
        version: `Node ${major}`,
        major,
        component: '',
        installed: false,
    }));
    return { perNodeVersionStatus, missingVariantMajors: [...requiredMajors] };
}

/**
 * Build per-node-version status from cached results when the main tool IS installed.
 * Filters cached results to required versions and identifies missing variants.
 */
function buildCachedPerNodeStatus(
    requiredMajors: string[],
    cachedResults: { version: string; major: string; component: string; installed: boolean }[],
    nodeVersionMapping: Record<string, string>,
): { perNodeVersionStatus: { version: string; major: string; component: string; installed: boolean }[]; missingVariantMajors: string[]; perNodeVariantMissing: boolean } {
    const perNodeVersionStatus: { version: string; major: string; component: string; installed: boolean }[] = [];
    const missingVariantMajors: string[] = [];

    for (const major of requiredMajors) {
        const cached = cachedResults.find(r => r.version === `Node ${major}`);
        if (cached) {
            perNodeVersionStatus.push(cached);
            if (!cached.installed) {
                missingVariantMajors.push(major);
            }
        } else {
            perNodeVersionStatus.push({
                version: `Node ${major}`,
                major,
                component: nodeVersionMapping[major] || '',
                installed: false,
            });
            missingVariantMajors.push(major);
        }
    }
    return { perNodeVersionStatus, missingVariantMajors, perNodeVariantMissing: missingVariantMajors.length > 0 };
}

/**
 * Check a Node.js prerequisite and return its check result and version status.
 */
async function checkNodePrerequisite(
    context: HandlerContext,
    prereq: PrerequisiteDefinition,
    nodeVersionMapping: Record<string, string>,
): Promise<{ checkResult: PrerequisiteStatus; nodeVersionStatus?: { version: string; component: string; installed: boolean }[] }> {
    if (hasNodeVersions(nodeVersionMapping)) {
        const nodeVersionStatus = await context.prereqManager?.checkMultipleNodeVersions(nodeVersionMapping);
        const allVersionsInstalled = nodeVersionStatus?.every(v => v.installed) ?? false;
        const installedVersions = nodeVersionStatus?.filter(v => v.installed).map(v => v.version).join(', ');

        context.logger.debug(`[Prerequisites] Node fnm check: ${allVersionsInstalled ? 'all installed' : 'missing versions'} (installed: ${installedVersions || 'none'})`);

        return {
            checkResult: {
                id: prereq.id,
                name: prereq.name,
                description: prereq.description,
                installed: allVersionsInstalled,
                optional: prereq.optional || false,
                canInstall: true,
                version: installedVersions || undefined,
            },
            nodeVersionStatus,
        };
    }

    // No components require Node.js - mark as satisfied
    context.logger.debug('[Prerequisites] Node.js not required for selected components');
    return {
        checkResult: {
            id: prereq.id,
            name: prereq.name,
            description: 'Not required for selected components',
            installed: true,
            optional: prereq.optional || false,
            canInstall: false,
        },
    };
}

/**
 * Detect per-node-version variant status for prerequisites like Adobe I/O CLI.
 * Returns which Node majors are missing the tool, reusing cached results when available.
 */
async function detectPerNodeVariantStatus(
    context: HandlerContext,
    prereq: PrerequisiteDefinition,
    checkResult: { installed: boolean },
    nodeVersionMapping: Record<string, string>,
    nodeVersionIdMapping: Record<string, string>,
): Promise<{
    perNodeVariantMissing: boolean;
    missingVariantMajors: string[];
    perNodeVersionStatus: { version: string; major: string; component: string; installed: boolean }[];
}> {
    if (!prereq.perNodeVersion || !hasNodeVersions(nodeVersionMapping)) {
        return { perNodeVariantMissing: false, missingVariantMajors: [], perNodeVersionStatus: [] };
    }

    const requiredMajors = resolveRequiredMajors(prereq, nodeVersionMapping, nodeVersionIdMapping);

    if (!checkResult.installed) {
        const result = buildUninstalledPerNodeStatus(requiredMajors);
        return { perNodeVariantMissing: true, ...result };
    }

    // Main tool installed: filter cached per-version results to required versions only
    const cachedResults = context.prereqManager?.getCacheManager().getPerVersionResults(prereq.id);

    if (cachedResults && cachedResults.length > 0) {
        context.logger.debug(`[Prerequisites] Reusing cached per-version results for ${prereq.name} (${requiredMajors.length} required versions)`);
        return buildCachedPerNodeStatus(requiredMajors, cachedResults, nodeVersionMapping);
    }

    // Fallback: no cached results, run the check
    context.logger.warn(`[Prerequisites] No cached per-version results for ${prereq.name}, falling back to re-check`);
    const result = await checkPerNodeVersionStatus(prereq, requiredMajors, context);
    return {
        perNodeVariantMissing: result.perNodeVariantMissing,
        missingVariantMajors: result.missingVariantMajors,
        perNodeVersionStatus: result.perNodeVersionStatus,
    };
}

/**
 * Determine the overall status and canInstall flag for a prerequisite.
 */
function computeOverallStatus(
    prereq: PrerequisiteDefinition,
    checkResult: PrerequisiteStatus,
    nodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined,
    perNodeVariantMissing: boolean,
    depsInstalled: boolean,
): { overallStatus: string; canInstall: boolean } {
    let overallStatus = determinePrerequisiteStatus(checkResult.installed, !!prereq.optional);
    let nodeMissing = false;

    if (prereq.id === 'node' && nodeVersionStatus && nodeVersionStatus.length > 0) {
        nodeMissing = nodeVersionStatus.some(v => !v.installed);
        if (nodeMissing) {
            overallStatus = 'error';
        }
    }
    if (prereq.perNodeVersion && perNodeVariantMissing) {
        overallStatus = 'error';
    }

    const canInstall = depsInstalled && (
        (prereq.id === 'node' && nodeMissing)
        || (prereq.perNodeVersion && perNodeVariantMissing)
        || (!checkResult.installed && checkResult.canInstall)
    );

    return { overallStatus, canInstall };
}

/**
 * Initialize the prerequisite check: clear cache, build component selection, load config.
 */
async function initializePrerequisiteCheck(
    context: HandlerContext,
    payload?: { selectedStack?: string; isRecheck?: boolean },
): Promise<void> {
    context.stepLogger?.log('prerequisites', 'Starting prerequisites check', 'info');

    if (payload?.isRecheck) {
        context.prereqManager?.getCacheManager().clearAll();
        context.logger.debug('[Prerequisites] Cache cleared for recheck');
    }

    if (payload?.selectedStack) {
        const stack = getStackById(payload.selectedStack);
        if (stack) {
            context.sharedState.currentComponentSelection = {
                frontend: stack.frontend,
                backend: stack.backend,
                // Include all optional deps so prerequisites are ready regardless of user's mesh choice
                // (prerequisites run before the Architecture Modal where mesh is toggled)
                dependencies: [...(stack.dependencies || []), ...(stack.optionalDependencies || [])],
                integrations: [],
                appBuilder: [],
            };
            context.logger.debug(`[Prerequisites] Built component selection from stack: ${payload.selectedStack}`);
        }
    }

    const config = await context.prereqManager?.loadConfig();
    const prerequisites = context.prereqManager?.resolveDependencies(config?.prerequisites || []);
    context.sharedState.currentPrerequisites = prerequisites;
    context.sharedState.currentPrerequisiteStates = new Map();
}

/**
 * Send the prerequisites list to the UI and wait for render.
 */
async function sendPrerequisitesListToUI(
    context: HandlerContext,
    prerequisites: { name: string; description: string; optional?: boolean; plugins?: unknown[] }[] | undefined,
    nodeVersionMapping: Record<string, string>,
): Promise<void> {
    context.stepLogger?.log('prerequisites', `Found ${prerequisites?.length ?? 0} prerequisites to check`, 'info');

    await context.sendMessage('prerequisites-loaded', {
        prerequisites: prerequisites?.map((p, index) => ({
            id: index,
            name: p.name,
            description: p.description,
            optional: p.optional || false,
            plugins: p.plugins,
        })),
        nodeVersionMapping,
    });

    await new Promise(resolve => setTimeout(resolve, TIMEOUTS.UI.UPDATE_DELAY));
}

/**
 * check-prerequisites - Check all prerequisites for selected components
 *
 * Loads prerequisites from config, checks each one, handles multi-version Node.js,
 * and sends status updates to the UI.
 *
 * Now receives selectedStack instead of componentSelection - looks up stack
 * directly from stacks.json (source of truth).
 */
export async function handleCheckPrerequisites(
    context: HandlerContext,
    payload?: { selectedStack?: string; isRecheck?: boolean },
): Promise<SimpleResult> {
    try {
        await initializePrerequisiteCheck(context, payload);

        const prerequisites = context.sharedState.currentPrerequisites;
        const prerequisiteStates = context.sharedState.currentPrerequisiteStates as Map<number, PrerequisiteCheckState>;
        const nodeVersionMapping = await getNodeVersionMapping(context);
        const nodeVersionIdMapping = await getNodeVersionIdMapping(context);

        await sendPrerequisitesListToUI(context, prerequisites, nodeVersionMapping);

        // Check each prerequisite
        for (let i = 0; i < (prerequisites?.length ?? 0); i++) {
            const prereq = prerequisites?.[i];
            if (!prereq) continue;

            context.stepLogger?.log('prerequisites', formatProgressMessage(prereq, nodeVersionMapping), 'info');

            await context.sendMessage('prerequisite-status', {
                index: i,
                name: prereq.name,
                status: 'checking',
                description: prereq.description,
                required: !prereq.optional,
            });

            // Check prerequisite with timeout error handling
            let checkResult: PrerequisiteStatus | undefined;
            let nodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined;

            try {
                if (prereq.id === 'node') {
                    const nodeResult = await checkNodePrerequisite(context, prereq, nodeVersionMapping);
                    checkResult = nodeResult.checkResult;
                    nodeVersionStatus = nodeResult.nodeVersionStatus;
                } else {
                    checkResult = prereq ? await context.prereqManager?.checkPrerequisite(prereq) : undefined;
                }
            } catch (error) {
                await handlePrerequisiteCheckError(context, prereq, i, error);
                continue;
            }

            if (!checkResult || !prereq) continue;

            // Detect per-node-version variant status
            const variantStatus = await detectPerNodeVariantStatus(
                context, prereq, checkResult,
                nodeVersionMapping, nodeVersionIdMapping,
            );

            // Store state for this prerequisite
            prerequisiteStates.set(i, {
                prereq,
                result: checkResult,
                nodeVersionStatus: prereq.id === 'node' ? nodeVersionStatus : variantStatus.perNodeVersionStatus,
            });

            // Log the result
            if (checkResult.installed) {
                const versionDisplay = formatVersionSuffix(prereq, nodeVersionStatus, checkResult.version);
                context.stepLogger?.log('prerequisites', `✓ ${prereq.name} is installed${versionDisplay}`, 'info');
            } else {
                context.stepLogger?.log('prerequisites', `✗ ${prereq.name} is not installed`, 'warn');
            }

            const depsInstalled = areDependenciesInstalled(prereq, context);
            const { overallStatus, canInstall } = computeOverallStatus(
                prereq,
                checkResult,
                nodeVersionStatus,
                variantStatus.perNodeVariantMissing,
                depsInstalled,
            );

            await context.sendMessage('prerequisite-status', {
                index: i,
                name: prereq.name,
                status: overallStatus,
                description: prereq.description,
                required: !prereq.optional,
                installed: (prereq.perNodeVersion && variantStatus.perNodeVariantMissing) ? false : checkResult.installed,
                version: checkResult.version,
                message: getPrerequisiteDisplayMessage(
                    prereq.name,
                    !!prereq.perNodeVersion,
                    variantStatus.perNodeVersionStatus,
                    variantStatus.perNodeVariantMissing,
                    variantStatus.missingVariantMajors,
                    checkResult.installed,
                    checkResult.version,
                ),
                canInstall,
                plugins: (prereq.perNodeVersion && variantStatus.perNodeVariantMissing) ? undefined : checkResult.plugins,
                nodeVersionStatus: prereq.id === 'node' ? nodeVersionStatus : variantStatus.perNodeVersionStatus,
            });
        }

        // Check if all required prerequisites are installed
        const allRequiredInstalled = Array.from(prerequisiteStates.values())
            .filter(state => !state.prereq.optional)
            .every(state => state.result.installed);

        await context.sendMessage('prerequisites-complete', {
            allInstalled: allRequiredInstalled,
            prerequisites: Array.from(prerequisiteStates.entries())
                .map(([id, state]) => toPrerequisiteSummary(id, state)),
        });

        context.stepLogger?.log('prerequisites', `Prerequisites check complete. All required installed: ${allRequiredInstalled}`, 'info');

        return { success: true };
    } catch (error) {
        context.logger.error('Prerequisites check failed:', error as Error);
        await context.sendMessage('error', {
            message: 'Failed to check prerequisites',
            details: toError(error).message,
        });
        return { success: false, error: 'Failed to check prerequisites', code: ErrorCode.UNKNOWN };
    }
}
