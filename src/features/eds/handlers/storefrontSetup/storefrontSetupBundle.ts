/**
 * Storefront setup for a project imported from a demo bundle (EDS-72, owner 2026-11-18):
 * Import from File holds the bundle's path, and setup makes the project's OWN new
 * repository from its files rather than generating one from a template.
 *
 * The bundle is the storefront's code and a pointer to the sender's published pages
 * (`demoBundle.ts`), so its code replaces the brand's patches and assets and its pages
 * replace the brand's content site. The brand's template stays on the config: the
 * project is recorded as a brand project (decision 3), and updates read it that way.
 *
 * @module features/eds/handlers/storefrontSetup/storefrontSetupBundle
 */

import {
    classifyZipStorefront,
    contentSourceOfZip,
    createRepositoryFromZip,
    readStorefrontZip,
    templateBaseOfZip,
} from '../../services/storefront/zipStorefrontImport';
import type { StorefrontSetupStartPayload } from './storefrontSetupHandlers';
import type { RepoInfo, SetupServices, StorefrontSetupResult } from './storefrontSetupTypes';
import { STOREFRONT_JOBS, jobLine } from '@/core/utils/storefrontJobs';
import type { DaLiveContentSource } from '@/types/demoPackages';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';
import type { StorefrontSetupProgressPayload } from '@/types/webviewPayloads';

type EdsConfig = StorefrontSetupStartPayload['edsConfig'];

/** The bundle as setup uses it: the storefront's files and the content site it names. */
export interface SetupBundle {
    files: Map<string, Buffer>;
    /** Entries left out as never-committed, for the progress line. */
    dropped: number;
    contentSource?: DaLiveContentSource;
    /** The template commit the sender's code was built on, when the bundle says (F252). */
    templateBase?: string;
}

/** A brand's own code and content settings, which a bundle's code and pages replace. */
const BRAND_ONLY_FIELDS = [
    'patches',
    'contentPatches',
    'contentPatchSource',
    'codePatches',
    'codePatchSource',
    'brandAssets',
    'accountContentSource',
] as const;

/** Whether setup has something to build the repository from: an imported bundle, or a template. */
export function hasCodeSource(edsConfig: EdsConfig, bundle: SetupBundle | undefined): boolean {
    return Boolean(bundle || (edsConfig.templateOwner && edsConfig.templateRepo));
}

/**
 * The repository the storefront's code is read from: the template, or for an imported project its
 * own repository once phase 1 has made it (block definitions are the bundle's, not the brand's).
 */
export function codeSource(
    bundle: SetupBundle | undefined,
    repoInfo: RepoInfo,
    edsConfig: EdsConfig,
): { owner: string; repo: string } {
    if (bundle) return { owner: repoInfo.repoOwner, repo: repoInfo.repoName };
    return { owner: edsConfig.templateOwner ?? '', repo: edsConfig.templateRepo ?? '' };
}

/**
 * Read the bundle the config names, and the config setup runs with it. A config with no
 * bundle comes back as it was: brand and added-demo projects are untouched.
 *
 * @returns the config (and the bundle, when there is one), or why the bundle cannot be used
 */
export async function readSetupBundle(
    edsConfig: EdsConfig,
    logger: Logger,
): Promise<{ edsConfig: EdsConfig; bundle?: SetupBundle } | { error: string }> {
    const bundlePath = edsConfig.bundleSource?.bundlePath;
    if (!bundlePath) return { edsConfig };
    let unpacked;
    try {
        unpacked = readStorefrontZip(bundlePath);
    } catch (error) {
        return { error: `The imported demo's file could not be read: ${(error as Error).message}` };
    }
    if ((await classifyZipStorefront(unpacked.files, logger)).kind !== 'storefront') {
        return { error: "The imported demo's file holds no storefront." };
    }
    const contentSource = contentSourceOfZip(unpacked.files);
    const kept: EdsConfig = { ...edsConfig };
    for (const field of BRAND_ONLY_FIELDS) delete kept[field];
    logger.info(
        `[Storefront Setup] Imported demo: ${unpacked.files.size} files from ${bundlePath}` +
            (contentSource
                ? `, pages from ${contentSource.org}/${contentSource.site}`
                : ', no content site named'),
    );
    const templateBase = templateBaseOfZip(unpacked.files, {
        owner: edsConfig.templateOwner ?? '',
        repo: edsConfig.templateRepo ?? '',
    });
    if (!templateBase) {
        logger.info(
            "[Storefront Setup] The sender's template version is unknown: updates count from the import",
        );
    }
    return {
        edsConfig: { ...kept, contentSource },
        bundle: {
            files: unpacked.files,
            dropped: unpacked.dropped,
            ...(contentSource ? { contentSource } : {}),
            ...(templateBase ? { templateBase } : {}),
        },
    };
}

/**
 * Phase 1 for an imported project: create the project's own repository from the bundle's
 * files, in the namespace the project uses, not flagged a template, and record the commit
 * the files were pushed as (Reset restores it, decision 1). Only a new repository: the
 * bundle IS the project's code, so there is no existing repository to put it in.
 *
 * @returns null to go on (the shape `executePhaseGitHubRepo` answers)
 */
export async function executePhaseBundleRepo(
    context: HandlerContext,
    edsConfig: EdsConfig,
    services: SetupServices,
    repoInfo: RepoInfo,
    bundle: SetupBundle,
): Promise<StorefrontSetupResult | null> {
    if (edsConfig.repoMode === 'existing' || edsConfig.createdRepo) {
        throw new Error(
            'An imported project makes its own new repository. Choose a new repository name.',
        );
    }
    // One push for every line of the step; the last carries the repository it made.
    const say = (message: string, progress: number, made?: RepoInfo): Promise<void> =>
        context.sendMessage('storefront-setup-progress', {
            phase: 'repository',
            message,
            progress,
            ...made,
        } satisfies StorefrontSetupProgressPayload);
    await say(jobLine(STOREFRONT_JOBS.creatingRepository, repoInfo.repoName), 5);
    const created = await createRepositoryFromZip(
        {
            repoOps: services.githubRepoLifecycle,
            fileOps: services.githubFileOps.treeCommits,
            logger: context.logger,
            onProgress: (message, detail) =>
                void say(detail ? jobLine(message, detail) : message, 10),
        },
        bundle.files,
        {
            repoName: repoInfo.repoName,
            isPrivate: edsConfig.isPrivate ?? false,
            namespace: edsConfig.daLiveOrg || undefined,
            template: false,
            leftOut: bundle.dropped,
        },
    );
    repoInfo.repoOwner = created.owner;
    repoInfo.repoName = created.repo;
    repoInfo.repoUrl = `https://github.com/${created.fullName}`;
    repoInfo.bundleImport = {
        commit: created.commit,
        ...(bundle.contentSource ? { contentSource: bundle.contentSource } : {}),
        ...(bundle.templateBase ? { templateBase: bundle.templateBase } : {}),
    };
    context.logger.info(
        `[Storefront Setup] Repository created from the imported demo: ${created.fullName} at ${created.commit}`,
    );
    await say('Repository ready', 15, repoInfo);
    return null;
}
