/**
 * Prerequisite Continue Handler
 *
 * Handles the continue-prerequisites message:
 * - Resumes checking from a specific index after prerequisite installation
 * - Re-validates Node version requirements and dependencies
 * - Updates UI with current status
 */

import { getNodeVersionMapping, areDependenciesInstalled, handlePrerequisiteCheckError, determinePrerequisiteStatus, getPrerequisiteStatusMessage, hasNodeVersions, perNodeVersionMajors, checkPerNodeVersionStatus } from '@/features/prerequisites/handlers/shared';
import type { PrerequisiteDefinition } from '@/features/prerequisites/services/PrerequisitesManager';
import { ErrorCode } from '@/types/errorCodes';
import { HandlerContext } from '@/types/handlers';
import { SimpleResult } from '@/types/results';
import type { PrerequisiteStatusPayload, PrerequisitesCompletePayload } from '@/types/webviewPayloads';
import type { ContinuePrerequisitesRequestPayload } from '@/types/webviewRequests';

/**
 * Check per-node-version variant status for a prerequisite during continue flow.
 * Returns which Node majors have the tool installed and which are missing.
 */
async function checkContinuePerNodeVariants(
    context: HandlerContext,
    prereq: PrerequisiteDefinition,
    checkResult: { installed: boolean },
    nodeVersionMapping: Record<string, string>,
): Promise<{
    perNodeVariantMissing: boolean;
    missingVariantMajors: string[];
    perNodeVersionStatus: { version: string; major: string; component: string; installed: boolean }[];
}> {
    if (!prereq.perNodeVersion || !hasNodeVersions(nodeVersionMapping)) {
        return { perNodeVariantMissing: false, missingVariantMajors: [], perNodeVersionStatus: [] };
    }

    // The SAME scope check applies — see perNodeVersionMajors' docstring.
    const requiredMajors = perNodeVersionMajors();
    if (!checkResult.installed) {
        const perNodeVersionStatus = requiredMajors.map(
            (major) => ({ version: `Node ${major}`, major, component: '', installed: false }),
        );
        return { perNodeVariantMissing: true, missingVariantMajors: [...requiredMajors], perNodeVersionStatus };
    }

    // Main tool installed: the same per-Node check the first pass runs.
    return checkPerNodeVersionStatus(prereq, requiredMajors, context);
}

/**
 * Compute the overall status and canInstall flag for a prerequisite.
 */
function computeContinueOverallStatus(
    prereq: { id: string; optional?: boolean; perNodeVersion?: boolean },
    checkResult: { installed: boolean; canInstall: boolean },
    nodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined,
    perNodeVariantMissing: boolean,
): { overallStatus: PrerequisiteStatusPayload['status']; nodeMissing: boolean } {
    let overallStatus = determinePrerequisiteStatus(checkResult.installed, !!prereq.optional);
    let nodeMissing = false;
    if (prereq.id === 'node' && nodeVersionStatus && nodeVersionStatus.length > 0) {
        nodeMissing = nodeVersionStatus.some(v => !v.installed);
        if (nodeMissing) overallStatus = 'error';
    }
    if (prereq.perNodeVersion && perNodeVariantMissing) overallStatus = 'error';
    return { overallStatus, nodeMissing };
}

/**
 * continue-prerequisites - Resume checking prerequisites after an install
 *
 * Used to re-check prerequisites starting from a specific index after
 * a prerequisite has been installed.
 */
export async function handleContinuePrerequisites(
    context: HandlerContext,
    payload?: ContinuePrerequisitesRequestPayload,
): Promise<SimpleResult> {
    try {
        if (!context.sharedState.currentPrerequisites || !context.sharedState.currentPrerequisiteStates) {
            return { success: false, error: 'No prerequisites state found', code: ErrorCode.PREREQ_CHECK_FAILED };
        }

        const start = typeof payload?.fromIndex === 'number' ? payload.fromIndex : 0;
        const nodeVersionMapping = await getNodeVersionMapping(context);

        for (let i = start; i < context.sharedState.currentPrerequisites.length; i++) {
            const prereq = context.sharedState.currentPrerequisites[i];
            const checking: PrerequisiteStatusPayload = {
                index: i,
                name: prereq.name,
                status: 'checking',
                description: prereq.description,
                required: !prereq.optional,
            };
            await context.sendMessage('prerequisite-status', checking);

            let checkResult;
            try {
                checkResult = prereq ? await context.prereqManager?.checkPrerequisite(prereq) : undefined;
            } catch (error) {
                await handlePrerequisiteCheckError(context, prereq, i, error, true);
                continue;
            }

            if (!checkResult) continue;

            context.sharedState.currentPrerequisiteStates.set(i, { prereq, result: checkResult });

            // Variant checks
            let nodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined;
            if (prereq.id === 'node' && hasNodeVersions(nodeVersionMapping)) {
                nodeVersionStatus = await context.prereqManager?.checkMultipleNodeVersions(nodeVersionMapping);
            }

            const variantStatus = await checkContinuePerNodeVariants(context, prereq, checkResult, nodeVersionMapping);
            const depsInstalled = areDependenciesInstalled(prereq, context);
            const { overallStatus, nodeMissing } = computeContinueOverallStatus(
                prereq, checkResult, nodeVersionStatus, variantStatus.perNodeVariantMissing,
            );

            const versionStatusForState = prereq.id === 'node' ? nodeVersionStatus : variantStatus.perNodeVersionStatus;
            context.sharedState.currentPrerequisiteStates.set(i, { prereq, result: checkResult, nodeVersionStatus: versionStatusForState });

            const result: PrerequisiteStatusPayload = {
                index: i,
                name: prereq.name,
                status: overallStatus,
                description: prereq.description,
                required: !prereq.optional,
                installed: (prereq.perNodeVersion && variantStatus.perNodeVariantMissing) ? false : checkResult.installed,
                version: checkResult.version,
                message: getPrerequisiteStatusMessage(
                    prereq.name,
                    checkResult.installed,
                    checkResult.version,
                    prereq.perNodeVersion && variantStatus.perNodeVariantMissing,
                    variantStatus.missingVariantMajors,
                ),
                canInstall: depsInstalled && (
                    (prereq.id === 'node' && nodeMissing)
                    || (prereq.perNodeVersion && variantStatus.perNodeVariantMissing)
                    || (!checkResult.installed && checkResult.canInstall)
                ),
                plugins: checkResult.plugins,
                nodeVersionStatus: prereq.id === 'node' ? nodeVersionStatus : variantStatus.perNodeVersionStatus,
            };
            await context.sendMessage('prerequisite-status', result);
        }

        const allRequiredInstalled = Array.from(context.sharedState.currentPrerequisiteStates.values())
            .filter(state => !state.prereq.optional)
            .every(state => state.result.installed);

        const complete: PrerequisitesCompletePayload = {
            allInstalled: allRequiredInstalled,
        };
        await context.sendMessage('prerequisites-complete', complete);

        return { success: true };
    } catch (error) {
        context.logger.error('Failed to continue prerequisites:', error as Error);
        return { success: false, error: 'Failed to continue prerequisites check', code: ErrorCode.UNKNOWN };
    }
}
