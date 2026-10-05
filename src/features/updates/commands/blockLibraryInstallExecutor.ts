/**
 * The QuickPick shell around a block-library INSTALL (EDS-28) — the UI
 * counterpart of `applyBlockLibraryInstalls` in `updateApplyService.ts`. Both
 * call the one core, `applyBlockLibraryInstall`; this file owns only the
 * toasts. Lives beside `updateExecutor.ts` rather than in it because that file
 * is at its size limit.
 *
 * The SC picking the row IS the confirmation: nothing here runs unless the
 * item was selected in the Check for Updates list.
 */

import * as vscode from 'vscode';
import type { BlockLibraryInstallItem } from './updateTypes';
import { sanitizeErrorForLogging } from '@/core/validation/SensitiveDataRedactor';
import {
    applyBlockLibraryInstall,
    describeInstallOutcome,
} from '@/features/updates/services/blockLibraryInstall';
import type { UpdateContext } from '@/features/updates/services/updateCore';

export async function performBlockLibraryInstalls(
    selections: BlockLibraryInstallItem[],
    ctx: UpdateContext,
): Promise<void> {
    for (const { project, library } of selections) {
        try {
            const outcome = await applyBlockLibraryInstall({ project, library }, ctx);
            vscode.window.showInformationMessage(
                `${project.name} — ${describeInstallOutcome(outcome)}`,
            );
        } catch (error) {
            const sanitizedError = sanitizeErrorForLogging(error as Error);
            ctx.logger.error(
                `[Updates] Failed to install block library "${library.name}" in ${project.name}`,
                error as Error,
            );
            vscode.window.showErrorMessage(
                `Failed to install ${library.name} in ${project.name}: ${sanitizedError}`,
            );
        }
    }
}
