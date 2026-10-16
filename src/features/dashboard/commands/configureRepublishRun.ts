/**
 * Configure's storefront Republish, run and told (EDS-39, EDS-44).
 *
 * WHERE IT IS TOLD. The SC presses Republish in the prompt a save raises, while the
 * Configure screen is open. The run is told in that screen's progress modal: each
 * stage as it starts, then one last word — what was added or removed, and anything
 * that went wrong without stopping it. It used to go to a notification, and each
 * library's result arrived as a notification of its own on top of the progress one,
 * so two overlapped (owner, 2026-10-15). With Configure closed by then, it goes to
 * a notification as before, and the result lines follow it.
 *
 * Split out of `configure.ts`, which is far past its size limit.
 *
 * @module features/dashboard/commands/configureRepublishRun
 */

import * as vscode from 'vscode';
import type { BlockLibraryWorkParts } from './configureBlockLibraryExecutor';
import {
    cdnLagWarning,
    republishFromConfigure,
    type ConfigureRepublishOutcome,
} from './configureStorefrontRepublish';
import { ProjectDashboardWebviewCommand } from './showDashboard';
import { CONFIGURE_REPUBLISH_OPERATION_ID } from '@/core/utils/operationIds';
import { startModalRun } from '@/core/vscode/operationProgress';
import { withOperationProgress, type ReportStage } from '@/core/vscode/withOperationProgress';
import type { BlockLibraryWorkLine } from '@/features/dashboard/services/configureBlockLibraryWork';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { toError } from '@/types/typeGuards';

/** What the run needs from the command that starts it. */
export interface ConfigureRepublishRunDeps {
    parts: BlockLibraryWorkParts;
    /** The open Configure screen's channel; without one the run is told in notifications. */
    sendToScreen?: HandlerContext['sendMessage'];
    /** The command's own success line, for the notification path. */
    showSuccess: (message: string) => void;
}

/** The republish, with a throw answered as a failure: the modal must always get an end. */
async function republishOrFail(
    project: Project,
    parts: BlockLibraryWorkParts,
    report: ReportStage,
): Promise<ConfigureRepublishOutcome | { success: false; error: string }> {
    try {
        return await republishFromConfigure(project, parts, report);
    } catch (error) {
        parts.logger.error('[Configure] Failed to republish storefront:', toError(error));
        return { success: false, error: `Failed to republish storefront: ${toError(error).message}` };
    }
}

function show(line: BlockLibraryWorkLine): void {
    if (line.level === 'error') vscode.window.showErrorMessage(line.text);
    else if (line.level === 'warning') vscode.window.showWarningMessage(line.text);
    else vscode.window.showInformationMessage(line.text);
}

/** The notification path: each library's line, then the run's own. */
function tellInNotifications(
    outcome: ConfigureRepublishOutcome | { success: false; error: string },
    showSuccess: (message: string) => void,
): void {
    if (!('published' in outcome)) {
        vscode.window.showErrorMessage(outcome.error);
        return;
    }
    outcome.libraryLines.forEach(show);
    const { published } = outcome;
    if (!published.success) {
        vscode.window.showErrorMessage(`Failed to republish storefront: ${published.error}`);
    } else if (published.cdnError) {
        vscode.window.showWarningMessage(cdnLagWarning(published.cdnError));
    } else {
        showSuccess(outcome.storePages ?? 'Storefront configuration republished successfully');
    }
}

/**
 * Record what a republish changed: the dashboard's status always; after a publish the
 * CDN took, the project, and the prompt re-armed for the next storefront change.
 */
async function recordPublished(
    project: Project,
    outcome: ConfigureRepublishOutcome | { success: false; error: string },
    parts: BlockLibraryWorkParts,
): Promise<void> {
    if (!('published' in outcome) || !outcome.published.success) return;
    if (!outcome.published.cdnError) {
        await parts.stateManager.saveProject(project);
        // Without this the once-per-session flag stays latched after the first
        // republish, and later changes silently show "Configuration saved" while the
        // live storefront stays stale. Mirrors the mesh and restart flows.
        await vscode.commands.executeCommand('demoBuilder._internal.storefrontActionTaken');
    }
    await ProjectDashboardWebviewCommand.refreshStatus();
}

/**
 * Run Configure's Republish and tell the SC how it went.
 *
 * @param project - the saved project
 * @param deps - the command's collaborators, and the open screen's channel if any
 */
export async function runConfigureRepublish(project: Project, deps: ConfigureRepublishRunDeps): Promise<void> {
    const { parts, sendToScreen } = deps;
    if (sendToScreen) startModalRun(CONFIGURE_REPUBLISH_OPERATION_ID, sendToScreen);
    const outcome = await withOperationProgress(
        { id: CONFIGURE_REPUBLISH_OPERATION_ID, title: 'Republishing storefront', inModal: Boolean(sendToScreen) },
        (report) => republishOrFail(project, parts, report),
    );
    await recordPublished(project, outcome, parts);
    if (!sendToScreen) tellInNotifications(outcome, deps.showSuccess);
}
