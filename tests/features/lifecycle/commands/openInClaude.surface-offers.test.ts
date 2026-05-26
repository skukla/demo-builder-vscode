/** Extension-surface offer toast + AI onboarding completion flag — split from openInClaude.test.ts. */
import * as vscode from 'vscode';
import { OpenInClaudeCommand } from '@/commands/openInClaude';
import type { Project } from '@/types/base';
import {
    setupVscodeMocks, makeLogger, makeStateManager, makeGlobalState, makeContext, makeProject,
    EXTENSION_OFFER_KEY, USE_EXTENSION_ACTION_LABEL,
    STAY_IN_TERMINAL_ACTION_LABEL, OPEN_SETTINGS_ACTION_LABEL,
} from './openInClaude.testkit';

describe('OpenInClaudeCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ------------------------------------------------------------------------
    // Extension-detected offer toast
    // ------------------------------------------------------------------------

    describe('extension-detected offer toast', () => {
        it("fires when surface='terminal' + extension installed + flag unset", async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: true,
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const offerCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === USE_EXTENSION_ACTION_LABEL),
            );
            expect(offerCall).toBeDefined();
            const buttons = offerCall!.slice(1).map(String);
            expect(buttons).toEqual(
                expect.arrayContaining([USE_EXTENSION_ACTION_LABEL, STAY_IN_TERMINAL_ACTION_LABEL]),
            );
        });

        it('does NOT fire when extension is missing', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const offerCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === USE_EXTENSION_ACTION_LABEL),
            );
            expect(offerCall).toBeUndefined();
            // Terminal launch proceeded
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
        });

        it("does NOT fire when surface='extension'", async () => {
            const mocks = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const offerCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === USE_EXTENSION_ACTION_LABEL),
            );
            expect(offerCall).toBeUndefined();
            // URI launch proceeded
            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
        });

        it('does NOT fire when the flag is already set', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: true,
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState({ [EXTENSION_OFFER_KEY]: true })),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const offerCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === USE_EXTENSION_ACTION_LABEL),
            );
            expect(offerCall).toBeUndefined();
            // Terminal launch proceeded
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
        });

        it('flag is set BEFORE the toast displays (race-safe)', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: true,
            });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const updateCalls = (globalState.update as jest.Mock).mock.calls;
            const offerFlagIdx = updateCalls.findIndex(c => c[0] === EXTENSION_OFFER_KEY);
            expect(offerFlagIdx).toBeGreaterThanOrEqual(0);
            const flagOrder = (globalState.update as jest.Mock).mock.invocationCallOrder[offerFlagIdx];
            const offerCallIdx = mocks.showInformationMessageMock.mock.calls.findIndex(c =>
                c.slice(1).some(b => String(b) === USE_EXTENSION_ACTION_LABEL),
            );
            const offerOrder = (mocks.showInformationMessageMock as jest.Mock).mock.invocationCallOrder[offerCallIdx];
            expect(flagOrder).toBeLessThan(offerOrder);
        });

        it('"Use the Extension" writes surface=extension AND re-dispatches via URI launch this click', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: true,
            });
            mocks.showInformationMessageMock.mockResolvedValueOnce(USE_EXTENSION_ACTION_LABEL);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // surface written
            expect(mocks.configUpdateMock).toHaveBeenCalledWith(
                'surface',
                'extension',
                vscode.ConfigurationTarget.Global,
            );
            // URI launched, terminal did NOT
            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
            expect(mocks.createTerminalMock).not.toHaveBeenCalled();
        });

        it('"Stay in Terminal" leaves surface unchanged AND launches the terminal', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: true,
            });
            mocks.showInformationMessageMock.mockResolvedValueOnce(STAY_IN_TERMINAL_ACTION_LABEL);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // surface NOT written
            const surfaceWriteCall = mocks.configUpdateMock.mock.calls.find(c => c[0] === 'surface');
            expect(surfaceWriteCall).toBeUndefined();
            // Terminal launched, URI did NOT
            expect(mocks.openExternalMock).not.toHaveBeenCalled();
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
        });

        it('dismissal leaves surface unchanged AND launches the terminal', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: true,
            });
            mocks.showInformationMessageMock.mockResolvedValueOnce(undefined);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const surfaceWriteCall = mocks.configUpdateMock.mock.calls.find(c => c[0] === 'surface');
            expect(surfaceWriteCall).toBeUndefined();
            expect(mocks.openExternalMock).not.toHaveBeenCalled();
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
        });

        it('"Open Settings" opens the demoBuilder.ai.surface settings filter without changing the surface', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: true,
            });
            mocks.showInformationMessageMock.mockResolvedValueOnce(OPEN_SETTINGS_ACTION_LABEL);
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // executeCommand was called to open settings with the surface filter
            expect(executeCommandMock).toHaveBeenCalledWith(
                'workbench.action.openSettings',
                'demoBuilder.ai.surface',
            );
            // Surface was NOT changed
            const surfaceWriteCall = mocks.configUpdateMock.mock.calls.find(c => c[0] === 'surface');
            expect(surfaceWriteCall).toBeUndefined();
            // Click falls through with current surface — terminal launches
            expect(mocks.openExternalMock).not.toHaveBeenCalled();
            expect(mocks.createTerminalMock).toHaveBeenCalledTimes(1);
        });

        it('toast offers Open Settings as a third action with title-case wording', async () => {
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: true,
            });
            mocks.showInformationMessageMock.mockResolvedValueOnce(STAY_IN_TERMINAL_ACTION_LABEL);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const calls = mocks.showInformationMessageMock.mock.calls;
            const extensionOfferCall = calls.find(c =>
                typeof c[0] === 'string' && c[0].includes('The Claude Code extension is installed'),
            );
            expect(extensionOfferCall).toBeDefined();
            // Three action labels are passed after the message
            expect(extensionOfferCall).toContain(USE_EXTENSION_ACTION_LABEL);
            expect(extensionOfferCall).toContain(STAY_IN_TERMINAL_ACTION_LABEL);
            expect(extensionOfferCall).toContain(OPEN_SETTINGS_ACTION_LABEL);
            // Body no longer references the raw setting key
            expect(extensionOfferCall![0]).not.toMatch(/demoBuilder\.ai\.surface/);
        });
    });

    // ------------------------------------------------------------------------
    // Cross-surface flag behavior
    // ------------------------------------------------------------------------

    describe('AI onboarding completion flag', () => {
        const AI_ONBOARDING_COMPLETED_KEY = 'demoBuilder.ai.onboardingCompleted';

        it('sets the flag after both offers settle (terminal-surface launch)', async () => {
            setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(globalState.update).toHaveBeenCalledWith(AI_ONBOARDING_COMPLETED_KEY, true);
        });

        it('sets the flag after both offers settle (extension-surface launch)', async () => {
            setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const executeCommandMock = vscode.commands.executeCommand as jest.Mock;
            executeCommandMock.mockClear();
            executeCommandMock.mockResolvedValue(undefined);
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(globalState.update).toHaveBeenCalledWith(AI_ONBOARDING_COMPLETED_KEY, true);
        });

        it('flag-write happens BEFORE the launch (so the AI dashboard reflects completion immediately after the launch returns)', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const updateCalls = (globalState.update as jest.Mock).mock.calls;
            const onboardingIdx = updateCalls.findIndex(c => c[0] === AI_ONBOARDING_COMPLETED_KEY);
            expect(onboardingIdx).toBeGreaterThanOrEqual(0);
            const onboardingOrder = (globalState.update as jest.Mock).mock.invocationCallOrder[onboardingIdx];
            // Terminal spawn is the launch — its createTerminal call comes
            // after the onboarding flag write.
            const createTerminalOrder = mocks.createTerminalMock.mock.invocationCallOrder[0];
            expect(onboardingOrder).toBeLessThan(createTerminalOrder);
        });
    });
});
