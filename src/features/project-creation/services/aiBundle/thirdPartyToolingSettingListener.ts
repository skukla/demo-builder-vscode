/**
 * Third-party tooling setting listener — "re-enabling must install".
 *
 * `demoBuilder.ai.enableThirdPartyTools` is read through the injected
 * resolver in `aiToolingGate`, so flipping it changes what EVERY gate seam
 * answers — but nothing re-runs those seams until a create, regenerate, or
 * activation sweep happens. Without this listener the opt-out is one-way in
 * practice: turning it back on restores nothing until some unrelated event
 * refreshes the bundle (the third-party-tooling item's step 7).
 *
 * On change, one prompt offers to apply now. Accepting runs, per project:
 * tier 3 (`installAiDefaultsMcpTools` — installs what now applies; a
 * disabled tool's package is left on disk, harmless, its config and skills
 * are the contract) then tiers 1+2 (`refreshMcpConfigs` +
 * `refreshContextAndSkills`, both hash-and-skip via ADR-013, so user-edited
 * files are reported, never clobbered). Declining is fine — the next
 * regenerate or activation refresh applies the same answer.
 *
 * @module features/project-creation/services/aiBundle/thirdPartyToolingSettingListener
 */

import * as vscode from 'vscode';
import { refreshMcpConfigs, refreshContextAndSkills } from './aiBundleService';
import { installAiDefaultsMcpTools } from './aiDefaultsInstaller';
import { createGeneratedFileWriter } from './generatedFileWriter';
import { resolveNodePath } from './mcpConfigWriter';
import type { CommandExecutor } from '@/core/shell';
import { ProjectConfigWriter } from '@/core/state/projectConfigWriter';
import { ProjectDirectoryScanner } from '@/core/state/projectDirectoryScanner';
import { ProjectFileLoader } from '@/core/state/projectFileLoader';
import type { Logger } from '@/types/logger';

const SETTING = 'demoBuilder.ai.enableThirdPartyTools';

/** Apply the new answer to every project: tier 3, then tiers 1+2. */
async function applyToAllProjects(
    extensionPath: string,
    logger: Logger,
    commandManager: CommandExecutor,
): Promise<void> {
    const scanner = new ProjectDirectoryScanner(logger);
    const loader = new ProjectFileLoader(logger);
    const configWriter = new ProjectConfigWriter(logger);
    const nodePath = await resolveNodePath();

    const summaries = await scanner.getAllProjects();
    for (const summary of summaries) {
        try {
            const project = await loader.loadProject(summary.path, () => []);
            if (!project) continue;
            await installAiDefaultsMcpTools(summary.path, project, commandManager);
            const writer = createGeneratedFileWriter(
                summary.path,
                project.aiFileHashes ?? {},
                logger,
            );
            await refreshMcpConfigs(summary.path, project, extensionPath, writer, nodePath);
            await refreshContextAndSkills(summary.path, project, extensionPath, writer);
            // Same persistence contract as the activation sweep: hashes for
            // writes that landed must persist, or those files read as
            // user-edited forever.
            project.aiFileHashes = writer.hashes();
            await configWriter.saveProjectConfig(project);
        } catch (error) {
            logger.warn(
                `[AI Bundle] third-party setting apply failed for ${summary.path}: ${(error as Error).message}`,
            );
        }
    }
    logger.info(
        `[AI Bundle] third-party tooling setting applied to ${summaries.length} project(s)`,
    );
}

/**
 * Register the listener. Returns the disposable for the extension's
 * subscription list.
 */
export function registerThirdPartyToolingSettingListener(
    commandManager: CommandExecutor,
    extensionPath: string,
    logger: Logger,
): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(async (event) => {
        if (!event.affectsConfiguration(SETTING)) return;

        const enabled = vscode.workspace
            .getConfiguration('demoBuilder')
            .get<boolean>('ai.enableThirdPartyTools', true);

        const applyNow = 'Apply Now';
        const choice = await vscode.window.showInformationMessage(
            enabled
                ? 'Third-party AI tooling enabled. Apply to your projects now? ' +
                      'This installs the tooling and restores the skills that drive it.'
                : 'Third-party AI tooling disabled. Apply to your projects now? ' +
                      'This removes the tooling from AI configs and the skills that drive it.',
            applyNow,
        );
        if (choice !== applyNow) return;

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: enabled
                    ? 'Demo Builder: enabling third-party AI tooling…'
                    : 'Demo Builder: removing third-party AI tooling…',
                cancellable: false,
            },
            () => applyToAllProjects(extensionPath, logger, commandManager),
        );
    });
}
