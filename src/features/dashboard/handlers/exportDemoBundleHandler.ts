/**
 * Export, "Send a file" (owner, 2026-09-13: export hands an artifact to someone
 * else; the file form is one bundle of the ticked parts). Setup alone stays the
 * plain settings file the projects list can import today; anything carrying the
 * storefront is a bundle, with the setup part stripped of credentials because a
 * bundle is for someone else. From the webview the host asks where with its save
 * dialog; an agent gives a path, which must resolve inside the project directory
 * (the settings export's rule). The storefront part is Edge Delivery only.
 *
 * @module features/dashboard/handlers/exportDemoBundleHandler
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { assertPathInsideSync } from '@/core/validation/PathSafetyValidator';
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { buildDemoBundle, defaultBundleName, type DemoBundleParts } from '@/features/eds/services/demoPackage/demoBundle';
import {
    describeProject,
    ownStorefrontOf,
    packageDraftFor,
    resolveOwnContentSource,
} from '@/features/eds/services/demoPackage/demoPackageService';
import { createExportSettings, getSuggestedFilename } from '@/features/projects-dashboard/services/settingsSerializer';
import { exportProjectSettings, exportProjectSettingsToFile } from '@/features/projects-dashboard/services/settingsTransferService';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import type { ExportDemoBundleRequest, ExportDemoBundleResult } from '@/types/webviewRequests';

export const NO_STOREFRONT_TO_BUNDLE = 'Only an Edge Delivery project has a storefront to put in the file.';
export const NOTHING_TICKED = 'Tick at least one part to put in the file.';

function bundleBaseName(project: Project): string {
    return getSuggestedFilename(project.name).replace(/\.demo-builder\.json$/, '') || 'demo';
}

/** Where the bundle goes: the given path inside the project directory, or the project's own folder. */
function resolveTarget(project: Project, providedPath: string | undefined): string {
    const name = defaultBundleName(bundleBaseName(project));
    let candidate = path.join(project.path, name);
    if (providedPath) {
        candidate = path.isAbsolute(providedPath) ? providedPath : path.join(project.path, providedPath);
    }
    try {
        if (fs.statSync(candidate).isDirectory()) candidate = path.join(candidate, name);
    } catch {
        // Not there yet: a file path.
    }
    return assertPathInsideSync(candidate, project.path);
}

async function askWhere(project: Project): Promise<string | undefined> {
    const picked = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultBundleName(bundleBaseName(project))),
        filters: { 'Demo bundle': ['zip'] },
        title: 'Save the demo bundle',
    });
    return picked?.fsPath;
}

function extensionVersion(): string {
    return vscode.extensions?.getExtension('AdobeDemoSystem.adobe-demo-builder')?.packageJSON?.version || 'unknown';
}

/** The setup part on its own is the settings file the projects list imports today. */
async function setupOnly(context: HandlerContext, project: Project, providedPath: string | undefined): Promise<HandlerResponse> {
    if (!providedPath && context.panel) return exportProjectSettings(context, project);
    const written = await exportProjectSettingsToFile(project, { path: providedPath, includeSecrets: false });
    return { success: true, data: { path: written.path, fileCount: 1, parts: ['setup'] } satisfies ExportDemoBundleResult };
}

export const handleExportDemoBundle: MessageHandler<ExportDemoBundleRequest> = async (
    context: HandlerContext,
    data,
): Promise<HandlerResponse> => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    const wantSetup = data?.setup ?? true;
    const wantStorefront = data?.storefront ?? true;
    if (!wantSetup && !wantStorefront) return { success: false, error: NOTHING_TICKED, code: ErrorCode.INVALID_OPERATION };
    if (!wantStorefront) return setupOnly(context, project, data?.path);

    const storefront = ownStorefrontOf(project);
    if (!storefront) return { success: false, error: NO_STOREFRONT_TO_BUNDLE, code: ErrorCode.INVALID_OPERATION };

    let target: string;
    try {
        if (data?.path || !context.panel) {
            target = resolveTarget(project, data?.path);
        } else {
            const picked = await askWhere(project);
            if (!picked) return { success: true, data: { cancelled: true } satisfies ExportDemoBundleResult };
            target = picked;
        }
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }

    try {
        const { fileOperations, repoOperations } = getGitHubServices(context.context.secrets);
        const own = await resolveOwnContentSource(storefront, { logger: context.logger });
        const description = describeProject(project, packageDraftFor(project), own.contentSource);
        const repository = await repoOperations.getRepository(storefront.owner, storefront.repo);
        const archive = await fileOperations.downloadRepoArchive(storefront.owner, storefront.repo, repository.defaultBranch);
        const parts: DemoBundleParts = {
            ...(wantSetup ? { settings: createExportSettings(project, extensionVersion(), false) } : {}),
            storefront: { archive, description },
        };
        const bundle = buildDemoBundle(bundleBaseName(project), parts);
        await fs.promises.writeFile(target, bundle.bytes);
        context.logger.info(`[Export] ${project.name}: bundle with ${bundle.parts.join(' + ')} (${bundle.fileCount} files) saved as ${target}`);
        return {
            success: true,
            data: { path: target, fileCount: bundle.fileCount, bytes: bundle.bytes.length, parts: bundle.parts } satisfies ExportDemoBundleResult,
        };
    } catch (error) {
        context.logger.error(`[Export] bundle failed: ${(error as Error).message}`);
        return { success: false, error: (error as Error).message };
    }
};
