/**
 * What the sidebar DOES — the buttons behind its messages, and the view
 * lifecycle around them.
 *
 * The sibling suite covers the update-check throttle and the basics of
 * resolving the view. This one is the routing table: sixteen message types,
 * each mapped to one command, each wrapped in a try/catch so a failed command
 * is reported rather than left as an unhandled rejection in a webview nobody
 * is watching.
 */
import {
    makeProvider,
    resolve,
    setOpenPanelCount,
    type MockWebviewView,
} from './sidebarProvider.testUtils';

import * as vscode from 'vscode';
import { toggleLogsPanel } from '@/features/lifecycle/services/lifecycleService';
import { createMockProject } from '../../../helpers/projectFake';

type Made = ReturnType<typeof makeProvider>;

/** Resolve the view and forget the commands resolving it fired. */
function openSidebar(made: Made): MockWebviewView {
    const view = resolve(made.provider);
    (vscode.commands.executeCommand as jest.Mock).mockClear();
    made.logger.error.mockClear();
    return view;
}

describe('SidebarProvider messages', () => {
    let made: Made;
    let view: MockWebviewView;

    beforeEach(() => {
        jest.clearAllMocks();
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);
        (vscode.env.openExternal as jest.Mock).mockResolvedValue(true);
        (toggleLogsPanel as jest.Mock).mockResolvedValue(true);
        setOpenPanelCount(0);
        made = makeProvider();
        view = openSidebar(made);
    });

    /**
     * One row per button. The command id is the contract — a wrong one is a
     * button that silently does nothing, because executeCommand rejects and the
     * catch swallows it.
     */
    describe('routing', () => {
        it.each([
            ['createProject', 'demoBuilder.createProject', undefined],
            ['openTools', 'workbench.action.quickOpen', '>Demo Builder: '],
            ['openSettings', 'workbench.action.openSettings', 'demoBuilder'],
            ['openAiChat', 'demoBuilder.openAiExperience', undefined],
            ['newAiChat', 'demoBuilder.newAiChat', undefined],
            ['showPrompts', 'demoBuilder.showPromptsPicker', undefined],
            ['startDemo', 'demoBuilder.startDemo', undefined],
            ['stopDemo', 'demoBuilder.stopDemo', undefined],
            ['openDashboard', 'demoBuilder.showProjectDashboard', undefined],
            ['openConfigure', 'demoBuilder.configure', undefined],
            ['checkUpdates', 'demoBuilder.checkUpdates', undefined],
        ])('runs %s as %s', async (type, command, argument) => {
            await view.deliver!({ type });

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                ...(argument === undefined ? [command] : [command, argument]),
            );
        });

        // Not a command: the logs panel toggle is a shared chokepoint, so the
        // sidebar's Logs button and the dashboard's stay in step.
        it('routes openLogs through the shared toggle, not a show command', async () => {
            await view.deliver!({ type: 'openLogs' });

            expect(toggleLogsPanel).toHaveBeenCalled();
        });

        it('opens the issue tracker externally for openHelp', async () => {
            await view.deliver!({ type: 'openHelp' });

            expect(vscode.env.openExternal).toHaveBeenCalled();
            expect(String((vscode.env.openExternal as jest.Mock).mock.calls[0][0])).toContain(
                'github.com/skukla/demo-builder-vscode/issues',
            );
        });

        it('passes the navigation target through', async () => {
            await view.deliver!({ type: 'navigate', payload: { target: 'projects' } });

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.navigate', {
                target: 'projects',
            });
        });

        // A navigate with no target would ask the router to go nowhere.
        it.each([
            ['no payload at all', undefined],
            ['a payload with no target', {}],
        ])('refuses to navigate with %s', async (_label, payload) => {
            await expect(view.deliver!({ type: 'navigate', payload })).resolves.toBeUndefined();

            expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
        });

        it('records a back message without running anything', async () => {
            await view.deliver!({ type: 'back' });

            expect(made.logger.info).toHaveBeenCalled();
            expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
        });

        it('runs nothing for a message type it does not know', async () => {
            await view.deliver!({ type: 'some-future-button' });

            expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
            expect(toggleLogsPanel).not.toHaveBeenCalled();
        });
    });

    /**
     * Every handler catches. A webview message handler that rejects produces an
     * unhandled rejection nobody sees — the failure has to be reported instead.
     */
    describe('when the thing behind the button fails', () => {
        beforeEach(() => {
            (vscode.commands.executeCommand as jest.Mock).mockRejectedValue(new Error('refused'));
            (vscode.env.openExternal as jest.Mock).mockRejectedValue(new Error('refused'));
            (toggleLogsPanel as jest.Mock).mockRejectedValue(new Error('refused'));
        });

        it.each([
            'createProject',
            'openTools',
            'openSettings',
            'openHelp',
            'openLogs',
            'openAiChat',
            'newAiChat',
            'showPrompts',
            'startDemo',
            'stopDemo',
            'openDashboard',
            'openConfigure',
            'checkUpdates',
        ])('reports a failed %s instead of rejecting', async (type) => {
            await expect(view.deliver!({ type })).resolves.toBeUndefined();

            expect(made.logger.error).toHaveBeenCalled();
        });

        it('reports a failed navigate instead of rejecting', async () => {
            await expect(
                view.deliver!({ type: 'navigate', payload: { target: 'projects' } }),
            ).resolves.toBeUndefined();

            expect(made.logger.error).toHaveBeenCalled();
        });
    });

    /**
     * The context is what the sidebar renders from: a project's own navigation,
     * the projects list, or the empty state.
     */
    describe('the context it reports', () => {
        it('reports the projects list once it is told that is what is showing', async () => {
            await made.provider.setShowingProjectsList(true);

            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'contextUpdate',
                data: { context: { type: 'projectsList' } },
            });
        });

        // The projects-list flag wins over a loaded project: the user is looking
        // at the list, whatever is loaded behind it.
        it('reports the projects list even while a project is loaded', async () => {
            const project = createMockProject({ name: 'Bodea' });
            made.stateManager.getCurrentProject.mockResolvedValue(project);

            await made.provider.setShowingProjectsList(true);

            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'contextUpdate',
                data: { context: { type: 'projectsList' } },
            });
        });

        it('reports the loaded project once the list is dismissed', async () => {
            const project = createMockProject({ name: 'Bodea' });
            made.stateManager.getCurrentProject.mockResolvedValue(project);

            await made.provider.setShowingProjectsList(false);

            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'contextUpdate',
                data: { context: { type: 'project', project } },
            });
        });

        it('answers getContext with the empty state when nothing is loaded', async () => {
            await view.deliver!({ type: 'getContext' });

            expect(view.webview.postMessage).toHaveBeenCalledWith({
                type: 'contextResponse',
                data: { context: { type: 'projects' } },
            });
        });
    });

    describe('sending to a webview that has gone', () => {
        it('reports a rejected postMessage rather than throwing', async () => {
            view.webview.postMessage.mockRejectedValue(new Error('Webview is disposed'));

            await expect(made.provider.sendMessage('anything')).resolves.toBeUndefined();
            expect(made.logger.debug).toHaveBeenCalled();
        });

        // Disposal drops the view AND the message subscription; leaving the
        // listener attached is a handler running against a dead webview.
        it('lets go of the view and its message listener on disposal', async () => {
            view.fireDisposal!();

            expect(view.listenerDisposal).toHaveBeenCalled();
            view.webview.postMessage.mockClear();
            await made.provider.sendMessage('anything');
            expect(view.webview.postMessage).not.toHaveBeenCalled();
        });
    });

    /**
     * Clicking the extension icon should land on something. It opens the
     * projects list — unless a webview panel is already open, in which case the
     * user is already somewhere and moving them would be rude.
     */
    describe('opening the dashboard behind the sidebar', () => {
        it('opens the projects list when the sidebar first resolves', () => {
            const fresh = makeProvider();

            resolve(fresh.provider);

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder.showProjectsList',
            );
        });

        it('opens nothing when a webview panel is already open', () => {
            setOpenPanelCount(1);
            const fresh = makeProvider();

            resolve(fresh.provider);

            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
                'demoBuilder.showProjectsList',
            );
        });

        it('opens the projects list again when the sidebar becomes visible', () => {
            view.visible = true;
            view.fireVisibilityChange!();

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder.showProjectsList',
            );
        });

        it('opens nothing when the sidebar is being HIDDEN', () => {
            view.visible = false;
            view.fireVisibilityChange!();

            expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
        });

        it('opens nothing on becoming visible while a panel is already open', () => {
            setOpenPanelCount(1);
            view.visible = true;

            view.fireVisibilityChange!();

            expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
        });

        it('reports a failure to open rather than leaving it unhandled', async () => {
            (vscode.commands.executeCommand as jest.Mock).mockRejectedValue(new Error('no window'));
            const fresh = makeProvider();

            resolve(fresh.provider);
            await Promise.resolve();
            await Promise.resolve();

            expect(fresh.logger.error).toHaveBeenCalled();
        });
    });

    describe('the webview it builds', () => {
        it('grants access to the bundle and the shipped media, and nothing else', () => {
            const fresh = makeProvider();

            const opened = resolve(fresh.provider);

            expect(opened.webview.options.enableScripts).toBe(true);
            expect(
                (opened.webview.options.localResourceRoots as Array<{ path: string }>).map(
                    (u) => u.path,
                ),
            ).toEqual(['/mock/extension/path/dist/webview', '/mock/extension/path/media']);
        });

        // A predictable nonce is a CSP that blocks nothing.
        it('gives each webview its own script nonce', () => {
            const first = resolve(makeProvider().provider).webview.html;
            const second = resolve(makeProvider().provider).webview.html;

            const nonceOf = (html: string) => /nonce="([^"]+)"/.exec(html)?.[1];
            expect(nonceOf(first)).toMatch(/^[A-Za-z0-9+/]{22}==$/);
            expect(nonceOf(first)).not.toBe(nonceOf(second));
        });
    });
});
