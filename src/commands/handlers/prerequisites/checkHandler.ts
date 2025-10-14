/**
 * Prerequisite Check Handler
 *
 * Handles the check-prerequisites message:
 * - Loads prerequisite definitions from config
 * - Checks each prerequisite with multi-version Node.js support
 * - Sends status updates to UI with progress tracking
 */

import { ServiceLocator } from '../../../services/serviceLocator';
import { TIMEOUTS } from '../../../utils/timeoutConfig';
import { HandlerContext } from '../HandlerContext';
import { getNodeVersionMapping, checkPerNodeVersionStatus, areDependenciesInstalled } from './shared';

/**
 * check-prerequisites - Check all prerequisites for selected components
 *
 * Loads prerequisites from config, checks each one, handles multi-version Node.js,
 * and sends status updates to the UI.
 */
export async function handleCheckPrerequisites(
    context: HandlerContext,
    payload?: { componentSelection?: import('../../../types/components').ComponentSelection },
): Promise<{ success: boolean }> {
    try {
        context.stepLogger.log('prerequisites', 'Starting prerequisites check', 'info');

        // Store the component selection for later use
        if (payload?.componentSelection) {
            context.sharedState.currentComponentSelection = payload.componentSelection;
        }

        // Load config and get prerequisites
        const config = await context.prereqManager.loadConfig();
        // Get prerequisites and resolve dependency order
        const prerequisites = context.prereqManager.resolveDependencies(config.prerequisites || []);
        context.sharedState.currentPrerequisites = prerequisites;

        // Initialize state tracking
        context.sharedState.currentPrerequisiteStates = new Map();

        // Get Node version to component mapping if we have components selected
        const nodeVersionMapping = await getNodeVersionMapping(context);

        context.stepLogger.log('prerequisites', `Found ${prerequisites.length} prerequisites to check`, 'info');

        // Send prerequisites list to UI so it can display them
        await context.sendMessage('prerequisites-loaded', {
            prerequisites: prerequisites.map((p, index) => ({
                id: index,
                name: p.name,
                description: p.description,
                optional: p.optional || false,
                plugins: p.plugins,
            })),
            nodeVersionMapping,
        });

        // Small delay to ensure UI updates before we start checking
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check each prerequisite
        for (let i = 0; i < prerequisites.length; i++) {
            const prereq = prerequisites[i];
            context.stepLogger.log('prerequisites', `Checking ${prereq.name}...`, 'info');

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
            try {
                checkResult = await context.prereqManager.checkPrerequisite(prereq);
            } catch (error) {
                // Handle timeout or other check errors
                const errorMessage = error instanceof Error ? error.message : String(error);
                const isTimeout = errorMessage.toLowerCase().includes('timed out') ||
                                 errorMessage.toLowerCase().includes('timeout');

                // Log to all appropriate channels
                if (isTimeout) {
                    context.logger.warn(`[Prerequisites] ${prereq.name} check timed out after ${TIMEOUTS.PREREQUISITE_CHECK / 1000}s`);
                    context.stepLogger.log('prerequisites', `⏱️ ${prereq.name} check timed out (${TIMEOUTS.PREREQUISITE_CHECK / 1000}s)`, 'warn');
                    context.debugLogger.debug('[Prerequisites] Timeout details:', { prereq: prereq.id, timeout: TIMEOUTS.PREREQUISITE_CHECK, error: errorMessage });
                } else {
                    context.logger.error(`[Prerequisites] Failed to check ${prereq.name}:`, error as Error);
                    context.stepLogger.log('prerequisites', `✗ ${prereq.name} check failed: ${errorMessage}`, 'error');
                    context.debugLogger.debug('[Prerequisites] Check failure details:', { prereq: prereq.id, error });
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

            // For Node.js, check multiple versions if we have a mapping
            let nodeVersionStatus: { version: string; component: string; installed: boolean }[] | undefined;
            if (prereq.id === 'node' && Object.keys(nodeVersionMapping).length > 0) {
                nodeVersionStatus = await context.prereqManager.checkMultipleNodeVersions(nodeVersionMapping);
            }

            // For per-node-version prerequisites (e.g., Adobe I/O CLI), detect partial installs across required Node majors
            let perNodeVariantMissing = false;
            const missingVariantMajors: string[] = [];
            const perNodeVersionStatus: { version: string; component: string; installed: boolean }[] = [];
            if (prereq.perNodeVersion && Object.keys(nodeVersionMapping).length > 0) {
                const requiredMajors = Object.keys(nodeVersionMapping);
                const result = await checkPerNodeVersionStatus(prereq, requiredMajors, context);
                perNodeVariantMissing = result.perNodeVariantMissing;
                missingVariantMajors.push(...result.missingVariantMajors);
                perNodeVersionStatus.push(...result.perNodeVersionStatus);
            }

            // Store state for this prerequisite (include nodeVersionStatus if available)
            context.sharedState.currentPrerequisiteStates.set(i, {
                prereq,
                result: checkResult,
                nodeVersionStatus: prereq.id === 'node' ? nodeVersionStatus : perNodeVersionStatus,
            });

            // Log the result
            if (checkResult.installed) {
                context.stepLogger.log('prerequisites', `✓ ${prereq.name} is installed${checkResult.version ? ': ' + checkResult.version : ''}`, 'info');
            } else {
                context.stepLogger.log('prerequisites', `✗ ${prereq.name} is not installed`, 'warn');
            }

            // Compute dependency gating (disable install until deps are installed)
            const depsInstalled = areDependenciesInstalled(prereq, context);

            // Determine overall status for Node when specific required versions are missing
            let overallStatus: 'success' | 'error' | 'warning' = checkResult.installed ? 'success' : (!prereq.optional ? 'error' : 'warning');
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
                installed: checkResult.installed,
                version: checkResult.version,
                message: (prereq.perNodeVersion && perNodeVersionStatus && perNodeVersionStatus.length > 0)
                    ? 'Installed for versions:'
                    : (prereq.perNodeVersion && perNodeVariantMissing)
                        ? `${prereq.name} is missing in Node ${missingVariantMajors.join(', ')}. Plugin status will be checked after CLI is installed.`
                        : (checkResult.installed
                            ? `${prereq.name} is installed${checkResult.version ? ': ' + checkResult.version : ''}`
                            : `${prereq.name} is not installed`),
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
            prerequisites: Array.from(context.sharedState.currentPrerequisiteStates.entries()).map(([id, state]) => ({
                id,
                name: state.prereq.name,
                required: !state.prereq.optional,
                installed: state.result.installed,
                version: state.result.version,
                canInstall: state.result.canInstall,
            })),
        });

        context.stepLogger.log('prerequisites', `Prerequisites check complete. All required installed: ${allRequiredInstalled}`, 'info');

        return { success: true };
    } catch (error) {
        context.logger.error('Prerequisites check failed:', error as Error);
        await context.sendMessage('error', {
            message: 'Failed to check prerequisites',
            details: error instanceof Error ? error.message : String(error),
        });
        return { success: false };
    }
}
