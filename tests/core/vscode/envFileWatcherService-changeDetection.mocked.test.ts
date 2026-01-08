/**
 * EnvFileWatcherService - Change Detection Tests (Mocked)
 *
 * Tests hash-based change detection and programmatic write suppression.
 *
 * Pattern: File System Mocking (Pattern 2)
 * Reference: .rptc/plans/resource-lifecycle-management/TESTING-MOCKING-PATTERNS.md
 */

// Mock logger FIRST (before any imports that might use it)
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

// Import mock exports from testUtils - must be before vscode mock for proper reference
import {
    mockWatchers,
    mockFileContents,
    mockStateManager,
    mockLogger,
    resetMocks,
    commandCallbacks,
} from './envFileWatcherService.testUtils';

// Mock vscode API - must be in test file for proper hoisting
jest.mock('vscode', () => {
    const actual = jest.requireActual('vscode');
    return {
        ...actual,
        workspace: {
            workspaceFolders: [
                { uri: { fsPath: '/project1', toString: () => 'file:///project1' }, name: 'project1', index: 0 },
            ],
            createFileSystemWatcher: jest.fn((pattern: string) => {
                const watcher = {
                    pattern,
                    _disposed: false,
                    _listeners: {
                        onCreate: [] as Function[],
                        onChange: [] as Function[],
                        onDelete: [] as Function[]
                    },
                    onDidCreate: jest.fn((listener) => {
                        watcher._listeners.onCreate.push(listener);
                        return { dispose: () => {} };
                    }),
                    onDidChange: jest.fn((listener) => {
                        watcher._listeners.onChange.push(listener);
                        return { dispose: () => {} };
                    }),
                    onDidDelete: jest.fn((listener) => {
                        watcher._listeners.onDelete.push(listener);
                        return { dispose: () => {} };
                    }),
                    dispose: jest.fn(() => {
                        watcher._disposed = true;
                        const { mockWatchers } = require('./envFileWatcherService.testUtils');
                        const idx = mockWatchers.indexOf(watcher);
                        if (idx !== -1) mockWatchers.splice(idx, 1);
                    }),
                    _simulateChange: (uri: any) => {
                        watcher._listeners.onChange.forEach((l: Function) => l(uri));
                    }
                };

                const { mockWatchers } = require('./envFileWatcherService.testUtils');
                mockWatchers.push(watcher);
                return watcher;
            })
        },
        window: {
            showInformationMessage: jest.fn(() => Promise.resolve(undefined)),
        },
        commands: {
            registerCommand: jest.fn((id, callback) => {
                const { commandCallbacks } = require('./envFileWatcherService.testUtils');
                commandCallbacks[id] = callback;
                return { dispose: jest.fn() };
            }),
            executeCommand: jest.fn((id, ...args) => {
                const { commandCallbacks } = require('./envFileWatcherService.testUtils');
                const callback = commandCallbacks[id];
                if (callback) {
                    return Promise.resolve(callback(...args));
                }
                return Promise.resolve();
            }),
        },
        Uri: {
            file: (path: string) => ({
                fsPath: path,
                toString: () => `file://${path}`
            }),
        },
        RelativePattern: jest.fn().mockImplementation((folder, pattern) => pattern),
    };
});

// Mock fs.promises
jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn((filePath: string) => {
            const { mockFileContents } = require('./envFileWatcherService.testUtils');
            const content = mockFileContents.get(filePath);
            if (content === undefined) {
                return Promise.reject(new Error(`File not found: ${filePath}`));
            }
            return Promise.resolve(content);
        }),
    },
}));

// Mock WorkspaceWatcherManager
jest.mock('@/core/vscode/workspaceWatcherManager', () => {
    return {
        WorkspaceWatcherManager: jest.fn().mockImplementation(() => ({
            registerWatcher: jest.fn(),
            dispose: jest.fn(),
        })),
    };
});

import * as vscode from 'vscode';
import { EnvFileWatcherService } from '@/core/vscode/envFileWatcherService';
import { WorkspaceWatcherManager } from '@/core/vscode/workspaceWatcherManager';

describe('EnvFileWatcherService - Change Detection (Mocked)', () => {
    let mockContext: vscode.ExtensionContext;
    let mockWatcherManager: WorkspaceWatcherManager;
    let service: EnvFileWatcherService;

    beforeEach(() => {
        resetMocks();

        mockContext = {
            subscriptions: [],
            extensionPath: '/test',
        } as any;

        mockWatcherManager = new WorkspaceWatcherManager();

        service = new EnvFileWatcherService(
            mockContext,
            mockStateManager as any,
            mockWatcherManager,
            mockLogger,
        );

        service.initialize();
    });

    afterEach(() => {
        service?.dispose();
    });

    describe('Hash-Based Change Detection', () => {
        it('should suppress notification when content unchanged (hash match)', async () => {
            // Given: File with known content
            const filePath = '/project1/.env';
            const content = 'API_KEY=test123';
            mockFileContents.set(filePath, content);

            // Initialize hash
            await vscode.commands.executeCommand(
                'demoBuilder._internal.initializeFileHashes',
                [filePath]
            );

            // Set demo as running
            mockStateManager.getCurrentProject.mockResolvedValue({
                status: 'running',
            });

            // When: File event fires with same content
            const uri = vscode.Uri.file(filePath);
            mockWatchers[0]._simulateChange(uri);

            // Wait for async processing
            await new Promise(resolve => process.nextTick(resolve));

            // Then: No notification shown
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Content unchanged'),
            );
        });

        it('should show notification when content actually changed (hash mismatch)', async () => {
            // Given: File with initial content
            const filePath = '/project1/.env';
            const initialContent = 'API_KEY=test123';
            mockFileContents.set(filePath, initialContent);

            // Initialize hash
            await vscode.commands.executeCommand(
                'demoBuilder._internal.initializeFileHashes',
                [filePath]
            );

            // Set demo as running
            mockStateManager.getCurrentProject.mockResolvedValue({
                status: 'running',
            });

            // When: File content changes
            const newContent = 'API_KEY=test456';
            mockFileContents.set(filePath, newContent);

            const uri = vscode.Uri.file(filePath);
            mockWatchers[0]._simulateChange(uri);

            // Wait for async processing
            await new Promise(resolve => process.nextTick(resolve));

            // Then: Notification shown
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('Environment configuration changed'),
                'Restart Demo',
            );
        });
    });

    describe('Programmatic Write Suppression', () => {
        it('should suppress notification for programmatic writes', async () => {
            // Given: File with content
            const filePath = '/project1/.env';
            const content = 'API_KEY=test123';
            mockFileContents.set(filePath, content);

            // Initialize hash
            await vscode.commands.executeCommand(
                'demoBuilder._internal.initializeFileHashes',
                [filePath]
            );

            // Register programmatic write
            await vscode.commands.executeCommand(
                'demoBuilder._internal.registerProgrammaticWrites',
                [filePath]
            );

            // Set demo as running
            mockStateManager.getCurrentProject.mockResolvedValue({
                status: 'running',
            });

            // When: File change event fires
            const newContent = 'API_KEY=test456';
            mockFileContents.set(filePath, newContent);

            const uri = vscode.Uri.file(filePath);
            mockWatchers[0]._simulateChange(uri);

            // Wait for async processing
            await new Promise(resolve => process.nextTick(resolve));

            // Then: No notification shown
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Ignoring programmatic write'),
            );
        });
    });
});
