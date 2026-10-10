/**
 * Shared update-apply core — `UpdateContext`, the commit-sha rollback helper,
 * and the snapshot/marker-bearing block-library apply logic.
 *
 * Sibling of `adobeMcpUpdateCore.ts` for the same reason it exists: two apply
 * paths share this substance — `commands/updateExecutor.ts` (the QuickPick UI
 * shell) and `services/updateApplyService.ts` (the headless MCP
 * `apply_updates` path). Hosting it in a service keeps the import direction
 * command→service; it previously lived in updateExecutor, forcing the apply
 * service to import from a commands module (2026-08-14 review).
 */

import type * as vscode from 'vscode';
import { COMPONENT_IDS } from '@/core/constants';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { RunnerResult } from '@/features/app-builder/services/appBuilderComponentRunner';
import { getGitHubServices } from '@/features/eds/handlers/edsServiceCache';
import {
    mergeAddedEntries,
    type RemovedByHandEntry,
} from '@/features/eds/services/addedEntriesRecord';
import {
    installBlockCollections,
    type BlockLibraryEntry,
    type InstallBlockCollectionResult,
} from '@/features/eds/services/blockCollectionHelpers';
import { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import type { Project } from '@/types/base';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';

/**
 * The pair update the integrations card's Update button runs, for any project:
 * guards, then the integration and its systems with newer code, systems first.
 * Bound at the boundary that has a handler context
 * (`updateIntegrationPairFor`, dashboard/handlers/integrationUpdateHandlers).
 */
export type IntegrationPairUpdater = (
    project: Project,
    componentId: string,
    report: (message: string, subMessage?: string) => void,
) => Promise<RunnerResult>;

/**
 * Context passed from the Check Updates command (or the headless apply
 * service) to the update apply functions.
 */
export interface UpdateContext {
    secrets: vscode.SecretStorage;
    extensionPath: string;
    /**
     * Narrowed to the methods the update pipeline actually calls (updateCore's
     * saveProject, updateExecutor's getCurrentProject, adobeMcpUpdateCore's
     * saveProjectConfigOnly). This also lets the MCP applyUpdatesTool pass its
     * HandlerContext stateManager (typed via the @/types/state INTERFACE, not
     * the class) without a widening cast.
     */
    stateManager: Pick<StateManager, 'saveProject' | 'getCurrentProject' | 'saveProjectConfigOnly'>;
    logger: Logger;
    /** ADR-015: the shell executor, supplied by whichever boundary builds this. */
    commandManager: CommandExecutor;
    /**
     * Runs an integration pair update (AB-73). Optional: a boundary that cannot
     * run App Builder deploys leaves it out, and an integration update then
     * reports "not available here" rather than pretending.
     */
    updateIntegrationPair?: IntegrationPairUpdater;
}

/**
 * The fields of a block-library update selection the core needs — structurally
 * identical to the same-named fields of `BlockLibraryUpdateItem`
 * (commands/updateTypes.ts), declared here so the service layer never imports
 * from commands.
 */
export interface BlockLibraryUpdateTarget {
    project: Project;
    library: InstalledBlockLibrary;
    latestCommit: string;
}

/**
 * Mutate a commitSha, save, and rollback on failure.
 * Prevents in-memory state poisoning when save throws.
 */
export async function updateCommitShaWithRollback(
    target: { commitSha: string } | undefined,
    newSha: string,
    save: () => Promise<void>,
): Promise<void> {
    if (!target) return;
    const original = target.commitSha;
    target.commitSha = newSha;
    try {
        await save();
    } catch (error) {
        target.commitSha = original;
        throw error;
    }
}

/**
 * The project's record of the library an update targets, or undefined (after a
 * warning) when the project no longer lists it. Both apply paths open with
 * this: the UI one before it prompts, so a library the project has dropped
 * never asks a question, and the resolved one before it writes.
 */
export function findInstalledLibrary(
    item: BlockLibraryUpdateTarget,
    ctx: Pick<UpdateContext, 'logger'>,
): InstalledBlockLibrary | undefined {
    const lib = item.project.installedBlockLibraries?.find((l) => l.name === item.library.name);
    if (!lib) {
        ctx.logger.warn(
            `[Updates] Block library "${item.library.name}" not in installedBlockLibraries; skipping`,
        );
    }
    return lib;
}

/**
 * Apply a block library update with the sync behavior ALREADY resolved to a
 * concrete action ('enabled' | 'disabled') — no 'ask', no modal. Shared by the
 * UI `applyBlockLibraryUpdate` (which resolves 'ask' via a prompt) and the
 * headless `updateApplyService` (which resolves 'ask' to the safe 'disabled'
 * default). Keeps the snapshot/marker logic in one place.
 *
 * Returns the authoring entries the update left out because the SC had removed
 * them by hand (EDS-36) — empty when it left none out or did not install.
 */
export async function applyBlockLibraryUpdateResolved(
    item: BlockLibraryUpdateTarget,
    effectiveBehavior: 'enabled' | 'disabled',
    ctx: UpdateContext,
): Promise<RemovedByHandEntry[]> {
    const lib = findInstalledLibrary(item, ctx);
    if (!lib) return [];

    if (effectiveBehavior === 'disabled') {
        await applyDisabledMarker(lib, item.latestCommit, item.project, ctx);
        ctx.logger.info(
            `[Updates] Sync disabled — recorded marker for "${item.library.name}" at ${item.latestCommit.substring(0, 7)}`,
        );
        return [];
    }

    // effectiveBehavior === 'enabled'
    const result = await installBlockLibraryFiles(item, ctx);
    // Saved by the commit-sha save just below. Set first: the entries and block
    // folders are in the repository now, whether or not that save succeeds.
    const version = result.libraryVersions?.[0];
    const addedEntries = mergeAddedEntries(lib.addedEntries, version?.addedEntries);
    if (addedEntries) lib.addedEntries = addedEntries;
    // A block this update copied is the library's from now on, so deleting its
    // folder later stays deleted too.
    lib.blockIds = [...new Set([...lib.blockIds, ...(version?.blockIds ?? [])])];
    await updateCommitShaWithRollback(lib, item.latestCommit, () =>
        ctx.stateManager.saveProject(item.project),
    );
    if (lib.syncDisabledMarker) {
        delete lib.syncDisabledMarker;
        await ctx.stateManager.saveProject(item.project);
    }
    ctx.logger.info(
        `[Updates] Updated block library "${item.library.name}" in ${item.project.name}`,
    );
    return result.removedByHand ?? [];
}

async function applyDisabledMarker(
    lib: InstalledBlockLibrary,
    upstreamSha: string,
    // The FULL project, because saveProject persists whatever it is handed —
    // an under-declared `{ name; path }` here plus the old `as never` would
    // have let a future caller legally persist a gutted manifest.
    project: Project,
    ctx: UpdateContext,
): Promise<void> {
    const previous = lib.syncDisabledMarker;
    lib.syncDisabledMarker = {
        upstreamSha,
        lastCheckedAt: new Date().toISOString(),
    };
    try {
        await ctx.stateManager.saveProject(project);
    } catch (err) {
        // Restore previous state to avoid poisoning in-memory.
        if (previous) {
            lib.syncDisabledMarker = previous;
        } else {
            delete lib.syncDisabledMarker;
        }
        throw err;
    }
}

/**
 * Copy one library's blocks into the project's storefront repository — the ONE
 * place the update pipeline calls the block installer. An update re-runs it for
 * a library already recorded; an install (EDS-28, `blockLibraryInstall.ts`)
 * runs it for a library that is selected but not yet in the storefront, and
 * reads the result to write the record.
 *
 * The installer only ADDS: a block folder that already exists in the storefront
 * is left exactly as it is (`installBlockCollections` seeds its seen-set from
 * the destination's `blocks/`), and one this library copied before that is gone
 * now was deleted by hand and is not copied back.
 */
export async function installBlockLibraryFiles(
    item: { project: Project; library: BlockLibraryEntry },
    ctx: UpdateContext,
): Promise<InstallBlockCollectionResult> {
    const storefront = item.project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const githubRepo = storefront?.metadata?.githubRepo;
    if (!storefront || typeof githubRepo !== 'string' || !githubRepo.includes('/')) {
        throw new Error(`Cannot re-install block library: storefront has no GitHub repo`);
    }
    const [destOwner, destRepo] = githubRepo.split('/');

    // The SHARED instance: its validation cache is per-instance, so a fresh one
    // would re-validate against GitHub.
    const { tokenService } = getGitHubServices(ctx.secrets);
    const fileOps = new GitHubFileOperations(tokenService, ctx.logger);

    // What this library added before — entries and block folders — so one the
    // SC has since deleted is left out rather than put back (EDS-36). None for a
    // first install.
    const recorded = item.project.installedBlockLibraries?.find(
        (l) => l.name === item.library.name,
    );
    const result = await installBlockCollections(
        fileOps,
        destOwner,
        destRepo,
        [{
            source: item.library.source,
            name: item.library.name,
            ...(recorded?.addedEntries ? { addedEntries: recorded.addedEntries } : {}),
            ...(recorded ? { blockIds: recorded.blockIds } : {}),
        }],
        ctx.logger,
    );
    if (!result.success) {
        throw new Error(result.error ?? 'Block library re-install failed');
    }
    return result;
}
