/**
 * Project Creation — pre-flight checks.
 *
 * Stops a running demo that would collide with the new project's port, refuses a
 * second ERP integration on a Commerce instance (AB-78), and clears an orphaned
 * project directory left by a failed earlier attempt.
 * Extracted from `executor.ts` (2026-08-23 god-file decomposition).
 *
 * @module features/project-creation/handlers/executorPreflight
 */

import * as vscode from 'vscode';
import { selectedEntry } from './executorAppBuilderPhase';
import type { ProgressTracker } from './shared';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    erpIntegrationHolder,
    oneErpIntegrationPerInstance,
} from '@/features/app-builder/services/erpIntegrationOnSameCommerce';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { bringsSystem } from '@/features/components/services/appBuilderComponentLinks';
import { loadOtherProjects } from '@/features/dashboard/handlers/replaceDeployedElsewhere';
import type { HandlerContext } from '@/types/handlers';
import { getProjectFrontendPort, getComponentConfigPort } from '@/types/typeGuards';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

export async function handlePortConflicts(
    context: HandlerContext,
    typedConfig: ProjectCreationConfig,
    _progressTracker: ProgressTracker,
): Promise<void> {
    const existingProject = await context.stateManager.getCurrentProject();
    if (existingProject && existingProject.status === 'running') {
        const runningPort = getProjectFrontendPort(existingProject);
        const defaultPort = vscode.workspace
            .getConfiguration('demoBuilder')
            .get<number>('defaultPort', 3000);
        const frontendId = typedConfig.components?.frontend;
        const targetPort =
            (frontendId && getComponentConfigPort(typedConfig.componentConfigs, frontendId)) ||
            defaultPort;

        if (runningPort === targetPort) {
            context.logger.debug(`[Project Creation] Stopping running demo on port ${runningPort}`);

            vscode.window.setStatusBarMessage(
                `⚠️  Stopping "${existingProject.name}" demo (port ${runningPort} conflict)`,
                TIMEOUTS.STATUS_BAR_SUCCESS,
            );

            await vscode.commands.executeCommand('demoBuilder.stopDemo');
            await sleep(TIMEOUTS.DEMO_STOP_WAIT);
        }
    }
}

/**
 * Stop before anything is made when the project would bring an ERP integration to a
 * Commerce instance another local project already runs one on. The wizard holds
 * Continue on the same answer; this covers an agent's `create_project` too.
 *
 * @param context - handler context (state manager)
 * @param typedConfig - what Finish was given
 * @throws the message naming the project that already runs one
 */
export async function refuseSecondErpIntegration(
    context: HandlerContext,
    typedConfig: ProjectCreationConfig,
): Promise<void> {
    const catalog = getAppBuilderComponentCatalog();
    const bringsOne = (typedConfig.selectedAppBuilderComponents ?? []).some((id) => {
        const entry = selectedEntry(typedConfig, id);
        return entry !== undefined && bringsSystem(entry, catalog);
    });
    if (!bringsOne) return;
    const source = {
        componentSelections: { backend: typedConfig.components?.backend },
        componentConfigs: typedConfig.componentConfigs,
    };
    const holder = erpIntegrationHolder(source, catalog, await loadOtherProjects(context, typedConfig.editProjectPath));
    if (holder) throw new Error(oneErpIntegrationPerInstance(holder));
}

export async function cleanupOrphanedDirectory(
    projectPath: string,
    context: HandlerContext,
    progressTracker: ProgressTracker,
    fs: typeof import('fs/promises'),
): Promise<void> {
    if (
        await fs
            .access(projectPath)
            .then(() => true)
            .catch(() => false)
    ) {
        context.logger.warn(`[Project Creation] Directory already exists: ${projectPath}`);

        const existingFiles = await fs.readdir(projectPath);
        if (existingFiles.length > 0) {
            context.logger.debug(
                `[Project Creation] Found ${existingFiles.length} files, cleaning up`,
            );
            progressTracker(OPERATION_STAGES.preparingProject.label, 5, 'Removing existing project data');
            await fs.rm(projectPath, { recursive: true, force: true });
        } else {
            await fs.rmdir(projectPath);
        }
    }
}
