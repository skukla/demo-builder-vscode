/**
 * What a stopped storefront setup does after its running step ends (F275).
 *
 * Setup holds its project's creation stop (`claimCreationStop`), so the wizard's Cancel,
 * `cancel_project_creation` and the agent's run all reach it. After a stop the running
 * step finishes and no further step starts (`storefrontSetupPhases.ts`). Then the run
 * removes what it made, and only what it made: a repository it created, and a DA.live
 * site it began writing. A repository or site it was handed stays.
 *
 * The removal is the delete path's own (`performEdsCleanup`): the shared storefront
 * teardown on the DA.live session, then the repository and its code on aem.live. A door
 * with nobody to ask (the agent) refuses each sign-in that would be needed, and the
 * answer names what was left. Until 2026-11-18 the agent's setup could not be stopped
 * at all, and the wizard's Cancel removed things at once, while the step carried on, with
 * a second cleanup that ran on the Adobe sign-in and never took pages off the CDN.
 *
 * @module features/eds/handlers/storefrontSetup/storefrontSetupStop
 */

import type { StorefrontSetupResult } from './storefrontSetupTypes';
import { OPERATION_STAGES, detailFor } from '@/core/utils/operationStages';
import type { CleanupResultItem } from '@/features/eds/services/resourceCleanupHelpers';
import { performEdsCleanup } from '@/features/projects-dashboard/services/edsExternalCleanup';
import type { HandlerContext } from '@/types/handlers';
import type { StorefrontSetupProgressPayload } from '@/types/webviewPayloads';
import type { StorefrontSetupStartPayload } from '@/types/webviewRequests';

const PROGRESS = 'storefront-setup-progress';

type EdsConfig = StorefrontSetupStartPayload['edsConfig'];

/** What the stopped run could not remove, one sentence each; empty when it left nothing. */
export interface SetupStopOutcome {
    left: string[];
}

/** The repository the run worked on, `owner/repo`, once it existed. */
function repoOf(result: StorefrontSetupResult): string | undefined {
    if (!result.repoUrl || !result.repoOwner || !result.repoName) return undefined;
    return `${result.repoOwner}/${result.repoName}`;
}

/** Whether the repository is this run's to remove: a new one, never one it was handed. */
function repoIsOurs(edsConfig: EdsConfig, repo: string): boolean {
    if (edsConfig.repoMode !== 'existing') return true;
    const made = edsConfig.createdRepo; // the wizard made it, then selected it
    return made !== undefined && `${made.owner}/${made.name}` === repo;
}

/** One line of the stop on the run's screen: a stage, and what it is doing under it. */
function say(context: HandlerContext, stage: string, step?: string): Promise<void> {
    return context.sendMessage(PROGRESS, {
        phase: 'cancelling',
        stage,
        message: step ?? detailFor(stage) ?? '',
        progress: 0,
    } satisfies StorefrontSetupProgressPayload);
}

/**
 * Say the run is stopping: the step running finishes, then what it made is deleted.
 * The same words creation uses (`CREATION_STAGES.stoppingCreation`).
 *
 * @param context - the run's channel
 */
export function announceStop(context: HandlerContext): Promise<void> {
    return say(context, OPERATION_STAGES.stoppingCreation.label);
}

/**
 * Remove what a stopped setup made, once its running step has ended.
 *
 * @param context - the run's channel, for the cleanup's steps and sign-ins
 * @param edsConfig - what the run was asked to build
 * @param result - what the run answered when it stopped
 * @param nobodyToAsk - a door with nobody to ask: sign-ins are refused, not asked for
 * @returns what it could not remove
 */
export async function removeWhatSetupMade(
    context: HandlerContext,
    edsConfig: EdsConfig,
    result: StorefrontSetupResult,
    nobodyToAsk: boolean,
): Promise<SetupStopOutcome> {
    const githubRepo = repoOf(result);
    const deleteGitHubRepo = githubRepo !== undefined && repoIsOurs(edsConfig, githubRepo);
    const deleteDaLiveSite = result.siteWritten === true;
    if (!deleteGitHubRepo && !deleteDaLiveSite) return { left: [] };

    const results: CleanupResultItem[] = [];
    const report = (stage: string, step?: string): void => void say(context, stage, step);
    const outcome = await performEdsCleanup(
        context,
        { githubRepo, daLiveOrg: edsConfig.daLiveOrg, daLiveSite: edsConfig.daLiveSite },
        { deleteGitHubRepo, deleteDaLiveSite, ...(nobodyToAsk ? { nobodyToAsk: true } : {}) },
        results,
        report,
    );
    const left = results
        .filter((row) => !row.success)
        .map((row) => `${row.name}: ${row.error ?? 'not removed'}`);
    if (outcome.stopped && !left.some((line) => line.endsWith(outcome.stopped ?? ''))) {
        left.push(outcome.stopped);
    }
    return { left };
}
