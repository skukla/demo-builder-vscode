/**
 * StopDemoCommand - Lifecycle Tests
 *
 * Tests the complete stop lifecycle with ProcessCleanup integration:
 * - Stop demo with process running (kills process before disposing terminal)
 * - Stop demo with no process found (graceful handling)
 * - State update waits for process termination
 * - Frontend env state cleared on success
 *
 * ALL TESTS ARE FULLY MOCKED - No real process spawning or port binding.
 */

// Real wall-clock retry/UI delays; mock the shared sleep so only orchestration is
// under test. Assertions pin the SEQUENCE of attempts, never elapsed duration.
jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import {
    ProcessCleanup,
    StopDemoCommand,
    mockCommandExecutor,
    setupStopDemo,
} from './stopDemo.testUtils';
import type { StateManager } from '@/types/state';
import * as vscode from 'vscode';

import {
    createMockTerminal,
} from '../../../helpers/vscodeMockViews';

describe('StopDemoCommand - Lifecycle', () => {
    let command: StopDemoCommand;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockProcessCleanup: jest.Mocked<ProcessCleanup>;
    let mockTerminal: ReturnType<typeof createMockTerminal>;

    beforeEach(() => {
        jest.clearAllMocks();
        ({ command, mockStateManager, mockProcessCleanup, mockTerminal } = setupStopDemo());
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Test 1.1: Stop Demo with Process Running', () => {
        it('should kill process tree before disposing terminal', async () => {
            // Given: Project exists with status 'running'
            // Frontend component running on port 3000
            // Process PID 12345 found via lsof

            // When: User executes stopDemo command
            await command.execute();

            // Then: ProcessCleanup.killProcessTree(12345) called with SIGTERM
            expect(mockProcessCleanup.killProcessTree).toHaveBeenCalledWith(12345, 'SIGTERM');

            // And: Terminal disposed after process killed
            expect(mockTerminal.dispose).toHaveBeenCalled();

            // Verify order: kill process first, then dispose terminal
            const killCallOrder = mockProcessCleanup.killProcessTree.mock.invocationCallOrder[0];
            const disposeCallOrder = mockTerminal.dispose.mock.invocationCallOrder[0];
            expect(killCallOrder).toBeLessThan(disposeCallOrder);
        });

        it('should update state to ready only after process confirmed dead', async () => {
            // Given: Process on port 3000
            // Capture status at save time (since project object is mutated in place)
            const saveStatuses: string[] = [];
            mockStateManager.saveProject.mockImplementation(async (project: any) => {
                saveStatuses.push(project.status);
            });

            // When: stopDemo completes
            await command.execute();

            // Then: State was saved with 'stopping' then 'ready'
            expect(saveStatuses).toContain('stopping');
            expect(saveStatuses).toContain('ready');

            // And: 'stopping' came before 'ready'
            const stoppingIndex = saveStatuses.indexOf('stopping');
            const readyIndex = saveStatuses.lastIndexOf('ready');
            expect(stoppingIndex).toBeLessThan(readyIndex);
        });
    });

    describe('Test 1.2: Stop Demo with No Process Found', () => {
        it('should gracefully handle no process found on port', async () => {
            // Given: lsof returns empty (no process)
            mockCommandExecutor.execute.mockResolvedValue({
                code: 1,
                stdout: '',
                stderr: 'No process found', duration: 0 });

            // When: stopDemo command executes
            await command.execute();

            // Then: ProcessCleanup.killProcessTree NOT called (no PID)
            expect(mockProcessCleanup.killProcessTree).not.toHaveBeenCalled();

            // And: Terminal still disposed (cleanup)
            expect(mockTerminal.dispose).toHaveBeenCalled();

            // And: State updated to ready
            expect(mockStateManager.saveProject).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'ready' })
            );

            // And: the COMPONENT records itself stopped, not only the project.
            // These are two different writes and the dashboard card reads the
            // component one — a project saying "ready" beside a component still
            // saying "running" is exactly the state the card renders wrong.
            // Nothing asserted this until 2026-09-02: deleting the component
            // write left the whole family green.
            const saved = (mockStateManager.saveProject as jest.Mock).mock.calls.at(-1)?.[0];
            expect(saved.componentInstances.eds.status).toBe('stopped');

            // And: No error shown to user
            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        });
    });

    describe('Test 1.3: Stop Demo Updates State After Process Exit', () => {
        it('should update state only after process termination completes', async () => {
            // Given: Track save order
            const saveStatuses: string[] = [];

            // Mock ProcessCleanup to resolve immediately (we test order, not timing)
            mockProcessCleanup.killProcessTree.mockResolvedValue(undefined);

            mockStateManager.saveProject.mockImplementation(async (project: any) => {
                saveStatuses.push(project.status);
            });

            // When: stopDemo command executes
            await command.execute();

            // Then: First save should be 'stopping' (before process cleanup)
            expect(saveStatuses[0]).toBe('stopping');

            // And: Second save should be 'ready' (after ProcessCleanup resolves)
            expect(saveStatuses[1]).toBe('ready');

            // And: ProcessCleanup was called between the two saves
            expect(mockProcessCleanup.killProcessTree).toHaveBeenCalled();
        });
    });

    describe('Test 1.4: Stop Demo Clears Frontend Env State', () => {
        it('should clear frontend env state on successful stop', async () => {
            // Given: Project has frontendEnvState set
            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'test-project',
                path: '/test/path',
                status: 'running',
                created: new Date(),
                lastModified: new Date(),
                frontendEnvState: { envVars: { TEST: 'value' }, capturedAt: new Date().toISOString() },
                componentInstances: {
                    eds: {
                        id: 'eds',
                        name: 'Edge Delivery Services',
                        type: 'frontend',
                        status: 'running',
                        port: 3000,
                    },
                },
            });

            // When: stopDemo completes successfully
            await command.execute();

            // Then: project.frontendEnvState is undefined
            expect(mockStateManager.saveProject).toHaveBeenCalledWith(
                expect.objectContaining({
                    frontendEnvState: undefined,
                })
            );

            // And: Internal command 'demoBuilder._internal.demoStopped' executed
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder._internal.demoStopped'
            );
        });
    });
});
