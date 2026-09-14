/**
 * "Save as demo package" — the dashboard's three messages (Pattern B: answers
 * are RETURNED): `getDemoPackagePreview` (a read: the draft, the checks, the
 * link, whether the card is already on the SC's list), `saveDemoPackage`
 * (writes the description file into the project's own storefront repository
 * through the ownership rule, puts the card on the SC's own Add a demo list,
 * records what it did on the project) and `removeDemoPackage` (removes only
 * what we wrote and takes the card off the list).
 *
 * Edge Delivery projects only (decided 2026-09-11): a headless project is a
 * local clone with no repository of the SC's own; the how-to says how to hand
 * one over by hand. Headless-safe: no panel, no modal, so the agent's tools sit
 * on the same handlers.
 *
 * @module features/dashboard/handlers/demoPackageHandlers
 */

import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import {
    describeProject,
    ownStorefrontOf,
    packageChecks,
    packageDraftFor,
    resolveOwnContentSource,
    type OwnStorefront,
    type PackageCheckDeps,
} from '@/features/eds/services/demoPackage/demoPackageService';
import { removeSharedDemoFile, writeSharedDemoFile } from '@/features/eds/services/demoPackage/sharedDemoFile';
import {
    addedDemoKey,
    forgetAddedDemo,
    readAddedDemos,
    rememberAddedDemo,
} from '@/features/project-creation/services/addedDemoSettings';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import type { AddedDemo, SharedDemoDescription } from '@/types/projectFile';
import type {
    DemoPackagePreview,
    RemoveDemoPackageResult,
    SaveDemoPackageRequest,
    SaveDemoPackageResult,
} from '@/types/webviewRequests';

export const EDS_ONLY =
    'Only an Edge Delivery project can become a demo package from here. A headless demo is handed over by pushing your clone to a repository and sending the link.';

function linkFor(storefront: OwnStorefront): string {
    return `https://github.com/${storefront.owner}/${storefront.repo}`;
}

function isOnList(storefront: OwnStorefront): boolean {
    const key = addedDemoKey({ source: storefront });
    return readAddedDemos().some((row) => addedDemoKey(row) === key);
}

/** The project and its storefront, or the refusal. */
async function candidate(
    context: HandlerContext,
): Promise<{ project: Project; storefront: OwnStorefront } | { response: HandlerResponse }> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { response: { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND } };
    }
    const storefront = ownStorefrontOf(project);
    if (!storefront) {
        return { response: { success: false, error: EDS_ONLY, code: ErrorCode.INVALID_OPERATION } };
    }
    return { project, storefront };
}

/**
 * Is the datapack in the service? Asked only when the Data Installer is
 * configured and the Adobe sign-in is silently valid; never a prompt from a
 * preview (the context is handed over without its panel, which is the
 * headless branch). `undefined` means "could not ask", and the check says nothing.
 */
function datapackLookup(context: HandlerContext): PackageCheckDeps['datapackExists'] {
    return async (name) => {
        try {
            const access = await resolveDataInstallerAccess({ ...context, panel: undefined });
            if (!access.ok) return undefined;
            const page = await access.client.findDatapacks({ datapackName: name, limit: 1 });
            return page.items.some((pack) => pack.id.name === name);
        } catch (error) {
            context.logger.debug(`[Demo package] datapack lookup failed: ${(error as Error).message}`);
            return undefined;
        }
    };
}

function checkDeps(context: HandlerContext): PackageCheckDeps {
    return {
        repoOps: getGitHubServices(context.context.secrets).repoOperations,
        datapackExists: datapackLookup(context),
        logger: context.logger,
    };
}

export const handleGetDemoPackagePreview: MessageHandler = async (context) => {
    const ready = await candidate(context);
    if ('response' in ready) return ready.response;
    const { project, storefront } = ready;
    const own = await resolveOwnContentSource(storefront, { logger: context.logger });
    const checks = await packageChecks(project, storefront, own, checkDeps(context));
    const preview: DemoPackagePreview = {
        draft: packageDraftFor(project),
        checks,
        link: linkFor(storefront),
        saved: Boolean(project.demoPackage?.fileSha),
        onList: isOnList(storefront),
    };
    return { success: true, data: preview };
};

/** The card for the SC's own list: the description plus where it lives and what kind it is. */
function cardFor(
    description: SharedDemoDescription,
    storefront: OwnStorefront,
    defaultBranch: string | undefined,
): AddedDemo {
    return {
        ...description,
        source: { owner: storefront.owner, repo: storefront.repo, ...(defaultBranch ? { branch: defaultBranch } : {}) },
        storefrontKind: 'eds',
    };
}

export const handleSaveDemoPackage: MessageHandler<SaveDemoPackageRequest> = async (context, data) => {
    const ready = await candidate(context);
    if ('response' in ready) return ready.response;
    const { project, storefront } = ready;
    const draft = { name: data?.name ?? '', description: data?.description ?? '' };

    const own = await resolveOwnContentSource(storefront, { logger: context.logger });
    const description = describeProject(project, draft, own.contentSource);
    const { fileOperations, repoOperations } = getGitHubServices(context.context.secrets);
    const written = await writeSharedDemoFile(
        fileOperations,
        storefront,
        `${JSON.stringify(description, null, 2)}\n`,
        project.demoPackage?.fileSha || undefined,
    );
    if (written.outcome === 'skipped') {
        context.logger.warn(`[Demo package] ${storefront.owner}/${storefront.repo}: ${written.reason}`);
    }

    // The card on the SC's own Welcome step: the same row a colleague's add builds,
    // from the description just written (or meant to be), never re-read.
    const repository = await repoOperations.getRepository(storefront.owner, storefront.repo).catch(() => undefined);
    await rememberAddedDemo(cardFor(description, storefront, repository?.defaultBranch));

    // Record what is ours to undo: the file's sha when we wrote it (empty when the
    // file was not ours to write).
    const fileSha = written.outcome === 'skipped' ? (project.demoPackage?.fileSha ?? '') : written.sha;
    project.demoPackage = { fileSha, savedAt: new Date().toISOString() };
    await context.stateManager.saveProject(project);
    context.logger.info(
        `[Demo package] ${project.name}: description file ${written.outcome} in ${storefront.owner}/${storefront.repo}, card on the Add a demo list`,
    );

    const checks = await packageChecks(project, storefront, own, checkDeps(context));
    const result: SaveDemoPackageResult = {
        link: linkFor(storefront),
        file: written.outcome,
        ...(written.outcome === 'skipped' ? { fileReason: written.reason } : {}),
        onList: true,
        checks,
    };
    return { success: true, data: result };
};

export const handleRemoveDemoPackage: MessageHandler = async (context) => {
    const ready = await candidate(context);
    if ('response' in ready) return ready.response;
    const { project, storefront } = ready;
    const { fileOperations } = getGitHubServices(context.context.secrets);
    const file = await removeSharedDemoFile(fileOperations, storefront, project.demoPackage?.fileSha || undefined);
    const removedFromList = isOnList(storefront);
    if (removedFromList) await forgetAddedDemo(storefront);
    if (file === 'skipped') {
        context.logger.warn(
            `[Demo package] ${storefront.owner}/${storefront.repo}: the description file is not the one Demo Builder wrote; it was left as it is.`,
        );
    }
    delete project.demoPackage;
    await context.stateManager.saveProject(project);
    context.logger.info(
        `[Demo package] ${project.name}: removed (file ${file}${removedFromList ? ', card off the list' : ''})`,
    );
    const result: RemoveDemoPackageResult = { file, removedFromList };
    return { success: true, data: result };
};
