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
import { InstallStep } from '@/features/prerequisites/services/PrerequisitesManager';
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
        // Technical flow log (Debug channel)
        context.logger.debug(`[Prerequisites] User initiated install for: ${prereq.name}`);
        // Debug channel detail
        context.debugLogger.debug('[Prerequisites] install-prerequisite payload', { id: prereqId, name: prereq.name, version });

        // Resolve install steps from config
        const nodeVersions = await getRequiredNodeVersions(context);

        // CRITICAL: For Node.js, determine missing versions BEFORE generating steps
        // This prevents generating steps for already-installed versions
        let targetVersions: string[] | undefined = undefined;
        if (prereq.id === 'node') {
            // Step 3: Check version satisfaction before installation
            // If a specific version was requested, check if it's already satisfied
            if (version) {
                context.debugLogger.debug(`[Prerequisites] Checking if Node ${version}.x is already satisfied`);
                const satisfied = await context.prereqManager?.checkVersionSatisfaction(version);
                if (satisfied) {
                    context.logger.debug(`[Prerequisites] Node ${version}.x already installed, skipping installation`);
                    context.debugLogger.debug(`[Prerequisites] Version satisfaction check passed - no installation needed for Node ${version}`);
                    await context.sendMessage('prerequisite-install-complete', { index: prereqId, continueChecking: true });
                    return { success: true };
                }
                context.debugLogger.debug(`[Prerequisites] Node ${version}.x not satisfied, proceeding with installation`);
            }

            // Determine missing majors from mapping
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
            // Sort versions in ascending order (18, 20, 24) for predictable installation order
            const sortedMissingMajors = missingMajors.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
            context.debugLogger.trace(`[Prerequisites] Sorted missing majors for installation: ${JSON.stringify(sortedMissingMajors)}`);
            targetVersions = getTargetNodeVersions(sortedMissingMajors, version);

            // If no versions need installation, we're done
            if (!targetVersions || targetVersions.length === 0) {
                context.logger.debug(`[Prerequisites] All required Node versions already installed`);
                await context.sendMessage('prerequisite-install-complete', { index: prereqId, continueChecking: true });
                return { success: true };
            }
        }

        // Generate install steps using targetVersions (only missing versions) instead of all nodeVersions
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

        const steps = installPlan.steps || [];

        // Execute steps with unified progress. For Node multi-version or per-node-version prereqs
        if (prereq.perNodeVersion) {
            // For per-node-version prerequisites (e.g., Adobe CLI), check which Node versions need this tool
            // Component-driven approach: Adobe CLI and other tools adapt to the Node version
            // they're installed under. This ensures each component's required Node version
            // has all necessary tools installed in its context.
            // CRITICAL: Use the same version resolution logic as getInstallSteps to ensure consistency
            const versionsToCheck = nodeVersions.length ? nodeVersions : [version || '20'];
            // Sort versions in ascending order (18, 20, 24) for predictable installation order
            versionsToCheck.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

            // Use shared utility to check which Node versions need the prerequisite installed
            const perNodeStatus = await checkPerNodeVersionStatus(prereq, versionsToCheck, context);
            const missingNodeVersions = perNodeStatus.missingVariantMajors;

            // Filter to only Node versions actually installed in fnm
            // (prevents trying to install under system Node when fnm has nothing)
            const fnmInstalledVersions = await getInstalledNodeVersions(context.logger);
            const fnmInstalledSet = new Set(fnmInstalledVersions);
            const installableVersions = missingNodeVersions.filter(v => fnmInstalledSet.has(v));

            if (installableVersions.length < missingNodeVersions.length) {
                context.logger.debug(`[Prerequisites] Some Node versions not in fnm, will only install ${prereq.name} for: ${installableVersions.join(', ') || 'none'}`);
            }

            // Sort versions in ascending order for predictable installation order
            targetVersions = installableVersions.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

            // If no versions need installation, return early
            if (!targetVersions || targetVersions.length === 0) {
                context.logger.debug(`[Prerequisites] ${prereq.name} already installed for all required Node versions or no Node versions available in fnm`);
                await context.sendMessage('prerequisite-install-complete', { index: prereqId, continueChecking: true });
                return { success: true };
            }
        }

        // OPTIMIZATION: For multi-version installs, separate install steps from default steps
        // Only run default steps for the LAST version (67% faster for 3 versions)
        const installSteps = steps.filter(s => !s.name.toLowerCase().includes('default'));
        const defaultSteps = steps.filter(s => s.name.toLowerCase().includes('default'));

        // BUG FIX: For dynamic installs (Node.js), PrerequisitesManager already creates
        // version-specific steps, so we shouldn't multiply by targetVersions.length again.
        // Only multiply for per-node-version installs (Adobe CLI) where steps are templates.
        const isDynamicInstall = prereq.id === 'node' && prereq.install?.dynamic;
        const total = isDynamicInstall
            ? installSteps.length + defaultSteps.length
            : (installSteps.length * (targetVersions?.length || 1)) + defaultSteps.length;
        let counter = 0;
        const run = async (step: InstallStep, ver?: string) => {
            // Resolve step name for logging (replace {version} placeholder)
            const resolvedStepName = ver ? step.name.replace(/{version}/g, ver) : step.name;

            // Debug before step
            context.debugLogger.debug(`[Prerequisites] Executing step: ${resolvedStepName}`);
            await context.progressUnifier?.executeStep(
                step,
                counter,
                total,
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
            // Debug after step
            context.debugLogger.debug(`[Prerequisites] Completed step: ${resolvedStepName}`);
        };

        if (isDynamicInstall) {
            // For dynamic installs (Node.js), steps are already version-specific
            // Just execute them sequentially without version iteration
            for (const step of installSteps) {
                await run(step);
            }
            // No default steps for dynamic installs (fnm handles default version automatically)
        } else if (targetVersions?.length) {
            // For per-node-version installs (Adobe CLI), steps are templates
            // Install all versions (without default steps)
            for (const ver of targetVersions) {
                for (const step of installSteps) {
                    await run(step, ver);
                }
            }

            // Set only the LAST version as default
            if (defaultSteps.length > 0) {
                const lastVersion = targetVersions[targetVersions.length - 1];
                context.debugLogger.debug(`[Prerequisites] Setting Node ${lastVersion} as default (optimization: only last version)`);
                for (const step of defaultSteps) {
                    await run(step, lastVersion);
                }
            }
        } else {
            // Single version or no versions - execute all steps normally
            for (const step of steps) {
                await run(step);
            }
        }

        // Install plugins if the prerequisite has plugins defined (e.g., api-mesh for aio-cli)
        // This must happen AFTER the main prerequisite is installed
        if (prereq.plugins && prereq.plugins.length > 0) {
            context.logger.debug(`[Prerequisites] ${prereq.name} has ${prereq.plugins.length} plugin(s) to check`);

            // Get node version mapping for smart plugin installation
            const nodeVersionMapping = await getNodeVersionMapping(context);

            for (const plugin of prereq.plugins) {
                // Check if plugin is already installed
                const pluginCommands = await context.prereqManager?.getPluginInstallCommands(prereq.id, plugin.id);
                if (!pluginCommands) {
                    context.logger.debug(`[Prerequisites] No install commands found for plugin ${plugin.id}`);
                    continue;
                }

                // Get the plugin definition from prereq to check requiredFor
                const pluginDef = prereq.plugins.find(p => p.id === plugin.id);
                const requiredForComponents = pluginDef?.requiredFor || [];

                // For perNodeVersion prerequisites, install plugin ONLY under Node versions
                // that are used by components requiring this plugin (via requiredFor)
                let versionsToInstall: (string | undefined)[] = [undefined];

                if (prereq.perNodeVersion && hasNodeVersions(nodeVersionMapping)) {
                    // Filter to Node versions used by components that require this plugin
                    const pluginNodeVersions: string[] = [];

                    for (const [nodeVersion, componentId] of Object.entries(nodeVersionMapping)) {
                        // Check if this component requires this plugin
                        if (requiredForComponents.includes(componentId)) {
                            pluginNodeVersions.push(nodeVersion);
                            context.debugLogger.debug(`[Prerequisites] Plugin ${plugin.id} needed for ${componentId} (Node ${nodeVersion})`);
                        }
                    }

                    // Also check dependencies (commerce-mesh, adobe-commerce-paas, etc.)
                    const selection = context.sharedState.currentComponentSelection;
                    if (selection?.dependencies) {
                        for (const dep of selection.dependencies) {
                            if (requiredForComponents.includes(dep)) {
                                // Find the Node version for this dependency component
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
                        // Filter to only Node versions that exist in fnm
                        const fnmVersions = await getInstalledNodeVersions(context.logger);
                        const fnmSet = new Set(fnmVersions);
                        const installablePluginVersions = pluginNodeVersions.filter(v => fnmSet.has(v));

                        if (installablePluginVersions.length > 0) {
                            versionsToInstall = installablePluginVersions;
                        } else {
                            context.logger.debug(`[Prerequisites] Plugin ${plugin.id}: Node versions not in fnm, skipping`);
                            continue;
                        }
                    } else if (targetVersions?.length) {
                        // Fallback: use first target version if no specific mapping found
                        versionsToInstall = [targetVersions[0]];
                        context.debugLogger.debug(`[Prerequisites] Plugin ${plugin.id}: no specific version mapping, using ${targetVersions[0]}`);
                    }
                }

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

                    // Execute plugin install commands
                    for (const cmd of pluginCommands.commands) {
                        try {
                            const commandManager = await import('@/core/di').then(m => m.ServiceLocator.getCommandExecutor());
                            await commandManager.execute(cmd, {
                                timeout: TIMEOUTS.LONG,
                                useNodeVersion: nodeVer,
                            });
                            context.logger.debug(`[Prerequisites] Plugin ${plugin.name} installed${versionLabel}`);
                        } catch (pluginError) {
                            context.logger.warn(`[Prerequisites] Failed to install plugin ${plugin.name}${versionLabel}: ${toError(pluginError).message}`);
                            // Continue with other plugins/versions - don't fail the whole installation
                        }
                    }
                }
            }
        }

        // Invalidate cache after installation (Step 2: Prerequisite Caching)
        context.prereqManager?.getCacheManager().invalidate(prereq.id);
        context.logger.debug(`[Prerequisites] Cache invalidated for ${prereq.id} after installation`);

        // CRITICAL: Also invalidate cache for prerequisites that DEPEND on this one
        // This fixes the bug where Adobe I/O CLI cache remains stale after Node.js installs
        const dependents = context.sharedState.currentPrerequisites?.filter(p =>
            p.depends?.includes(prereq.id),
        );
        if (dependents && dependents.length > 0) {
            dependents.forEach(dep => {
                context.prereqManager?.getCacheManager().invalidate(dep.id);
                context.logger.debug(`[Prerequisites] Cache invalidated for dependent ${dep.id} (depends on ${prereq.id})`);
            });
        }

        // Re-check after installation and include variant details/messages
        let installResult;
        try {
            installResult = prereq ? await context.prereqManager?.checkPrerequisite(prereq) : undefined;
        } catch (error) {
            // Handle timeout or other check errors during verification
            const errorMessage = toError(error).message;
            const isTimeoutErr = isTimeout(toAppError(error));

            // Log to all appropriate channels
            if (isTimeoutErr) {
                context.logger.warn(`[Prerequisites] ${prereq.name} verification timed out after ${TIMEOUTS.POLL.INTERVAL / 1000}s`);
                context.stepLogger?.log('prerequisites', `⏱️ ${prereq.name} verification timed out (${TIMEOUTS.POLL.INTERVAL / 1000}s) - installation may have succeeded`, 'warn');
                context.debugLogger.debug('[Prerequisites] Verification timeout details:', { prereq: prereq.id, timeout: TIMEOUTS.POLL.INTERVAL, error: errorMessage });
            } else {
                context.logger.error(`[Prerequisites] Failed to verify ${prereq.name} after installation:`, error as Error);
                context.stepLogger?.log('prerequisites', `✗ ${prereq.name} verification failed: ${errorMessage}`, 'error');
                context.debugLogger.debug('[Prerequisites] Verification failure details:', { prereq: prereq.id, error });

                // Log to error channel for critical errors
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
            return { success: true }; // Installation steps completed even if verification failed
        }

        if (!installResult) {
            context.logger.error(`[Prerequisites] Installation verification failed - no result returned for ${prereq.name}`);
            return { success: false, error: 'Installation verification failed', code: ErrorCode.UNKNOWN };
        }

        let finalNodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined;
        let finalPerNodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined;
        if (prereq.id === 'node') {
            // Build mapping and check installed status per required major
            const mapping = await getNodeVersionMapping(context);
            if (hasNodeVersions(mapping)) {
                finalNodeVersionStatus = await context.prereqManager?.checkMultipleNodeVersions(mapping);
            }
        } else if (prereq.perNodeVersion) {
            // For per-node-version prerequisites (e.g., Adobe I/O CLI), re-check under each required Node major
            const mapping = await getNodeVersionMapping(context);
            const requiredMajors = getNodeVersionKeys(mapping);
            if (requiredMajors.length > 0) {
                // Use shared utility to check which Node versions have the prerequisite installed
                const postCheckStatus = await checkPerNodeVersionStatus(prereq, requiredMajors, context);
                finalPerNodeVersionStatus = postCheckStatus.perNodeVersionStatus;
            }
        }

        const states = context.sharedState.currentPrerequisiteStates;
        if (states) {
            states.set(prereqId, { prereq, result: installResult, nodeVersionStatus: finalNodeVersionStatus });
        }

        // Build final status message based on prerequisite type
        let finalMessage: string;
        if (prereq.id === 'node' && finalNodeVersionStatus && finalNodeVersionStatus.length > 0) {
            // Node.js: Show version-specific status
            if (finalNodeVersionStatus.every(s => s.installed)) {
                const versions = finalNodeVersionStatus.map(s => s.version).join(', ');
                finalMessage = `${prereq.name} is installed: ${versions}`;
            } else {
                const missing = finalNodeVersionStatus
                    .filter(s => !s.installed)
                    .map(s => s.version)
                    .join(', ');
                finalMessage = `${prereq.name} is missing in ${missing}`;
            }
        } else {
            // Other prerequisites: Show simple status
            if (installResult.installed) {
                const version = installResult.version ? `: ${installResult.version}` : '';
                finalMessage = `${prereq.name} is installed${version}`;
            } else {
                finalMessage = `${prereq.name} is not installed`;
            }
        }

        // For perNodeVersion prerequisites, determine overall status from per-node checks
        // For other prerequisites, use the global check result
        const overallInstalled = prereq.perNodeVersion && finalPerNodeVersionStatus && finalPerNodeVersionStatus.length > 0
            ? finalPerNodeVersionStatus.every(s => s.installed)
            : installResult.installed;

        // Summarize result in both channels
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
