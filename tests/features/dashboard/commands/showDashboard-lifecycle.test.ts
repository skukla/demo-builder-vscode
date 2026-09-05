/**
 * ProjectDashboardWebviewCommand — opening it, wiring it, and pushing to it.
 *
 * `execute()` does five things in an order that matters: the on-open checks are
 * re-armed BEFORE the panel exists (the panel triggers the first status request,
 * and arming after it leaves that request guarded), and the projects list is
 * disposed AFTER, so the user never sees a flash of empty window.
 *
 * The static push channels below are the only way an already-open dashboard
 * learns anything, so each is asserted on the exact message it posts — a payload
 * that loses its field renders an empty tile with no error anywhere.
 */

import * as vscode from 'vscode';
import { ProjectDashboardWebviewCommand } from '@/features/dashboard/commands/showDashboard';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { getRegisteredTypes } from '@/core/handlers/dispatchHandler';
import { armOnOpenChecks } from '@/features/dashboard/services/onOpenChecks/orchestrator';
import type { Project } from '@/types/base';
import { internals } from '../../../helpers/commandInternals';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';

const mockAccess = jest.fn();
jest.mock('fs/promises', () => ({
    access: (...args: unknown[]) => mockAccess(...args),
}));

jest.mock('@/features/dashboard/services/onOpenChecks/orchestrator', () => ({
    armOnOpenChecks: jest.fn(),
}));

jest.mock('@/commands/handlerContextFactory', () => ({
    createPanelHandlerContext: jest.fn(() => ({ stub: 'handler-context' })),
}));

const mockDispatchHandler = jest.fn().mockResolvedValue({ ok: true });
jest.mock('@/core/handlers/dispatchHandler', () => ({
    getRegisteredTypes: jest.fn((map: Record<string, unknown>) => Object.keys(map)),
    dispatchHandler: (...args: unknown[]) => mockDispatchHandler(...args),
}));

jest.mock('@/features/dashboard/handlers/dashboardHandlers', () => ({
    dashboardHandlers: { requestStatus: jest.fn(), openExternal: jest.fn() },
}));
jest.mock('@/features/dashboard/handlers/aiHandlers', () => ({
    aiHandlers: { 'verify-ai-setup': jest.fn() },
}));

/** The command, wired to a given project. */
function commandFor(project: Project | undefined): {
    command: ProjectDashboardWebviewCommand;
    stateManager: ReturnType<typeof createMockStateManager>;
} {
    const stateManager = createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue(project),
    });
    const command = new ProjectDashboardWebviewCommand(
        createMockExtensionContext({}, '/mock/extension/path'),
        stateManager,
        createMockLogger()
    );
    internals(command).createOrRevealPanel = jest.fn().mockResolvedValue(undefined);
    internals(command).initializeCommunication = jest.fn().mockResolvedValue(undefined);
    return { command, stateManager };
}

describe('ProjectDashboardWebviewCommand - lifecycle and push channels', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
        mockAccess.mockRejectedValue(new Error('ENOENT'));
    });

    describe('the webview identity', () => {
        it('names the panel, its title and its loading message', () => {
            const { command } = commandFor(createMockProject());

            expect(internals(command).getWebviewId()).toBe('demoBuilder.projectDashboard');
            expect(internals(command).getWebviewTitle()).toBe('Project Dashboard');
            expect(internals(command).getLoadingMessage()).toBe('Loading Project Dashboard...');
        });

        it('reopens the welcome surface when it is disposed', () => {
            const { command } = commandFor(createMockProject());

            expect(internals(command).shouldReopenWelcomeOnDispose()).toBe(true);
        });

        it('refuses to build HTML before the panel exists', async () => {
            const { command } = commandFor(createMockProject());
            internals(command).panel = undefined;

            await expect(internals(command).getWebviewContent()).rejects.toThrow(
                'Panel must be created before getting webview content'
            );
        });
    });

    describe('execute', () => {
        it('opens nothing when there is no current project', async () => {
            const { command } = commandFor(undefined);

            await command.execute();

            expect(armOnOpenChecks).not.toHaveBeenCalled();
            expect(internals(command).createOrRevealPanel).not.toHaveBeenCalled();
        });

        it('re-arms this project on-open checks BEFORE creating the panel', async () => {
            const order: string[] = [];
            const { command } = commandFor(createMockProject({ path: '/projects/citisignal' }));
            (armOnOpenChecks as jest.Mock).mockImplementation(() => order.push('arm'));
            internals(command).createOrRevealPanel = jest.fn(async () => {
                order.push('panel');
            });

            await command.execute();

            expect(armOnOpenChecks).toHaveBeenCalledWith('/projects/citisignal');
            expect(order).toEqual(['arm', 'panel']);
        });

        it('disposes the projects list only AFTER its own panel exists', async () => {
            const order: string[] = [];
            const dispose = jest
                .spyOn(BaseWebviewCommand, 'disposePanel')
                .mockImplementation((id: string) => {
                    order.push(`dispose:${id}`);
                });
            const { command } = commandFor(createMockProject());
            internals(command).createOrRevealPanel = jest.fn(async () => {
                order.push('panel');
            });

            await command.execute();

            expect(order).toEqual(['panel', 'dispose:demoBuilder.projectsList']);
            dispose.mockRestore();
        });

        it('initialises communication the first time only', async () => {
            const { command } = commandFor(createMockProject());

            await command.execute();
            expect(internals(command).initializeCommunication).toHaveBeenCalledTimes(1);

            internals(command).communicationManager = { sendMessage: jest.fn() };
            await command.execute();
            expect(internals(command).initializeCommunication).toHaveBeenCalledTimes(1);
        });

        it('does NOT hash env files for a project that is not running', async () => {
            mockAccess.mockResolvedValue(undefined);
            // The instance HAS a path on purpose: without one, "no files hashed"
            // would pass whether or not the running check was consulted.
            const { command } = commandFor(
                createMockProject({
                    status: 'stopped',
                    componentInstances: {
                        api: { id: 'api', name: 'api', status: 'ready', path: '/c/api' },
                    } as Project['componentInstances'],
                })
            );

            await command.execute();

            expect(mockAccess).not.toHaveBeenCalled();
        });

        it('hashes the env files that exist for a RUNNING demo', async () => {
            mockAccess.mockImplementation((p: string) =>
                p === '/c/api/.env' ? Promise.resolve() : Promise.reject(new Error('ENOENT'))
            );
            const { command } = commandFor(
                createMockProject({
                    status: 'running',
                    componentInstances: {
                        api: { id: 'api', name: 'api', status: 'ready', path: '/c/api' },
                    } as Project['componentInstances'],
                })
            );

            await command.execute();

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.initializeFileHashes',
                ['/c/api/.env']
            );
        });

        it('registers both .env and .env.local when both are present', async () => {
            mockAccess.mockResolvedValue(undefined);
            const { command } = commandFor(
                createMockProject({
                    status: 'running',
                    componentInstances: {
                        next: { id: 'next', name: 'next', status: 'ready', path: '/c/next' },
                    } as Project['componentInstances'],
                })
            );

            await command.execute();

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.initializeFileHashes',
                ['/c/next/.env', '/c/next/.env.local']
            );
        });

        it('skips a component instance with no path on disk', async () => {
            mockAccess.mockResolvedValue(undefined);
            const { command } = commandFor(
                createMockProject({
                    status: 'running',
                    componentInstances: {
                        backend: { id: 'backend', name: 'backend', status: 'ready' },
                    } as Project['componentInstances'],
                })
            );

            await command.execute();

            expect(mockAccess).not.toHaveBeenCalled();
        });

        it('asks for no hashing when a running demo has no env files at all', async () => {
            const { command } = commandFor(
                createMockProject({
                    status: 'running',
                    componentInstances: {
                        api: { id: 'api', name: 'api', status: 'ready', path: '/c/api' },
                    } as Project['componentInstances'],
                })
            );

            await command.execute();

            const ids = (vscode.commands.executeCommand as jest.Mock).mock.calls.map(
                ([id]) => id as string
            );
            expect(ids).not.toContain('demoBuilder._internal.initializeFileHashes');
        });
    });

    describe('initializeMessageHandlers', () => {
        it('registers the dashboard handlers AND the AI handlers on the same channel', () => {
            const { command } = commandFor(createMockProject());
            const registered: string[] = [];

            internals(command).initializeMessageHandlers({
                onStreaming: (type: string) => registered.push(type),
            });

            expect(getRegisteredTypes).toHaveBeenCalledTimes(2);
            // The AI handlers matter: without them the dashboard's AI Ready badge
            // has nothing to call and stays on "Verifying" forever.
            expect(registered).toEqual(['requestStatus', 'openExternal', 'verify-ai-setup']);
        });

        it('builds ONE complete handler context from the shared factory', async () => {
            const factory = jest.requireMock('@/commands/handlerContextFactory') as {
                createPanelHandlerContext: jest.Mock;
            };
            const { command, stateManager } = commandFor(createMockProject());
            const handlers = new Map<string, (data: unknown) => Promise<unknown>>();
            internals(command).initializeMessageHandlers({
                onStreaming: (type: string, fn: (data: unknown) => Promise<unknown>) => {
                    handlers.set(type, fn);
                },
            });

            await handlers.get('requestStatus')?.({});

            expect(factory.createPanelHandlerContext).toHaveBeenCalledWith(
                expect.objectContaining({
                    context: expect.anything(),
                    stateManager,
                    sendMessage: expect.any(Function),
                })
            );
        });

        it('gives handlers a sendMessage that reaches THIS command webview', async () => {
            const factory = jest.requireMock('@/commands/handlerContextFactory') as {
                createPanelHandlerContext: jest.Mock;
            };
            const { command } = commandFor(createMockProject());
            const sendSpy = jest
                .spyOn(
                    command as unknown as {
                        sendMessage: (t: string, d?: unknown) => Promise<void>;
                    },
                    'sendMessage'
                )
                .mockResolvedValue(undefined);
            const handlers = new Map<string, (data: unknown) => Promise<unknown>>();
            internals(command).initializeMessageHandlers({
                onStreaming: (type: string, fn: (data: unknown) => Promise<unknown>) => {
                    handlers.set(type, fn);
                },
            });
            await handlers.get('requestStatus')?.({});

            const parts = factory.createPanelHandlerContext.mock.calls[0][0] as {
                sendMessage: (t: string, d?: unknown) => Promise<void>;
            };
            await parts.sendMessage('progress', { step: 1 });

            expect(sendSpy).toHaveBeenCalledWith('progress', { step: 1 });
        });

        it('dispatches an AI message into the AI map, not the dashboard map', async () => {
            const { command } = commandFor(createMockProject());
            const handlers = new Map<string, (data: unknown) => Promise<unknown>>();
            internals(command).initializeMessageHandlers({
                onStreaming: (type: string, fn: (data: unknown) => Promise<unknown>) => {
                    handlers.set(type, fn);
                },
            });

            await handlers.get('verify-ai-setup')?.({ scope: 'all' });

            const [map, , type, data] = mockDispatchHandler.mock.calls[0] as [
                Record<string, unknown>,
                unknown,
                string,
                unknown,
            ];
            expect(Object.keys(map)).toEqual(['verify-ai-setup']);
            expect(type).toBe('verify-ai-setup');
            expect(data).toEqual({ scope: 'all' });
        });

        it('dispatches a dashboard message into the dashboard map', async () => {
            const { command } = commandFor(createMockProject());
            const handlers = new Map<string, (data: unknown) => Promise<unknown>>();
            internals(command).initializeMessageHandlers({
                onStreaming: (type: string, fn: (data: unknown) => Promise<unknown>) => {
                    handlers.set(type, fn);
                },
            });

            const result = await handlers.get('requestStatus')?.({});

            expect(result).toEqual({ ok: true });
            const [map] = mockDispatchHandler.mock.calls[0] as [Record<string, unknown>];
            expect(Object.keys(map)).toEqual(['requestStatus', 'openExternal']);
        });
    });

    describe('disposeActivePanel', () => {
        it('disposes the dashboard panel, looked up by its own id', () => {
            const panel = createMockWebviewPanel();
            const lookup = jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(panel);

            ProjectDashboardWebviewCommand.disposeActivePanel();

            expect(lookup).toHaveBeenCalledWith('demoBuilder.projectDashboard');
            expect(panel.dispose).toHaveBeenCalledTimes(1);
        });

        it('does nothing when no dashboard is open', () => {
            jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(undefined);

            expect(() => ProjectDashboardWebviewCommand.disposeActivePanel()).not.toThrow();
        });

        it('swallows a dispose that throws because the panel was already gone', () => {
            jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(
                createMockWebviewPanel({
                    dispose: jest.fn(() => {
                        throw new Error('already disposed');
                    }),
                })
            );

            expect(() => ProjectDashboardWebviewCommand.disposeActivePanel()).not.toThrow();
        });
    });

    describe('push channels', () => {
        /** Make the given panel id the only live one. */
        function livePanel(id: string): jest.Mock {
            const postMessage = jest.fn().mockResolvedValue(true);
            jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockImplementation((wanted: string) =>
                wanted === id
                    ? ({ webview: { postMessage } } as unknown as vscode.WebviewPanel)
                    : undefined
            );
            return postMessage;
        }

        it('posts the destination crumb to whichever project panel is live', async () => {
            const postMessage = livePanel('demoBuilder.integrations');

            await ProjectDashboardWebviewCommand.sendProjectDestinationUpdate({
                projectTitle: 'Acme',
                workspaceTitle: 'Stage',
            });

            expect(postMessage).toHaveBeenCalledWith({
                type: 'projectDestinationUpdate',
                payload: { destination: { projectTitle: 'Acme', workspaceTitle: 'Stage' } },
            });
        });

        it('is a silent no-op when no project panel is live', async () => {
            jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(undefined);

            await expect(
                ProjectDashboardWebviewCommand.sendProjectDestinationUpdate({
                    projectTitle: 'Acme',
                    workspaceTitle: 'Stage',
                })
            ).resolves.toBeUndefined();
        });

        it('posts the mesh status with its message and endpoint', async () => {
            const postMessage = livePanel('demoBuilder.projectDashboard');

            await ProjectDashboardWebviewCommand.sendMeshStatusUpdate(
                'deployed',
                'Mesh is live',
                'https://mesh.test/graphql'
            );

            expect(postMessage).toHaveBeenCalledWith({
                type: 'meshStatusUpdate',
                payload: {
                    status: 'deployed',
                    message: 'Mesh is live',
                    endpoint: 'https://mesh.test/graphql',
                },
            });
        });

        it('does not post mesh status when no panel is live', async () => {
            jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(undefined);

            await expect(
                ProjectDashboardWebviewCommand.sendMeshStatusUpdate('deployed')
            ).resolves.toBeUndefined();
        });

        it('posts a per-row status update carrying the row id and its new name', async () => {
            const postMessage = livePanel('demoBuilder.projectDashboard');

            await ProjectDashboardWebviewCommand.sendAppBuilderComponentStatusUpdate(
                'erp-sync',
                'deployed',
                'Deployed',
                'ERP Sync'
            );

            expect(postMessage).toHaveBeenCalledWith({
                type: 'appBuilderComponentStatusUpdate',
                payload: {
                    id: 'erp-sync',
                    status: 'deployed',
                    message: 'Deployed',
                    name: 'ERP Sync',
                },
            });
        });

        it('does not post a row status update when no panel is live', async () => {
            jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(undefined);

            await expect(
                ProjectDashboardWebviewCommand.sendAppBuilderComponentStatusUpdate(
                    'erp-sync',
                    'deployed'
                )
            ).resolves.toBeUndefined();
        });

        it('posts the full components map, not an empty envelope', async () => {
            const postMessage = livePanel('demoBuilder.projectDashboard');
            const components = {
                'erp-sync': {
                    kind: 'integration' as const,
                    status: 'deployed' as const,
                    source: { owner: 'acme', repo: 'erp' },
                },
            };

            await ProjectDashboardWebviewCommand.sendAppBuilderComponentsSnapshot(components);

            expect(postMessage).toHaveBeenCalledWith({
                type: 'appBuilderComponentsSnapshot',
                payload: { components },
            });
        });
    });

    describe('refreshStatus', () => {
        it('does nothing when no dashboard has ever been opened', async () => {
            (
                ProjectDashboardWebviewCommand as unknown as { activeInstance: unknown }
            ).activeInstance = null;

            await ProjectDashboardWebviewCommand.refreshStatus();

            expect(mockDispatchHandler).not.toHaveBeenCalled();
        });

        it('re-dispatches requestStatus through the live instance own context', async () => {
            const { command } = commandFor(createMockProject());
            await command.execute(); // registers the active instance

            await ProjectDashboardWebviewCommand.refreshStatus();

            expect(mockDispatchHandler).toHaveBeenCalledWith(
                expect.objectContaining({ requestStatus: expect.anything() }),
                { stub: 'handler-context' },
                'requestStatus',
                {}
            );
        });
    });
});
