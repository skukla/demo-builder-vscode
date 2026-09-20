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
import { extractEdsMetadata } from '@/features/eds/services/resourceCleanupHelpers';
import { tearDownStorefront } from '@/features/eds/services/storefront/storefrontTeardown';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

/** What the caller asked for, before the setting has its say. */
export interface CloudCleanupRequest {
    deleteGithubRepo?: boolean;
    deleteDaLiveSite?: boolean;
}

/** What the two boxes end up at, and why, so a tool can answer honestly. */
export interface CloudCleanupChoice {
    deleteGithubRepo: boolean;
    deleteDaLiveSite: boolean;
    /** Set when `cleanupBehavior` overrode what was asked for. */
    refusedBySetting?: string;
}

/** What actually happened out there. */
export interface CloudCleanupOutcome {
    githubRepo?: { name: string; deleted: boolean; error?: string };
    daLiveSite?: {
        name: string;
        contentDeleted: boolean;
        unpublishedPages?: number;
        /** The CDN was not unpublished, so the storefront may still serve. */
        stillPublished: boolean;
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
        const asked = request.deleteGithubRepo || request.deleteDaLiveSite;
        return {
            deleteGithubRepo: false,
            deleteDaLiveSite: false,
            refusedBySetting: asked
                ? 'demoBuilder.cleanupBehavior is "localOnly", so cloud resources are never deleted. Change the setting to delete them.'
                : undefined,
        };
    }

    if (behavior === 'deleteAll') {
        return {
            deleteGithubRepo: request.deleteGithubRepo ?? true,
            deleteDaLiveSite: request.deleteDaLiveSite ?? true,
        };
    }

    return {
        deleteGithubRepo: request.deleteGithubRepo === true,
        deleteDaLiveSite: request.deleteDaLiveSite === true,
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
        const name = `${metadata.daLiveOrg}/${metadata.daLiveSite}`;
        try {
            const tokenManager = ServiceLocator.getAuthenticationService().getTokenManager();
            const tokenProvider = {
                getAccessToken: async () => (await tokenManager.inspectToken()).token ?? null,
            };
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
                    initKeyStore: () =>
                        HelixService.initKeyStore(
                            context.context.secrets,
                            context.context.globalState,
                        ),
                },
            );
            outcome.daLiveSite = {
                name,
                contentDeleted: torn.contentDeleted,
                unpublishedPages: torn.unpublishedPages,
                stillPublished: torn.stillPublished,
                error: torn.error,
            };
        } catch (error) {
            outcome.daLiveSite = {
                name,
                contentDeleted: false,
                stillPublished: true,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    if (choice.deleteGithubRepo && metadata.githubRepo) {
        const [owner, repo] = metadata.githubRepo.split('/');
        try {
            const { getGitHubServices } = await import('@/features/eds/handlers/edsHelpers');
            const { repoOperations } = getGitHubServices(context.context.secrets);
            if (!owner || !repo) {
                throw new Error(`"${metadata.githubRepo}" is not an owner/repo pair`);
            }
            await repoOperations.deleteRepository(owner, repo);
            outcome.githubRepo = { name: metadata.githubRepo, deleted: true };
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
