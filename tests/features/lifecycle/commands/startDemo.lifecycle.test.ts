/**
 * StartDemoCommand - Lifecycle Tests
 *
 * Tests the complete start lifecycle with startup verification:
 * - Start demo waits for port to be in use before setting status to 'running'
 * - Graceful timeout if demo doesn't start within 30 seconds
 * - Early exit if demo already running
 * - Handles no project gracefully
 *
 * ALL TESTS ARE FULLY MOCKED - No real process spawning or port binding.
 */

import {
    StartDemoCommand,
    mockCommandExecutor,
    mockWindow,
    setupStartDemo,
} from './startDemo.testUtils';
import { ServiceLocator as _ServiceLocator } from '@/core/di/serviceLocator';
import type { StateManager } from '@/types/state';
import * as vscode from 'vscode';

describe('StartDemoCommand - Lifecycle', () => {
    let command: StartDemoCommand;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockTerminal: { name: string; dispose: jest.Mock; sendText: jest.Mock; show: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        ({ command, mockStateManager, mockTerminal } = setupStartDemo());

        mockCommandExecutor.isPortAvailable.mockResolvedValue(true);
        mockCommandExecutor.execute.mockResolvedValue({
            code: 0,
            stdout: '',
            stderr: '', duration: 0 });
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('Test 1.1: Start Demo Waits for Port', () => {
        it('should set status to running only after port is in use', async () => {
            // Given: Project exists with status 'ready'
            // Port 3000 is available initially, then becomes in use after polling
            let portCheckCount = 0;
            mockCommandExecutor.isPortAvailable.mockImplementation(async () => {
                portCheckCount++;
                // First 2 calls: port available (demo starting)
                // 3rd call: port in use (demo started)
                return portCheckCount < 3;
            });

            // Track status changes
            const statusChanges: string[] = [];
            mockStateManager.saveProject.mockImplementation(async (project: any) => {
                statusChanges.push(project.status);
            });

            // When: User executes startDemo command
            const executePromise = command.execute();

            // Advance timers to allow port polling
            await jest.advanceTimersByTimeAsync(3000);
            await executePromise;

            // Then: Status was set to 'starting' first
            expect(statusChanges).toContain('starting');

            // And: Status was set to 'running' after port detected in use
            expect(statusChanges).toContain('running');

            // And: waitForPortInUse was called (multiple isPortAvailable calls)
            expect(portCheckCount).toBeGreaterThanOrEqual(2);
        });
    });

    describe('Test 1.2: Start Demo Timeout on Slow Startup', () => {
        it('should show warning after startup timeout if demo does not start', async () => {
            // Given: Port never becomes in use (demo fails to start)
            mockCommandExecutor.isPortAvailable.mockResolvedValue(true); // Always available = never started

            // When: startDemo command waits for port
            const executePromise = command.execute();

            // Advance timers past the 30 second timeout
            await jest.advanceTimersByTimeAsync(35000);
            await executePromise;

            // Then: Warning shown to user after timeout
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining('timed out'),
                expect.anything()
            );

            // And: No crash or hang (command completed)
            // If we get here without timeout, test passes
        });
    });

    describe('Test 1.3: Start Demo Already Running', () => {
        it('should show info message and exit early if demo already running', async () => {
            // Given: Project status is 'running'
            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'test-project',
                path: '/test/path',
                status: 'running',
                created: new Date(),
                lastModified: new Date(),
                componentInstances: {
                    'headless': {
                        id: 'headless',
                        name: 'CitiSignal Frontend',
                        type: 'frontend',
                        status: 'running',
                        path: '/test/path/frontend',
                        port: 3000,
                    },
                },
            });

            // When: startDemo called
            await command.execute();

            // Then: Shows info message "Demo is already running"
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('already running'),
                expect.anything()
            );

            // And: No terminal created
            expect(vscode.window.createTerminal).not.toHaveBeenCalled();

            // And: No state changes (saveProject not called)
            expect(mockStateManager.saveProject).not.toHaveBeenCalled();
        });
    });

    describe('Test 1.4: Start Demo No Project', () => {
        it('should show warning with option to create project when no project exists', async () => {
            // Given: No project in state
            mockStateManager.getCurrentProject.mockResolvedValue(undefined);

            // Mock showInformationMessage to return 'Cancel' (user doesn't create project)
            mockWindow.showInformationMessage = jest.fn().mockResolvedValue('Cancel');

            // When: startDemo called
            await command.execute();

            // Then: Shows warning message
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining('No project'),
                expect.anything()
            );

            // And: Shows option to create project
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('No Demo Builder project'),
                'Create Project',
                'Cancel'
            );

            // And: No errors thrown (test completes without exception)
        });

        it('should execute createProject command when user chooses to create', async () => {
            // Given: No project in state
            mockStateManager.getCurrentProject.mockResolvedValue(undefined);

            // Mock showInformationMessage to return 'Create Project'
            mockWindow.showInformationMessage = jest.fn().mockResolvedValue('Create Project');

            // When: startDemo called and user chooses 'Create Project'
            await command.execute();

            // Then: createProject command executed
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.createProject');
        });
    });

    describe('Test 1.5: fnm env initialization', () => {
        it('should prepend eval "$(fnm env)" before fnm use in terminal command', async () => {
            // Given: Project with Node 24 requirement
            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'test-project',
                path: '/test/path',
                status: 'ready',
                created: new Date(),
                lastModified: new Date(),
                componentInstances: {
                    'headless': {
                        id: 'headless',
                        name: 'CitiSignal Frontend',
                        type: 'frontend',
                        status: 'ready',
                        path: '/test/path/frontend',
                        port: 3000,
                        metadata: { nodeVersion: '24' },
                    },
                },
            });

            // Port becomes in use quickly
            let portCheckCount = 0;
            mockCommandExecutor.isPortAvailable.mockImplementation(async () => {
                portCheckCount++;
                return portCheckCount < 2;
            });

            // When: startDemo command executes
            const executePromise = command.execute();
            await jest.advanceTimersByTimeAsync(3000);
            await executePromise;

            // Then: terminal sendText includes fnm env initialization
            const sendTextCalls = mockTerminal.sendText.mock.calls.map((c: string[]) => c[0]);
            const fnmCommand = sendTextCalls.find((cmd: string) => cmd.includes('fnm'));

            expect(fnmCommand).toBeDefined();
            expect(fnmCommand).toContain('eval "$(fnm env)"');
            expect(fnmCommand).toContain('fnm use 24');
            expect(fnmCommand).toContain('npm run dev');
        });
    });
});
