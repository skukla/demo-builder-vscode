/**
 * "Add a storefront from a zip file" (shareable-demo step 10): the host half of
 * the Add a demo dialog's second way in. Picks the file (when the webview asks
 * without a path), unpacks it, refuses what is not an Edge Delivery storefront
 * by the probe's own rule, creates a repository in the SC's own GitHub account
 * (D28: personal account only), pushes the files as one commit, flags the
 * repository a template, and answers owner/repo so the dialog can probe it as
 * it would any link. Headless-safe when `zipPath` is given: the agent's door.
 *
 * @module features/eds/handlers/importStorefrontZipHandler
 */

import * as vscode from 'vscode';
import { pushFiles } from '../services/github/githubTreePush';
import { classifyZipStorefront, readStorefrontZip, suggestRepoName } from '../services/storefront/zipStorefrontImport';
import { getGitHubServices } from './edsHelpers';
import { getRepositoryNameError } from '@/core/validation/normalizers';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { ImportStorefrontZipRequest, ImportStorefrontZipResult } from '@/types/webviewRequests';

const PICKER_TITLE = 'Add a storefront from a zip file';
const COMMIT_MESSAGE = 'Add storefront from a zip file';

async function pickZip(): Promise<string | undefined> {
    const picked = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { 'Zip file': ['zip'] },
        title: PICKER_TITLE,
    });
    return picked?.[0]?.fsPath;
}

/** What is wrong with the unpacked files as a storefront, or nothing. */
export async function refusalFor(
    files: Map<string, Buffer>,
    logger: HandlerContext['logger'],
): Promise<string | undefined> {
    const readiness = await classifyZipStorefront(files, logger);
    if (readiness.kind === 'storefront') return undefined;
    if (readiness.kind === 'empty' || files.size === 0) return 'The zip holds no files a repository would keep.';
    if (readiness.kind === 'not-a-storefront') {
        return `This zip is not an Edge Delivery storefront: it has no ${readiness.missing.join(', ')}.`;
    }
    return `The zip could not be read as a storefront: ${readiness.reason}`;
}

/**
 * Handle 'import-storefront-zip'.
 *
 * @param context - Handler context
 * @param request - The zip's path (optional from the webview), a repository name, and visibility
 * @returns `{ success, result }`; `result.cancelled` when the picker was dismissed
 */
export async function handleImportStorefrontZip(
    context: HandlerContext,
    request?: ImportStorefrontZipRequest,
): Promise<HandlerResponse> {
    const zipPath = request?.zipPath ?? (await pickZip());
    if (!zipPath) return { success: true, result: { cancelled: true } satisfies ImportStorefrontZipResult };

    let unpacked;
    try {
        unpacked = readStorefrontZip(zipPath);
    } catch (error) {
        return { success: false, error: `The zip file could not be read: ${(error as Error).message}` };
    }
    const refusal = await refusalFor(unpacked.files, context.logger);
    if (refusal) return { success: false, error: refusal };

    const repoName = request?.repoName?.trim() || suggestRepoName(unpacked.rootName, 'storefront');
    const nameError = getRepositoryNameError(repoName);
    if (nameError) return { success: false, error: nameError };
    const isPrivate = request?.isPrivate ?? true;

    const { repoOperations, fileOperations } = getGitHubServices(context.context.secrets);
    try {
        context.logger.info(`[Zip] Creating ${repoName} (${isPrivate ? 'private' : 'public'}) from ${zipPath}: ${unpacked.files.size} files, ${unpacked.dropped} dropped`);
        const repository = await repoOperations.createEmptyRepository(repoName, isPrivate);
        const [owner, repo] = repository.fullName.split('/');
        await repoOperations.waitForContent(owner, repo);
        const pushed = await pushFiles(fileOperations, owner, repo, unpacked.files, COMMIT_MESSAGE, context.logger);
        await repoOperations.setTemplateFlag(owner, repo, true);
        context.logger.info(`[Zip] ${repository.fullName}: ${pushed.fileCount} files pushed, marked as a template`);
        return {
            success: true,
            result: {
                owner,
                repo,
                fullName: repository.fullName,
                fileCount: pushed.fileCount,
                dropped: unpacked.dropped,
                isPrivate,
            } satisfies ImportStorefrontZipResult,
        };
    } catch (error) {
        context.logger.error(`[Zip] Import failed: ${(error as Error).message}`);
        return { success: false, error: (error as Error).message };
    }
}
