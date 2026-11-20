/**
 * `datapack-save-question-answered` (datapack simplification step 03, S6; decisions J2-3): the SC
 * answered "Save Your Changes First?", either way, so the first time this happens a one-time tip
 * points to the setting that replaced the window's "Always" box, as a project delete's tip points
 * to its cleanup settings (`projectDeletionService.ts`).
 *
 * Webview-only: merged into `importHandlers`, and no agent descriptor names it. An agent answers
 * the question with `changes` on its start, and a tip on the SC's screen for that would be noise.
 *
 * @module features/data-installer/handlers/saveQuestionTip
 */

import * as vscode from 'vscode';
import { showOneTimeTip } from '@/core/utils/oneTimeTip';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

const OPEN_SETTINGS = 'Open Settings';
const SETTING = 'demoBuilder.dataInstaller.changesOnRemoval';

export const saveQuestionTipHandlers = defineHandlers({
    'datapack-save-question-answered': async (context: HandlerContext): Promise<HandlerResponse> => {
        showOneTimeTip(context.context.globalState, {
            stateKey: 'dataInstaller.saveQuestionTipShown',
            message: 'Tip: You can customize saving changes in Settings → Demo Builder',
            actions: [OPEN_SETTINGS],
            onAction: (selection) => {
                if (selection === OPEN_SETTINGS) {
                    void vscode.commands.executeCommand('workbench.action.openSettings', SETTING);
                }
            },
        });
        return { success: true };
    },
});
