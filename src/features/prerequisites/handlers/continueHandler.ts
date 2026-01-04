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
import {
    getNodeVersionMapping,
    areDependenciesInstalled,
    handlePrerequisiteCheckError,
    getPrerequisiteStatusMessage,
    getNodeVersionKeys,
    hasNodeVersions,
} from '@/features/prerequisites/handlers/shared';
import { ErrorCode } from '@/types/errorCodes';
import type { PrerequisiteDefinition, PrerequisiteStatus } from '@/features/prerequisites/services/types';
import { SimpleResult } from '@/types/results';
import { DEFAULT_SHELL } from '@/types/shell';

// Alias for backwards compatibility with previous naming
type PrerequisiteResult = PrerequisiteStatus;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result from per-node-version check during continue flow
 */
interface ContinuePerNodeVersionResult {
    perNodeVersionStatus: { version: string; major: string; component: string; installed: boolean }[];
    perNodeVariantMissing: boolean;
    missingVariantMajors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// FNM VERSION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get list of installed Node major versions from fnm
 */
async function getInstalledFnmMajors(
    context: HandlerContext,
): Promise<Set<string>> {
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

// ─────────────────────────────────────────────────────────────────────────────
// PER-NODE-VERSION STATUS CHECKING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check per-node-version prerequisites during continue flow
 *
 * This is used when resuming prerequisite checking after an installation.
 * It checks which Node versions have the prerequisite installed.
 */
async function checkPerNodeVersionDuringContinue(params: {
    prereq: PrerequisiteDefinition;
    checkResult: PrerequisiteResult;
    nodeVersionMapping: Record<string, string>;
    context: HandlerContext;
}): Promise<ContinuePerNodeVersionResult> {
    const { prereq, checkResult, nodeVersionMapping, context } = params;

    const perNodeVersionStatus: { version: string; major: string; component: string; installed: boolean }[] = [];
    const missingVariantMajors: string[] = [];
    let perNodeVariantMissing = false;

    if (!prereq.perNodeVersion || !hasNodeVersions(nodeVersionMapping)) {
        return { perNodeVersionStatus, perNodeVariantMissing, missingVariantMajors };
    }

    const requiredMajors = getNodeVersionKeys(nodeVersionMapping);

    if (!checkResult.installed) {
        // Main tool not installed: populate with all NOT installed
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
        return { perNodeVersionStatus, perNodeVariantMissing, missingVariantMajors };
    }

    // Main tool installed: check each Node version
    const installedMajors = await getInstalledFnmMajors(context);
    const commandManager = ServiceLocator.getCommandExecutor();

    for (const major of requiredMajors) {
        // Check if this Node version is actually installed
        if (!installedMajors.has(major)) {
            context.logger.debug(`[Prerequisites] Node ${major} not installed, skipping ${prereq.name} check for this version`);
            perNodeVariantMissing = true;
            missingVariantMajors.push(major);
            perNodeVersionStatus.push({ version: `Node ${major}`, major, component: '', installed: false });
            continue;
        }

        try {
            const result = await commandManager.execute(prereq.check.command, {
                useNodeVersion: major,
                timeout: TIMEOUTS.PREREQUISITE_CHECK,
            });

            if (result.code === 0) {
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
                perNodeVersionStatus.push({ version: `Node ${major}`, major, component: cliVersion, installed: true });
            } else {
                perNodeVariantMissing = true;
                missingVariantMajors.push(major);
                perNodeVersionStatus.push({ version: `Node ${major}`, major, component: '', installed: false });
            }
        } catch {
            perNodeVariantMissing = true;
            missingVariantMajors.push(major);
            perNodeVersionStatus.push({ version: `Node ${major}`, major, component: '', installed: false });
        }
    }

    return { perNodeVersionStatus, perNodeVariantMissing, missingVariantMajors };
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine if a Node version is missing based on version status
 */
function isNodeVersionMissing(
    prereq: PrerequisiteDefinition,
    nodeVersionStatus?: { version: string; component: string; installed: boolean }[],
): boolean {
    if (prereq.id !== 'node' || !nodeVersionStatus || nodeVersionStatus.length === 0) {
        return false;
    }
    return nodeVersionStatus.some(v => !v.installed);
}

/**
 * Determine the overall status string for a prerequisite
 */
function determineOverallStatusForContinue(params: {
    installed: boolean;
    optional: boolean;
    nodeMissing: boolean;
    perNodeVariantMissing: boolean;
}): 'success' | 'error' | 'warning' {
    const { installed, optional, nodeMissing, perNodeVariantMissing } = params;

    let status: 'success' | 'error' | 'warning' = installed
        ? 'success'
        : (optional ? 'warning' : 'error');

    if (nodeMissing || perNodeVariantMissing) {
        status = 'error';
    }

    return status;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────────────────

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

        // Recompute Node version mapping if we have a component selection (for variant checks)
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

            // Check prerequisite with timeout error handling
            let checkResult;
            try {
                checkResult = prereq ? await context.prereqManager?.checkPrerequisite(prereq) : undefined;
            } catch (error) {
                await handlePrerequisiteCheckError(context, prereq, i, error, true); // isRecheck = true
                continue;
            }

            if (!checkResult) continue;

            context.sharedState.currentPrerequisiteStates.set(i, { prereq, result: checkResult });

            // Variant checks
            let nodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined;
            if (prereq.id === 'node' && hasNodeVersions(nodeVersionMapping)) {
                nodeVersionStatus = await context.prereqManager?.checkMultipleNodeVersions(nodeVersionMapping);
            }

            // Check per-node-version status using helper (extracted for testability)
            const perNodeResult = await checkPerNodeVersionDuringContinue({
                prereq,
                checkResult,
                nodeVersionMapping,
                context,
            });
            const { perNodeVersionStatus, perNodeVariantMissing, missingVariantMajors } = perNodeResult;

            // Dependency gating
            const depsInstalled = areDependenciesInstalled(prereq, context);

            // Compute nodeMissing and overall status using helpers (extracted for testability)
            const nodeMissing = isNodeVersionMissing(prereq, nodeVersionStatus);
            const overallStatus = determineOverallStatusForContinue({
                installed: checkResult.installed,
                optional: !!prereq.optional,
                nodeMissing,
                perNodeVariantMissing,
            });

            // Persist nodeVersionStatus to state for downstream gating
            // For Node.js: use nodeVersionStatus; for perNodeVersion prereqs: use perNodeVersionStatus
            const versionStatusForState = prereq.id === 'node' ? nodeVersionStatus : perNodeVersionStatus;
            context.sharedState.currentPrerequisiteStates.set(i, { prereq, result: checkResult, nodeVersionStatus: versionStatusForState });

            await context.sendMessage('prerequisite-status', {
                index: i,
                name: prereq.name,
                status: overallStatus,
                description: prereq.description,
                required: !prereq.optional,
                // For per-node-version prerequisites: installed is false if ANY required Node version is missing the tool
                installed: (prereq.perNodeVersion && perNodeVariantMissing) ? false : checkResult.installed,
                version: checkResult.version,
                message: getPrerequisiteStatusMessage(
                    prereq.name,
                    checkResult.installed,
                    checkResult.version,
                    prereq.perNodeVersion && perNodeVariantMissing,
                    missingVariantMajors,
                ),
                canInstall: depsInstalled && (
                    (prereq.id === 'node' && nodeMissing)
                    || (prereq.perNodeVersion && perNodeVariantMissing)
                    || (!checkResult.installed && checkResult.canInstall)
                ),
                plugins: checkResult.plugins,
                // For Node.js: show nodeVersionStatus; for perNodeVersion prereqs: show perNodeVersionStatus
                nodeVersionStatus: prereq.id === 'node' ? nodeVersionStatus : perNodeVersionStatus,
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
