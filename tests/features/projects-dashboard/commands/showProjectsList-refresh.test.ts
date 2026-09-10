/**
 * The Projects List command's own work: what it sends, what it registers, and
 * what it tears down.
 *
 * The sibling suites cover the panel's identity and its sidebar wiring. Almost
 * everything BELOW that was reached by nothing — the two refresh paths, the
 * streaming-handler registration, the configuration listener, the handler
 * context and the static dispose. Each one is a decision about what crosses to
 * the webview, so the assertions are on the ARGUMENTS the collaborators receive:
 * a mocked communication manager answers the same whatever it is handed.
 */

import { ShowProjectsListCommand } from './showProjectsList.testUtils';

jest.mock('@/commands/handlerContextFactory', () => ({
    createPanelHandlerContext: jest.fn(() => ({ handlerContext: true })),
}));
jest.mock('@/core/handlers/dispatchHandler', () => ({
    getRegisteredTypes: jest.fn(() => ['getProjects', 'selectProject']),
    dispatchHandler: jest.fn(async () => ({ dispatched: true })),
}));

import * as vscode from 'vscode';
import { createPanelHandlerContext } from '@/commands/handlerContextFactory';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { dispatchHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';
import { projectsListHandlers } from '@/features/projects-dashboard/handlers/projectsListHandlers';
import type { Project } from '@/types/base';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

/**
 * The members this suite reaches past the class boundary for.
 *
 * `refreshConfig` and `refreshProjectsList` are private, `initializeMessageHandlers`
 * and `sendMessage` protected. Naming them ONCE keeps a typo in any of them a
 * compile error, which `as any` at each call site would not.
 */
interface CommandInternals {
    communicationManager: unknown;
    panel: unknown;
    sendMessage: jest.Mock;
    initializeMessageHandlers: (comm: unknown) => void;
    refreshConfig: () => Promise<void>;
    refreshProjectsList: () => Promise<void>;
    createOrRevealPanel: jest.Mock;
    initializeCommunication: jest.Mock;
}

function internals(command: ShowProjectsListCommand): CommandInternals {
    return command as unknown as CommandInternals;
}

type Built = {
    command: ShowProjectsListCommand;
    stateManager: ReturnType<typeof createMockStateManager>;
    logger: ReturnType<typeof createMockLogger>;
    sendMessage: jest.Mock;
};

/** A command whose `sendMessage` is a spy, so what it sends can be read directly. */
function build(): Built {
    const stateManager = createMockStateManager();
    const logger = createMockLogger();
    const command = new ShowProjectsListCommand(
        createMockExtensionContext(),
        stateManager,
        logger,
    );
    const sendMessage = jest.fn().mockResolvedValue(undefined);
    internals(command).sendMessage = sendMessage;
    return { command, stateManager, logger, sendMessage };
}

/** Mark the command as owning a live channel, which both refresh paths require. */
function withChannel(command: ShowProjectsListCommand): void {
    internals(command).communicationManager = { sendMessage: jest.fn() };
}

/** The canonical Project fake, pinned to one path. */
function projectAt(path: string): Project {
    return createMockProject({ name: path.split('/').pop() ?? path, path });
}

/** The list entry `getAllProjects` returns — a summary, not a whole Project. */
function listedAt(path: string): { name: string; path: string; lastModified: Date } {
    return { name: path.split('/').pop() ?? path, path, lastModified: new Date(0) };
}

describe('ShowProjectsListCommand — refreshing the webview', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn(() => 'rows'),
        });
    });

    describe('refreshConfig', () => {
        it('sends the current view mode as a configChanged payload', async () => {
            const { command, sendMessage } = build();
            withChannel(command);

            await internals(command).refreshConfig();

            expect(sendMessage).toHaveBeenCalledWith('configChanged', { projectsViewMode: 'rows' });
        });

        it('sends nothing when there is no channel to send it down', async () => {
            const { command, sendMessage } = build();

            await internals(command).refreshConfig();

            expect(sendMessage).not.toHaveBeenCalled();
        });
    });

    describe('refreshProjectsList', () => {
        it('loads each project WITHOUT persisting, and sends them all', async () => {
            // persistAfterLoad:false is the whole point of this read: refreshing a
            // list must not write every project back to disk.
            const { command, stateManager, sendMessage } = build();
            withChannel(command);
            stateManager.getAllProjects.mockResolvedValue([listedAt('/p/one'), listedAt('/p/two')]);
            stateManager.loadProjectFromPath.mockImplementation(async (p: string) => projectAt(p));

            await internals(command).refreshProjectsList();

            expect(stateManager.loadProjectFromPath).toHaveBeenCalledWith('/p/one', undefined, {
                persistAfterLoad: false,
            });
            expect(sendMessage).toHaveBeenCalledWith('projectsUpdated', {
                projects: [projectAt('/p/one'), projectAt('/p/two')],
            });
        });

        it('drops a project that will not load rather than sending a hole', async () => {
            const { command, stateManager, sendMessage } = build();
            withChannel(command);
            stateManager.getAllProjects.mockResolvedValue([
                listedAt('/p/good'),
                listedAt('/p/broken'),
            ]);
            stateManager.loadProjectFromPath.mockImplementation(async (p: string) =>
                p === '/p/broken' ? null : projectAt(p),
            );

            await internals(command).refreshProjectsList();

            expect(sendMessage).toHaveBeenCalledWith('projectsUpdated', {
                projects: [projectAt('/p/good')],
            });
        });

        it('sends an empty list when there are no projects', async () => {
            const { command, stateManager, sendMessage } = build();
            withChannel(command);
            stateManager.getAllProjects.mockResolvedValue([]);

            await internals(command).refreshProjectsList();

            expect(sendMessage).toHaveBeenCalledWith('projectsUpdated', { projects: [] });
        });

        it('sends nothing when there is no channel to send it down', async () => {
            const { command, stateManager, sendMessage } = build();

            await internals(command).refreshProjectsList();

            expect(sendMessage).not.toHaveBeenCalled();
            expect(stateManager.getAllProjects).not.toHaveBeenCalled();
        });

        it('reports a load failure instead of swallowing it', async () => {
            // A silent failure here leaves the list stale with nothing in the
            // Debug Logs to say why.
            const { command, stateManager, logger, sendMessage } = build();
            withChannel(command);
            stateManager.getAllProjects.mockRejectedValue(new Error('disk gone'));

            await expect(internals(command).refreshProjectsList()).resolves.toBeUndefined();

            expect(logger.error).toHaveBeenCalled();
            expect(sendMessage).not.toHaveBeenCalled();
        });
    });
});

describe('ShowProjectsListCommand — message wiring', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn(() => 'cards'),
        });
    });

    /** Register the handlers against a fake comm, and hand back what it captured. */
    function wire() {
        const built = build();
        const onStreaming = jest.fn();
        let configListener: ((e: { affectsConfiguration: (k: string) => boolean }) => void) | undefined;
        (vscode.workspace.onDidChangeConfiguration as jest.Mock).mockImplementation((cb) => {
            configListener = cb;
            return { dispose: jest.fn() };
        });

        internals(built.command).initializeMessageHandlers({ onStreaming });

        return { ...built, onStreaming, fireConfigChange: (e: Parameters<NonNullable<typeof configListener>>[0]) => configListener?.(e) };
    }

    it('registers one streaming handler per registered message type', () => {
        const { onStreaming } = wire();

        expect(getRegisteredTypes).toHaveBeenCalledWith(projectsListHandlers);
        expect(onStreaming.mock.calls.map((c) => c[0])).toEqual(['getProjects', 'selectProject']);
    });

    it('dispatches a received message into the projects-list handler map', async () => {
        const { onStreaming } = wire();
        const handler = onStreaming.mock.calls[0][1] as (data: unknown) => Promise<unknown>;

        const result = await handler({ some: 'payload' });

        expect(dispatchHandler).toHaveBeenCalledWith(
            projectsListHandlers,
            { handlerContext: true },
            'getProjects',
            { some: 'payload' },
        );
        expect(result).toEqual({ dispatched: true });
    });

    it('builds the handler context from the shared factory, with a working sendMessage', async () => {
        // The context is built per call by the shared factory — no per-panel
        // guessing about which managers a reused handler will reach for.
        const { command, sendMessage, onStreaming } = wire();
        withChannel(command);
        await (onStreaming.mock.calls[0][1] as (d: unknown) => Promise<unknown>)({});

        const passed = (createPanelHandlerContext as jest.Mock).mock.calls[0][0];
        expect(passed.stateManager).toBeDefined();
        expect(passed.communicationManager).toBe(internals(command).communicationManager);
        await passed.sendMessage('somethingHappened', { n: 1 });

        expect(sendMessage).toHaveBeenCalledWith('somethingHappened', { n: 1 });
    });

    it('pushes the view mode down when THAT setting changes', () => {
        const { sendMessage, fireConfigChange } = wire();

        fireConfigChange({ affectsConfiguration: () => true });

        expect(sendMessage).toHaveBeenCalledWith('configChanged', { projectsViewMode: 'cards' });
    });

    it('ignores a change to any other setting', () => {
        const { sendMessage, fireConfigChange } = wire();

        fireConfigChange({ affectsConfiguration: (k: string) => k === 'something.else' });

        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('asks about the projectsViewMode setting by name', () => {
        const { fireConfigChange } = wire();
        const affectsConfiguration = jest.fn(() => false);

        fireConfigChange({ affectsConfiguration });

        expect(affectsConfiguration).toHaveBeenCalledWith('demoBuilder.projectsViewMode');
    });
});

describe('ShowProjectsListCommand — panel content and teardown', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('refuses to build webview content before a panel exists', async () => {
        const { command } = build();

        await expect(
            (command as unknown as { getWebviewContent: () => Promise<string> }).getWebviewContent(),
        ).rejects.toThrow('Panel must be created before getting webview content');
    });

    it('reports a dark theme as dark and everything else as light', async () => {
        const { command } = build();
        const getInitialData = (command as unknown as {
            getInitialData: () => Promise<{ theme: string }>;
        }).getInitialData;

        (vscode.window.activeColorTheme as { kind: number }).kind = vscode.ColorThemeKind.Dark;
        expect((await getInitialData.call(command)).theme).toBe('dark');

        (vscode.window.activeColorTheme as { kind: number }).kind = vscode.ColorThemeKind.Light;
        expect((await getInitialData.call(command)).theme).toBe('light');
    });

    describe('disposeActivePanel', () => {
        it('disposes the Projects List panel when one is open', () => {
            const dispose = jest.fn();
            const spy = jest
                .spyOn(BaseWebviewCommand, 'getActivePanel')
                .mockReturnValue({ dispose } as unknown as ReturnType<
                    typeof BaseWebviewCommand.getActivePanel
                >);

            ShowProjectsListCommand.disposeActivePanel();

            expect(spy).toHaveBeenCalledWith('demoBuilder.projectsList');
            expect(dispose).toHaveBeenCalled();
        });

        it('does nothing when no panel is open', () => {
            jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(undefined);

            expect(() => ShowProjectsListCommand.disposeActivePanel()).not.toThrow();
        });

        it('survives a panel that is already disposed', () => {
            // Reset and navigation both call this, and either can arrive after
            // the user has closed the tab.
            jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue({
                dispose: jest.fn(() => {
                    throw new Error('already disposed');
                }),
            } as unknown as ReturnType<typeof BaseWebviewCommand.getActivePanel>);

            expect(() => ShowProjectsListCommand.disposeActivePanel()).not.toThrow();
        });
    });
});
