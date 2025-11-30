/**
 * Unit Tests for BaseWebviewCommand Disposal Integration
 *
 * Tests disposal infrastructure migration from manual webviewDisposables array
 * to inherited DisposableStore from BaseCommand:
 * - Inherited DisposableStore usage (no manual array)
 * - Panel disposal listener tracking
 * - Theme change listener tracking
 * - dispose() delegation to super.dispose()
 * - communicationManager disposal
 * - Complete disposal flow (panel close)
 * - LIFO disposal ordering
 *
 * CRITICAL: All tests fully mocked (no real webviews) - safe for IDE execution
 */

import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { DisposableStore } from '@/core/utils/disposableStore';

// Mock panel state for disposal testing
let mockPanel: any;
let mockDisposeCallback: (() => void) | undefined;

// Mock logger
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

// Mock VS Code API with comprehensive webview support
jest.mock('vscode', () => ({
    window: {
        createWebviewPanel: jest.fn(() => {
            mockPanel = {
                webview: {
                    html: '',
                    postMessage: jest.fn().mockResolvedValue(true),
                    onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
                    asWebviewUri: jest.fn((uri: any) => uri),
                },
                onDidDispose: jest.fn((callback) => {
                    mockDisposeCallback = callback;
                    return { dispose: jest.fn() };
                }),
                dispose: jest.fn(() => {
                    if (mockDisposeCallback) {
                        mockDisposeCallback();
                    }
                }),
                reveal: jest.fn(),
                visible: true,
            };
            return mockPanel;
        }),
        onDidChangeActiveColorTheme: jest.fn((callback) => ({
            dispose: jest.fn(),
        })),
        setStatusBarMessage: jest.fn(),
        withProgress: jest.fn((options, task) => task({ report: jest.fn() })),
    },
    ViewColumn: {
        One: 1,
    },
    Uri: {
        file: (path: string) => ({ fsPath: path }),
    },
    ColorThemeKind: {
        Dark: 1,
        Light: 2,
    },
}));

// Mock WebviewCommunicationManager
jest.mock('@/core/communication', () => ({
    createWebviewCommunication: jest.fn().mockResolvedValue({
        on: jest.fn(),
        sendMessage: jest.fn().mockResolvedValue(undefined),
        request: jest.fn().mockResolvedValue({}),
        dispose: jest.fn(),
        incrementStateVersion: jest.fn(),
        getStateVersion: jest.fn().mockReturnValue(1),
    }),
}));

// Mock loading HTML utility
jest.mock('@/core/utils/loadingHTML', () => ({
    setLoadingState: jest.fn().mockResolvedValue(undefined),
}));

// Concrete test command (BaseWebviewCommand is abstract)
class TestWebviewCommand extends BaseWebviewCommand {
    public async execute(): Promise<void> {
        // Test implementation
        await this.testCreatePanel();
        await this.testInitComm();
    }

    protected getWebviewId(): string {
        return 'test-webview';
    }

    protected getWebviewTitle(): string {
        return 'Test Webview';
    }

    protected async getWebviewContent(): Promise<string> {
        return '<html><body>Test</body></html>';
    }

    protected initializeMessageHandlers(_comm: any): void {
        // Test implementation
    }

    protected async getInitialData(): Promise<unknown> {
        return { test: true };
    }

    protected getLoadingMessage(): string {
        return 'Loading...';
    }

    // Expose protected members for testing
    public getDisposables(): DisposableStore {
        return (this as any).disposables;
    }

    public async testCreatePanel(): Promise<vscode.WebviewPanel> {
        return await (this as any).createOrRevealPanel();
    }

    public async testInitComm() {
        return await (this as any).initializeCommunication();
    }

    public testGetPanel() {
        return (this as any).panel;
    }

    public testGetCommManager() {
        return (this as any).communicationManager;
    }
}

describe('BaseWebviewCommand Disposal', () => {
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: any;
    let mockStatusBar: any;
    let mockLogger: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockDisposeCallback = undefined;

        mockContext = {
            subscriptions: [],
            extensionPath: '/test',
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
            },
        } as any;

        mockStateManager = {
            getCurrentProject: jest.fn().mockResolvedValue({ name: 'test' }),
            saveProject: jest.fn().mockResolvedValue(undefined),
        };

        mockStatusBar = {
            update: jest.fn(),
        };

        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
        };
    });

    describe('Inherited DisposableStore', () => {
        it('should use inherited disposables property from BaseCommand', () => {
            const command = new TestWebviewCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger,
            );

            const disposables = command.getDisposables();

            expect(disposables).toBeDefined();
            expect(disposables).toBeInstanceOf(DisposableStore);
        });

        it('should NOT have separate webviewDisposables array', () => {
            const command = new TestWebviewCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger,
            );

            // Should not have webviewDisposables property
            expect((command as any).webviewDisposables).toBeUndefined();
        });
    });

    describe('Panel Disposal Listener', () => {
        it('should add panel disposal listener to disposables', async () => {
            const command = new TestWebviewCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger,
            );

            const disposables = command.getDisposables();
            const addSpy = jest.spyOn(disposables, 'add');

            await command.testCreatePanel();

            // Panel disposal listener should be added
            expect(addSpy).toHaveBeenCalled();
            expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
        });

        it('should dispose listener when command disposed', async () => {
            const command = new TestWebviewCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger,
            );

            await command.testCreatePanel();

            const mockDisposable = { dispose: jest.fn() };
            command.getDisposables().add(mockDisposable);

            command.dispose();

            expect(mockDisposable.dispose).toHaveBeenCalled();
        });
    });

    describe('Theme Listener', () => {
        it('should add theme listener to disposables', async () => {
            const command = new TestWebviewCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger,
            );

            const disposables = command.getDisposables();
            const countBefore = disposables.count;

            await command.testCreatePanel();
            await command.testInitComm();

            // Should have added theme listener
            expect(disposables.count).toBeGreaterThan(countBefore);
        });
    });

    describe('dispose() Coordination', () => {
        it('should call super.dispose()', () => {
            const command = new TestWebviewCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger,
            );

            const disposables = command.getDisposables();
            const disposeSpy = jest.spyOn(disposables, 'dispose');

            command.dispose();

            // Should call DisposableStore.dispose() via super.dispose()
            expect(disposeSpy).toHaveBeenCalled();
        });

        it('should dispose communicationManager', async () => {
            const command = new TestWebviewCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger,
            );

            await command.testCreatePanel();
            await command.testInitComm();

            const commManager = command.testGetCommManager();
            expect(commManager).toBeDefined();

            command.dispose();

            expect(commManager.dispose).toHaveBeenCalled();
            expect(command.testGetCommManager()).toBeUndefined();
        });
    });

    describe('Complete Disposal Flow', () => {
        it('should clear all resources on panel disposal', async () => {
            const command = new TestWebviewCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger,
            );

            await command.testCreatePanel();
            await command.testInitComm();

            // Add mock disposable
            const mockDisposable = { dispose: jest.fn() };
            command.getDisposables().add(mockDisposable);

            const commManager = command.testGetCommManager();

            // Trigger panel disposal
            mockPanel.dispose();

            // Should dispose communicationManager
            expect(commManager.dispose).toHaveBeenCalled();

            // Should dispose all registered resources
            expect(mockDisposable.dispose).toHaveBeenCalled();

            // Should clear panel reference
            expect(command.testGetPanel()).toBeUndefined();
        });
    });

    describe('LIFO Disposal Ordering', () => {
        it('should dispose resources in reverse order', () => {
            const command = new TestWebviewCommand(
                mockContext,
                mockStateManager,
                mockStatusBar,
                mockLogger,
            );

            const disposalOrder: number[] = [];

            const disposable1 = { dispose: () => disposalOrder.push(1) };
            const disposable2 = { dispose: () => disposalOrder.push(2) };
            const disposable3 = { dispose: () => disposalOrder.push(3) };

            command.getDisposables().add(disposable1);
            command.getDisposables().add(disposable2);
            command.getDisposables().add(disposable3);

            command.dispose();

            // Should dispose in reverse order (LIFO)
            expect(disposalOrder).toEqual([3, 2, 1]);
        });
    });
});
