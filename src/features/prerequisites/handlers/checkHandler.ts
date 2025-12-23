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
import { getNodeVersionMapping, checkPerNodeVersionStatus, areDependenciesInstalled, handlePrerequisiteCheckError, determinePrerequisiteStatus, getPrerequisiteDisplayMessage, formatProgressMessage, formatVersionSuffix, hasNodeVersions, getNodeVersionKeys } from '@/features/prerequisites/handlers/shared';
import { ErrorCode } from '@/types/errorCodes';
import type { PrerequisiteCheckState } from '@/types/handlers';
import { SimpleResult } from '@/types/results';
import { toError } from '@/types/typeGuards';

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
 * check-prerequisites - Check all prerequisites for selected components
 *
 * Loads prerequisites from config, checks each one, handles multi-version Node.js,
 * and sends status updates to the UI.
 */
export async function handleCheckPrerequisites(
    context: HandlerContext,
    payload?: { componentSelection?: import('../../../types/components').ComponentSelection; isRecheck?: boolean },
): Promise<SimpleResult> {
    try {
        context.stepLogger?.log('prerequisites', 'Starting prerequisites check', 'info');

        // Clear cache on Recheck button click (Step 2: Prerequisite Caching)
        if (payload?.isRecheck) {
            context.prereqManager?.getCacheManager().clearAll();
            context.logger.debug('[Prerequisites] Cache cleared for recheck');
        }

        // Store the component selection for later use
        if (payload?.componentSelection) {
            context.sharedState.currentComponentSelection = payload.componentSelection;
        }

        // Load config and get prerequisites
        const config = await context.prereqManager?.loadConfig();
        // Get prerequisites and resolve dependency order
        const prerequisites = context.prereqManager?.resolveDependencies(config?.prerequisites || []);
        context.sharedState.currentPrerequisites = prerequisites;

        // Initialize state tracking
        context.sharedState.currentPrerequisiteStates = new Map();

        // Get Node version to component mapping if we have components selected
        const nodeVersionMapping = await getNodeVersionMapping(context);

        context.stepLogger?.log('prerequisites', `Found ${prerequisites?.length ?? 0} prerequisites to check`, 'info');

        // Send prerequisites list to UI so it can display them
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

        // Small delay to ensure UI updates before we start checking
        await new Promise(resolve => setTimeout(resolve, TIMEOUTS.UI_UPDATE_DELAY));

        // Check each prerequisite
        for (let i = 0; i < (prerequisites?.length ?? 0); i++) {
            const prereq = prerequisites?.[i];
            if (!prereq) continue;

            context.stepLogger?.log('prerequisites', formatProgressMessage(prereq, nodeVersionMapping), 'info');

            // Send status update
            await context.sendMessage('prerequisite-status', {
                index: i,
                name: prereq.name,
                status: 'checking',
                description: prereq.description,
                required: !prereq.optional,
            });

            // Check prerequisite with timeout error handling
            let checkResult;
            let nodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined;

            try {
                if (prereq.id === 'node') {
                    // COMPONENT-DRIVEN NODE CHECK:
                    // Node versions are determined by component requirements and managed via fnm.
                    // System Node is irrelevant - we only care about fnm-managed versions.
                    if (hasNodeVersions(nodeVersionMapping)) {
                        nodeVersionStatus = await context.prereqManager?.checkMultipleNodeVersions(nodeVersionMapping);

                        const allVersionsInstalled = nodeVersionStatus?.every(v => v.installed) ?? false;
                        const installedVersions = nodeVersionStatus?.filter(v => v.installed).map(v => v.version).join(', ');

                        context.logger.debug(`[Prerequisites] Node fnm check: ${allVersionsInstalled ? 'all installed' : 'missing versions'} (installed: ${installedVersions || 'none'})`);

                        checkResult = {
                            id: prereq.id,
                            name: prereq.name,
                            description: prereq.description,
                            installed: allVersionsInstalled,
                            optional: prereq.optional || false,
                            canInstall: true,
                            version: installedVersions || undefined,
                        };
                    } else {
                        // No components selected - shouldn't happen in normal flow
                        // Mark as not installed since we can't determine required versions
                        context.logger.warn('[Prerequisites] Node check with no component selection - cannot determine required versions');
                        checkResult = {
                            id: prereq.id,
                            name: prereq.name,
                            description: prereq.description,
                            installed: false,
                            optional: prereq.optional || false,
                            canInstall: false, // Can't install without knowing versions
                        };
                    }
                } else {
                    // Standard check for non-Node prerequisites
                    checkResult = prereq ? await context.prereqManager?.checkPrerequisite(prereq) : undefined;
                }
            } catch (error) {
                await handlePrerequisiteCheckError(context, prereq, i, error);
                continue;
            }

            if (!checkResult || !prereq) continue;

            // For per-node-version prerequisites (e.g., Adobe I/O CLI), detect partial installs across required Node majors
            // OPTIMIZATION: Reuse cached per-version results from checkPrerequisite() instead of re-checking
            // The initial check already ran checkPerNodeVersionStatus for ALL installed Node versions
            // We just need to filter to required versions and determine missing variants
            let perNodeVariantMissing = false;
            const missingVariantMajors: string[] = [];
            const perNodeVersionStatus: { version: string; major: string; component: string; installed: boolean }[] = [];
            if (prereq.perNodeVersion && hasNodeVersions(nodeVersionMapping)) {
                const requiredMajors = getNodeVersionKeys(nodeVersionMapping);

                if (!checkResult.installed) {
                    // Main tool not installed: populate with all NOT installed
                    // This shows users what Node versions they'll need for this tool
                    for (const major of requiredMajors) {
                        perNodeVersionStatus.push({
                            version: `Node ${major}`,
                            major,
                            component: '',
                            installed: false,
                        });
                    }
                    perNodeVariantMissing = true;
                    missingVariantMajors.push(...requiredMajors);
                } else {
                    // Main tool installed: filter cached per-version results to required versions only
                    // This avoids duplicate checks - checkPrerequisite() already checked all versions
                    const cachedResults = context.prereqManager?.getCacheManager().getPerVersionResults(prereq.id);

                    if (cachedResults && cachedResults.length > 0) {
                        // Use cached results - just filter to required versions
                        context.logger.debug(`[Prerequisites] Reusing cached per-version results for ${prereq.name} (${requiredMajors.length} required versions)`);

                        for (const major of requiredMajors) {
                            const cached = cachedResults.find(r => r.version === `Node ${major}`);
                            if (cached) {
                                perNodeVersionStatus.push(cached);
                                if (!cached.installed) {
                                    missingVariantMajors.push(major);
                                }
                            } else {
                                // Fallback: version not in cache, assume not installed
                                perNodeVersionStatus.push({
                                    version: `Node ${major}`,
                                    major,
                                    component: nodeVersionMapping[major] || '',
                                    installed: false,
                                });
                                missingVariantMajors.push(major);
                            }
                        }
                        perNodeVariantMissing = missingVariantMajors.length > 0;
                    } else {
                        // Fallback: no cached results, run the check (shouldn't happen but be safe)
                        context.logger.warn(`[Prerequisites] No cached per-version results for ${prereq.name}, falling back to re-check`);
                        const result = await checkPerNodeVersionStatus(prereq, requiredMajors, context);
                        perNodeVariantMissing = result.perNodeVariantMissing;
                        missingVariantMajors.push(...result.missingVariantMajors);
                        perNodeVersionStatus.push(...result.perNodeVersionStatus);
                    }
                }
            }

            // Store state for this prerequisite (include nodeVersionStatus if available)
            context.sharedState.currentPrerequisiteStates.set(i, {
                prereq,
                result: checkResult,
                nodeVersionStatus: prereq.id === 'node' ? nodeVersionStatus : perNodeVersionStatus,
            });

            // Log the result - for Node.js, show all installed versions (SOP §2)
            if (checkResult.installed) {
                const versionDisplay = formatVersionSuffix(prereq, nodeVersionStatus, checkResult.version);
                context.stepLogger?.log('prerequisites', `✓ ${prereq.name} is installed${versionDisplay}`, 'info');
            } else {
                context.stepLogger?.log('prerequisites', `✗ ${prereq.name} is not installed`, 'warn');
            }

            // Compute dependency gating (disable install until deps are installed)
            const depsInstalled = areDependenciesInstalled(prereq, context);

            // Determine overall status for Node when specific required versions are missing
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

            // Send result with proper status values
            await context.sendMessage('prerequisite-status', {
                index: i,
                name: prereq.name,
                status: overallStatus,
                description: prereq.description,
                required: !prereq.optional,
                // For per-node-version prerequisites: installed is false if ANY required Node version is missing the tool
                installed: (prereq.perNodeVersion && perNodeVariantMissing) ? false : checkResult.installed,
                version: checkResult.version,
                // Special message for per-node-version display, otherwise use standard status message
                message: getPrerequisiteDisplayMessage(
                    prereq.name,
                    !!prereq.perNodeVersion,
                    perNodeVersionStatus,
                    perNodeVariantMissing,
                    missingVariantMajors,
                    checkResult.installed,
                    checkResult.version,
                ),
                // Enable install only when dependencies are satisfied AND this prerequisite is incomplete
                // Node: missing majors; perNodeVersion: missing any variant; Otherwise: not installed
                canInstall: depsInstalled && (
                    (prereq.id === 'node' && nodeMissing)
                    || (prereq.perNodeVersion && perNodeVariantMissing)
                    || (!checkResult.installed && checkResult.canInstall)
                ),
                // Suppress plugin list until CLI is present on all required Node majors to avoid confusion
                plugins: (prereq.perNodeVersion && perNodeVariantMissing) ? undefined : checkResult.plugins,
                nodeVersionStatus: prereq.id === 'node' ? nodeVersionStatus : perNodeVersionStatus,
            });
        }

        // Check if all required prerequisites are installed
        const allRequiredInstalled = Array.from(context.sharedState.currentPrerequisiteStates.values())
            .filter(state => !state.prereq.optional)
            .every(state => state.result.installed);

        // Send completion status
        await context.sendMessage('prerequisites-complete', {
            allInstalled: allRequiredInstalled,
            prerequisites: Array.from(context.sharedState.currentPrerequisiteStates.entries())
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
