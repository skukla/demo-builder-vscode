/**
 * ProjectFinalizationService
 *
 * Handles the final phases of project creation:
 * Phase 4: Generate environment files for all non-mesh components
 * Phase 5: Save state, send completion
 *
 * Note: Manifest writing is handled by ProjectConfigWriter (single source of truth).
 */

import * as path from 'path';
import * as vscode from 'vscode';
import stacksConfig from '../config/stacks.json';
import { ProgressTracker } from '../handlers/shared';
import { writeAgentsMd } from './aiContextWriter';
import type { ComponentDefinitionEntry } from './componentInstallationOrchestrator';
import { writeMcpConfigs } from './mcpConfigWriter';
import { writeSkillFiles } from './skillsWriter';
import { isMeshComponentId } from '@/core/constants';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { ProjectSetupContext, generateComponentConfigFiles } from '@/features/project-creation/helpers';
import type { Project } from '@/types/base';
import type { Stack } from '@/types/stacks';
import { getComponentIds, getEntryCount } from '@/types/typeGuards';

export interface FinalizationContext {
    setupContext: ProjectSetupContext;
    projectPath: string;
    componentDefinitions: Map<string, ComponentDefinitionEntry>;
    progressTracker: ProgressTracker;
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
    const { setupContext, componentDefinitions, progressTracker } = context;
    const { project, logger } = setupContext;

    progressTracker('Configuring Environment', 85, 'Generating environment files...');
    logger.debug('[Project Creation] Phase 4: Generating environment configuration...');

    // Generate all config files for all non-mesh components
    // (treats .env and site.json as peers - all just "config files in different formats")
    for (const [compId, { definition }] of componentDefinitions) {
        // Skip mesh - already generated in Phase 3
        if (isMeshComponentId(compId)) continue;

        const componentPath = project.componentInstances?.[compId]?.path;
        if (!componentPath) continue;

        // Generate all config files for this component
        // If component has explicit configFiles, generates those.
        // Otherwise defaults to .env (or .env.local for Next.js)
        await generateComponentConfigFiles(
            componentPath,
            compId,
            definition,
            setupContext,
        );
    }

    logger.debug('[Project Creation] Phase 4 complete: Environment configured');
}

/**
 * Phase 5: Finalize project and save state
 *
 * Note: Manifest is written by StateManager.saveProject() via ProjectConfigWriter.
 * This ensures a single authoritative manifest writer.
 */
export async function finalizeProject(
    context: FinalizationContext,
): Promise<void> {
    const { setupContext, progressTracker, saveProject } = context;
    const { project, logger } = setupContext;

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
        logger.debug('[Project Creation] Project state saved successfully');
    } catch (saveError) {
        logger.error('[Project Creation] Failed to save project', saveError instanceof Error ? saveError : undefined);
        throw saveError;
    }

    progressTracker('Project Created', 100, 'Project creation complete');
    logger.debug('[Project Creation] Phase 5 complete: Project finalized');
}

/**
 * Send completion message and set up auto-close timeout
 */
export async function sendCompletionAndCleanup(
    context: FinalizationContext,
): Promise<void> {
    const { projectPath, sendMessage, panel, setupContext } = context;
    const { logger } = setupContext;

    logger.debug('[Project Creation] Sending completion message to webview...');
    try {
        await sendMessage('creationComplete', {
            projectPath: projectPath,
            success: true,
            message: 'Your demo is ready to start',
        });
        logger.debug('[Project Creation] Completion message sent');
    } catch (messageError) {
        logger.error('[Project Creation] Failed to send completion message', messageError instanceof Error ? messageError : undefined);
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

/**
 * Phase 6: Generate AI context files (.claude/CLAUDE.md, .claude/mcp.json, .claude/skills/)
 *
 * Delegates to the three writers. Non-blocking by design — callers should wrap in
 * try/catch and log warnings on failure.
 *
 * @param helixToken - Optional DA.live session token (currently unused — retained for
 *        backward compatibility with callers that pass the stored DA.live token).
 */
export async function generateAIContextFiles(
    projectPath: string,
    project: Project,
    extensionPath: string,
    helixToken?: string,
): Promise<void> {
    // helixToken is currently unused — kept on the signature for caller compatibility.
    // Cycle B will revisit when Adobe Commerce Extensibility Tools installs require it.
    void helixToken;

    const config = vscode.workspace.getConfiguration('demoBuilder.ai');
    const externalMcpServers: string[] = config.get('externalMcpServers') ?? [];
    const includeBoilerplateSkills: boolean = config.get('includeBoilerplateSkills') ?? true;

    const results = await Promise.allSettled([
        writeAgentsMd(projectPath, project, stacksConfig.stacks as Stack[]),
        writeMcpConfigs(projectPath, project, path.join(extensionPath, 'dist')),
        writeSkillFiles(projectPath, project, { externalMcpServers, includeBoilerplateSkills }),
    ]);
    const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map(r => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
    if (errors.length > 0) {
        throw new Error(`AI context file generation failed: ${errors.join('; ')}`);
    }
}
