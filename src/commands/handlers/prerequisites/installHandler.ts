/**
 * Prerequisite Install Handler
 *
 * Handles the install-prerequisite message:
 * - Manages installation of missing prerequisites
 * - Supports multi-version Node.js installation
 * - Handles per-node-version tools (e.g., Adobe I/O CLI)
 * - Provides unified progress tracking during installation
 */

import * as vscode from 'vscode';
import { ServiceLocator } from '../../../services/serviceLocator';
import { InstallStep } from '../../../utils/prerequisitesManager';
import { TIMEOUTS } from '../../../utils/timeoutConfig';
import { HandlerContext } from '../HandlerContext';
import { getRequiredNodeVersions, getNodeVersionMapping } from './shared';

/**
 * install-prerequisite - Install a missing prerequisite
 *
 * Handles installation of prerequisites including multi-version Node.js
 * and per-node-version tools like Adobe I/O CLI.
 */
export async function handleInstallPrerequisite(
    context: HandlerContext,
    payload: { prereqId: number; version?: string },
): Promise<{ success: boolean }> {
    try {
        const { prereqId, version } = payload;
        const state = context.sharedState.currentPrerequisiteStates?.get(prereqId);
        if (!state) {
            throw new Error(`Prerequisite state not found for ID ${prereqId}`);
        }

        const { prereq } = state;
        // High-level log (user-facing Logs channel)
        context.logger.info(`[Prerequisites] User initiated install for: ${prereq.name}`);
        // Debug channel detail
        context.debugLogger.debug('[Prerequisites] install-prerequisite payload', { id: prereqId, name: prereq.name, version });

        // Resolve install steps from config
        const nodeVersions = await getRequiredNodeVersions(context);

        const installPlan = context.prereqManager.getInstallSteps(prereq, {
            nodeVersions: prereq.perNodeVersion
                ? (nodeVersions.length ? nodeVersions : [version || '20'])
                : (prereq.id === 'node' ? (version ? [version] : undefined) : undefined),
        });

        if (!installPlan) {
            throw new Error(`No installation steps defined for ${prereq.name}`);
        }

        if (installPlan.manual && installPlan.url) {
            await context.sendMessage('prerequisite-status', {
                index: prereqId,
                name: prereq.name,
                status: 'warning',
                message: `Manual installation required. Open: ${installPlan.url}`,
                required: !prereq.optional,
            });
            await vscode.env.openExternal(vscode.Uri.parse(installPlan.url));
            return { success: true };
        }

        const steps = installPlan.steps || [];

        // If Node requires additional versions (multi-version case), surface Install when any required version missing
        if (prereq.id === 'node') {
            const mapping = await getNodeVersionMapping(context);
            const requiredMajors = Object.keys(mapping);
            if (requiredMajors.length > 0) {
                // ensure steps include per required version when not installed; ProgressUnifier handles template replacement
            }
        }

        // Execute steps with unified progress. For Node multi-version, iterate missing majors.
        let targetVersions: string[] | undefined = undefined;
        if (prereq.id === 'node') {
            // Determine missing majors from mapping
            const mapping = await getNodeVersionMapping(context);
            const nodeStatus = Object.keys(mapping).length > 0
                ? await context.prereqManager.checkMultipleNodeVersions(mapping)
                : undefined;
            const missingMajors = nodeStatus
                ? Object.keys(mapping).filter(m => !nodeStatus.some(s => s.version.startsWith(`Node ${m}`) && s.installed))
                : [];
            targetVersions = missingMajors.length > 0 ? missingMajors : (version ? [version] : undefined);
        } else if (prereq.perNodeVersion) {
            // For per-node-version prerequisites, check which Node versions are missing this prereq
            const commandManager = ServiceLocator.getCommandExecutor();
            const missingNodeVersions: string[] = [];

            for (const nodeVer of nodeVersions) {
                try {
                    await commandManager.execute(prereq.check.command, { useNodeVersion: nodeVer });
                    // Already installed for this Node version
                    context.debugLogger.debug(`[Prerequisites] ${prereq.name} already installed for Node ${nodeVer}, skipping`);
                } catch {
                    // Missing for this Node version
                    context.debugLogger.debug(`[Prerequisites] ${prereq.name} not found for Node ${nodeVer}, will install`);
                    missingNodeVersions.push(nodeVer);
                }
            }

            targetVersions = missingNodeVersions.length > 0 ? missingNodeVersions : (version ? [version] : []);
        }

        const total = steps.length * (targetVersions?.length ? targetVersions.length : 1);
        let counter = 0;
        const run = async (step: InstallStep, ver?: string) => {
            // Debug before step
            context.debugLogger.debug(`[Prerequisites] Executing step: ${step.name}${ver ? ` (Node ${ver})` : ''}`);
            await context.progressUnifier.executeStep(
                step,
                counter,
                total,
                async (progress) => {
                    await context.sendMessage('prerequisite-status', {
                        index: prereqId,
                        name: prereq.name,
                        status: 'checking',
                        message: ver ? `${step.message} for Node ${ver}` : step.message,
                        required: !prereq.optional,
                        unifiedProgress: progress,
                    });
                },
                ver ? { nodeVersion: ver } : undefined,
            );
            counter++;
            // Debug after step
            context.debugLogger.debug(`[Prerequisites] Completed step: ${step.name}${ver ? ` (Node ${ver})` : ''}`);
        };

        if (targetVersions?.length) {
            for (const ver of targetVersions) {
                for (const step of steps) {
                    await run(step, ver);
                }
            }
        } else {
            for (const step of steps) {
                await run(step);
            }
        }

        // Re-check after installation and include variant details/messages
        let installResult;
        try {
            installResult = await context.prereqManager.checkPrerequisite(prereq);
        } catch (error) {
            // Handle timeout or other check errors during verification
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isTimeout = errorMessage.toLowerCase().includes('timed out') ||
                             errorMessage.toLowerCase().includes('timeout');

            // Log to all appropriate channels
            if (isTimeout) {
                context.logger.warn(`[Prerequisites] ${prereq.name} verification timed out after ${TIMEOUTS.PREREQUISITE_CHECK / 1000}s`);
                context.stepLogger.log('prerequisites', `⏱️ ${prereq.name} verification timed out (${TIMEOUTS.PREREQUISITE_CHECK / 1000}s) - installation may have succeeded`, 'warn');
                context.debugLogger.debug('[Prerequisites] Verification timeout details:', { prereq: prereq.id, timeout: TIMEOUTS.PREREQUISITE_CHECK, error: errorMessage });
            } else {
                context.logger.error(`[Prerequisites] Failed to verify ${prereq.name} after installation:`, error as Error);
                context.stepLogger.log('prerequisites', `✗ ${prereq.name} verification failed: ${errorMessage}`, 'error');
                context.debugLogger.debug('[Prerequisites] Verification failure details:', { prereq: prereq.id, error });

                // Log to error channel for critical errors
                try {
                    context.errorLogger.logError(error as Error, `Prerequisite Verification - ${prereq.name}`, true);
                } catch {
                    // Ignore errors from error logger
                }
            }

            await context.sendMessage('prerequisite-status', {
                index: prereqId,
                name: prereq.name,
                status: 'warning',
                description: prereq.description,
                required: !prereq.optional,
                installed: false,
                message: isTimeout
                    ? `Installation completed but verification timed out after ${TIMEOUTS.PREREQUISITE_CHECK / 1000} seconds. Click Recheck to verify.`
                    : `Installation completed but verification failed: ${errorMessage}. Click Recheck to verify.`,
                canInstall: false,
            });
            return { success: true }; // Installation steps completed even if verification failed
        }

        let finalNodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined;
        let finalPerNodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined;
        if (prereq.id === 'node') {
            // Build mapping and check installed status per required major
            const mapping = await getNodeVersionMapping(context);
            if (Object.keys(mapping).length > 0) {
                finalNodeVersionStatus = await context.prereqManager.checkMultipleNodeVersions(mapping);
            }
        } else if (prereq.perNodeVersion) {
            // For per-node-version prerequisites (e.g., Adobe I/O CLI), re-check under each required Node major
            const mapping = await getNodeVersionMapping(context);
            const requiredMajors = Object.keys(mapping);
            if (requiredMajors.length > 0) {
                finalPerNodeVersionStatus = [];
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
                        finalPerNodeVersionStatus.push({ version: `Node ${major}`, component: cliVersion, installed: true });
                    } catch {
                        finalPerNodeVersionStatus.push({ version: `Node ${major}`, component: '', installed: false });
                    }
                }
            }
        }

        context.sharedState.currentPrerequisiteStates!.set(prereqId, { prereq, result: installResult, nodeVersionStatus: finalNodeVersionStatus });

        const finalMessage = (prereq.id === 'node' && finalNodeVersionStatus && finalNodeVersionStatus.length > 0)
            ? finalNodeVersionStatus.every(s => s.installed)
                ? `${prereq.name} is installed: ${finalNodeVersionStatus.map(s => s.version).join(', ')}`
                : `${prereq.name} is missing in ${finalNodeVersionStatus.filter(s => !s.installed).map(s => s.version.replace('Node ', 'Node ')).join(', ')}`
            : (installResult.installed
                ? `${prereq.name} is installed${installResult.version ? ': ' + installResult.version : ''}`
                : `${prereq.name} is not installed`);

        // Summarize result in both channels
        if (installResult.installed) {
            context.logger.info(`[Prerequisites] ${prereq.name} installation succeeded`);
            context.debugLogger.debug(`[Prerequisites] ${prereq.name} installation succeeded`, { nodeVersionStatus: finalNodeVersionStatus });
        } else {
            context.logger.warn(`[Prerequisites] ${prereq.name} installation did not complete`);
            context.debugLogger.debug(`[Prerequisites] ${prereq.name} installation incomplete`, { nodeVersionStatus: finalNodeVersionStatus });
        }

        await context.sendMessage('prerequisite-status', {
            index: prereqId,
            name: prereq.name,
            status: installResult.installed ? 'success' : (!prereq.optional ? 'error' : 'warning'),
            description: prereq.description,
            required: !prereq.optional,
            installed: installResult.installed,
            version: installResult.version,
            message: finalMessage,
            canInstall: !installResult.installed,
            plugins: installResult.plugins,
            // Include per-node-version status for CLI and per-version status for Node
            nodeVersionStatus: prereq.id === 'node' ? finalNodeVersionStatus : finalPerNodeVersionStatus,
        });

        // Continue checking remaining prerequisites from the next index
        await context.sendMessage('prerequisite-install-complete', { index: prereqId, continueChecking: true });

        return { success: true };
    } catch (error) {
        const { prereqId } = payload;
        context.logger.error(`Failed to install prerequisite ${prereqId}:`, error as Error);
        // Surface to error channel with context
        try {
            context.errorLogger.logError(error as Error, 'Prerequisite Installation', true);
        } catch {
            // Ignore errors from error logger
        }
        await context.sendMessage('prerequisite-status', {
            index: prereqId,
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
        });
        return { success: false };
    }
}
