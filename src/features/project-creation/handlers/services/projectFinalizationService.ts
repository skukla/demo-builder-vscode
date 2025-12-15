/**
 * ProjectFinalizationService
 *
 * Handles the final phases of project creation:
 * Phase 4: Generate environment files for all non-mesh components
 * Phase 5: Create manifest, save state, send completion
 */

import * as vscode from 'vscode';
import type { Logger } from '@/types/logger';
import type { Project, EnvVarDefinition } from '@/types';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { getComponentIds, getEntryCount } from '@/types/typeGuards';
import { generateComponentEnvFile, EnvGenerationConfig } from '@/features/project-creation/helpers';
import { ProgressTracker } from '../shared';
import type { ComponentDefinitionEntry } from './componentInstallationOrchestrator';

export interface FinalizationContext {
    project: Project;
    projectPath: string;
    componentDefinitions: Map<string, ComponentDefinitionEntry>;
    sharedEnvVars: Record<string, Omit<EnvVarDefinition, 'key'>>;
    config: Record<string, unknown>;
    progressTracker: ProgressTracker;
    logger: Logger;
    saveProject: () => Promise<void>;
    sendMessage: (type: string, data: Record<string, unknown>) => Promise<void>;
    panel?: vscode.WebviewPanel;
}

/**
 * Phase 4: Generate environment files for all non-mesh components
 */
export async function generateEnvironmentFiles(
    context: FinalizationContext,
): Promise<void> {
    const { project, componentDefinitions, sharedEnvVars, config, progressTracker, logger } = context;

    progressTracker('Configuring Environment', 85, 'Generating environment files...');
    logger.info('[Project Creation] 📝 Phase 4: Generating environment configuration...');

    // Get deployed mesh endpoint (if available)
    const deployedMeshEndpoint = project.componentInstances?.['commerce-mesh']?.endpoint;
    const typedConfig = config as { apiMesh?: { endpoint?: string } };

    // Create config with mesh endpoint for .env generation
    const envConfig: EnvGenerationConfig = {
        ...config,
        apiMesh: deployedMeshEndpoint ? {
            ...typedConfig.apiMesh,
            endpoint: deployedMeshEndpoint,
        } : typedConfig.apiMesh,
    };

    // Generate .env for all non-mesh components (frontend, app-builder, etc.)
    for (const [compId, { definition }] of componentDefinitions) {
        // Skip mesh - already generated in Phase 3
        if (compId === 'commerce-mesh') continue;

        const componentPath = project.componentInstances?.[compId]?.path;
        if (!componentPath) continue;

        await generateComponentEnvFile(
            componentPath,
            compId,
            definition,
            sharedEnvVars,
            envConfig,
            logger,
        );
    }

    logger.info('[Project Creation] ✅ Phase 4 complete: Environment configured');
}

/**
 * Phase 5: Create manifest and finalize project
 */
export async function finalizeProject(
    context: FinalizationContext,
): Promise<void> {
    const { project, projectPath, progressTracker, logger, saveProject } = context;
    const fs = await import('fs/promises');
    const path = await import('path');

    progressTracker('Finalizing Project', 90, 'Creating project manifest...');

    const manifest = {
        name: project.name,
        version: '1.0.0',
        created: project.created.toISOString(),
        lastModified: project.lastModified.toISOString(),
        adobe: project.adobe,
        componentSelections: project.componentSelections,
        componentInstances: project.componentInstances,
        componentConfigs: project.componentConfigs,
        meshState: project.meshState,
        commerce: project.commerce,
        components: getComponentIds(project.componentInstances),
    };

    await fs.writeFile(
        path.join(projectPath, '.demo-builder.json'),
        JSON.stringify(manifest, null, 2),
    );

    logger.debug('[Project Creation] Project manifest created');

    progressTracker('Finalizing Project', 95, 'Saving project state...');

    logger.debug(`[Project Creation] Saving project: ${project.name} (${getEntryCount(project.componentInstances)} components)`);

    try {
        project.status = 'ready';

        // Initialize component versions (for future update tracking)
        if (!project.componentVersions) {
            project.componentVersions = {};
        }

        for (const componentId of getComponentIds(project.componentInstances)) {
            const componentInstance = project.componentInstances?.[componentId];
            const detectedVersion = componentInstance?.version || 'unknown';

            project.componentVersions[componentId] = {
                version: detectedVersion,
                lastUpdated: new Date().toISOString(),
            };

            if (detectedVersion !== 'unknown') {
                logger.debug(`[Project Creation] ${componentId} version: ${detectedVersion}`);
            }
        }

        await saveProject();
        logger.info('[Project Creation] ✅ Project state saved successfully');
    } catch (saveError) {
        logger.error('[Project Creation] ❌ Failed to save project', saveError instanceof Error ? saveError : undefined);
        throw saveError;
    }

    progressTracker('Project Created', 100, 'Project creation complete');
    logger.info('[Project Creation] ✅ Phase 5 complete: Project finalized');
}

/**
 * Send completion message and set up auto-close timeout
 */
export async function sendCompletionAndCleanup(
    context: FinalizationContext,
): Promise<void> {
    const { projectPath, logger, sendMessage, panel } = context;

    logger.debug('[Project Creation] Sending completion message to webview...');
    try {
        await sendMessage('creationComplete', {
            projectPath: projectPath,
            success: true,
            message: 'Your demo is ready to start',
        });
        logger.debug('[Project Creation] ✅ Completion message sent');
    } catch (messageError) {
        logger.error('[Project Creation] ❌ Failed to send completion message', messageError instanceof Error ? messageError : undefined);
    }

    // Auto-close the webview panel after timeout as a fallback
    if (panel) {
        setTimeout(() => {
            try {
                if (panel.visible) {
                    panel.dispose();
                    logger.debug('[Project Creation] Webview panel auto-closed after timeout');
                }
            } catch {
                // Panel was already disposed by user action - expected
            }
        }, TIMEOUTS.WEBVIEW_AUTO_CLOSE);
    }

    logger.debug('[Project Creation] ===== PROJECT CREATION WORKFLOW COMPLETE =====');
}
