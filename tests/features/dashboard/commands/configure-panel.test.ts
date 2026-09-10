/**
 * ConfigureProjectWebviewCommand — opening the panel and filling it.
 *
 * `execute()` is the door: no project means a warning and no panel, and every
 * failure below it has to surface as an error toast rather than an unhandled
 * rejection. `getInitialData` is what the form is built from — the stack ids it
 * reads decide which App Builder components the webview can even offer, so the
 * fallbacks when a project carries no selections are asserted on the ARGUMENTS
 * the catalog loader receives.
 */

import { ConfigureProjectWebviewCommand } from './configure.testUtils';
import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { getRegisteredTypes } from '@/core/handlers/dispatchHandler';
import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import { getAvailableAppBuilderComponents } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { loadDeclaredSecretFlags } from '@/features/components/services/commerceSecretMigration';
import { loadAppBuilderComponentSecretFlags } from '@/features/dashboard/handlers/appBuilderComponentSecrets';
import type { Logger } from '@/types/logger';
import { internals } from '../../../helpers/commandInternals';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';

jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    getAvailableAppBuilderComponents: jest.fn(() => []),
}));
jest.mock('@/core/state/appBuilderComponentState', () => ({
    getProvidedEnvVars: jest.fn(() => ({ MESH_ENDPOINT: 'https://mesh.test' })),
}));
jest.mock('@/features/dashboard/handlers/appBuilderComponentSecrets', () => ({
    loadAppBuilderComponentSecretFlags: jest.fn(async () => ({ API_KEY: true })),
    persistAppBuilderComponentSecrets: jest.fn(),
    splitAppBuilderComponentSecrets: jest.fn(),
}));
jest.mock('@/features/components/services/commerceSecretMigration', () => ({
    loadDeclaredSecretFlags: jest.fn(async () => ({ COMMERCE_PASSWORD: true })),
    migrateDeclaredSecrets: jest.fn(),
    reKeyProjectSecrets: jest.fn(),
}));
jest.mock('@/types/typeGuards', () => ({
    ...jest.requireActual('@/types/typeGuards'),
    isEdsProject: jest.fn(() => false),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getEwCanvasBranch: jest.fn(() => ''),
    resolveProjectAuthoringExperience: jest.fn(() => 'da-live-classic'),
}));
jest.mock('@/features/eds/services/storefront/storefrontStalenessDetector', () => ({
    detectStorefrontChanges: jest.fn(() => ({ hasChanges: false })),
}));
jest.mock('@/features/eds/services/storefront/storefrontRepublishService', () => ({
    republishStorefrontConfig: jest.fn(),
}));

// The handler CONTEXT is not what this suite is about — it is built from the
// service registry, which the shared node setup empties after every test. Stubbing
// the factory keeps the dispatch assertions about the dispatch.
jest.mock('@/commands/handlerContextFactory', () => ({
    createPanelHandlerContext: jest.fn(() => ({ stub: 'handler-context' })),
}));

const mockDispatchHandler = jest.fn().mockResolvedValue({ ok: true });
jest.mock('@/core/handlers/dispatchHandler', () => ({
    getRegisteredTypes: jest.fn(() => ['cancel', 'openExternal']),
    dispatchHandler: (...args: unknown[]) => mockDispatchHandler(...args),
}));

const EMPTY_REGISTRY = {
    version: '1.0.0',
    components: {
        frontends: [{ id: 'eds-storefront' }],
        backends: [],
        dependencies: [],
        mesh: [],
        integrations: [],
    },
    envVars: { A_KEY: { label: 'A', type: 'text' } },
};

function useRegistry(registry: unknown = EMPTY_REGISTRY): void {
    (
        ComponentRegistryManager as jest.MockedClass<typeof ComponentRegistryManager>
    ).mockImplementation(
        () =>
            ({
                loadRegistry: jest.fn().mockResolvedValue(registry),
            }) as unknown as ComponentRegistryManager
    );
}

describe('ConfigureProjectWebviewCommand - panel lifecycle and initial data', () => {
    let command: ConfigureProjectWebviewCommand;
    let stateManager: ReturnType<typeof createMockStateManager>;
    let logger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();
        useRegistry();
        vscode.window.activeColorTheme = { kind: vscode.ColorThemeKind.Dark };
        stateManager = createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(createMockProject()),
            getAllProjects: jest.fn().mockResolvedValue([]),
        });
        logger = createMockLogger() as unknown as Logger;
        command = new ConfigureProjectWebviewCommand(
            createMockExtensionContext(),
            stateManager,
            logger
        );
    });

    describe('execute', () => {
        beforeEach(() => {
            internals(command).createOrRevealPanel = jest.fn().mockResolvedValue(undefined);
            internals(command).initializeCommunication = jest.fn().mockResolvedValue(undefined);
        });

        it('warns and opens nothing when there is no current project', async () => {
            stateManager.getCurrentProject.mockResolvedValue(undefined);

            await command.execute();

            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                'No project found to configure.',
                'OK'
            );
            expect(internals(command).createOrRevealPanel).not.toHaveBeenCalled();
        });

        it('opens the panel and initialises communication for a real project', async () => {
            await command.execute();

            expect(internals(command).createOrRevealPanel).toHaveBeenCalledTimes(1);
            expect(internals(command).initializeCommunication).toHaveBeenCalledTimes(1);
        });

        it('does NOT re-initialise communication on a second open', async () => {
            internals(command).communicationManager = { sendMessage: jest.fn() };

            await command.execute();

            expect(internals(command).initializeCommunication).not.toHaveBeenCalled();
        });

        it('captures the project name for the loading screen subtitle', async () => {
            stateManager.getCurrentProject.mockResolvedValue(
                createMockProject({ name: 'CitiSignal Demo' })
            );

            await command.execute();

            expect(internals(command).getLoadingHeader()).toEqual({
                title: 'Configure Project',
                subtitle: 'CitiSignal Demo',
            });
        });

        it('reports a panel failure as an error toast instead of throwing', async () => {
            internals(command).createOrRevealPanel = jest
                .fn()
                .mockRejectedValue(new Error('no window'));

            await expect(command.execute()).resolves.toBeUndefined();

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                'Failed to open configuration',
                'OK'
            );
        });

        it('has no subtitle before any project has been opened', () => {
            expect(internals(command).getLoadingHeader()).toEqual({
                title: 'Configure Project',
                subtitle: undefined,
            });
        });
    });

    describe('disposeActivePanel', () => {
        it('disposes the Configure panel, looked up by its own webview id', () => {
            const panel = createMockWebviewPanel();
            const lookup = jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(panel);

            ConfigureProjectWebviewCommand.disposeActivePanel();

            expect(lookup).toHaveBeenCalledWith('demoBuilder.configureProject');
            expect(panel.dispose).toHaveBeenCalledTimes(1);
            lookup.mockRestore();
        });

        it('does nothing when no Configure panel is open', () => {
            const lookup = jest
                .spyOn(BaseWebviewCommand, 'getActivePanel')
                .mockReturnValue(undefined);

            expect(() => ConfigureProjectWebviewCommand.disposeActivePanel()).not.toThrow();

            lookup.mockRestore();
        });

        it('swallows a dispose that throws because the panel was already gone', () => {
            const panel = createMockWebviewPanel({
                dispose: jest.fn(() => {
                    throw new Error('already disposed');
                }),
            });
            const lookup = jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(panel);

            expect(() => ConfigureProjectWebviewCommand.disposeActivePanel()).not.toThrow();

            lookup.mockRestore();
        });
    });

    describe('getWebviewContent', () => {
        it('resolves the media base URI from the extension dist directory', async () => {
            const panel = createMockWebviewPanel();
            internals(command).panel = panel;

            await internals(command).getWebviewContent();

            const uris = (panel.webview.asWebviewUri as jest.Mock).mock.calls.map(
                ([u]) => (u as { fsPath: string }).fsPath
            );
            expect(uris[1]).toMatch(/dist$/);
        });

        it('refuses to build HTML before the panel exists', async () => {
            internals(command).panel = undefined;

            await expect(internals(command).getWebviewContent()).rejects.toThrow(
                'Panel must be created before getting webview content'
            );
        });
    });

    describe('getInitialData', () => {
        it('throws when the project disappeared between opening and loading', async () => {
            stateManager.getCurrentProject.mockResolvedValue(undefined);

            await expect(internals(command).getInitialData()).rejects.toThrow('No project found');
        });

        it('reports the dark theme as dark', async () => {
            const data = await internals(command).getInitialData<{ theme: string }>();
            expect(data.theme).toBe('dark');
        });

        it('reports every non-dark theme as light', async () => {
            vscode.window.activeColorTheme = { kind: vscode.ColorThemeKind.HighContrastLight };

            const data = await internals(command).getInitialData<{ theme: string }>();

            expect(data.theme).toBe('light');
        });

        it('passes the project stack ids to the App Builder catalog', async () => {
            stateManager.getCurrentProject.mockResolvedValue(
                createMockProject({
                    componentSelections: { backend: 'accs', frontend: 'eds-storefront' },
                })
            );

            await internals(command).getInitialData();

            expect(getAvailableAppBuilderComponents).toHaveBeenCalledWith('accs', 'eds-storefront');
        });

        it('sends empty stack ids — not undefined — when the project has no selections', async () => {
            stateManager.getCurrentProject.mockResolvedValue(
                createMockProject({ componentSelections: undefined })
            );

            await internals(command).getInitialData();

            expect(getAvailableAppBuilderComponents).toHaveBeenCalledWith('', '');
        });

        it('asks for declared-secret flags for exactly the configured components', async () => {
            stateManager.getCurrentProject.mockResolvedValue(
                createMockProject({
                    path: '/proj',
                    componentConfigs: { 'commerce-accs': {}, mesh: {} },
                })
            );

            await internals(command).getInitialData();

            expect(loadDeclaredSecretFlags).toHaveBeenCalledWith(
                ['commerce-accs', 'mesh'],
                '/proj',
                expect.anything()
            );
        });

        it('asks for no declared-secret flags when the project has no componentConfigs', async () => {
            stateManager.getCurrentProject.mockResolvedValue(
                createMockProject({ componentConfigs: undefined })
            );

            await internals(command).getInitialData();

            expect(loadDeclaredSecretFlags).toHaveBeenCalledWith(
                [],
                expect.anything(),
                expect.anything()
            );
        });

        it('sends the existing project names so the rename field can reject duplicates', async () => {
            stateManager.getAllProjects.mockResolvedValue([
                createMockProject({ name: 'alpha' }),
                createMockProject({ name: 'beta' }),
            ]);

            const data = await internals(command).getInitialData<{
                existingProjectNames: string[];
            }>();

            expect(data.existingProjectNames).toEqual(['alpha', 'beta']);
        });

        it('forwards the secret FLAGS (never the values) the webview needs', async () => {
            const data = await internals(command).getInitialData<{
                appBuilderComponentSecretFlags: Record<string, boolean>;
                componentSecretFlags: Record<string, boolean>;
                providedEnvVars: Record<string, string>;
            }>();

            expect(loadAppBuilderComponentSecretFlags).toHaveBeenCalled();
            expect(data.appBuilderComponentSecretFlags).toEqual({ API_KEY: true });
            expect(data.componentSecretFlags).toEqual({ COMMERCE_PASSWORD: true });
            expect(data.providedEnvVars).toEqual({ MESH_ENDPOINT: 'https://mesh.test' });
        });

        it('passes the registry component categories through untouched', async () => {
            const data = await internals(command).getInitialData<{
                componentsData: { frontends: { id: string }[] };
            }>();

            expect(data.componentsData.frontends).toEqual([{ id: 'eds-storefront' }]);
        });
    });

    describe('createHandlerContext', () => {
        it('gives handlers a sendMessage that reaches THIS command webview', async () => {
            const factory = jest.requireMock('@/commands/handlerContextFactory') as {
                createPanelHandlerContext: jest.Mock;
            };
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
            await handlers.get('cancel')?.({});

            const parts = factory.createPanelHandlerContext.mock.calls[0][0] as {
                sendMessage: (t: string, d?: unknown) => Promise<void>;
            };
            await parts.sendMessage('progress', { step: 1 });

            expect(sendSpy).toHaveBeenCalledWith('progress', { step: 1 });
        });
    });

    describe('initializeMessageHandlers', () => {
        it('registers a streaming handler for every type in the configure handler map', () => {
            const registered: string[] = [];
            internals(command).initializeMessageHandlers({
                onStreaming: (type: string) => registered.push(type),
            });

            expect(getRegisteredTypes).toHaveBeenCalled();
            expect(registered).toEqual(['cancel', 'openExternal', 'save-configuration']);
        });

        it('dispatches a registered message to the handler map under its own type', async () => {
            const handlers = new Map<string, (data: unknown) => Promise<unknown>>();
            internals(command).initializeMessageHandlers({
                onStreaming: (type: string, fn: (data: unknown) => Promise<unknown>) => {
                    handlers.set(type, fn);
                },
            });

            const result = await handlers.get('openExternal')?.({ url: 'https://example.test' });

            expect(result).toEqual({ ok: true });
            // The TYPE is the dispatch key — a handler registered under one type and
            // dispatched under another would answer the wrong message.
            expect(mockDispatchHandler).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                'openExternal',
                { url: 'https://example.test' }
            );
        });
    });
});
