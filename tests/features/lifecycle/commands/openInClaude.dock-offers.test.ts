/** Dock-to-right offer toast (extension + terminal contexts) and cross-surface flag — split from openInClaude.test.ts. */
import * as vscode from 'vscode';
import { OpenInClaudeCommand } from '@/commands/openInClaude';
import type { Project } from '@/types/base';
import {
    setupVscodeMocks, makeLogger, makeStateManager, makeGlobalState, makeContext, makeProject,
    DOCK_OFFER_KEY, DOCK_ACTION_LABEL, USE_DEFAULT_LAYOUT_ACTION_LABEL,
} from './openInClaude.testkit';

describe('OpenInClaudeCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ------------------------------------------------------------------------
    // Dock-to-right offer toast — extension launch context
    // ------------------------------------------------------------------------

    describe("dock offer toast (extension-context)", () => {
        it('first successful URI launch sets the dock-offer flag BEFORE showing the toast', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(globalState.update).toHaveBeenCalledWith(DOCK_OFFER_KEY, true);
            // The toast must be the dock-offer (with 2 buttons)
            const dockCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            expect(dockCall).toBeDefined();

            // update must have been called before showInformationMessage(dockCall)
            const updateOrder = (globalState.update as jest.Mock).mock.invocationCallOrder[0];
            const infoOrder = (mocks.showInformationMessageMock as jest.Mock).mock.invocationCallOrder[0];
            expect(updateOrder).toBeLessThan(infoOrder);
        });

        it('toast wording mentions editor tab + right side for extension-context', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const dockCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            expect(dockCall).toBeDefined();
            const body = String(dockCall![0]).toLowerCase();
            // Predictive wording — describes what dock-right actually does:
            // chats in a right editor split + sessions browser in the sidebar.
            expect(body).toMatch(/right/);
            expect(body).toMatch(/editor split/);
            expect(body).toMatch(/sessions browser/);
            // Has both buttons
            const buttons = dockCall!.slice(1).map(String);
            expect(buttons).toEqual(expect.arrayContaining([DOCK_ACTION_LABEL, USE_DEFAULT_LAYOUT_ACTION_LABEL]));
        });

        it('clicking "Dock to right side" writes BOTH dockToRight=true AND preferredLocation=sidebar atomically', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            mocks.showInformationMessageMock.mockResolvedValueOnce(DOCK_ACTION_LABEL);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.configUpdateMock).toHaveBeenCalledWith(
                'dockToRight',
                true,
                vscode.ConfigurationTarget.Global,
            );
            expect(mocks.claudeCodeUpdateMock).toHaveBeenCalledWith(
                'preferredLocation',
                'sidebar',
                vscode.ConfigurationTarget.Global,
            );
        });

        it('clicking "Use default" writes dockToRight=false explicitly (persists choice) and leaves claudeCode.preferredLocation alone', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            mocks.showInformationMessageMock.mockResolvedValueOnce(USE_DEFAULT_LAYOUT_ACTION_LABEL);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // dockToRight=false is written explicitly — persists the user's intent
            // so a future package.json default flip wouldn't override their choice.
            expect(mocks.configUpdateMock).toHaveBeenCalledWith(
                'dockToRight',
                false,
                vscode.ConfigurationTarget.Global,
            );
            // We do NOT touch claudeCode.preferredLocation — user may have set it
            // for their own reasons; "use default" only writes our own setting.
            expect(mocks.claudeCodeUpdateMock).not.toHaveBeenCalled();
        });

        it('dismissal writes NEITHER setting', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            mocks.showInformationMessageMock.mockResolvedValueOnce(undefined);

            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const dockUpdateCall = mocks.configUpdateMock.mock.calls.find(c => c[0] === 'dockToRight');
            expect(dockUpdateCall).toBeUndefined();
            expect(mocks.claudeCodeUpdateMock).not.toHaveBeenCalled();
        });

        it('subsequent URI launches do NOT show the dock toast again', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const globalState = makeGlobalState({ [DOCK_OFFER_KEY]: true });
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.openExternalMock).toHaveBeenCalledTimes(1);
            const dockCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            expect(dockCall).toBeUndefined();
        });

        it('two URI launches in quick succession only show the dock toast once (race-safe)', async () => {
            const mocks = setupVscodeMocks({ surface: 'extension', extensionInstalled: true });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);
            await command.execute(makeProject() as Project);

            expect(mocks.openExternalMock).toHaveBeenCalledTimes(2);
            const dockCalls = mocks.showInformationMessageMock.mock.calls.filter(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            expect(dockCalls.length).toBe(1);
        });

        it('dock toast fires BEFORE openExternal so the launch lands at the chosen location', async () => {
            const mocks = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
            });
            // User picks "Use default" — covers the fire-before-launch order
            mocks.showInformationMessageMock.mockResolvedValueOnce(USE_DEFAULT_LAYOUT_ACTION_LABEL);
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            // Dock toast fired
            const dockCallIdx = mocks.showInformationMessageMock.mock.calls.findIndex(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            expect(dockCallIdx).toBeGreaterThanOrEqual(0);
            // openExternal also fired (the launch happened after the toast)
            expect(mocks.openExternalMock).toHaveBeenCalled();
            // Ordering: dock toast resolved before openExternal was invoked
            const dockOrder = mocks.showInformationMessageMock.mock.invocationCallOrder[dockCallIdx];
            const openExternalOrder = mocks.openExternalMock.mock.invocationCallOrder[0];
            expect(dockOrder).toBeLessThan(openExternalOrder);
        });

        it('does NOT fire when dockToRight is already true', async () => {
            const mocks = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
                dockToRight: true,
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const dockCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            expect(dockCall).toBeUndefined();
        });
    });

    // ------------------------------------------------------------------------
    // Dock-to-right offer toast — terminal launch context
    // ------------------------------------------------------------------------

    describe("dock offer toast (terminal-context)", () => {
        it('toast wording mentions bottom panel terminal + right side for terminal-context', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const dockCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            expect(dockCall).toBeDefined();
            const body = String(dockCall![0]).toLowerCase();
            // Predictive wording — references the terminal and bottom-panel default
            expect(body).toMatch(/terminal/);
            expect(body).toMatch(/bottom panel/);
            expect(body).toMatch(/right/);
            const buttons = dockCall!.slice(1).map(String);
            expect(buttons).toEqual(expect.arrayContaining([DOCK_ACTION_LABEL, USE_DEFAULT_LAYOUT_ACTION_LABEL]));
        });

        it('terminal launch sets the dock-offer flag BEFORE showing the toast', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            const globalState = makeGlobalState();
            const command = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(globalState.update).toHaveBeenCalledWith(DOCK_OFFER_KEY, true);
            // Flag-write must precede toast-show
            const updateCalls = (globalState.update as jest.Mock).mock.calls;
            const flagIdx = updateCalls.findIndex(c => c[0] === DOCK_OFFER_KEY);
            expect(flagIdx).toBeGreaterThanOrEqual(0);
            const flagOrder = (globalState.update as jest.Mock).mock.invocationCallOrder[flagIdx];
            const dockCallIdx = mocks.showInformationMessageMock.mock.calls.findIndex(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            const dockOrder = (mocks.showInformationMessageMock as jest.Mock).mock.invocationCallOrder[dockCallIdx];
            expect(flagOrder).toBeLessThan(dockOrder);
        });

        it('clicking "Dock to right side" in terminal context writes BOTH settings', async () => {
            const mocks = setupVscodeMocks({ surface: 'terminal', extensionInstalled: false });
            // showInformationMessage returns DOCK_ACTION_LABEL — but we may also get the
            // clipboard toast first if a prompt is provided; here no prompt → only dock toast
            mocks.showInformationMessageMock.mockResolvedValueOnce(DOCK_ACTION_LABEL);
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            expect(mocks.configUpdateMock).toHaveBeenCalledWith(
                'dockToRight',
                true,
                vscode.ConfigurationTarget.Global,
            );
            expect(mocks.claudeCodeUpdateMock).toHaveBeenCalledWith(
                'preferredLocation',
                'sidebar',
                vscode.ConfigurationTarget.Global,
            );
        });

        it('dock toast fires regardless of reuse-vs-spawn (gated by flag, not by launch outcome)', async () => {
            // Pre-existing terminal: launch will reuse, not spawn. The dock toast
            // still fires because it's a layout preference asked once-ever via flag.
            const mocks = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
                existingTerminals: [{ name: 'Claude Code', exitStatus: undefined }],
            });
            const command = new OpenInClaudeCommand(
                makeContext(makeGlobalState()),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await command.execute(makeProject() as Project);

            const dockCall = mocks.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            expect(dockCall).toBeDefined();
        });
    });

    describe('cross-surface dock-offer flag', () => {
        it('terminal launch sets the dock-offer flag; subsequent extension-surface click does NOT re-show', async () => {
            // First call — terminal surface, accept the dock offer
            const mocksA = setupVscodeMocks({
                surface: 'terminal',
                extensionInstalled: false,
            });
            mocksA.showInformationMessageMock.mockResolvedValueOnce(DOCK_ACTION_LABEL);
            const globalState = makeGlobalState();
            const commandA = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await commandA.execute(makeProject() as Project);

            // Dock toast fired (terminal context)
            const dockCallA = mocksA.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            expect(dockCallA).toBeDefined();
            // Flag now set
            expect(globalState._store[DOCK_OFFER_KEY]).toBe(true);

            // Second call — extension surface; share the same globalState
            const mocksB = setupVscodeMocks({
                surface: 'extension',
                extensionInstalled: true,
            });
            const commandB = new OpenInClaudeCommand(
                makeContext(globalState),
                makeStateManager(makeProject()) as never,
                makeLogger() as never,
            );

            await commandB.execute(makeProject() as Project);

            // Dock toast did NOT fire again
            const dockCallB = mocksB.showInformationMessageMock.mock.calls.find(c =>
                c.slice(1).some(b => String(b) === DOCK_ACTION_LABEL),
            );
            expect(dockCallB).toBeUndefined();
            expect(mocksB.openExternalMock).toHaveBeenCalledTimes(1);
        });
    });
});
