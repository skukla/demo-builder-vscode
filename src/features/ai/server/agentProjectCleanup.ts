/**
 * agentProjectCleanup — the agent's checklist for a project delete, and its answer (AI-9).
 *
 * The button offers a checklist with two boxes, both unticked: "Delete GitHub
 * Repository" and "Delete DA.live Site" (which is also what unpublishes the
 * CDN). Press Enter without ticking either and it deletes locally — exactly what
 * `delete_project` has always done. The difference was never policy; the agent
 * simply had no way to say "and those two as well".
 *
 * So this is the checklist, as arguments. Both default to false, and both obey
 * the same setting the dialog does (`demoBuilder.cleanupBehavior`): `deleteAll`
 * ticks them, `localOnly` refuses them. One setting governs both surfaces.
 *
 * The delete itself is the button's (`runProjectDelete`, PL-104 fix 6), run with nobody to
 * ask; this file reads its answer back into the shape the agent is told about. Until then a
 * second orchestration lived here (`cleanUpProjectCloud`, deleted), with its own order, stop
 * rules and DA.live token choice, kept equal to the button's by comments that said so.
 *
 * @module features/ai/server/agentProjectCleanup
 */

import * as vscode from 'vscode';
import {
    extractEdsMetadata,
    type CleanupResultItem,
    type EdsProjectMetadata,
} from '@/features/eds/services/resourceCleanupHelpers';
import type { CodeRemovalResult } from '@/features/eds/services/storefront/storefrontCodeRemoval';
import type { StorefrontTeardownResult } from '@/features/eds/services/storefront/storefrontTeardown';
import type { ProjectDeleteRun } from '@/features/projects-dashboard/services/projectDeletionService';
import type { Project } from '@/types/base';

/** What the caller asked for, before the setting has its say. */
export interface CloudCleanupRequest {
    deleteGithubRepo?: boolean;
    deleteDaLiveSite?: boolean;
    /** Also remove its datapack's data from Commerce first, the button's Uninstall Datapack (walk F96). */
    removeData?: boolean;
}

/** What the two boxes end up at, and why, so a tool can answer honestly. */
export interface CloudCleanupChoice {
    deleteGithubRepo: boolean;
    deleteDaLiveSite: boolean;
    /**
     * Set only when the call asked for it and the setting allows it. `deleteAll` never
     * ticks it: it writes to a store, and the button never removes the data without the SC
     * ticking it either.
     */
    removeData?: true;
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
        const asked = request.deleteGithubRepo || request.deleteDaLiveSite || request.removeData;
        return {
            deleteGithubRepo: false,
            deleteDaLiveSite: false,
            refusedBySetting: asked
                ? 'demoBuilder.cleanupBehavior is "localOnly", so cloud resources are never deleted. Change the setting to delete them.'
                : undefined,
        };
    }

    const data = request.removeData === true ? { removeData: true as const } : {};
    if (behavior === 'deleteAll') {
        return {
            deleteGithubRepo: request.deleteGithubRepo ?? true,
            deleteDaLiveSite: request.deleteDaLiveSite ?? true,
            ...data,
        };
    }

    return {
        deleteGithubRepo: request.deleteGithubRepo === true,
        deleteDaLiveSite: request.deleteDaLiveSite === true,
        ...data,
    };
}

/** Which online result rows a delete reported, by kind. */
function rowOf(results: CleanupResultItem[], type: CleanupResultItem['type'], name: string): CleanupResultItem | undefined {
    return results.find((row) => row.type === type && row.name === name);
}

/** The DA.live site's outcome: the teardown's own result when it ran, else why it did not. */
function daLiveSiteOutcome(
    metadata: EdsProjectMetadata,
    torn: StorefrontTeardownResult | undefined,
    results: CleanupResultItem[],
): CloudCleanupOutcome['daLiveSite'] {
    if (!metadata.daLiveOrg || !metadata.daLiveSite) return undefined;
    const name = `${metadata.daLiveOrg}/${metadata.daLiveSite}`;
    if (torn) {
        return {
            name,
            contentDeleted: torn.contentDeleted,
            unpublishedPages: torn.unpublishedPages,
            stillPublished: torn.stillPublished,
            publishSummary: torn.publishSummary,
            ...(torn.productPages ? { productPages: torn.productPages.summary } : {}),
            error: torn.error,
        };
    }
    const row = rowOf(results, 'daLive', name);
    if (!row) return undefined;
    // No teardown result: it did not run (a sign-in refused), or the delete failed after it.
    return {
        name,
        contentDeleted: row.success,
        stillPublished: true,
        publishSummary: row.success
            ? 'Whether the pages are gone was not reported, so they may still be live.'
            : 'The storefront teardown did not run, so its pages may still be live.',
        error: row.error,
    };
}

/** The repository's outcome, and what happened to its code on aem.live when it went. */
function githubRepoOutcome(
    metadata: EdsProjectMetadata,
    code: CodeRemovalResult | undefined,
    results: CleanupResultItem[],
): CloudCleanupOutcome['githubRepo'] {
    if (!metadata.githubRepo) return undefined;
    const row = rowOf(results, 'github', metadata.githubRepo);
    if (!row) return undefined;
    return {
        name: metadata.githubRepo,
        deleted: row.success,
        ...(row.error ? { error: row.error } : {}),
        ...(row.success && code ? { siteCode: agentSiteCode(code) } : {}),
    };
}

/**
 * The agent's answer about what the delete did online, read off the button's own delete
 * (`runProjectDelete`, PL-104 fix 6): its result rows, and the teardown's and the site code's
 * results. `stopped` is set only when the online cleanup is what stopped it.
 *
 * @param project - the project deleted, for which resources it had
 * @param run - what `runProjectDelete` returned
 * @param results - the cleanup rows it reported
 */
export function agentCloudOutcome(project: Project, run: ProjectDeleteRun, results: CleanupResultItem[]): CloudCleanupOutcome {
    const metadata = extractEdsMetadata(project);
    if (!metadata) return {};
    const outcome: CloudCleanupOutcome = {};
    const daLiveSite = daLiveSiteOutcome(metadata, run.storefront, results);
    const githubRepo = githubRepoOutcome(metadata, run.siteCode, results);
    const stoppedOnline = run.stopped !== undefined && (run.storefront?.stopped === run.stopped || githubRepo?.error === run.stopped);
    if (stoppedOnline) outcome.stopped = run.stopped;
    if (githubRepo) outcome.githubRepo = githubRepo;
    if (daLiveSite) outcome.daLiveSite = daLiveSite;
    return outcome;
}
