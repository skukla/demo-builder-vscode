/**
 * The one-time tip after the first save question (step 03, S6; decisions J2-3): once the SC has
 * answered "Save Your Changes First?" either way, a VS Code notification points to the setting that
 * replaced the window's box, with Open Settings filtered to it. Shown once ever; webview-only, so an
 * agent never triggers it.
 */

import * as vscode from 'vscode';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import { saveQuestionTipHandlers } from '@/features/data-installer/handlers/saveQuestionTip';
import { DATA_INSTALLER_DESCRIPTORS } from '@/features/ai/server/dataInstallerDescriptors';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

const TYPE = 'datapack-save-question-answered';
const showInformationMessage = vscode.window.showInformationMessage as jest.Mock;
const executeCommand = vscode.commands.executeCommand as jest.Mock;

/** A context whose tip has not been shown yet; the shared fake answers "shown" to keep tips away. */
function fresh() {
    const context = createMockHandlerContext();
    (context.context.globalState.get as jest.Mock).mockReturnValue(false);
    return context;
}

beforeEach(() => {
    showInformationMessage.mockReset().mockResolvedValue(undefined);
    executeCommand.mockReset();
});

it('shows the tip about the setting, with Open Settings', async () => {
    const context = fresh();

    const answer = await saveQuestionTipHandlers[TYPE](context);

    expect(answer).toEqual({ success: true });
    expect(showInformationMessage).toHaveBeenCalledWith(
        'Tip: You can customize saving changes in Settings → Demo Builder',
        'Open Settings',
    );
    expect(context.context.globalState.update).toHaveBeenCalledWith('dataInstaller.saveQuestionTipShown', true);
});

it('opens Settings filtered to the setting', async () => {
    showInformationMessage.mockResolvedValue('Open Settings');

    await saveQuestionTipHandlers[TYPE](fresh());
    await Promise.resolve();

    expect(executeCommand).toHaveBeenCalledWith(
        'workbench.action.openSettings',
        'demoBuilder.dataInstaller.changesOnRemoval',
    );
});

it('shows it only once', async () => {
    await saveQuestionTipHandlers[TYPE](createMockHandlerContext());

    expect(showInformationMessage).not.toHaveBeenCalled();
});

it('is served to the Datapacks screen and to no agent tool', () => {
    expect(importHandlers).toHaveProperty(TYPE);
    expect(DATA_INSTALLER_DESCRIPTORS.map((descriptor) => descriptor.type)).not.toContain(TYPE);
});
