/**
 * "Add a storefront from a zip file" (shareable-demo step 10): the host half of
 * the Add a demo package dialog's second way in. Picks the file (when the webview asks
 * without a path), unpacks it, refuses what is not an Edge Delivery storefront
 * by the probe's own rule, creates a repository in the SC's own GitHub account
 * (D28: personal account only), pushes the files as one commit, flags the
 * repository a template, and answers owner/repo so the dialog can probe it as
 * it would any link. Headless-safe when `zipPath` is given: the agent's door.
 *
 * @module features/eds/handlers/importStorefrontZipHandler
 */

import * as path from 'path';
import * as vscode from 'vscode';
import {
    cardFromZip,
    classifyZipStorefront,
    createRepositoryFromZip,
    readStorefrontZip,
    setupForCard,
    suggestRepoName,
} from '../services/storefront/zipStorefrontImport';
import { getGitHubServices } from './edsHelpers';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { getRepositoryNameError } from '@/core/validation/normalizers';
import { rememberAddedDemo } from '@/features/project-creation/services/addedDemoSettings';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { StorefrontZipProgressPayload } from '@/types/webviewPayloads';
import type { ImportStorefrontZipRequest, ImportStorefrontZipResult, UseBundleSetupRequest } from '@/types/webviewRequests';

const PICKER_TITLE = 'Add a storefront from a zip file';
const WIZARD_PANEL = 'demoBuilderWizard';

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
    // Each step goes to the dialog's spinner as it starts (owner, 2026-09-14): a
    // large storefront takes half a minute or more, and one static line read as stuck.
    const report = (message: string, detail?: string): void => {
        void context.sendMessage('storefront-zip-progress', { message, ...(detail ? { detail } : {}) } satisfies StorefrontZipProgressPayload);
    };
    report('Reading the zip', path.basename(zipPath));

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
    // Public unless asked otherwise (owner, 2026-09-14): a demo package is for sharing.
    const isPrivate = request?.isPrivate ?? false;

    const { repoOperations, fileOperations } = getGitHubServices(context.context.secrets);
    try {
        context.logger.info(`[Zip] ${zipPath}: ${unpacked.files.size} files, ${unpacked.dropped} dropped${unpacked.setup ? ', setup included' : ''}`);
        const created = await createRepositoryFromZip(
            { repoOps: repoOperations, fileOps: fileOperations, logger: context.logger, onProgress: report },
            unpacked.files,
            { repoName, isPrivate, leftOut: unpacked.dropped },
        );
        if (unpacked.setupError) context.logger.warn(`[Zip] the bundle's setup file was not usable: ${unpacked.setupError}`);
        return {
            success: true,
            result: {
                owner: created.owner,
                repo: created.repo,
                fullName: created.fullName,
                fileCount: created.fileCount,
                dropped: unpacked.dropped,
                isPrivate,
                ...(unpacked.setup ? { setup: unpacked.setup } : {}),
            } satisfies ImportStorefrontZipResult,
        };
    } catch (error) {
        context.logger.error(`[Zip] Import failed: ${(error as Error).message}`);
        return refusalForCreate(context, repoName, (error as Error).message);
    }
}

/**
 * What the dialog says when GitHub will not create the repository.
 *
 * The raw error is GitHub's JSON and a docs link (measured 2026-09-14); a person
 * reads one sentence. A name the account already uses is named, with where it
 * is, so the dialog can offer to add the demo from it: that is exactly the
 * repository an earlier import that timed out in the dialog left behind.
 */
async function refusalForCreate(context: HandlerContext, repoName: string, raw: string): Promise<HandlerResponse> {
    if (/name already exists/i.test(raw)) {
        const login = (await getGitHubServices(context.context.secrets).tokenService.validateToken()).user?.login;
        return {
            success: false,
            code: 'REPO_EXISTS',
            error: `Your GitHub account already has a repository named ${repoName}.`,
            ...(login ? { existing: { owner: login, repo: repoName } } : {}),
        };
    }
    const said = /"message"\s*:\s*"([^"]+)"/.exec(raw)?.[1] ?? raw.replace(/\s+-\s+https?:\/\/\S+$/, '');
    return { success: false, error: `GitHub didn't create ${repoName}: ${said.replace(/\.$/, '')}.` };
}

/**
 * Handle 'use-bundle-setup': start a project from the setup a bundle carried,
 * on the card its storefront became. The wizard cannot take settings while it
 * is open, so it is closed and reopened the way the projects list's Import
 * opens it.
 *
 * @param context - Handler context
 * @param request - The bundle's setup and the remembered card
 * @returns `{ success }`
 */
export async function handleUseBundleSetup(context: HandlerContext, request?: UseBundleSetupRequest): Promise<HandlerResponse> {
    if (!request?.setup || !request.demo) return { success: false, error: "The bundle's setup and the demo it belongs to are required" };
    const importedSettings = setupForCard(request.setup, request.demo);
    context.logger.info(`[Zip] Starting a project from the bundle's setup on ${request.demo.source.owner}/${request.demo.source.repo}`);
    BaseWebviewCommand.disposePanel(WIZARD_PANEL);
    await vscode.commands.executeCommand('demoBuilder.createProject', { importedSettings, sourceDescription: 'the demo bundle' });
    return { success: true };
}

/**
 * The projects list's Import, handed a demo bundle: the storefront part becomes
 * a repository in the SC's account and a card on their Welcome step; the setup
 * part, when present, opens the wizard pre-filled on that card. A bundle with
 * setup alone opens the wizard from the setup, as a settings file would.
 *
 * @param context - Handler context
 * @param zipPath - The bundle on disk
 * @returns `{ success, data }` in the shape the projects list reads
 */
export async function importDemoBundle(context: HandlerContext, zipPath: string): Promise<HandlerResponse> {
    let unpacked;
    try {
        unpacked = readStorefrontZip(zipPath);
    } catch (error) {
        return { success: true, data: { success: false, error: `The file could not be read: ${(error as Error).message}` } };
    }
    if (unpacked.setupError) {
        return { success: true, data: { success: false, error: `The bundle's setup file could not be read: ${unpacked.setupError}` } };
    }
    const hasStorefront = !(await refusalFor(unpacked.files, context.logger));
    if (!hasStorefront && !unpacked.setup) {
        return { success: true, data: { success: false, error: 'This zip is neither a demo bundle nor an Edge Delivery storefront.' } };
    }

    let settings = unpacked.setup;
    try {
        if (hasStorefront) {
            const { repoOperations, fileOperations } = getGitHubServices(context.context.secrets);
            const created = await createRepositoryFromZip(
                { repoOps: repoOperations, fileOps: fileOperations, logger: context.logger },
                unpacked.files,
                { repoName: suggestRepoName(unpacked.rootName, 'storefront'), isPrivate: false },
            );
            const card = cardFromZip(unpacked.files, created) ?? {
                kind: 'demo',
                version: 1,
                name: created.repo,
                source: { owner: created.owner, repo: created.repo, branch: created.defaultBranch },
                storefrontKind: 'eds',
                createdFromZip: true,
            };
            await rememberAddedDemo(card);
            context.logger.info(`[Zip] Bundle: ${created.fullName} created and "${card.name}" added to the Welcome step`);
            if (settings) settings = setupForCard(settings, card);
            else void vscode.window.showInformationMessage(`"${card.name}" is on your Welcome step now.`);
        }
    } catch (error) {
        context.logger.error(`[Zip] Bundle import failed: ${(error as Error).message}`);
        return { success: true, data: { success: false, error: (error as Error).message } };
    }

    const sourceDescription = path.basename(zipPath);
    await vscode.commands.executeCommand('demoBuilder.createProject', settings ? { importedSettings: settings, sourceDescription } : undefined);
    return { success: true, data: { success: true, ...(settings ? { settings } : {}), sourceDescription } };
}
