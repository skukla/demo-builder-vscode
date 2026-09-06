/**
 * ResetAllCommand — the cleanup steps themselves.
 *
 * The two sibling suites cover Adobe CLI logout and the security guards. This
 * one covers the rest of the sequence: the confirmation, stopping the demo,
 * closing panels, removing Demo Builder workspace folders, and clearing the
 * three pieces of state that outlive the .demo-builder directory.
 *
 * Every mock lives in the testUtils — see the note at the top of that file.
 */

import {
    BaseWebviewCommand,
    LAST_UPDATE_CHECK_VERSION,
    ResetAllCommand,
    fs,
    getDaLiveAuthService,
    setupResetAllSuite,
    vscode,
} from './ResetAllCommand.testUtils';

import * as os from 'os';
import * as path from 'path';

describe('ResetAllCommand - cleanup steps', () => {
    let command: ResetAllCommand;
    let context: any;
    let stateManager: any;
    let disposePanel: jest.SpyInstance;
    let disposeAllActivePanels: jest.SpyInstance;
    let resetAll: jest.Mock;

    const demoBuilderPath = path.join(os.homedir(), '.demo-builder');

    /** A workspace folder as the vscode API hands one over. */
    function folder(fsPath: string) {
        return { uri: { fsPath }, name: fsPath, index: 0 };
    }

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        ({ command, context, stateManager } = setupResetAllSuite());

        disposePanel = jest.spyOn(BaseWebviewCommand, 'disposePanel').mockImplementation(() => {});
        disposeAllActivePanels = jest
            .spyOn(BaseWebviewCommand, 'disposeAllActivePanels')
            .mockImplementation(() => {});

        resetAll = jest.fn().mockResolvedValue(undefined);
        (getDaLiveAuthService as jest.Mock).mockReturnValue({ resetAll });

        (vscode.window.showErrorMessage as jest.Mock) = jest.fn().mockResolvedValue(undefined);
    });

    describe('the confirmation', () => {
        // Modal is the point: this deletes every project on the machine, and a
        // dismissable toast is not a decision.
        it('asks in a modal, offering both choices', async () => {
            await command.execute();

            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.any(String),
                { modal: true },
                'Yes, Reset Everything',
                'Cancel',
            );
        });

        it('does nothing at all when the answer is not the confirming one', async () => {
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Cancel');

            await command.execute();

            expect(stateManager.clearAll).not.toHaveBeenCalled();
            expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
            expect(fs.rm).not.toHaveBeenCalled();
        });
    });

    describe('the order of the first two steps', () => {
        it('stops any running demo first', async () => {
            await command.execute();

            expect(vscode.commands.executeCommand).toHaveBeenNthCalledWith(1, 'demoBuilder.stopDemo');
        });

        it('closes both named panels and every other active one', async () => {
            await command.execute();

            expect(disposePanel).toHaveBeenCalledWith('demoBuilder.projectsList');
            expect(disposePanel).toHaveBeenCalledWith('demoBuilder.projectDashboard');
            expect(disposeAllActivePanels).toHaveBeenCalled();
        });
    });

    // Removing a folder shifts every index above it, which is why the matching
    // indices are removed in descending order and why the non-matching ones must
    // never reach the call at all.
    describe('removing Demo Builder workspace folders', () => {
        it('removes only the Demo Builder folders, highest index first', async () => {
            (vscode.workspace as any).workspaceFolders = [
                folder(path.join(demoBuilderPath, 'projects', 'alpha')),
                folder('/Users/someone/code/unrelated-repo'),
                folder(path.join(demoBuilderPath, 'projects', 'beta')),
            ];

            await command.execute();

            expect(vscode.workspace.updateWorkspaceFolders).toHaveBeenCalledTimes(2);
            expect(vscode.workspace.updateWorkspaceFolders).toHaveBeenNthCalledWith(1, 2, 1);
            expect(vscode.workspace.updateWorkspaceFolders).toHaveBeenNthCalledWith(2, 0, 1);
        });

        // No workspace is open at all — the reset must still run.
        it('carries on when there are no workspace folders', async () => {
            (vscode.workspace as any).workspaceFolders = undefined;

            await command.execute();

            expect(vscode.workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
            expect(stateManager.clearAll).toHaveBeenCalled();
            expect(fs.rm).toHaveBeenCalledWith(demoBuilderPath, { recursive: true, force: true });
        });
    });

    // These three outlive the .demo-builder directory, so deleting the directory
    // is not enough on its own.
    describe('the state that survives the directory', () => {
        it('clears the update-check version from global state', async () => {
            await command.execute();

            expect(context.globalState.update).toHaveBeenCalledWith(
                LAST_UPDATE_CHECK_VERSION,
                undefined,
            );
        });

        it('resets the AI onboarding flags', async () => {
            await command.execute();

            expect(context.globalState.update).toHaveBeenCalledWith(
                'demoBuilder.ai.onboardingCompleted',
                undefined,
            );
        });

        it('resets DA.live auth for this context', async () => {
            await command.execute();

            expect(getDaLiveAuthService).toHaveBeenCalledWith(context);
            expect(resetAll).toHaveBeenCalledTimes(1);
        });
    });

    // A reset that throws halfway leaves the user with no idea what state their
    // machine is in, so the failure is reported rather than propagated.
    it('reports a failure to the user instead of throwing', async () => {
        stateManager.clearAll.mockRejectedValue(new Error('state store is locked'));

        await expect(command.execute()).resolves.toBeUndefined();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'Failed to reset Demo Builder',
            'OK',
        );
    });
});
