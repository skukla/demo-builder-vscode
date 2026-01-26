/**
 * Unit Tests for BaseCommand Disposal Support
 *
 * Tests disposal infrastructure added to BaseCommand:
 * - DisposableStore property initialization
 * - dispose() method delegation
 * - Idempotent disposal (safe to call multiple times)
 * - createTerminal() integration with disposables
 * - Subclass inheritance of disposal support
 * - vscode.Disposable interface compliance
 */

import * as vscode from 'vscode';
import { BaseCommand } from '@/core/base/baseCommand';
import { DisposableStore } from '@/core/utils/disposableStore';

// Mock logger
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

// Mock VS Code API
jest.mock('vscode', () => ({
    window: {
        createTerminal: jest.fn(() => ({
            name: 'test',
            processId: Promise.resolve(1234),
            dispose: jest.fn(),
            sendText: jest.fn(),
            show: jest.fn(),
        })),
        setStatusBarMessage: jest.fn(),
        withProgress: jest.fn((options, task) => task({ report: jest.fn() })),
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showWarningMessage: jest.fn(),
    },
    ProgressLocation: {
        Notification: 15,
    },
    Uri: {
        file: (path: string) => ({ fsPath: path }),
    },
}));

// Concrete test command (BaseCommand is abstract)
class TestCommand extends BaseCommand {
    public async execute(): Promise<void> {
        // Test implementation
    }

    // Expose protected disposables for testing
    public getDisposables(): DisposableStore {
        return (this as any).disposables;
    }

    // Expose protected createTerminal for testing
    public testCreateTerminal(name: string): vscode.Terminal {
        return (this as any).createTerminal(name);
    }
}

describe('BaseCommand Disposal Support', () => {
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: any;
    let mockLogger: any;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Create mock dependencies
        mockContext = {
            subscriptions: [],
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
            },
        } as any;

        mockStateManager = {
            getCurrentProject: jest.fn(),
            setState: jest.fn(),
        };

        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
        };
    });

    describe('DisposableStore Initialization', () => {
        it('should initialize disposables property', () => {
            const command = new TestCommand(
                mockContext,
                mockStateManager,
                mockLogger,
            );

            const disposables = command.getDisposables();

            expect(disposables).toBeDefined();
            expect(disposables).toBeInstanceOf(DisposableStore);
        });

        it('should initialize disposables as empty store', () => {
            const command = new TestCommand(
                mockContext,
                mockStateManager,
                mockLogger,
            );

            const disposables = command.getDisposables();

            expect(disposables.count).toBe(0);
            expect(disposables.disposed).toBe(false);
        });
    });

    describe('Dispose Method', () => {
        it('should call DisposableStore.dispose()', () => {
            const command = new TestCommand(
                mockContext,
                mockStateManager,
                mockLogger,
            );

            const disposables = command.getDisposables();
            const disposeSpy = jest.spyOn(disposables, 'dispose');

            command.dispose();

            expect(disposeSpy).toHaveBeenCalledTimes(1);
        });

        it('should dispose all added resources', () => {
            const command = new TestCommand(
                mockContext,
                mockStateManager,
                mockLogger,
            );

            const mockDisposable1 = { dispose: jest.fn() };
            const mockDisposable2 = { dispose: jest.fn() };

            const disposables = command.getDisposables();
            disposables.add(mockDisposable1);
            disposables.add(mockDisposable2);

            command.dispose();

            expect(mockDisposable1.dispose).toHaveBeenCalledTimes(1);
            expect(mockDisposable2.dispose).toHaveBeenCalledTimes(1);
        });

        it('should be idempotent (safe to call multiple times)', () => {
            const command = new TestCommand(
                mockContext,
                mockStateManager,
                mockLogger,
            );

            const mockDisposable = { dispose: jest.fn() };
            command.getDisposables().add(mockDisposable);

            command.dispose();
            command.dispose();
            command.dispose();

            // Disposable should only be disposed once (DisposableStore is idempotent)
            expect(mockDisposable.dispose).toHaveBeenCalledTimes(1);
            expect(() => command.dispose()).not.toThrow();
        });
    });

    describe('CreateTerminal Integration', () => {
        it('should add terminal to disposables', () => {
            const command = new TestCommand(
                mockContext,
                mockStateManager,
                mockLogger,
            );

            const disposables = command.getDisposables();
            const addSpy = jest.spyOn(disposables, 'add');

            const terminal = command.testCreateTerminal('Test Terminal');

            expect(vscode.window.createTerminal).toHaveBeenCalled();
            expect(addSpy).toHaveBeenCalledWith(terminal);
        });

        it('should NOT add terminal to context.subscriptions', () => {
            const command = new TestCommand(
                mockContext,
                mockStateManager,
                mockLogger,
            );

            const initialLength = mockContext.subscriptions.length;

            command.testCreateTerminal('Test Terminal');

            // Should NOT add to context.subscriptions (legacy pattern removed)
            expect(mockContext.subscriptions.length).toBe(initialLength);
        });

        it('should dispose terminal when command disposed', () => {
            const command = new TestCommand(
                mockContext,
                mockStateManager,
                mockLogger,
            );

            const terminal = command.testCreateTerminal('Test Terminal');

            command.dispose();

            expect(terminal.dispose).toHaveBeenCalledTimes(1);
        });
    });

    describe('Subclass Inheritance', () => {
        it('should allow subclass to add resources', () => {
            class SubCommand extends BaseCommand {
                public async execute(): Promise<void> {
                    // Add mock resource
                    (this as any).disposables.add({
                        dispose: jest.fn(),
                    });
                }
            }

            const command = new SubCommand(
                mockContext,
                mockStateManager,
                mockLogger,
            );

            expect(() => command.execute()).not.toThrow();
        });

        it('should dispose subclass resources via parent', () => {
            const mockDisposable = {
                dispose: jest.fn(),
            };

            class SubCommand extends BaseCommand {
                public async execute(): Promise<void> {
                    (this as any).disposables.add(mockDisposable);
                }

                public getDisposables() {
                    return (this as any).disposables;
                }
            }

            const command = new SubCommand(
                mockContext,
                mockStateManager,
                mockLogger,
            );

            command.execute();
            command.dispose();

            expect(mockDisposable.dispose).toHaveBeenCalled();
        });

        it('should allow subclass to override dispose() and call super', () => {
            const subclassCleanupSpy = jest.fn();
            const mockDisposable = { dispose: jest.fn() };

            class SubCommand extends BaseCommand {
                public async execute(): Promise<void> {
                    (this as any).disposables.add(mockDisposable);
                }

                public override dispose(): void {
                    subclassCleanupSpy();
                    super.dispose();
                }
            }

            const command = new SubCommand(
                mockContext,
                mockStateManager,
                mockLogger,
            );

            command.execute();
            command.dispose();

            expect(subclassCleanupSpy).toHaveBeenCalled();
            expect(mockDisposable.dispose).toHaveBeenCalled();
        });
    });

    describe('vscode.Disposable Interface', () => {
        it('should implement vscode.Disposable interface', () => {
            const command = new TestCommand(
                mockContext,
                mockStateManager,
                mockLogger,
            );

            // Should have dispose method
            expect(typeof command.dispose).toBe('function');

            // Should be usable as Disposable
            const disposable: vscode.Disposable = command;
            expect(disposable).toBeDefined();
        });

        it('should be pushable to context.subscriptions', () => {
            const command = new TestCommand(
                mockContext,
                mockStateManager,
                mockLogger,
            );

            // Should be compatible with VS Code's subscription pattern
            expect(() => {
                mockContext.subscriptions.push(command);
            }).not.toThrow();

            expect(mockContext.subscriptions).toContain(command);
        });
    });
});
