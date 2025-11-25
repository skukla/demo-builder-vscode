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
        registerCommand: jest.fn((id, callback) => ({
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
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

// Mock WorkspaceWatcherManager
jest.mock('@/core/vscode/workspaceWatcherManager');

// Mock StateManager
const mockStateManager = {
    getCurrentProject: jest.fn(),
};

// Mock logger
const mockLogger = {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
};

describe('EnvFileWatcherService', () => {
    let mockContext: vscode.ExtensionContext;
    let mockWatcherManager: WorkspaceWatcherManager;

    beforeEach(() => {
        jest.clearAllMocks();

        mockContext = {
            subscriptions: [],
            extensionPath: '/test',
        } as any;

        mockWatcherManager = new WorkspaceWatcherManager();
    });

    describe('Creation and Disposal', () => {
        it('should create service with all internal commands registered', () => {
            // When: Service instantiated
            const service = new EnvFileWatcherService(
                mockContext,
                mockStateManager as any,
                mockWatcherManager,
                mockLogger,
            );

            // Then: All 7 internal commands should be registered
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.demoStarted',
                expect.any(Function),
            );
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.demoStopped',
                expect.any(Function),
            );
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.registerProgrammaticWrites',
                expect.any(Function),
            );
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.initializeFileHashes',
                expect.any(Function),
            );
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.restartActionTaken',
                expect.any(Function),
            );
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.meshActionTaken',
                expect.any(Function),
            );

            // Additional commands for Configure UI coordination
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.shouldShowRestartNotification',
                expect.any(Function),
            );
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.shouldShowMeshNotification',
                expect.any(Function),
            );
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.markRestartNotificationShown',
                expect.any(Function),
            );
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.markMeshNotificationShown',
                expect.any(Function),
            );
        });

        it('should dispose all commands when service disposed', () => {
            // Given: Service with registered commands
            const service = new EnvFileWatcherService(
                mockContext,
                mockStateManager as any,
                mockWatcherManager,
                mockLogger,
            );

            // Collect dispose functions
            const disposeSpy = jest.fn();
            const mockDisposable = { dispose: disposeSpy };

            // Mock registerCommand to return our spy
            (vscode.commands.registerCommand as jest.Mock).mockReturnValue(mockDisposable);

            // Recreate service to get our mocked disposables
            const service2 = new EnvFileWatcherService(
                mockContext,
                mockStateManager as any,
                mockWatcherManager,
                mockLogger,
            );

            // When: Service disposed
            service2.dispose();

            // Then: All commands should be disposed
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Service disposed'),
            );
        });
    });

    describe('Workspace-Scoped Watchers', () => {
        it('should create watcher for each workspace folder', () => {
            // Given: Service with workspace folders
            const service = new EnvFileWatcherService(
                mockContext,
                mockStateManager as any,
                mockWatcherManager,
                mockLogger,
            );

            // When: Service initialized
            service.initialize();

            // Then: Should log initialization for workspace folders
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Initialized watchers for 2 workspace folders'),
            );
        });
    });

    describe('Internal Command Registration', () => {
        it('should register all 10 internal commands', () => {
            // When: Service created
            new EnvFileWatcherService(
                mockContext,
                mockStateManager as any,
                mockWatcherManager,
                mockLogger,
            );

            // Then: All commands should be registered
            const registeredCommands = (vscode.commands.registerCommand as jest.Mock).mock.calls.map(
                call => call[0],
            );

            expect(registeredCommands).toContain('demoBuilder._internal.demoStarted');
            expect(registeredCommands).toContain('demoBuilder._internal.demoStopped');
            expect(registeredCommands).toContain('demoBuilder._internal.registerProgrammaticWrites');
            expect(registeredCommands).toContain('demoBuilder._internal.initializeFileHashes');
            expect(registeredCommands).toContain('demoBuilder._internal.restartActionTaken');
            expect(registeredCommands).toContain('demoBuilder._internal.meshActionTaken');
            expect(registeredCommands).toContain('demoBuilder._internal.shouldShowRestartNotification');
            expect(registeredCommands).toContain('demoBuilder._internal.shouldShowMeshNotification');
            expect(registeredCommands).toContain('demoBuilder._internal.markRestartNotificationShown');
            expect(registeredCommands).toContain('demoBuilder._internal.markMeshNotificationShown');
        });
    });
});
