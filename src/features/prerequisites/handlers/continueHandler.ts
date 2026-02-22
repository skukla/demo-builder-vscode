/**
 * Prerequisite Continue Handler
 *
 * Handles the continue-prerequisites message:
 * - Resumes checking from a specific index after prerequisite installation
 * - Re-validates Node version requirements and dependencies
 * - Updates UI with current status
 */

import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { ServiceLocator } from '@/core/di';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getNodeVersionMapping, areDependenciesInstalled, handlePrerequisiteCheckError, determinePrerequisiteStatus, getPrerequisiteStatusMessage, hasNodeVersions, getNodeVersionKeys } from '@/features/prerequisites/handlers/shared';
import { ErrorCode } from '@/types/errorCodes';
import { SimpleResult } from '@/types/results';
import { DEFAULT_SHELL } from '@/types/shell';

/**
 * Get the set of Node major versions installed via fnm.
 */
async function getFnmInstalledMajors(): Promise<Set<string>> {
    const commandManager = ServiceLocator.getCommandExecutor();
    const fnmListResult = await commandManager.execute('fnm list', {
        timeout: TIMEOUTS.PREREQUISITE_CHECK,
        shell: DEFAULT_SHELL,
    });
    const installedVersions = fnmListResult.stdout.trim().split('\n').filter(v => v.trim());
    const installedMajors = new Set<string>();
    for (const version of installedVersions) {
        const match = /v?(\d+)/.exec(version);
        if (match) {
            installedMajors.add(match[1]);
        }
    }
    return installedMajors;
}

/**
 * Check if a per-node-version tool is installed for a specific Node major version.
 * Returns the version status entry for that major.
 */
async function checkToolForNodeMajor(
    prereq: { check: { command: string; parseVersion?: string } },
    major: string,
): Promise<{ version: string; major: string; component: string; installed: boolean }> {
    try {
        const commandManager = ServiceLocator.getCommandExecutor();
        const result = await commandManager.execute(prereq.check.command, {
            useNodeVersion: major,
            timeout: TIMEOUTS.PREREQUISITE_CHECK,
        });

        if (result.code === 0) {
            let cliVersion = '';
            if (prereq.check.parseVersion) {
                try {
                    const match = new RegExp(prereq.check.parseVersion).exec(result.stdout);
                    if (match) cliVersion = match[1] || '';
                } catch {
                    // Ignore regex parse errors
                }
            }
            return { version: `Node ${major}`, major, component: cliVersion, installed: true };
        }
        return { version: `Node ${major}`, major, component: '', installed: false };
    } catch {
        return { version: `Node ${major}`, major, component: '', installed: false };
    }
}

/**
 * Check per-node-version variant status for a prerequisite during continue flow.
 * Returns which Node majors have the tool installed and which are missing.
 */
async function checkContinuePerNodeVariants(
    context: HandlerContext,
    prereq: { id: string; name: string; perNodeVersion?: boolean; check: { command: string; parseVersion?: string } },
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

    const requiredMajors = getNodeVersionKeys(nodeVersionMapping);
    const perNodeVersionStatus: { version: string; major: string; component: string; installed: boolean }[] = [];
    const missingVariantMajors: string[] = [];

    if (!checkResult.installed) {
        for (const major of requiredMajors) {
            perNodeVersionStatus.push({ version: `Node ${major}`, major, component: '', installed: false });
        }
        return { perNodeVariantMissing: true, missingVariantMajors: [...requiredMajors], perNodeVersionStatus };
    }

    // Main tool installed: check each Node version
    const installedMajors = await getFnmInstalledMajors();

    for (const major of requiredMajors) {
        if (!installedMajors.has(major)) {
            context.logger.debug(`[Prerequisites] Node ${major} not installed, skipping ${prereq.name} check for this version`);
            missingVariantMajors.push(major);
            perNodeVersionStatus.push({ version: `Node ${major}`, major, component: '', installed: false });
            continue;
        }

        const status = await checkToolForNodeMajor(prereq, major);
        perNodeVersionStatus.push(status);
        if (!status.installed) {
            missingVariantMajors.push(major);
        }
    }

    return { perNodeVariantMissing: missingVariantMajors.length > 0, missingVariantMajors, perNodeVersionStatus };
}

/**
 * Compute the overall status and canInstall flag for a prerequisite.
 */
function computeContinueOverallStatus(
    prereq: { id: string; optional?: boolean; perNodeVersion?: boolean },
    checkResult: { installed: boolean; canInstall: boolean },
    nodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined,
    perNodeVariantMissing: boolean,
): { overallStatus: string; nodeMissing: boolean } {
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
    payload?: { fromIndex?: number },
): Promise<SimpleResult> {
    try {
        if (!context.sharedState.currentPrerequisites || !context.sharedState.currentPrerequisiteStates) {
            return { success: false, error: 'No prerequisites state found', code: ErrorCode.PREREQ_CHECK_FAILED };
        }

        const start = typeof payload?.fromIndex === 'number' ? payload.fromIndex : 0;
        const nodeVersionMapping = await getNodeVersionMapping(context);

        for (let i = start; i < context.sharedState.currentPrerequisites.length; i++) {
            const prereq = context.sharedState.currentPrerequisites[i];
            await context.sendMessage('prerequisite-status', {
                index: i,
                name: prereq.name,
                status: 'checking',
                description: prereq.description,
                required: !prereq.optional,
            });

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

            await context.sendMessage('prerequisite-status', {
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
            });
        }

        const allRequiredInstalled = Array.from(context.sharedState.currentPrerequisiteStates.values())
            .filter(state => !state.prereq.optional)
            .every(state => state.result.installed);

        await context.sendMessage('prerequisites-complete', {
            allInstalled: allRequiredInstalled,
        });

        return { success: true };
    } catch (error) {
        context.logger.error('Failed to continue prerequisites:', error as Error);
        return { success: false, error: 'Failed to continue prerequisites check', code: ErrorCode.UNKNOWN };
    }
}
