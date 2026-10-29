/**
 * The Configure shell around pending block library work (EDS-39) — the
 * counterpart of `updates/commands/blockLibraryInstallExecutor.ts`, which is
 * the Check for Updates shell around the same installer.
 *
 * The work itself is `services/configureBlockLibraryWork.ts`. This file is the
 * boundary: it fetches the collaborators that work needs, asks for the DA.live
 * session a removal uses, and refreshes the DA.live block list when a block was
 * added or removed. Its result lines go back to the caller, which says them in
 * the progress modal or, with Configure closed, as notifications. It lives beside
 * `configure.ts` rather than in it because that file is far past its size limit.
 *
 * Nothing here runs until the SC presses the apply notification's action:
 * `ConfigureProjectWebviewCommand.republishStorefront` is the only caller.
 */

import type * as vscode from 'vscode';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { sanitizeErrorForLogging } from '@/core/validation/SensitiveDataRedactor';
import type { ReportStage } from '@/core/vscode/withOperationProgress';
import {
    applyPendingBlockLibraryWork,
    findPendingBlockLibraryWork,
    type BlockLibraryWorkDeps,
    type BlockLibraryWorkLine,
} from '@/features/dashboard/services/configureBlockLibraryWork';
import {
    ensureDaLiveAuth,
    getDaLiveAuthService,
    getGitHubServices,
} from '@/features/eds/handlers/edsHelpers';
import { DaLiveContentOperations } from '@/features/eds/services/daLive/daLiveContentOperations';
import { createDaLiveServiceTokenProvider } from '@/features/eds/services/daLive/daLiveTokenProviders';
import { refreshBlockLibraryHeadless } from '@/features/eds/services/refreshBlockLibraryHeadless';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';

/** What the Configure command hands over to build the collaborators from. */
export interface BlockLibraryWorkParts {
    context: vscode.ExtensionContext;
    stateManager: StateManager;
    logger: Logger;
}

/**
 * The DA.live block list, once the SC has a session. Undefined when the sign-in
 * is declined: the removal still runs, and its result says the DA.live block
 * list was not updated.
 */
async function daLiveBlockList(
    { context, logger }: BlockLibraryWorkParts,
): Promise<BlockLibraryWorkDeps['uninstall']['daLive']> {
    const session = await ensureDaLiveAuth({ context, logger }, '[Configure]');
    if (!session.authenticated) return undefined;
    const tokenProvider = createDaLiveServiceTokenProvider(getDaLiveAuthService(context));
    return new DaLiveContentOperations(tokenProvider, logger).blockLibOps;
}

/**
 * Rebuild the DA.live block list from the storefront's `component-definition.json`
 * and publish it — the dashboard's Refresh Block Library, not a second one. An
 * install needs it (nothing else puts the new blocks in the DA.live picker); a
 * removal needs it to republish the list its rows were just taken out of. Only the
 * added blocks' doc pages are published with it; the rest are live already.
 *
 * A failure is a line, never a throw: the files are already committed.
 */
async function refreshDaLiveBlockList(
    project: Project,
    { context, logger }: BlockLibraryWorkParts,
    report: ReportStage,
    addedBlockIds: string[],
): Promise<BlockLibraryWorkLine | undefined> {
    const stage = OPERATION_STAGES.publishingBlockList.label;
    report(stage);
    let reason: string | undefined;
    try {
        const result = await refreshBlockLibraryHeadless({
            project,
            context,
            logger,
            onProgress: (message) => report(stage, message),
            // The other doc pages are live already; publishing them all again was
            // the slow half of the refresh (2026-10-15, 37s for 49 pages).
            publishOnlyBlocks: addedBlockIds,
        });
        if (result.success) return undefined;
        reason = result.error;
    } catch (error) {
        reason = sanitizeErrorForLogging(error as Error);
    }
    logger.warn(`[Configure] DA.live block list not refreshed: ${reason}`);
    return {
        level: 'warning',
        text:
            'The storefront files were changed, but the DA.live block list was not refreshed ' +
            `(${reason ?? 'unknown error'}). Run Refresh Block Library from the dashboard.`,
    };
}

/**
 * Install the block libraries the project selects and its storefront lacks,
 * remove the ones it has and no longer selects, and answer what happened.
 * Does nothing when no library work is pending.
 *
 * @param project - the project being configured
 * @param parts - the command's context, state manager and logger
 * @param report - each stage as it starts, with the step under it
 * @returns one line per library, and one more when the DA.live block list was not refreshed
 */
export async function runPendingBlockLibraryWork(
    project: Project,
    parts: BlockLibraryWorkParts,
    report: ReportStage,
): Promise<BlockLibraryWorkLine[]> {
    const pending = findPendingBlockLibraryWork(project);
    if (pending.install.length + pending.remove.length === 0) return [];

    const { context, stateManager, logger } = parts;
    const deps: BlockLibraryWorkDeps = {
        // The context Check for Updates builds for the same installer.
        updateContext: {
            secrets: context.secrets,
            extensionPath: context.extensionPath,
            stateManager,
            logger,
            commandManager: ServiceLocator.getCommandExecutor(),
        },
        uninstall: {
            // The SHARED instance: a fresh one would re-validate against GitHub.
            fileOps: getGitHubServices(context.secrets).fileOperations,
            // Only a removal touches DA.live, so only a removal asks for the session.
            daLive: pending.remove.length > 0 ? await daLiveBlockList(parts) : undefined,
            stateManager,
            logger,
        },
    };

    const { lines, storefrontChanged, addedBlockIds } = await applyPendingBlockLibraryWork(project, deps, report);
    // Before the result is told, so "Added 2 blocks" is true of the DA.live picker too.
    const refreshFailure = storefrontChanged
        ? await refreshDaLiveBlockList(project, parts, report, addedBlockIds)
        : undefined;
    return refreshFailure ? [...lines, refreshFailure] : lines;
}
