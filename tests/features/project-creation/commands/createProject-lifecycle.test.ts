/**
 * CreateProjectWebviewCommand — opening, closing, and the identity it presents.
 *
 * `execute` is the only place the wizard learns which of its three modes it is
 * in, and it does so by writing two private fields the rest of the class reads:
 * the imported settings and the edit project. Edit mode additionally seeds the
 * shared component selection, because the prerequisites check needs to know the
 * project's Node requirement before any step renders.
 *
 * Everything else here is small and load-bearing: the tab title, the loading
 * header, the bundle id, and the two helpers that delegate to shared services.
 */

import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { getEndpoint as getEndpointHelper } from '@/features/mesh/services/meshEndpoint';
import { CreateProjectWebviewCommand } from '@/features/project-creation/commands/createProject';
import { formatGroupName } from '@/features/project-creation/helpers/formatters';
import type { Logger } from '@/types/logger';
import type { SettingsFile } from '@/types/settingsFile';
import type { EditProjectConfig } from '@/types/wizard';
import { internals } from '../../../helpers/commandInternals';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

jest.mock('@/core/logging/debugLogger');
jest.mock('@/features/prerequisites/services/PrerequisitesManager');
jest.mock('@/features/mesh/services/meshEndpoint', () => ({
    getEndpoint: jest.fn().mockResolvedValue('https://mesh.example/graphql'),
}));
jest.mock('@/features/project-creation/helpers/formatters', () => ({
    formatGroupName: jest.fn(() => 'Api Config'),
}));

const commandExecutor = { execute: jest.fn() };
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({ isAuthenticated: jest.fn() })),
        getCommandExecutor: jest.fn(() => commandExecutor),
    },
}));

const mockGetEndpoint = getEndpointHelper as jest.MockedFunction<typeof getEndpointHelper>;
const mockFormatGroupName = formatGroupName as jest.MockedFunction<typeof formatGroupName>;

const EDIT_PROJECT: EditProjectConfig = {
    projectName: 'acme-demo',
    projectPath: '/projects/acme-demo',
    settings: {},
};

function build(logger: Logger = createMockLogger()): CreateProjectWebviewCommand {
    return new CreateProjectWebviewCommand(
        createMockExtensionContext({}, '/mock/extension/path'),
        createMockStateManager(),
        logger
    );
}

/** A command whose panel work is stubbed, so execute() runs to the end. */
function buildOpenable(): CreateProjectWebviewCommand {
    const command = build();
    const panel = { title: 'stale title' };
    internals(command).createOrRevealPanel = jest.fn().mockResolvedValue(panel);
    internals(command).panel = panel;
    internals(command).initializeCommunication = jest.fn().mockResolvedValue(undefined);
    return command;
}

beforeEach(() => {
    jest.clearAllMocks();
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
    });
});

describe('what the wizard calls itself', () => {
    it('is the creation wizard by default', () => {
        const command = build();

        expect(internals(command).getWebviewTitle()).toBe('Create Demo Project');
        expect(internals(command).getLoadingMessage()).toBe('Loading Project Creation Wizard...');
        expect(internals(command).getLoadingHeader()).toEqual({
            title: 'Create Demo Project',
            subtitle: undefined,
        });
    });

    it('becomes the editor, named for the project, once an edit is in flight', async () => {
        const command = buildOpenable();

        await command.execute({ editProject: EDIT_PROJECT });

        expect(internals(command).getWebviewTitle()).toBe('Edit Project');
        expect(internals(command).getLoadingMessage()).toBe('Loading Project Editor...');
        expect(internals(command).getLoadingHeader()).toEqual({
            title: 'Edit Project',
            subtitle: 'acme-demo',
        });
    });

    it('renders into the wizard bundle', () => {
        expect(internals(build()).getWebviewId()).toBe('demoBuilderWizard');
    });

    it('asks for the Welcome view back when it closes', () => {
        expect(internals(build()).shouldReopenWelcomeOnDispose()).toBe(true);
    });

    it('refuses to build its HTML before a panel exists', async () => {
        await expect(internals(build()).getWebviewContent()).rejects.toThrow(
            'Panel must be created before getting webview content'
        );
    });
});

describe('execute stores the mode it was opened in', () => {
    it('opens in plain create mode when called with no options', async () => {
        const command = buildOpenable();

        await command.execute();

        expect(internals(command).importedSettings).toBeNull();
        expect(internals(command).editProject).toBeNull();
    });

    it('opens in plain create mode when the options carry neither', async () => {
        const command = buildOpenable();

        await command.execute({ sourceDescription: 'nothing useful' });

        expect(internals(command).importedSettings).toBeNull();
        expect(internals(command).editProject).toBeNull();
    });

    it('keeps the imported settings for the webview to seed from', async () => {
        const command = buildOpenable();
        const imported = { selections: { frontend: 'eds-storefront' } } as SettingsFile;

        await command.execute({ importedSettings: imported, sourceDescription: 'a file' });

        expect(internals(command).importedSettings).toBe(imported);
    });

    it('keeps the edit project for the webview to seed from', async () => {
        const command = buildOpenable();

        await command.execute({ editProject: EDIT_PROJECT });

        expect(internals(command).editProject).toBe(EDIT_PROJECT);
    });

    it('seeds the component selection an edit needs before any step renders', async () => {
        const command = buildOpenable();

        await command.execute({
            editProject: {
                ...EDIT_PROJECT,
                settings: {
                    selections: {
                        frontend: 'eds-storefront',
                        backend: 'adobe-commerce-accs',
                        dependencies: ['dep-a'],
                        integrations: ['int-a'],
                    },
                },
            },
        });

        expect(internals(command).sharedState.currentComponentSelection).toEqual({
            frontend: 'eds-storefront',
            backend: 'adobe-commerce-accs',
            dependencies: ['dep-a'],
            integrations: ['int-a'],
        });
    });

    it('fills the two list fields with empties when the project stored neither', async () => {
        const command = buildOpenable();

        await command.execute({
            editProject: {
                ...EDIT_PROJECT,
                settings: { selections: { frontend: 'eds-storefront' } },
            },
        });

        expect(internals(command).sharedState.currentComponentSelection).toEqual({
            frontend: 'eds-storefront',
            backend: undefined,
            dependencies: [],
            integrations: [],
        });
    });

    it('seeds no selection for an edit project that stored none', async () => {
        const command = buildOpenable();

        await command.execute({ editProject: EDIT_PROJECT });

        expect(internals(command).sharedState.currentComponentSelection).toBeUndefined();
    });

    it('seeds no selection when opening in create mode', async () => {
        const command = buildOpenable();

        await command.execute();

        expect(internals(command).sharedState.currentComponentSelection).toBeUndefined();
    });

    it('retitles a reused panel so a create-to-edit switch is visible on the tab', async () => {
        const command = buildOpenable();

        await command.execute({ editProject: EDIT_PROJECT });

        expect((internals(command).panel as { title: string }).title).toBe('Edit Project');
    });

    it('initializes the message channel only when there is not one already', async () => {
        const command = buildOpenable();
        const initialize = internals(command).initializeCommunication as jest.Mock;

        await command.execute();
        expect(initialize).toHaveBeenCalledTimes(1);

        (command as unknown as { communicationManager: unknown }).communicationManager = {};
        await command.execute();

        expect(initialize).toHaveBeenCalledTimes(1);
    });

    it('marks the wizard active for the view-switching context', async () => {
        const command = buildOpenable();

        await command.execute();

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'setContext',
            'demoBuilder.wizardActive',
            true
        );
    });

    it('reports a failure to open rather than leaving the transition hanging', async () => {
        const logger = createMockLogger();
        const command = build(logger);
        const failure = new Error('panel refused');
        internals(command).createOrRevealPanel = jest.fn().mockRejectedValue(failure);
        const showError = jest.fn().mockResolvedValue(undefined);
        (command as unknown as { showError: jest.Mock }).showError = showError;
        const endTransition = jest.spyOn(BaseWebviewCommand, 'endWebviewTransition');

        await expect(command.execute()).resolves.toBeUndefined();

        expect(showError).toHaveBeenCalledWith('Failed to create webview', failure);
        expect(endTransition).toHaveBeenCalled();
        endTransition.mockRestore();
    });
});

describe('closing the wizard', () => {
    it('clears the wizard-active context', () => {
        const command = build();

        command.dispose();

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'setContext',
            'demoBuilder.wizardActive',
            false
        );
    });

    it('returns the SC to the projects list', () => {
        jest.spyOn(BaseWebviewCommand, 'isWebviewTransitionInProgress').mockReturnValue(false);

        build().dispose();

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.showProjectsList');
    });

    it('stays put when another webview is already taking over', () => {
        jest.spyOn(BaseWebviewCommand, 'isWebviewTransitionInProgress').mockReturnValue(true);

        build().dispose();

        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
            'demoBuilder.showProjectsList'
        );
    });
});

describe('disposeActivePanel', () => {
    it('disposes the wizard panel when one is open', () => {
        const dispose = jest.fn();
        jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue({
            dispose,
        } as unknown as ReturnType<typeof BaseWebviewCommand.getActivePanel>);

        CreateProjectWebviewCommand.disposeActivePanel();

        expect(dispose).toHaveBeenCalled();
    });

    it('does nothing when no wizard panel is open', () => {
        jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(undefined);

        expect(() => CreateProjectWebviewCommand.disposeActivePanel()).not.toThrow();
    });

    it('swallows a panel that was already disposed', () => {
        jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue({
            dispose: jest.fn(() => {
                throw new Error('already disposed');
            }),
        } as unknown as ReturnType<typeof BaseWebviewCommand.getActivePanel>);

        expect(() => CreateProjectWebviewCommand.disposeActivePanel()).not.toThrow();
    });
});

describe('the two shared-service delegations', () => {
    it('resolves a mesh endpoint through the shared helper, with the session executor', async () => {
        const logger = createMockLogger();
        const command = build(logger);

        const endpoint = await internals(command)._getEndpoint('mesh-1', 'https://cached');

        expect(mockGetEndpoint).toHaveBeenCalledWith(
            'mesh-1',
            'https://cached',
            commandExecutor,
            logger,
            expect.anything()
        );
        expect(endpoint).toBe('https://mesh.example/graphql');
    });

    it('passes no cached endpoint through when it has none', async () => {
        await internals(build())._getEndpoint('mesh-1');

        expect(mockGetEndpoint.mock.calls[0][1]).toBeUndefined();
    });

    it('formats a group name through the shared formatter', () => {
        const result = internals(build())._formatGroupName('api-config');

        expect(mockFormatGroupName).toHaveBeenCalledWith('api-config');
        expect(result).toBe('Api Config');
    });
});
