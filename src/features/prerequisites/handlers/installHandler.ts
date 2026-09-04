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
import { ServiceLocator } from '@/core/di/serviceLocator';
import { isTimeout, toAppError } from '@/core/errors';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getRequiredNodeVersions, getNodeVersionMapping, checkPerNodeVersionStatus, determinePrerequisiteStatus, hasNodeVersions, getNodeVersionKeys } from '@/features/prerequisites/handlers/shared';
import type { InstallStep, PrerequisiteDefinition, PrerequisiteStatus } from '@/features/prerequisites/services/PrerequisitesManager';
import { getInstalledNodeVersions } from '@/features/prerequisites/services/versioning/MultiVersionDetector';
import { ErrorCode } from '@/types/errorCodes';
import { HandlerContext } from '@/types/handlers';
import { SimpleResult } from '@/types/results';
import { toError } from '@/types/typeGuards';
import type { PrerequisiteInstallCompletePayload, PrerequisiteStatusPayload } from '@/types/webviewPayloads';
import type { InstallPrerequisiteRequestPayload } from '@/types/webviewRequests';

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
 * Determine which Node versions to pass to getInstallSteps.
 *
 * - Per-node-version prerequisites (e.g. Adobe CLI): every required Node version, or a
 *   single fallback when the project requires none
 * - Everything else: no nodeVersions needed
 *
 * THE NODE PREREQUISITE NEVER REACHES HERE, which is why it has no case. Its only
 * caller writes `targetVersions || determineNodeVersionsForInstall(...)`, and
 * `targetVersions` is assigned in exactly one place — inside `if (prereq.id === 'node')`
 * — from `resolveNodeTargetVersions`, which returns `earlyReturn` for every case where
 * the list would be missing or empty. So for Node the left side is always a non-empty
 * array and this function is never called; for anything else it is called and the id is
 * never 'node'.
 *
 * It used to carry a Node case anyway. Mutation testing found it: five mutants there
 * that no test could reach, because nothing can. Removed 2026-09-02 — do not re-add it
 * without changing the caller first.
 */
function determineNodeVersionsForInstall(
    prereq: { perNodeVersion?: boolean },
    nodeVersions: string[],
    version?: string,
): string[] | undefined {
    // Per-node-version prerequisites need to install for all Node versions
    if (prereq.perNodeVersion) {
        return nodeVersions.length ? nodeVersions : [version || '20'];
    }

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
            await context.sendMessage('prerequisite-install-complete', { index: prereqId, continueChecking: true } satisfies PrerequisiteInstallCompletePayload);
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
        await context.sendMessage('prerequisite-install-complete', { index: prereqId, continueChecking: true } satisfies PrerequisiteInstallCompletePayload);
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

    const fnmInstalledVersions = await getInstalledNodeVersions(
        ServiceLocator.getCommandExecutor(),
        context.logger,
    );
    const fnmInstalledSet = new Set(fnmInstalledVersions);
    const installableVersions = missingNodeVersions.filter(v => fnmInstalledSet.has(v));

    if (installableVersions.length < missingNodeVersions.length) {
        context.logger.debug(`[Prerequisites] Some Node versions not in fnm, will only install ${prereq.name} for: ${installableVersions.join(', ') || 'none'}`);
    }

    const targetVersions = installableVersions.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    if (!targetVersions || targetVersions.length === 0) {
        context.logger.debug(`[Prerequisites] ${prereq.name} already installed for all required Node versions or no Node versions available in fnm`);
        await context.sendMessage('prerequisite-install-complete', { index: prereqId, continueChecking: true } satisfies PrerequisiteInstallCompletePayload);
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
                const stepStatus: PrerequisiteStatusPayload = {
                    index: prereqId,
                    name: prereq.name,
                    status: 'checking',
                    message: ver ? `${step.message.replace(/{version}/g, ver)} for Node ${ver}` : step.message,
                    required: !prereq.optional,
                    unifiedProgress: progress,
                };
                await context.sendMessage('prerequisite-status', stepStatus);
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

    // A second pass over `currentComponentSelection.dependencies` used to sit here,
    // looking up each dependency that appears in `requiredFor` and adding its Node
    // version. It could never add one: it found its version with
    // `.find(([_, compId]) => compId === dep)`, so the mapping entry it landed on had
    // `componentId === dep`, and `dep` was already known to be in `requiredFor` — which
    // is exactly the condition the loop above tests for every mapping entry. Its
    // `!pluginNodeVersions.includes(...)` guard was therefore always false. Ten mutants
    // sat behind it that no test could reach. Removed 2026-09-04; the same finding as
    // the two blocks the docstrings above record.

    if (pluginNodeVersions.length > 0) {
        const fnmVersions = await getInstalledNodeVersions(
            ServiceLocator.getCommandExecutor(),
            context.logger,
        );
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

            const pluginStatus: PrerequisiteStatusPayload = {
                index: prereqId,
                name: prereq.name,
                status: 'checking',
                message: pluginCommands.message || `Installing ${plugin.name}${versionLabel}...`,
                required: !prereq.optional,
            };
            await context.sendMessage('prerequisite-status', pluginStatus);

            for (const cmd of pluginCommands.commands) {
                try {
                    const commandManager = await import('@/core/di/serviceLocator').then(m => m.ServiceLocator.getCommandExecutor());
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

    const verifyWarning: PrerequisiteStatusPayload = {
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
    };
    await context.sendMessage('prerequisite-status', verifyWarning);
    return { success: true };
}

/**
 * Build the final status message after installation verification.
 *
 * `finalNodeVersionStatus` is only ever populated for the Node prerequisite — its single
 * caller assigns it inside `if (prereq.id === 'node')` — so its presence already means
 * "this is Node". A second `prereqId === 'node'` check used to say so again; it could not
 * be independently false, and mutation testing found four mutants sitting behind it that
 * no test could reach. Removed 2026-09-02 along with the parameter it was the only use of.
 */
function buildFinalStatusMessage(
    prereqName: string,
    installResult: { installed: boolean; version?: string },
    finalNodeVersionStatus?: { version: string; component: string; installed: boolean }[],
): string {
    if (finalNodeVersionStatus && finalNodeVersionStatus.length > 0) {
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

    const finalMessage = buildFinalStatusMessage(prereq.name, installResult, finalNodeVersionStatus);
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

    const finalStatus: PrerequisiteStatusPayload = {
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
    };
    await context.sendMessage('prerequisite-status', finalStatus);
}

/**
 * Resolve WHICH prerequisite to install, from either address.
 *
 * Two callers with genuinely different knowledge:
 *
 * - The **webview** holds a numeric index into the list it was sent, and the
 *   matching `currentPrerequisiteStates` entry was populated by the check that
 *   ran moments earlier in the same session.
 * - An **agent** holds neither. `sharedState` is rebuilt per call on the headless
 *   context, so the map is always empty there and an index-addressed install
 *   could only ever fail. It addresses the prerequisite by its own id from
 *   `prerequisites.json`, which `check_prerequisites` now reports as `prereqId`.
 *
 * The id path re-resolves the list rather than reading cached state, so it does
 * not depend on a check having run first.
 */
async function resolveInstallTarget(
    context: HandlerContext,
    payload: { prereqId?: number; prerequisiteId?: string },
): Promise<{ prereq: PrerequisiteDefinition; prereqId: number } | undefined> {
    if (payload.prerequisiteId) {
        const config = await context.prereqManager?.loadConfig();
        const resolved = context.prereqManager?.resolveDependencies(config?.prerequisites || []);
        const index = resolved?.findIndex((p) => p.id === payload.prerequisiteId) ?? -1;
        if (index < 0 || !resolved) return undefined;
        // The index still travels onward: it is the row identity every
        // `prerequisite-status` push carries, and the webview keys off it. On the
        // agent path nothing is listening, which costs nothing.
        return { prereq: resolved[index], prereqId: index };
    }

    if (typeof payload.prereqId !== 'number') return undefined;
    const state = context.sharedState.currentPrerequisiteStates?.get(payload.prereqId);
    return state ? { prereq: state.prereq, prereqId: payload.prereqId } : undefined;
}

/** Say which address failed, because the two fail for unrelated reasons. */
function describeUnresolvedTarget(payload: {
    prereqId?: number;
    prerequisiteId?: string;
}): string {
    if (payload.prerequisiteId) {
        return `No prerequisite with id "${payload.prerequisiteId}". Run check_prerequisites and use a prereqId it reports.`;
    }
    if (typeof payload.prereqId === 'number') {
        return `Prerequisite state not found for index ${payload.prereqId}. Run the prerequisites check first, or address it by prerequisiteId.`;
    }
    return 'Either prerequisiteId (preferred) or prereqId is required.';
}

/**
 * Whether this context has no webview behind it.
 *
 * `createHeadlessHandlerContext` leaves `panel` undefined precisely so a handler
 * can tell — see its docstring. Used here for ONE decision: whether opening a
 * browser window is a service to the caller or an ambush.
 */
function isHeadless(context: HandlerContext): boolean {
    return context.panel === undefined;
}

/**
 * install-prerequisite - Install a missing prerequisite
 *
 * Handles installation of prerequisites including multi-version Node.js
 * and per-node-version tools like Adobe I/O CLI.
 */
export async function handleInstallPrerequisite(
    context: HandlerContext,
    payload: InstallPrerequisiteRequestPayload,
): Promise<SimpleResult> {
    try {
        const { version } = payload;
        const target = await resolveInstallTarget(context, payload);
        if (!target) {
            // Thrown, not returned. The catch below pushes `prerequisite-status`
            // with `status: 'error'`, and without it the webview's row sits on
            // "Installing…" forever — which is what returning early did, and what
            // installHandler-errorHandling.test.ts caught.
            throw new Error(describeUnresolvedTarget(payload));
        }

        const { prereq, prereqId } = target;
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
            const manualStatus: PrerequisiteStatusPayload = {
                index: prereqId,
                name: prereq.name,
                status: 'warning',
                message: `Manual installation required. Open: ${installPlan.url}`,
                required: !prereq.optional,
            };
            await context.sendMessage('prerequisite-status', manualStatus);

            // Only for a person who just clicked Install. Headless this is an
            // agent's call, and opening a browser window nobody asked for is the
            // same ambush `open_url` exists to prevent — there, the argument is
            // that the danger is a well-formed URL nobody requested.
            if (!isHeadless(context)) {
                await vscode.env.openExternal(vscode.Uri.parse(installPlan.url));
            }

            // Structured on BOTH paths. `{success: true}` alone said "installed"
            // for a prerequisite that was not installed and never would be by
            // this call — the bare-success shape Wave 3 removed elsewhere.
            return {
                success: true,
                data: { manual: true, url: installPlan.url, prerequisite: prereq.name },
            };
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

        await context.sendMessage('prerequisite-install-complete', { index: prereqId, continueChecking: true } satisfies PrerequisiteInstallCompletePayload);

        // Named, not bare. `{success: true}` renders as the literal "{}" through
        // `defaultShape`, so an agent learned nothing — not which prerequisite,
        // not which version it ended up with, and not whether the re-check
        // actually found it installed. All three are already in hand here.
        return {
            success: true,
            data: {
                installed: {
                    id: prereq.id,
                    name: prereq.name,
                    version: installResult.version,
                    verified: installResult.installed,
                },
            },
        };
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
