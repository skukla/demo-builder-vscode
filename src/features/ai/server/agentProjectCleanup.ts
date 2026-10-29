/**
 * agentProjectCleanup — the cloud half of an agent's project delete (AI-9).
 *
 * The button offers a checklist with two boxes, both unticked: "Delete
 * Repository" and "Delete DA.live Site" (which is also what unpublishes the
 * CDN). Press Enter without ticking either and it deletes locally — exactly what
 * `delete_project` has always done. The difference was never policy; the agent
 * simply had no way to say "and those two as well".
 *
 * So this is the checklist, as arguments. Both default to false, and both obey
 * the same setting the dialog does (`demoBuilder.cleanupBehavior`): `deleteAll`
 * ticks them, `localOnly` refuses them. One setting governs both surfaces.
 *
 * @module features/ai/server/agentProjectCleanup
 */

import * as vscode from 'vscode';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { reportPhase } from '@/core/utils/agentPhaseChannel';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { getDaLiveAuthService } from '@/features/eds/handlers/edsHelpers';
import { firstUsableDaLiveToken } from '@/features/eds/services/daLive/daLiveTokenChain';
import { extractEdsMetadata } from '@/features/eds/services/resourceCleanupHelpers';
import { otherProjectsPublishingTo } from '@/features/eds/services/storefront/sharedRepoProjects';
import {
    deleteStorefrontRepository,
    type CodeRemovalResult,
} from '@/features/eds/services/storefront/storefrontCodeRemoval';
import { tearDownStorefront } from '@/features/eds/services/storefront/storefrontTeardown';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/** What the caller asked for, before the setting has its say. */
export interface CloudCleanupRequest {
    deleteGithubRepo?: boolean;
    deleteDaLiveSite?: boolean;
    /** Also delete the project's own library pack (step 07). */
    deletePack?: boolean;
}

/** What the two boxes end up at, and why, so a tool can answer honestly. */
export interface CloudCleanupChoice {
    deleteGithubRepo: boolean;
    deleteDaLiveSite: boolean;
    /**
     * Set only when the call asked for it and the setting allows it. `deleteAll` never
     * ticks it: the button never deletes a pack without the SC ticking it either.
     */
    deletePack?: true;
    /** Set when `cleanupBehavior` overrode what was asked for. */
    refusedBySetting?: string;
}

/**
 * What happened to AEM's copy of a deleted repository's code (EDS-67), for an agent:
 * counts rather than every path, and the SC's sentence whenever anything may be left.
 */
export interface AgentSiteCode {
    removed: number;
    notRemoved: number;
    /** False only when aem.live was asked and no longer serves the code. */
    stillServing: boolean | 'unknown';
    summary?: string;
}

/** The agent's view of a code removal; shared by `delete_project` and `delete_github_repo`. */
export function agentSiteCode(code: CodeRemovalResult): AgentSiteCode {
    return {
        removed: code.removed,
        notRemoved: code.failed.length,
        stillServing: code.stillServing,
        ...(code.summary ? { summary: code.summary } : {}),
    };
}

/** What actually happened out there. */
export interface CloudCleanupOutcome {
    /**
     * Set when the storefront's pages are still live: why, for the SC. The repository
     * was kept, and the caller keeps the project, so a second try can still take the
     * pages down (EDS-65).
     */
    stopped?: string;
    /** `siteCode` is set for a storefront's repository: what happened to its code on aem.live. */
    githubRepo?: { name: string; deleted: boolean; error?: string; siteCode?: AgentSiteCode };
    daLiveSite?: {
        name: string;
        contentDeleted: boolean;
        unpublishedPages?: number;
        /**
         * False only when the pages were unpublished and the live host was checked and
         * no longer answers; true when they may still serve or it could not be told.
         */
        stillPublished: boolean;
        /** Whether the published pages are gone, in words, including "could not tell" (EDS-33). */
        publishSummary: string;
        /** What happened to the product pages the overlay published, in SC words (EDS-26). */
        productPages?: string;
        error?: string;
    };
}

/**
 * Resolve the two checkboxes against the SC's setting.
 *
 * @param request - what the tool call asked for
 * @returns the effective choice; `refusedBySetting` when the setting said no
 */
export function resolveCloudCleanup(request: CloudCleanupRequest): CloudCleanupChoice {
    const behavior = vscode.workspace
        .getConfiguration('demoBuilder')
        .get<string>('cleanupBehavior', 'ask');

    if (behavior === 'localOnly') {
        const asked = request.deleteGithubRepo || request.deleteDaLiveSite || request.deletePack;
        return {
            deleteGithubRepo: false,
            deleteDaLiveSite: false,
            refusedBySetting: asked
                ? 'demoBuilder.cleanupBehavior is "localOnly", so cloud resources are never deleted. Change the setting to delete them.'
                : undefined,
        };
    }

    const pack = request.deletePack === true ? { deletePack: true as const } : {};
    if (behavior === 'deleteAll') {
        return {
            deleteGithubRepo: request.deleteGithubRepo ?? true,
            deleteDaLiveSite: request.deleteDaLiveSite ?? true,
            ...pack,
        };
    }

    return {
        deleteGithubRepo: request.deleteGithubRepo === true,
        deleteDaLiveSite: request.deleteDaLiveSite === true,
        ...pack,
    };
}

/**
 * Delete whichever cloud resources the choice names, before the local files go.
 *
 * Runs the SAME storefront teardown the button runs, so an agent's delete takes
 * the pages off the CDN rather than leaving a live site with no project behind
 * it. Never throws: each resource reports its own outcome.
 */
export async function cleanUpProjectCloud(
    context: HandlerContext,
    project: Project,
    choice: CloudCleanupChoice,
): Promise<CloudCleanupOutcome> {
    const outcome: CloudCleanupOutcome = {};
    const metadata = extractEdsMetadata(project);
    if (!metadata) return outcome;

    if (choice.deleteDaLiveSite && metadata.daLiveOrg && metadata.daLiveSite) {
        reportPhase('Taking the storefront down');
        const name = `${metadata.daLiveOrg}/${metadata.daLiveSite}`;
        try {
            // The DA.live session FIRST. Helix's admin API on a registered site accepts
            // only that token; handed the Adobe Console token alone, as this was until
            // 2026-10-12, it answered every unpublish "[admin] not authenticated" while
            // the content and the repository were deleted — a live site with nothing
            // behind it. The button and both clean-up tools already choose it this way.
            const tokenProvider = await firstUsableDaLiveToken({
                daLiveSession: () => getDaLiveAuthService(context.context),
                imsTokenManager: () => ServiceLocator.getAuthenticationService().getTokenManager(),
            });
            if (!tokenProvider) {
                throw new Error('Not signed in to DA.live, so the storefront could not be taken down.');
            }
            const { HelixService } = await import('@/features/eds/services/helix/helixService');
            const torn = await tearDownStorefront(
                {
                    daLiveOrg: metadata.daLiveOrg,
                    daLiveSite: metadata.daLiveSite,
                    githubRepo: metadata.githubRepo,
                },
                {
                    tokenProvider,
                    logger: context.logger,
                    // The teardown's own step names, which is what the agent's
                    // notification shows while it waits (PL-59 R3).
                    onStep: (step) => reportPhase(step),
                    initKeyStore: () =>
                        HelixService.initKeyStore(
                            context.context.secrets,
                            context.context.globalState,
                        ),
                    // The project being deleted is still on disk here, and does not count.
                    otherProjectsOnRepo: (repo) =>
                        otherProjectsPublishingTo(context.stateManager, repo, project.path),
                },
            );
            outcome.daLiveSite = {
                name,
                contentDeleted: torn.contentDeleted,
                unpublishedPages: torn.unpublishedPages,
                stillPublished: torn.stillPublished,
                publishSummary: torn.publishSummary,
                ...(torn.productPages ? { productPages: torn.productPages.summary } : {}),
                error: torn.error,
            };
            if (torn.stopped) return { ...outcome, stopped: torn.stopped };
        } catch (error) {
            outcome.daLiveSite = {
                name,
                contentDeleted: false,
                stillPublished: true,
                publishSummary: 'The storefront teardown failed before it could say; its pages may still be live.',
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    if (choice.deleteGithubRepo && metadata.githubRepo) {
        reportPhase(OPERATION_STAGES.deletingRepository.label);
        const [owner, repo] = metadata.githubRepo.split('/');
        try {
            const { getGitHubServices, tryCreateDaLiveTokenProvider } = await import(
                '@/features/eds/handlers/edsHelpers'
            );
            const { repoLifecycle, fileOperations } = getGitHubServices(context.context.secrets);
            if (!owner || !repo) {
                throw new Error(`"${metadata.githubRepo}" is not an owner/repo pair`);
            }
            // The button's own path: the files listed first, then the repository, then
            // AEM's copy of the code, on the DA.live session (EDS-67).
            const { code, kept } = await deleteStorefrontRepository(
                { owner, repo },
                {
                    files: fileOperations,
                    deleteRepository: (o, r) => repoLifecycle.deleteRepository(o, r),
                    tokenProvider: tryCreateDaLiveTokenProvider(context.context),
                    logger: context.logger,
                    onStep: (step) => reportPhase(step),
                },
            );
            if (kept) {
                // No working DA.live sign-in to remove the site code with: the repository
                // stays, and the project with it, so "delete again" can finish (EDS-67).
                outcome.githubRepo = { name: metadata.githubRepo, deleted: false, error: kept };
                return { ...outcome, stopped: kept };
            }
            outcome.githubRepo = {
                name: metadata.githubRepo,
                deleted: true,
                ...(code ? { siteCode: agentSiteCode(code) } : {}),
            };
        } catch (error) {
            outcome.githubRepo = {
                name: metadata.githubRepo,
                deleted: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    return outcome;
}
