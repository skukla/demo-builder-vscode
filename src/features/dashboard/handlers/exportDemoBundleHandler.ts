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
import { privatePackNote } from '@/features/data-installer/handlers/privatePackPrompt';
import { recordSharedInFile } from '@/features/data-installer/services/sharedInFiles';
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
import { PROJECT_FILE_SUFFIX } from '@/types/projectFile';
import type { ExportDemoBundleRequest, ExportDemoBundleResult } from '@/types/webviewRequests';

export const NO_STOREFRONT_TO_BUNDLE = 'Only an Edge Delivery project has a storefront to put in the file.';
export const NOTHING_TICKED = 'Select at least one part to put in the file.';

function bundleBaseName(project: Project): string {
    return getSuggestedFilename(project.name).slice(0, -PROJECT_FILE_SUFFIX.length) || 'demo';
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
        title: 'Save the Demo Bundle',
    });
    return picked?.fsPath;
}

function extensionVersion(): string {
    return vscode.extensions?.getExtension('AdobeDemoSystem.adobe-demo-builder')?.packageJSON?.version || 'unknown';
}

/**
 * The settings export's answer, read as the bundle's (walk F236): Share Demo draws its result from
 * the path, and a dismissed save dialog is `cancelled`, as the bundle's own dialog answers.
 */
function asBundleResult(answer: HandlerResponse): HandlerResponse {
    if (!answer.success) return answer;
    const written = answer.data as { success?: boolean; filePath?: string } | undefined;
    if (!written?.success || !written.filePath) return { success: true, data: { cancelled: true } satisfies ExportDemoBundleResult };
    return { success: true, data: { path: written.filePath, fileCount: 1, parts: ['setup'] } satisfies ExportDemoBundleResult };
}

/** The setup part on its own is the settings file the projects list imports today. */
async function setupOnly(context: HandlerContext, project: Project, providedPath: string | undefined, packNote?: string): Promise<HandlerResponse> {
    // The window shows where the file went (walk F236), so the export's own pop-up stays quiet.
    if (!providedPath && context.panel) return asBundleResult(await exportProjectSettings(context, project, { announce: false }));
    const written = await exportProjectSettingsToFile(project, { path: providedPath, globalState: context.context.globalState });
    return { success: true, data: { path: written.path, fileCount: 1, parts: ['setup'], ...(packNote ? { packNote } : {}) } satisfies ExportDemoBundleResult };
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
    // A setup part names its pack by reference, and a private one is the SC's alone (owner,
    // 2026-10-30): an agent's answer carries the note. Share Demo's file step already shows the
    // datapack notice with Share Datapack before Save File is pressed (walk F230), so a save from
    // the window asks nothing more; the pop-up it replaced never stopped a save either.
    const fromWindow = Boolean(context.panel) && !data?.path;
    const packNote = wantSetup && !fromWindow ? await privatePackNote(context, project) : undefined;
    if (!wantStorefront) return setupOnly(context, project, data?.path, packNote);

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
        const { repoArchive, repoOperations } = getGitHubServices(context.context.secrets);
        const own = await resolveOwnContentSource(storefront, { logger: context.logger });
        const description = describeProject(project, packageDraftFor(project), own.contentSource, {
            extension: extensionVersion(),
        });
        const repository = await repoOperations.getRepository(storefront.owner, storefront.repo);
        const archive = await repoArchive.downloadRepoArchive(storefront.owner, storefront.repo, repository.defaultBranch);
        const parts: DemoBundleParts = {
            ...(wantSetup ? { settings: createExportSettings(project, extensionVersion()) } : {}),
            storefront: { archive, description },
        };
        const bundle = buildDemoBundle(bundleBaseName(project), parts);
        await fs.promises.writeFile(target, bundle.bytes);
        // The setup part carries a library pack by reference, as the plain file does (step 07).
        if (wantSetup) await recordSharedInFile(context.context.globalState, project);
        context.logger.info(`[Export] ${project.name}: bundle with ${bundle.parts.join(' + ')} (${bundle.fileCount} files) saved as ${target}`);
        return {
            success: true,
            data: { path: target, fileCount: bundle.fileCount, bytes: bundle.bytes.length, parts: bundle.parts, ...(packNote ? { packNote } : {}) } satisfies ExportDemoBundleResult,
        };
    } catch (error) {
        context.logger.error(`[Export] bundle failed: ${(error as Error).message}`);
        return { success: false, error: (error as Error).message };
    }
};

/**
 * Reveal in Finder, on Share Demo's result once Save File wrote the file (walk F236): shows the
 * file in the operating system's file browser, through VS Code's own `revealFileInOS`. Only an
 * existing file at an absolute path; anything else is refused, since there is nothing to show.
 */
export const FILE_GONE = 'That file is no longer there.';

export const handleRevealFile: MessageHandler<{ path?: string }> = async (_context, data): Promise<HandlerResponse> => {
    const target = data?.path;
    if (typeof target !== 'string' || !path.isAbsolute(target) || !fs.existsSync(target)) {
        return { success: false, error: FILE_GONE, code: ErrorCode.INVALID_OPERATION };
    }
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(target));
    return { success: true };
};
