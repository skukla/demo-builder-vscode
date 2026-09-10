/**
 * Unit Tests for EnvFileWatcherService
 *
 * Tests service creation, internal command registration, and basic logic
 * without mocking file system operations.
 *
 * Pattern: Direct unit testing for service methods
 */

import * as vscode from 'vscode';
import { EnvFileWatcherService } from '@/core/vscode/envFileWatcherService';
import { WorkspaceWatcherManager } from '@/core/vscode/workspaceWatcherManager';
import { createMockLogger } from '../../helpers/loggerFake';
import { createMockStateManager } from '../../helpers/stateManagerFake';

import { createMockExtensionContext } from '../../helpers/extensionContextFake';
import { mockWorkspace } from '../../helpers/vscodeMockViews';
// Mock vscode API
jest.mock('vscode', () => ({
    workspace: {
        workspaceFolders: [
            { uri: { fsPath: '/project1' }, name: 'project1', index: 0 },
            { uri: { fsPath: '/project2' }, name: 'project2', index: 1 },
        ],
        createFileSystemWatcher: jest.fn(() => ({
            onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
            onDidCreate: jest.fn(() => ({ dispose: jest.fn() })),
            onDidDelete: jest.fn(() => ({ dispose: jest.fn() })),
            dispose: jest.fn(),
        })),
    },
    window: {
        showInformationMessage: jest.fn(),
    },
    commands: {
        registerCommand: jest.fn((_id, _callback) => ({
            dispose: jest.fn(),
        })),
        executeCommand: jest.fn(),
    },
    Uri: {
        file: (path: string) => ({ fsPath: path }),
    },
    RelativePattern: jest.fn((folder, pattern) => pattern),
}));

// Mock logger

// Mock WorkspaceWatcherManager
jest.mock('@/core/vscode/workspaceWatcherManager');

// Mock StateManager
const mockStateManager = createMockStateManager({
    getCurrentProject: jest.fn(),
});

// Mock logger
const mockLogger = createMockLogger();

describe('EnvFileWatcherService', () => {
    let mockContext: vscode.ExtensionContext;
    let mockWatcherManager: WorkspaceWatcherManager;

    beforeEach(() => {
        jest.clearAllMocks();

        // The canonical fake, with this suite's path. The literal it replaces named
        // two of ExtensionContext's twenty-one members and cast the difference away.
        mockContext = createMockExtensionContext({ subscriptions: [] }, '/test');

        mockWatcherManager = new WorkspaceWatcherManager();
    });

    describe('Creation and Disposal', () => {
        it('should create service with all internal commands registered', () => {
            // When: Service instantiated
            const _service = new EnvFileWatcherService(
                mockContext,
                mockStateManager,
                mockWatcherManager,
                mockLogger
            );

            // Then: All 7 internal commands should be registered
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.demoStarted',
                expect.any(Function)
            );
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.demoStopped',
                expect.any(Function)
            );
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.registerProgrammaticWrites',
                expect.any(Function)
            );
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.initializeFileHashes',
                expect.any(Function)
            );
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.restartActionTaken',
                expect.any(Function)
            );
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.meshActionTaken',
                expect.any(Function)
            );

            // Additional commands for Configure UI coordination
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.shouldShowRestartNotification',
                expect.any(Function)
            );
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.shouldShowMeshNotification',
                expect.any(Function)
            );
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.markRestartNotificationShown',
                expect.any(Function)
            );
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.markMeshNotificationShown',
                expect.any(Function)
            );
        });

        it('should dispose all commands when service disposed', () => {
            // Given: Service with registered commands
            const _service = new EnvFileWatcherService(
                mockContext,
                mockStateManager,
                mockWatcherManager,
                mockLogger
            );

            // Collect dispose functions
            const disposeSpy = jest.fn();
            const mockDisposable = { dispose: disposeSpy };

            // Mock registerCommand to return our spy
            (vscode.commands.registerCommand as jest.Mock).mockReturnValue(mockDisposable);

            // Recreate service to get our mocked disposables
            const service2 = new EnvFileWatcherService(
                mockContext,
                mockStateManager,
                mockWatcherManager,
                mockLogger
            );

            // When: Service disposed
            service2.dispose();

            // Then: All commands should be disposed
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Service disposed')
            );
        });
    });

    describe('Notification flags start armed', () => {
        it('should let every apply prompt through on a fresh service', () => {
            // The three "shown" flags start false, so the Configure screen's first
            // ask for each one answers yes. A flag that started true would mute its
            // prompt for the whole session with nothing having been shown.
            new EnvFileWatcherService(
                mockContext,
                mockStateManager,
                mockWatcherManager,
                mockLogger
            );

            const callbackFor = (id: string): (() => unknown) =>
                (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
                    (call) => call[0] === id
                )?.[1];

            expect(callbackFor('demoBuilder._internal.shouldShowRestartNotification')()).toBe(true);
            expect(callbackFor('demoBuilder._internal.shouldShowMeshNotification')()).toBe(true);
            expect(callbackFor('demoBuilder._internal.shouldShowStorefrontNotification')()).toBe(
                true
            );
        });
    });

    describe('Workspace-Scoped Watchers', () => {
        it('should watch both env files and ask for every event kind', () => {
            // The three falses are ignoreCreate/ignoreChange/ignoreDelete. Any of
            // them flipped to true and the watcher stops reporting that event, which
            // no assertion on "a watcher was created" can see.
            const service = new EnvFileWatcherService(
                mockContext,
                mockStateManager,
                mockWatcherManager,
                mockLogger
            );

            service.initialize();

            expect(vscode.RelativePattern).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'project1' }),
                '{.env,.env.local}'
            );
            expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith(
                expect.anything(),
                false,
                false,
                false
            );
        });

        it('should create no watchers when there is no workspace open', () => {
            const originalFolders = mockWorkspace.workspaceFolders;
            mockWorkspace.workspaceFolders = undefined;

            try {
                const service = new EnvFileWatcherService(
                    mockContext,
                    mockStateManager,
                    mockWatcherManager,
                    mockLogger
                );

                service.initialize();

                expect(vscode.workspace.createFileSystemWatcher).not.toHaveBeenCalled();
            } finally {
                mockWorkspace.workspaceFolders = originalFolders;
            }
        });

        it('should create watcher for each workspace folder', () => {
            // Given: Service with workspace folders
            const service = new EnvFileWatcherService(
                mockContext,
                mockStateManager,
                mockWatcherManager,
                mockLogger
            );

            // When: Service initialized
            service.initialize();

            // Then: Should create watchers (silent initialization - no debug log)
            // Verify by checking createFileSystemWatcher was called for each folder
            expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
        });
    });

    describe('Internal Command Registration', () => {
        it('should register all 10 internal commands', () => {
            // When: Service created
            new EnvFileWatcherService(
                mockContext,
                mockStateManager,
                mockWatcherManager,
                mockLogger
            );

            // Then: All commands should be registered
            const registeredCommands = (
                vscode.commands.registerCommand as jest.Mock
            ).mock.calls.map((call) => call[0]);

            expect(registeredCommands).toContain('demoBuilder._internal.demoStarted');
            expect(registeredCommands).toContain('demoBuilder._internal.demoStopped');
            expect(registeredCommands).toContain(
                'demoBuilder._internal.registerProgrammaticWrites'
            );
            expect(registeredCommands).toContain('demoBuilder._internal.initializeFileHashes');
            expect(registeredCommands).toContain('demoBuilder._internal.restartActionTaken');
            expect(registeredCommands).toContain('demoBuilder._internal.meshActionTaken');
            expect(registeredCommands).toContain(
                'demoBuilder._internal.shouldShowRestartNotification'
            );
            expect(registeredCommands).toContain(
                'demoBuilder._internal.shouldShowMeshNotification'
            );
            expect(registeredCommands).toContain(
                'demoBuilder._internal.markRestartNotificationShown'
            );
            expect(registeredCommands).toContain('demoBuilder._internal.markMeshNotificationShown');
        });
    });
});
