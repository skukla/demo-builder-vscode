/**
 * Prerequisite Continue Handler
 *
 * Handles the continue-prerequisites message:
 * - Resumes checking from a specific index after prerequisite installation
 * - Re-validates Node version requirements and dependencies
 * - Updates UI with current status
 */

import { ServiceLocator } from '../../../services/serviceLocator';
import { TIMEOUTS } from '@/utils/timeoutConfig';
import { HandlerContext } from '../../../commands/handlers/HandlerContext';
import { getNodeVersionMapping, areDependenciesInstalled } from './shared';

/**
 * continue-prerequisites - Resume checking prerequisites after an install
 *
 * Used to re-check prerequisites starting from a specific index after
 * a prerequisite has been installed.
 */
export async function handleContinuePrerequisites(
    context: HandlerContext,
    payload?: { fromIndex?: number },
): Promise<{ success: boolean }> {
    try {
        if (!context.sharedState.currentPrerequisites || !context.sharedState.currentPrerequisiteStates) {
            return { success: false };
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
                checkResult = await context.prereqManager.checkPrerequisite(prereq);
            } catch (error) {
                // Handle timeout or other check errors
                const errorMessage = error instanceof Error ? error.message : String(error);
                const isTimeout = errorMessage.toLowerCase().includes('timed out') ||
                                 errorMessage.toLowerCase().includes('timeout');

                // Log to all appropriate channels
                if (isTimeout) {
                    context.logger.warn(`[Prerequisites] ${prereq.name} re-check timed out after ${TIMEOUTS.PREREQUISITE_CHECK / 1000}s`);
                    context.stepLogger.log('prerequisites', `⏱️ ${prereq.name} re-check timed out (${TIMEOUTS.PREREQUISITE_CHECK / 1000}s)`, 'warn');
                    context.debugLogger.debug('[Prerequisites] Re-check timeout details:', { prereq: prereq.id, timeout: TIMEOUTS.PREREQUISITE_CHECK, error: errorMessage });
                } else {
                    context.logger.error(`[Prerequisites] Failed to re-check ${prereq.name}:`, error as Error);
                    context.stepLogger.log('prerequisites', `✗ ${prereq.name} re-check failed: ${errorMessage}`, 'error');
                    context.debugLogger.debug('[Prerequisites] Re-check failure details:', { prereq: prereq.id, error });
                }

                await context.sendMessage('prerequisite-status', {
                    index: i,
                    name: prereq.name,
                    status: 'error',
                    description: prereq.description,
                    required: !prereq.optional,
                    installed: false,
                    message: isTimeout
                        ? `Check timed out after ${TIMEOUTS.PREREQUISITE_CHECK / 1000} seconds. Click Recheck to try again.`
                        : `Failed to check: ${errorMessage}`,
                    canInstall: false,
                });

                // Continue to next prerequisite
                continue;
            }

            context.sharedState.currentPrerequisiteStates.set(i, { prereq, result: checkResult });

            // Variant checks
            let nodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined;
            if (prereq.id === 'node' && Object.keys(nodeVersionMapping).length > 0) {
                nodeVersionStatus = await context.prereqManager.checkMultipleNodeVersions(nodeVersionMapping);
            }

            let perNodeVariantMissing = false;
            const missingVariantMajors: string[] = [];
            const perNodeVersionStatus: { version: string; component: string; installed: boolean }[] = [];
            if (prereq.perNodeVersion && Object.keys(nodeVersionMapping).length > 0) {
                const requiredMajors = Object.keys(nodeVersionMapping);
                const commandManager = ServiceLocator.getCommandExecutor();
                for (const major of requiredMajors) {
                    try {
                        const { stdout } = await commandManager.execute(prereq.check.command, { useNodeVersion: major });
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
                        perNodeVariantMissing = true;
                        missingVariantMajors.push(major);
                        perNodeVersionStatus.push({ version: `Node ${major}`, component: '', installed: false });
                    }
                }
            }

            // Dependency gating
            const depsInstalled = areDependenciesInstalled(prereq, context);

            // Overall status and canInstall
            let overallStatus: 'success' | 'error' | 'warning' = checkResult.installed ? 'success' : (!prereq.optional ? 'error' : 'warning');
            let nodeMissing = false;
            if (prereq.id === 'node' && nodeVersionStatus && nodeVersionStatus.length > 0) {
                nodeMissing = nodeVersionStatus.some(v => !v.installed);
                if (nodeMissing) overallStatus = 'error';
            }
            if (prereq.perNodeVersion && perNodeVariantMissing) overallStatus = 'error';

            // Persist nodeVersionStatus to state for downstream gating
            context.sharedState.currentPrerequisiteStates.set(i, { prereq, result: checkResult, nodeVersionStatus });

            await context.sendMessage('prerequisite-status', {
                index: i,
                name: prereq.name,
                status: overallStatus,
                description: prereq.description,
                required: !prereq.optional,
                installed: checkResult.installed,
                version: checkResult.version,
                message: (prereq.perNodeVersion && perNodeVariantMissing)
                    ? `${prereq.name} is missing in Node ${missingVariantMajors.join(', ')}`
                    : (checkResult.installed
                        ? `${prereq.name} is installed${checkResult.version ? ': ' + checkResult.version : ''}`
                        : `${prereq.name} is not installed`),
                canInstall: depsInstalled && (
                    (prereq.id === 'node' && nodeMissing)
                    || (prereq.perNodeVersion && perNodeVariantMissing)
                    || (!checkResult.installed && checkResult.canInstall)
                ),
                plugins: checkResult.plugins,
                nodeVersionStatus,
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
        return { success: false };
    }
}
