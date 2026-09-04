/**
 * CreateProjectWebviewCommand.initializeMessageHandlers — what the wizard wires
 * to its message channel.
 *
 * Three things are registered here and nowhere else: the one-time tip offering
 * to save the SC's block-library picks as defaults, the shortcut that opens the
 * custom-library setting, and a settings listener that pushes both library
 * settings back to the webview when VS Code changes them. Everything else is
 * the auto-registration loop over the handler registry.
 */

import * as vscode from 'vscode';
import { dispatchHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';
import { showOneTimeTip } from '@/core/utils/oneTimeTip';
import { CreateProjectWebviewCommand } from '@/features/project-creation/commands/createProject';
import { projectCreationHandlers } from '@/features/project-creation/handlers/ProjectCreationHandlerRegistry';
import { internals } from '../../../helpers/commandInternals';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

jest.mock('@/core/logging/debugLogger');
jest.mock('@/features/prerequisites/services/PrerequisitesManager');
jest.mock('@/core/utils/oneTimeTip', () => ({ showOneTimeTip: jest.fn() }));
jest.mock('@/core/handlers/dispatchHandler', () => ({
    dispatchHandler: jest.fn().mockResolvedValue({ success: true }),
    getRegisteredTypes: jest.fn(() => ['get-components-data', 'create-project']),
}));
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({ isAuthenticated: jest.fn() })),
        getCommandExecutor: jest.fn(() => ({ execute: jest.fn() })),
    },
}));

const mockShowOneTimeTip = showOneTimeTip as jest.MockedFunction<typeof showOneTimeTip>;
const mockDispatchHandler = dispatchHandler as jest.MockedFunction<typeof dispatchHandler>;
const mockGetRegisteredTypes = getRegisteredTypes as jest.MockedFunction<typeof getRegisteredTypes>;

/** A stand-in message channel that records what the command registers on it. */
function fakeComm() {
    const on = new Map<string, (data: unknown) => unknown>();
    const streaming = new Map<string, (data: unknown) => unknown>();
    return {
        on: jest.fn((type: string, handler: (data: unknown) => unknown) => {
            on.set(type, handler);
        }),
        onStreaming: jest.fn((type: string, handler: (data: unknown) => unknown) => {
            streaming.set(type, handler);
        }),
        handlerFor: (type: string) => on.get(type),
        streamingHandlerFor: (type: string) => streaming.get(type),
    };
}

/** The settings VS Code reports, and the update calls the command makes. */
let settings: Record<string, unknown>;
let configUpdate: jest.Mock;
/** The listener the command hands to onDidChangeConfiguration. */
let onConfigChange: ((e: vscode.ConfigurationChangeEvent) => void) | undefined;

function wireUp() {
    const command = new CreateProjectWebviewCommand(
        createMockExtensionContext({}, '/mock/extension/path'),
        createMockStateManager(),
        createMockLogger()
    );
    const sendMessage = jest.fn().mockResolvedValue(undefined);
    (command as unknown as { sendMessage: jest.Mock }).sendMessage = sendMessage;
    internals(command).disposables = { add: jest.fn() };
    const comm = fakeComm();
    internals(command).initializeMessageHandlers(comm);
    return { command, comm, sendMessage };
}

/** Run the tip's action callback as if the SC clicked `label`. */
function clickTipAction(label: string): void {
    const options = mockShowOneTimeTip.mock.calls[0][1];
    options.onAction?.(label);
}

beforeEach(() => {
    jest.clearAllMocks();
    settings = { 'blockLibraries.custom': [], 'blockLibraries.defaults': [] };
    configUpdate = jest.fn();
    onConfigChange = undefined;
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((key: string, defaultValue?: unknown) =>
            key in settings ? settings[key] : defaultValue
        ),
        update: configUpdate,
    });
    (vscode.workspace.onDidChangeConfiguration as jest.Mock).mockImplementation(
        (listener: (e: vscode.ConfigurationChangeEvent) => void) => {
            onConfigChange = listener;
            return { dispose: jest.fn() };
        }
    );
    mockGetRegisteredTypes.mockReturnValue(['get-components-data', 'create-project']);
});

describe('the offer to save block-library defaults', () => {
    it('offers the tip, naming the state key and both actions', () => {
        const { comm } = wireUp();

        comm.handlerFor('offer-save-block-library-defaults')?.({
            selectedLibraries: ['isle5'],
        });

        expect(mockShowOneTimeTip).toHaveBeenCalledTimes(1);
        expect(mockShowOneTimeTip.mock.calls[0][1]).toMatchObject({
            stateKey: 'blockLibraries.defaultsTipShown',
            actions: ['Save as Defaults', 'Open Settings'],
        });
    });

    it('does not offer the tip when no library was selected', () => {
        const { comm } = wireUp();

        const result = comm.handlerFor('offer-save-block-library-defaults')?.({
            selectedLibraries: [],
        });

        expect(mockShowOneTimeTip).not.toHaveBeenCalled();
        expect(result).toEqual({ success: true });
    });

    it('does not offer the tip when the payload names no libraries at all', () => {
        const { comm } = wireUp();

        const result = comm.handlerFor('offer-save-block-library-defaults')?.({});

        expect(mockShowOneTimeTip).not.toHaveBeenCalled();
        expect(result).toEqual({ success: true });
    });

    it('does not offer the tip when there is no payload', () => {
        const { comm } = wireUp();

        const result = comm.handlerFor('offer-save-block-library-defaults')?.(undefined);

        expect(mockShowOneTimeTip).not.toHaveBeenCalled();
        expect(result).toEqual({ success: true });
    });

    it('answers the webview once the tip has been offered', () => {
        const { comm } = wireUp();

        const result = comm.handlerFor('offer-save-block-library-defaults')?.({
            selectedLibraries: ['isle5'],
        });

        expect(result).toEqual({ success: true });
    });

    it('writes the selection to the global setting when the SC saves it', () => {
        const { comm } = wireUp();
        comm.handlerFor('offer-save-block-library-defaults')?.({
            selectedLibraries: ['isle5', 'aem-boilerplate'],
        });

        clickTipAction('Save as Defaults');

        expect(configUpdate).toHaveBeenCalledWith(
            'blockLibraries.defaults',
            ['isle5', 'aem-boilerplate'],
            vscode.ConfigurationTarget.Global
        );
    });

    it('opens the block-library settings when the SC asks for them instead', () => {
        const { comm } = wireUp();
        comm.handlerFor('offer-save-block-library-defaults')?.({ selectedLibraries: ['isle5'] });

        clickTipAction('Open Settings');

        expect(configUpdate).not.toHaveBeenCalled();
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'workbench.action.openSettings',
            'demoBuilder.blockLibraries'
        );
    });

    it('does nothing when the notification is dismissed', () => {
        const { comm } = wireUp();
        comm.handlerFor('offer-save-block-library-defaults')?.({ selectedLibraries: ['isle5'] });

        clickTipAction('');

        expect(configUpdate).not.toHaveBeenCalled();
        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
            'workbench.action.openSettings',
            'demoBuilder.blockLibraries'
        );
    });
});

describe('the shortcut to the custom-library setting', () => {
    it('opens settings filtered to the custom block libraries', () => {
        const { comm } = wireUp();

        const result = comm.handlerFor('open-block-library-settings')?.(undefined);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'workbench.action.openSettings',
            'demoBuilder.blockLibraries.custom'
        );
        expect(result).toEqual({ success: true });
    });
});

describe('the auto-registered handler types', () => {
    it('registers one streaming handler per type the registry declares', () => {
        const { comm } = wireUp();

        expect(comm.onStreaming).toHaveBeenCalledTimes(2);
        expect(comm.streamingHandlerFor('get-components-data')).toBeDefined();
        expect(comm.streamingHandlerFor('create-project')).toBeDefined();
    });

    it('registers nothing when the registry declares no types', () => {
        mockGetRegisteredTypes.mockReturnValue([]);

        const { comm } = wireUp();

        expect(comm.onStreaming).not.toHaveBeenCalled();
    });

    it('dispatches a message to the registry under its own type', async () => {
        const { comm } = wireUp();

        await comm.streamingHandlerFor('create-project')?.({ projectName: 'demo' });

        expect(mockDispatchHandler).toHaveBeenCalledWith(
            projectCreationHandlers,
            expect.objectContaining({ sharedState: expect.any(Object) }),
            'create-project',
            { projectName: 'demo' }
        );
    });
});

describe('the settings listener', () => {
    /** A change event reporting only `section` as affected. */
    function changed(section: string): vscode.ConfigurationChangeEvent {
        return {
            affectsConfiguration: (s: string) => s === section,
        } as vscode.ConfigurationChangeEvent;
    }

    it('pushes the parsed custom libraries when that setting changes', () => {
        const { sendMessage } = wireUp();
        settings['blockLibraries.custom'] = ['https://github.com/owner/isle5'];

        onConfigChange?.(changed('demoBuilder.blockLibraries.custom'));

        expect(sendMessage).toHaveBeenCalledWith('customBlockLibraryDefaultsUpdated', {
            customBlockLibraryDefaults: [
                { name: 'Isle5', source: { owner: 'owner', repo: 'isle5', branch: 'main' } },
            ],
        });
    });

    it('pushes an empty list when the custom setting is cleared', () => {
        const { sendMessage } = wireUp();

        onConfigChange?.(changed('demoBuilder.blockLibraries.custom'));

        expect(sendMessage).toHaveBeenCalledWith('customBlockLibraryDefaultsUpdated', {
            customBlockLibraryDefaults: [],
        });
    });

    it('pushes the default library ids when that setting changes', () => {
        const { sendMessage } = wireUp();
        settings['blockLibraries.defaults'] = ['isle5'];

        onConfigChange?.(changed('demoBuilder.blockLibraries.defaults'));

        expect(sendMessage).toHaveBeenCalledWith('blockLibraryDefaultsUpdated', {
            blockLibraryDefaults: ['isle5'],
        });
    });

    it('pushes an empty list when the setting has never been set', () => {
        const { sendMessage } = wireUp();
        delete settings['blockLibraries.defaults'];

        onConfigChange?.(changed('demoBuilder.blockLibraries.defaults'));

        expect(sendMessage).toHaveBeenCalledWith('blockLibraryDefaultsUpdated', {
            blockLibraryDefaults: [],
        });
    });

    it('pushes an empty list when the defaults setting is cleared', () => {
        const { sendMessage } = wireUp();

        onConfigChange?.(changed('demoBuilder.blockLibraries.defaults'));

        expect(sendMessage).toHaveBeenCalledWith('blockLibraryDefaultsUpdated', {
            blockLibraryDefaults: [],
        });
    });

    it('pushes nothing for a setting it does not own', () => {
        const { sendMessage } = wireUp();

        onConfigChange?.(changed('demoBuilder.projectsViewMode'));

        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('registers the listener for disposal with the panel', () => {
        const command = new CreateProjectWebviewCommand(
            createMockExtensionContext({}, '/mock/extension/path'),
            createMockStateManager(),
            createMockLogger()
        );
        const add = jest.fn();
        internals(command).disposables = { add };

        internals(command).initializeMessageHandlers(fakeComm());

        expect(add).toHaveBeenCalledWith(
            expect.objectContaining({ dispose: expect.any(Function) })
        );
    });
});
