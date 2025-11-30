/**
 * StopDemoCommand - Process Discovery Tests
 *
 * Tests process discovery and termination logic:
 * - Find PID from port using lsof
 * - Handle multiple PIDs on port (use first)
 * - Handle invalid lsof output gracefully
 * - Validate port number before lsof execution (security)
 *
 * ALL TESTS ARE FULLY MOCKED - No real process spawning or port binding.
 */

import { StopDemoCommand } from '@/features/lifecycle/commands/stopDemo';
import { ProcessCleanup } from '@/core/shell/processCleanup';
import { ServiceLocator } from '@/core/di';
import { StateManager } from '@/core/state';
import { StatusBarManager } from '@/core/vscode/StatusBarManager';
import { Logger } from '@/core/logging';
import * as vscode from 'vscode';

// Mock ProcessCleanup
jest.mock('@/core/shell/processCleanup');
const MockProcessCleanup = ProcessCleanup as jest.MockedClass<typeof ProcessCleanup>;

// Mock ServiceLocator for CommandExecutor (lsof commands)
const mockCommandExecutor = {
    execute: jest.fn(),
};
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(() => mockCommandExecutor),
        reset: jest.fn(),
    },
}));

// Mock logging
jest.mock('@/core/logging', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    })),
    getLogger: jest.fn(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    })),
}));

describe('StopDemoCommand - Process Discovery', () => {
    let command: StopDemoCommand;
    let mockContext: jest.Mocked<vscode.ExtensionContext>;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockStatusBar: jest.Mocked<StatusBarManager>;
    let mockLogger: jest.Mocked<Logger>;
    let mockProcessCleanup: jest.Mocked<ProcessCleanup>;
    let mockTerminal: { name: string; dispose: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock terminal
        mockTerminal = {
            name: 'test-project - Frontend',
            dispose: jest.fn(),
        };
        (vscode.window as any).terminals = [mockTerminal];

        // Setup mock ProcessCleanup instance
        mockProcessCleanup = {
            killProcessTree: jest.fn().mockResolvedValue(undefined),
        } as any;
        MockProcessCleanup.mockImplementation(() => mockProcessCleanup);

        // Setup mock CommandExecutor for lsof
        mockCommandExecutor.execute.mockResolvedValue({
            code: 0,
            stdout: '12345',
            stderr: '',
        });

        // Mock extension context
        mockContext = {
            subscriptions: [],
            extensionPath: '/mock/extension/path',
            globalState: {
                get: jest.fn(),
                update: jest.fn().mockResolvedValue(undefined),
            },
        } as any;

        // Mock state manager
        mockStateManager = {
            getCurrentProject: jest.fn().mockResolvedValue({
                name: 'test-project',
                path: '/test/path',
                status: 'running',
                created: new Date(),
                lastModified: new Date(),
                componentInstances: {
                    'citisignal-nextjs': {
                        id: 'citisignal-nextjs',
                        name: 'CitiSignal Frontend',
                        status: 'running',
                        port: 3000,
                    },
                },
            }),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as any;

        // Mock status bar
        mockStatusBar = {
            updateProject: jest.fn(),
            clear: jest.fn(),
        } as any;

        // Mock logger
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        } as any;

        // Mock vscode.window.withProgress to execute task immediately
        (vscode.window as any).withProgress = jest.fn().mockImplementation(
            async (_options: any, task: any) => {
                return await task({ report: jest.fn() });
            }
        );

        // Mock vscode.window.setStatusBarMessage
        (vscode.window as any).setStatusBarMessage = jest.fn();

        // Mock vscode.commands.executeCommand
        (vscode.commands as any).executeCommand = jest.fn().mockResolvedValue(undefined);

        // Mock vscode.workspace.getConfiguration
        (vscode.workspace as any).getConfiguration = jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue(3000),
        });

        // Create command instance
        command = new StopDemoCommand(
            mockContext,
            mockStateManager,
            mockStatusBar,
            mockLogger
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Test 2.1: Find Process by Port', () => {
        it('should discover PID from port number using lsof', async () => {
            // Given: Process listening on port 3000
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: '12345',
                stderr: '',
            });

            // When: stopDemo called (which triggers findProcessByPort internally)
            await command.execute();

            // Then: Executes `lsof -ti:3000`
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.stringContaining('lsof -ti:3000'),
                expect.any(Object)
            );

            // And: killProcessTree called with the discovered PID
            expect(mockProcessCleanup.killProcessTree).toHaveBeenCalledWith(12345, 'SIGTERM');
        });
    });

    describe('Test 2.2: Handle Multiple PIDs on Port', () => {
        it('should use first PID when lsof returns multiple', async () => {
            // Given: lsof returns "12345\n12346\n12347" (parent + children)
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: '12345\n12346\n12347',
                stderr: '',
            });

            // When: stopDemo command executes
            await command.execute();

            // Then: Returns first PID (parent process)
            // ProcessCleanup handles tree (kills children)
            expect(mockProcessCleanup.killProcessTree).toHaveBeenCalledWith(12345, 'SIGTERM');
        });
    });

    describe('Test 2.3: Handle Invalid lsof Output', () => {
        it('should gracefully handle lsof errors', async () => {
            // Given: lsof command fails (process already dead)
            mockCommandExecutor.execute.mockResolvedValue({
                code: 1,
                stdout: '',
                stderr: 'lsof: command failed',
            });

            // When: stopDemo command executes
            await command.execute();

            // Then: Returns null (no PID found)
            // No exception thrown
            // Continues with terminal dispose only
            expect(mockProcessCleanup.killProcessTree).not.toHaveBeenCalled();
            expect(mockTerminal.dispose).toHaveBeenCalled();
        });

        it('should handle non-numeric lsof output', async () => {
            // Given: lsof returns non-numeric output
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: 'not-a-pid',
                stderr: '',
            });

            // When: stopDemo command executes
            await command.execute();

            // Then: ProcessCleanup not called (invalid PID)
            expect(mockProcessCleanup.killProcessTree).not.toHaveBeenCalled();
            expect(mockTerminal.dispose).toHaveBeenCalled();
        });
    });

    describe('Test 2.4: Validate Port Number Before lsof', () => {
        it('should not execute lsof for invalid port (negative)', async () => {
            // Given: Invalid port (negative number)
            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'test-project',
                path: '/test/path',
                status: 'running',
                created: new Date(),
                lastModified: new Date(),
                componentInstances: {
                    'citisignal-nextjs': {
                        id: 'citisignal-nextjs',
                        name: 'CitiSignal Frontend',
                        status: 'running',
                        port: -1, // Invalid
                    },
                },
            });

            // When: stopDemo command executes
            await command.execute();

            // Then: lsof NOT executed (security)
            expect(mockCommandExecutor.execute).not.toHaveBeenCalledWith(
                expect.stringContaining('lsof'),
                expect.any(Object)
            );
        });

        it('should not execute lsof for invalid port (too high)', async () => {
            // Given: Invalid port (> 65535)
            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'test-project',
                path: '/test/path',
                status: 'running',
                created: new Date(),
                lastModified: new Date(),
                componentInstances: {
                    'citisignal-nextjs': {
                        id: 'citisignal-nextjs',
                        name: 'CitiSignal Frontend',
                        status: 'running',
                        port: 70000, // Invalid
                    },
                },
            });

            // When: stopDemo command executes
            await command.execute();

            // Then: lsof NOT executed (security)
            expect(mockCommandExecutor.execute).not.toHaveBeenCalledWith(
                expect.stringContaining('lsof'),
                expect.any(Object)
            );
        });

        it('should not execute lsof for NaN port', async () => {
            // Given: Port is NaN (and no default port configured)
            // Override workspace.getConfiguration to return NaN for defaultPort
            (vscode.workspace as any).getConfiguration = jest.fn().mockReturnValue({
                get: jest.fn().mockReturnValue(NaN),
            });

            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'test-project',
                path: '/test/path',
                status: 'running',
                created: new Date(),
                lastModified: new Date(),
                componentInstances: {
                    'citisignal-nextjs': {
                        id: 'citisignal-nextjs',
                        name: 'CitiSignal Frontend',
                        status: 'running',
                        port: undefined, // No port set, will use defaultPort
                    },
                },
            });

            // When: stopDemo command executes
            await command.execute();

            // Then: lsof NOT executed (security)
            expect(mockCommandExecutor.execute).not.toHaveBeenCalledWith(
                expect.stringContaining('lsof'),
                expect.any(Object)
            );
        });
    });
});
