/**
 * Prerequisite Install Handler
 *
 * Handles the install-prerequisite message:
 * - Manages installation of missing prerequisites
 * - Supports multi-version Node.js installation (component-driven)
 * - Handles per-node-version tools (e.g., Adobe I/O CLI)
 * - Provides unified progress tracking during installation
 *
 * Component-Driven Approach:
 * - Node versions are determined by component requirements, not infrastructure
 * - Adobe CLI and other per-node-version tools adapt to the Node version they're installed under
 * - This is the opposite of traditional approaches where infrastructure dictates versions
 * - Tools conform to what components need, not the other way around
 */

import * as vscode from 'vscode';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getRequiredNodeVersions, getNodeVersionMapping, checkPerNodeVersionStatus, determinePrerequisiteStatus, hasNodeVersions, getNodeVersionKeys } from '@/features/prerequisites/handlers/shared';
import type { InstallStep, PrerequisiteDefinition, PrerequisiteStatus } from '@/features/prerequisites/services/PrerequisitesManager';
import { getInstalledNodeVersions } from '@/features/prerequisites/services/versioning';
import { ErrorCode } from '@/types/errorCodes';
import { isTimeout, toAppError } from '@/types/errors';
import { SimpleResult } from '@/types/results';
import { toError } from '@/types/typeGuards';

/**
 * Get target Node versions for installation (SOP §3 compliance)
 *
 * Extracts nested ternary: `sortedMissing.length > 0 ? sortedMissing : (version ? [version] : undefined)`
 * to explicit helper with clear fallback logic.
 *
 * @param sortedMissingMajors - Sorted array of missing major version numbers
 * @param fallbackVersion - Optional single version to use if no missing majors
 * @returns Array of versions to install, or undefined if none needed
 */
function getTargetNodeVersions(
    sortedMissingMajors: string[],
    fallbackVersion?: string,
): string[] | undefined {
    // Primary: Install missing versions if any
    if (sortedMissingMajors.length > 0) {
        return sortedMissingMajors;
    }
    // Fallback: Use explicit version if provided
    if (fallbackVersion) {
        return [fallbackVersion];
    }
    // No versions to install
    return undefined;
}

/**
 * Determine which Node versions to pass to getInstallSteps
 *
 * Logic:
 * - Per-node-version prerequisites (e.g., Adobe CLI): Use all required Node versions
 * - Node.js prerequisite: Use explicit version if provided, otherwise all required versions
 * - Other prerequisites: No nodeVersions needed (undefined)
 */
function determineNodeVersionsForInstall(
    prereq: { id: string; perNodeVersion?: boolean },
    nodeVersions: string[],
    version?: string,
): string[] | undefined {
    // Per-node-version prerequisites need to install for all Node versions
    if (prereq.perNodeVersion) {
        return nodeVersions.length ? nodeVersions : [version || '20'];
    }

    // Node.js prerequisite: explicit version overrides, otherwise use all required versions
    if (prereq.id === 'node') {
        if (version) {
            return [version];
        }
        return nodeVersions.length ? nodeVersions : undefined;
    }

    // Other prerequisites don't need nodeVersions
    return undefined;
}

/**
 * Determine missing Node.js versions and return target versions for installation.
 * Returns undefined if all versions are already installed.
 */
async function resolveNodeTargetVersions(
    context: HandlerContext,
    prereqId: number,
    version?: string,
): Promise<{ targetVersions: string[] | undefined; earlyReturn: boolean }> {
    if (version) {
        context.debugLogger.debug(`[Prerequisites] Checking if Node ${version}.x is already satisfied`);
        const satisfied = await context.prereqManager?.checkVersionSatisfaction(version);
        if (satisfied) {
            context.logger.debug(`[Prerequisites] Node ${version}.x already installed, skipping installation`);
            context.debugLogger.debug(`[Prerequisites] Version satisfaction check passed - no installation needed for Node ${version}`);
            await context.sendMessage('prerequisite-install-complete', { index: prereqId, continueChecking: true });
            return { targetVersions: undefined, earlyReturn: true };
        }
        context.debugLogger.debug(`[Prerequisites] Node ${version}.x not satisfied, proceeding with installation`);
    }

    const mapping = await getNodeVersionMapping(context);
    context.debugLogger.trace(`[Prerequisites] Node version mapping: ${JSON.stringify(mapping)}`);
    const nodeStatus = hasNodeVersions(mapping)
        ? await context.prereqManager?.checkMultipleNodeVersions(mapping)
        : undefined;
    context.debugLogger.trace(`[Prerequisites] Node status check results: ${JSON.stringify(nodeStatus)}`);
    const missingMajors = nodeStatus
        ? getNodeVersionKeys(mapping).filter(m => !nodeStatus.some(s => s.version.startsWith(`Node ${m}`) && s.installed))
        : [];
    context.debugLogger.trace(`[Prerequisites] Missing major versions: ${JSON.stringify(missingMajors)}`);
    const sortedMissingMajors = missingMajors.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    context.debugLogger.trace(`[Prerequisites] Sorted missing majors for installation: ${JSON.stringify(sortedMissingMajors)}`);
    const targetVersions = getTargetNodeVersions(sortedMissingMajors, version);

    if (!targetVersions || targetVersions.length === 0) {
        context.logger.debug(`[Prerequisites] All required Node versions already installed`);
        await context.sendMessage('prerequisite-install-complete', { index: prereqId, continueChecking: true });
        return { targetVersions: undefined, earlyReturn: true };
    }

    return { targetVersions, earlyReturn: false };
}

/**
 * Determine which Node versions need a per-node-version tool installed.
 * Filters to versions that are missing the tool AND present in fnm.
 */
async function resolvePerNodeTargetVersions(
    context: HandlerContext,
    prereq: PrerequisiteDefinition,
    nodeVersions: string[],
    prereqId: number,
    version?: string,
): Promise<{ targetVersions: string[] | undefined; earlyReturn: boolean }> {
    const versionsToCheck = nodeVersions.length ? nodeVersions : [version || '20'];
    versionsToCheck.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    const perNodeStatus = await checkPerNodeVersionStatus(prereq, versionsToCheck, context);
    const missingNodeVersions = perNodeStatus.missingVariantMajors;

    const fnmInstalledVersions = await getInstalledNodeVersions(context.logger);
    const fnmInstalledSet = new Set(fnmInstalledVersions);
    const installableVersions = missingNodeVersions.filter(v => fnmInstalledSet.has(v));

    if (installableVersions.length < missingNodeVersions.length) {
        context.logger.debug(`[Prerequisites] Some Node versions not in fnm, will only install ${prereq.name} for: ${installableVersions.join(', ') || 'none'}`);
    }

    const targetVersions = installableVersions.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    if (!targetVersions || targetVersions.length === 0) {
        context.logger.debug(`[Prerequisites] ${prereq.name} already installed for all required Node versions or no Node versions available in fnm`);
        await context.sendMessage('prerequisite-install-complete', { index: prereqId, continueChecking: true });
        return { targetVersions: undefined, earlyReturn: true };
    }

    return { targetVersions, earlyReturn: false };
}

/**
 * Execute installation steps with unified progress tracking.
 */
async function executeInstallSteps(
    context: HandlerContext,
    prereq: PrerequisiteDefinition,
    prereqId: number,
    steps: InstallStep[],
    targetVersions: string[] | undefined,
): Promise<void> {
    const installSteps = steps.filter(s => !s.name.toLowerCase().includes('default'));
    const defaultSteps = steps.filter(s => s.name.toLowerCase().includes('default'));

    const isDynamicInstall = prereq.id === 'node' && prereq.install?.dynamic;
    const total = isDynamicInstall
        ? installSteps.length + defaultSteps.length
        : (installSteps.length * (targetVersions?.length || 1)) + defaultSteps.length;
    let counter = 0;

    const run = async (step: InstallStep, ver?: string) => {
        const resolvedStepName = ver ? step.name.replace(/{version}/g, ver) : step.name;
        context.debugLogger.debug(`[Prerequisites] Executing step: ${resolvedStepName}`);
        await context.progressUnifier?.executeStep(
            step, counter, total,
            async (progress) => {
                await context.sendMessage('prerequisite-status', {
                    index: prereqId,
                    name: prereq.name,
                    status: 'checking',
                    message: ver ? `${step.message.replace(/{version}/g, ver)} for Node ${ver}` : step.message,
                    required: !prereq.optional,
                    unifiedProgress: progress,
                });
            },
            ver ? { nodeVersion: ver } : undefined,
        );
        counter++;
        context.debugLogger.debug(`[Prerequisites] Completed step: ${resolvedStepName}`);
    };

    if (isDynamicInstall) {
        for (const step of installSteps) {
            await run(step);
        }
    } else if (targetVersions?.length) {
        for (const ver of targetVersions) {
            for (const step of installSteps) {
                await run(step, ver);
            }
        }
        if (defaultSteps.length > 0) {
            const lastVersion = targetVersions[targetVersions.length - 1];
            context.debugLogger.debug(`[Prerequisites] Setting Node ${lastVersion} as default (optimization: only last version)`);
            for (const step of defaultSteps) {
                await run(step, lastVersion);
            }
        }
    } else {
        for (const step of steps) {
            await run(step);
        }
    }
}

/**
 * Determine which Node versions a plugin should be installed for.
 */
async function resolvePluginNodeVersions(
    context: HandlerContext,
    prereq: PrerequisiteDefinition,
    plugin: { id: string; requiredFor?: string[] },
    nodeVersionMapping: Record<string, string>,
    targetVersions: string[] | undefined,
): Promise<(string | undefined)[] | null> {
    const requiredForComponents = plugin.requiredFor || [];
    let versionsToInstall: (string | undefined)[] = [undefined];

    if (!prereq.perNodeVersion || !hasNodeVersions(nodeVersionMapping)) {
        return versionsToInstall;
    }

    const pluginNodeVersions: string[] = [];

    for (const [nodeVersion, componentId] of Object.entries(nodeVersionMapping)) {
        if (requiredForComponents.includes(componentId)) {
            pluginNodeVersions.push(nodeVersion);
            context.debugLogger.debug(`[Prerequisites] Plugin ${plugin.id} needed for ${componentId} (Node ${nodeVersion})`);
        }
    }

    // Also check dependencies
    const selection = context.sharedState.currentComponentSelection;
    if (selection?.dependencies) {
        for (const dep of selection.dependencies) {
            if (requiredForComponents.includes(dep)) {
                const depNodeVersion = Object.entries(nodeVersionMapping)
                    .find(([_, compId]) => compId === dep)?.[0];
                if (depNodeVersion && !pluginNodeVersions.includes(depNodeVersion)) {
                    pluginNodeVersions.push(depNodeVersion);
                    context.debugLogger.debug(`[Prerequisites] Plugin ${plugin.id} needed for dependency ${dep} (Node ${depNodeVersion})`);
                }
            }
        }
    }

    if (pluginNodeVersions.length > 0) {
        const fnmVersions = await getInstalledNodeVersions(context.logger);
        const fnmSet = new Set(fnmVersions);
        const installablePluginVersions = pluginNodeVersions.filter(v => fnmSet.has(v));

        if (installablePluginVersions.length > 0) {
            versionsToInstall = installablePluginVersions;
        } else {
            context.logger.debug(`[Prerequisites] Plugin ${plugin.id}: Node versions not in fnm, skipping`);
            return null; // Signal to skip this plugin
        }
    } else if (targetVersions?.length) {
        versionsToInstall = [targetVersions[0]];
        context.debugLogger.debug(`[Prerequisites] Plugin ${plugin.id}: no specific version mapping, using ${targetVersions[0]}`);
    }

    return versionsToInstall;
}

/**
 * Install all plugins for a prerequisite across the appropriate Node versions.
 */
async function installPlugins(
    context: HandlerContext,
    prereq: PrerequisiteDefinition,
    prereqId: number,
    targetVersions: string[] | undefined,
): Promise<void> {
    if (!prereq.plugins || prereq.plugins.length === 0) return;

    context.logger.debug(`[Prerequisites] ${prereq.name} has ${prereq.plugins.length} plugin(s) to check`);
    const nodeVersionMapping = await getNodeVersionMapping(context);

    for (const plugin of prereq.plugins) {
        const pluginCommands = await context.prereqManager?.getPluginInstallCommands(prereq.id, plugin.id);
        if (!pluginCommands) {
            context.logger.debug(`[Prerequisites] No install commands found for plugin ${plugin.id}`);
            continue;
        }

        const versionsToInstall = await resolvePluginNodeVersions(
            context, prereq, plugin, nodeVersionMapping, targetVersions,
        );
        if (versionsToInstall === null) continue; // Skip this plugin

        for (const nodeVer of versionsToInstall) {
            const versionLabel = nodeVer ? ` for Node ${nodeVer}` : '';
            context.debugLogger.debug(`[Prerequisites] Installing plugin ${plugin.name}${versionLabel}`);

            await context.sendMessage('prerequisite-status', {
                index: prereqId,
                name: prereq.name,
                status: 'checking',
                message: pluginCommands.message || `Installing ${plugin.name}${versionLabel}...`,
                required: !prereq.optional,
            });

            for (const cmd of pluginCommands.commands) {
                try {
                    const commandManager = await import('@/core/di').then(m => m.ServiceLocator.getCommandExecutor());
                    await commandManager.execute(cmd, { timeout: TIMEOUTS.LONG, useNodeVersion: nodeVer });
                    context.logger.debug(`[Prerequisites] Plugin ${plugin.name} installed${versionLabel}`);
                } catch (pluginError) {
                    context.logger.warn(`[Prerequisites] Failed to install plugin ${plugin.name}${versionLabel}: ${toError(pluginError).message}`);
                }
            }
        }
    }
}

/**
 * Invalidate cache for the installed prerequisite and its dependents.
 */
function invalidateCaches(
    context: HandlerContext,
    prereq: { id: string },
): void {
    context.prereqManager?.getCacheManager().invalidate(prereq.id);
    context.logger.debug(`[Prerequisites] Cache invalidated for ${prereq.id} after installation`);

    const dependents = context.sharedState.currentPrerequisites?.filter(p =>
        p.depends?.includes(prereq.id),
    );
    if (dependents && dependents.length > 0) {
        dependents.forEach(dep => {
            context.prereqManager?.getCacheManager().invalidate(dep.id);
            context.logger.debug(`[Prerequisites] Cache invalidated for dependent ${dep.id} (depends on ${prereq.id})`);
        });
    }
}

/**
 * Handle verification errors after installation (timeout or other failures).
 * Returns a SimpleResult if verification failed and the caller should return early.
 */
async function handleVerificationError(
    context: HandlerContext,
    prereq: PrerequisiteDefinition,
    prereqId: number,
    error: unknown,
): Promise<SimpleResult> {
    const errorMessage = toError(error).message;
    const isTimeoutErr = isTimeout(toAppError(error));

    if (isTimeoutErr) {
        context.logger.warn(`[Prerequisites] ${prereq.name} verification timed out after ${TIMEOUTS.POLL.INTERVAL / 1000}s`);
        context.stepLogger?.log('prerequisites', `⏱️ ${prereq.name} verification timed out (${TIMEOUTS.POLL.INTERVAL / 1000}s) - installation may have succeeded`, 'warn');
        context.debugLogger.debug('[Prerequisites] Verification timeout details:', { prereq: prereq.id, timeout: TIMEOUTS.POLL.INTERVAL, error: errorMessage });
    } else {
        context.logger.error(`[Prerequisites] Failed to verify ${prereq.name} after installation:`, error as Error);
        context.stepLogger?.log('prerequisites', `✗ ${prereq.name} verification failed: ${errorMessage}`, 'error');
        context.debugLogger.debug('[Prerequisites] Verification failure details:', { prereq: prereq.id, error });
        try {
            context.errorLogger?.logError(error as Error, `Prerequisite Verification - ${prereq.name}`, true);
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
        message: isTimeoutErr
            ? `Installation completed but verification timed out after ${TIMEOUTS.POLL.INTERVAL / 1000} seconds. Click Recheck to verify.`
            : `Installation completed but verification failed: ${errorMessage}. Click Recheck to verify.`,
        canInstall: false,
    });
    return { success: true };
}

/**
 * Build the final status message after installation verification.
 */
function buildFinalStatusMessage(
    prereqName: string,
    prereqId: string,
    installResult: { installed: boolean; version?: string },
    finalNodeVersionStatus?: { version: string; component: string; installed: boolean }[],
): string {
    if (prereqId === 'node' && finalNodeVersionStatus && finalNodeVersionStatus.length > 0) {
        if (finalNodeVersionStatus.every(s => s.installed)) {
            const versions = finalNodeVersionStatus.map(s => s.version).join(', ');
            return `${prereqName} is installed: ${versions}`;
        }
        const missing = finalNodeVersionStatus.filter(s => !s.installed).map(s => s.version).join(', ');
        return `${prereqName} is missing in ${missing}`;
    }

    if (installResult.installed) {
        const ver = installResult.version ? `: ${installResult.version}` : '';
        return `${prereqName} is installed${ver}`;
    }
    return `${prereqName} is not installed`;
}

/**
 * Send the final status message and log the installation result.
 */
async function sendFinalInstallStatus(
    context: HandlerContext,
    prereq: PrerequisiteDefinition,
    prereqId: number,
    installResult: PrerequisiteStatus,
    finalNodeVersionStatus?: { version: string; component: string; installed: boolean }[],
    finalPerNodeVersionStatus?: { version: string; component: string; installed: boolean }[],
): Promise<void> {
    const states = context.sharedState.currentPrerequisiteStates;
    if (states) {
        states.set(prereqId, { prereq, result: installResult, nodeVersionStatus: finalNodeVersionStatus });
    }

    const finalMessage = buildFinalStatusMessage(prereq.name, prereq.id, installResult, finalNodeVersionStatus);
    const overallInstalled = prereq.perNodeVersion && finalPerNodeVersionStatus && finalPerNodeVersionStatus.length > 0
        ? finalPerNodeVersionStatus.every(s => s.installed)
        : installResult.installed;

    if (overallInstalled) {
        context.logger.info(`[Prerequisites] ${prereq.name} installation succeeded`);
        context.debugLogger.debug(`[Prerequisites] ${prereq.name} installation succeeded`, {
            nodeVersionStatus: finalNodeVersionStatus,
            perNodeVersionStatus: finalPerNodeVersionStatus,
        });
    } else {
        context.logger.warn(`[Prerequisites] ${prereq.name} installation did not complete`);
        context.debugLogger.debug(`[Prerequisites] ${prereq.name} installation incomplete`, {
            nodeVersionStatus: finalNodeVersionStatus,
            perNodeVersionStatus: finalPerNodeVersionStatus,
        });
    }

    await context.sendMessage('prerequisite-status', {
        index: prereqId,
        name: prereq.name,
        status: determinePrerequisiteStatus(overallInstalled, !!prereq.optional),
        description: prereq.description,
        required: !prereq.optional,
        installed: overallInstalled,
        version: installResult.version,
        message: finalMessage,
        canInstall: !overallInstalled,
        plugins: installResult.plugins,
        nodeVersionStatus: prereq.id === 'node' ? finalNodeVersionStatus : finalPerNodeVersionStatus,
    });
}

/**
 * install-prerequisite - Install a missing prerequisite
 *
 * Handles installation of prerequisites including multi-version Node.js
 * and per-node-version tools like Adobe I/O CLI.
 */
export async function handleInstallPrerequisite(
    context: HandlerContext,
    payload: { prereqId: number; version?: string },
): Promise<SimpleResult> {
    try {
        const { prereqId, version } = payload;
        const state = context.sharedState.currentPrerequisiteStates?.get(prereqId);
        if (!state) {
            throw new Error(`Prerequisite state not found for ID ${prereqId}`);
        }

        const { prereq } = state;
        context.logger.debug(`[Prerequisites] User initiated install for: ${prereq.name}`);
        context.debugLogger.debug('[Prerequisites] install-prerequisite payload', { id: prereqId, name: prereq.name, version });

        const nodeVersions = await getRequiredNodeVersions(context);

        // Determine target versions for Node.js
        let targetVersions: string[] | undefined = undefined;
        if (prereq.id === 'node') {
            const nodeResult = await resolveNodeTargetVersions(context, prereqId, version);
            if (nodeResult.earlyReturn) return { success: true };
            targetVersions = nodeResult.targetVersions;
        }

        // Generate install steps
        const installPlan = context.prereqManager?.getInstallSteps(prereq, {
            nodeVersions: targetVersions || determineNodeVersionsForInstall(prereq, nodeVersions, version),
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

        // Resolve per-node-version target versions
        if (prereq.perNodeVersion) {
            const perNodeResult = await resolvePerNodeTargetVersions(context, prereq, nodeVersions, prereqId, version);
            if (perNodeResult.earlyReturn) return { success: true };
            targetVersions = perNodeResult.targetVersions;
        }

        // Execute installation steps
        await executeInstallSteps(context, prereq, prereqId, installPlan.steps || [], targetVersions);

        // Install plugins
        await installPlugins(context, prereq, prereqId, targetVersions);

        // Invalidate caches
        invalidateCaches(context, prereq);

        // Re-check after installation
        let installResult;
        try {
            installResult = prereq ? await context.prereqManager?.checkPrerequisite(prereq) : undefined;
        } catch (error) {
            return await handleVerificationError(context, prereq, prereqId, error);
        }

        if (!installResult) {
            context.logger.error(`[Prerequisites] Installation verification failed - no result returned for ${prereq.name}`);
            return { success: false, error: 'Installation verification failed', code: ErrorCode.UNKNOWN };
        }

        // Build final version status
        let finalNodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined;
        let finalPerNodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined;
        if (prereq.id === 'node') {
            const mapping = await getNodeVersionMapping(context);
            if (hasNodeVersions(mapping)) {
                finalNodeVersionStatus = await context.prereqManager?.checkMultipleNodeVersions(mapping);
            }
        } else if (prereq.perNodeVersion) {
            const mapping = await getNodeVersionMapping(context);
            const requiredMajors = getNodeVersionKeys(mapping);
            if (requiredMajors.length > 0) {
                const postCheckStatus = await checkPerNodeVersionStatus(prereq, requiredMajors, context);
                finalPerNodeVersionStatus = postCheckStatus.perNodeVersionStatus;
            }
        }

        await sendFinalInstallStatus(
            context, prereq, prereqId, installResult,
            finalNodeVersionStatus, finalPerNodeVersionStatus,
        );

        await context.sendMessage('prerequisite-install-complete', { index: prereqId, continueChecking: true });
        return { success: true };
    } catch (error) {
        const { prereqId } = payload;
        context.logger.error(`Failed to install prerequisite ${prereqId}:`, error as Error);
        try {
            context.errorLogger?.logError(error as Error, 'Prerequisite Installation', true);
        } catch {
            // Ignore errors from error logger
        }
        await context.sendMessage('prerequisite-status', {
            index: prereqId,
            status: 'error',
            message: toError(error).message,
        });
        return { success: false, error: toError(error).message, code: ErrorCode.UNKNOWN };
    }
}
