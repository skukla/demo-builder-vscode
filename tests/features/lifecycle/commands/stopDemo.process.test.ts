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

// Delays in this path are real wall-clock waits on the node project's real timers.
// Mocking the shared sleep keeps the orchestration under test and drops the waiting.
// Assertions here pin the SEQUENCE of attempts, never elapsed duration.
jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import {
    ProcessCleanup,
    StopDemoCommand,
    mockCommandExecutor,
    setupStopDemo,
} from './stopDemo.testUtils';
import type { StateManager } from '@/types/state';

import {
    createMockTerminal,
    mockWorkspace,
} from '../../../helpers/vscodeMockViews';

describe('StopDemoCommand - Process Discovery', () => {
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

    describe('Test 2.1: Find Process by Port', () => {
        it('should discover PID from port number using lsof', async () => {
            // Given: Process listening on port 3000
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: '12345',
                stderr: '', duration: 0 });

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
                stderr: '', duration: 0 });

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
                duration: 0,
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
                stderr: '', duration: 0 });

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
                    eds: {
                        id: 'eds',
                        name: 'Edge Delivery Services',
                        type: 'frontend',
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
                    eds: {
                        id: 'eds',
                        name: 'Edge Delivery Services',
                        type: 'frontend',
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
            mockWorkspace.getConfiguration = jest.fn().mockReturnValue({
                get: jest.fn().mockReturnValue(NaN),
            });

            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'test-project',
                path: '/test/path',
                status: 'running',
                created: new Date(),
                lastModified: new Date(),
                componentInstances: {
                    eds: {
                        id: 'eds',
                        name: 'Edge Delivery Services',
                        type: 'frontend',
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
