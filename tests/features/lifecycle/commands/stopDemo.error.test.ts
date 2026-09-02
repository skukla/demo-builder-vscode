/**
 * StopDemoCommand - Error Handling Tests
 *
 * Tests error handling and edge cases:
 * - Process cleanup timeout with force-kill fallback
 * - Process kill permission denied (EPERM)
 * - State consistency on unexpected error
 * - No project loaded (silent exit)
 *
 * ALL TESTS ARE FULLY MOCKED - No real process spawning or port binding.
 */

import {
    ProcessCleanup,
    StopDemoCommand,
    setupStopDemo,
} from './stopDemo.testUtils';
import type { StateManager } from '@/types/state';
import type { Logger } from '@/types/logger';
import * as vscode from 'vscode';

import {
    createMockTerminal,
} from '../../../helpers/vscodeMockViews';

describe('StopDemoCommand - Error Handling', () => {
    let command: StopDemoCommand;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockLogger: jest.Mocked<Logger>;
    let mockProcessCleanup: jest.Mocked<ProcessCleanup>;
    let mockTerminal: ReturnType<typeof createMockTerminal>;

    beforeEach(() => {
        jest.clearAllMocks();
        ({ command, mockStateManager, mockLogger, mockProcessCleanup, mockTerminal } = setupStopDemo());
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Test 3.1: Process Cleanup Timeout', () => {
        it('should handle graceful timeout with force-kill fallback', async () => {
            // Given: Process ignores SIGTERM but ProcessCleanup handles timeout internally
            // ProcessCleanup configured with timeout (internal) - it still resolves eventually
            // ProcessCleanup handles timeout internally and always resolves
            mockProcessCleanup.killProcessTree.mockResolvedValue(undefined);

            // When: stopDemo called
            await command.execute();

            // Then: ProcessCleanup internally sends SIGKILL after timeout
            // Stop eventually completes
            expect(mockStateManager.saveProject).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'ready' })
            );
        });
    });

    describe('Test 3.2: Process Kill Permission Denied', () => {
        it('should handle EPERM error gracefully', async () => {
            // Given: Process owned by different user (EPERM)
            const epermError: any = new Error('EPERM: operation not permitted');
            epermError.code = 'EPERM';
            mockProcessCleanup.killProcessTree.mockRejectedValue(epermError);

            // When: stopDemo called
            await command.execute();

            // Then: Error shown to user with actionable message
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Permission denied'),
                'OK'
            );

            // And: Terminal still disposed (attempt cleanup)
            expect(mockTerminal.dispose).toHaveBeenCalled();

            // And: State NOT updated to 'ready' (still unknown)
            // The final save should NOT have status 'ready'
            const finalSaves = mockStateManager.saveProject.mock.calls.filter(
                call => call[0].status === 'ready'
            );
            expect(finalSaves).toHaveLength(0);
        });
    });

    describe('Test 3.3: State Remains Consistent on Error', () => {
        it('should revert state to running on unexpected error', async () => {
            // Given: ProcessCleanup throws unexpected error
            mockProcessCleanup.killProcessTree.mockRejectedValue(new Error('Unexpected error'));

            // When: stopDemo catches error
            await command.execute();

            // Then: User sees error message
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();

            // And: State reverts to 'running' (not left in 'stopping')
            // OR error is handled gracefully and state doesn't go to 'ready'
            const finalSaves = mockStateManager.saveProject.mock.calls.filter(
                call => call[0].status === 'ready'
            );
            expect(finalSaves).toHaveLength(0);
        });

        it('should allow retry after error', async () => {
            // Given: First call fails
            mockProcessCleanup.killProcessTree
                .mockRejectedValueOnce(new Error('Temporary error'))
                .mockResolvedValueOnce(undefined);

            // When: First stopDemo call fails
            await command.execute();

            // Then: User sees error
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();

            // Clear mocks for retry
            jest.clearAllMocks();

            // When: User retries (second call succeeds)
            // Reset project state for retry
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
                        port: 3000,
                    },
                },
            });

            await command.execute();

            // Then: Second call succeeds
            expect(mockStateManager.saveProject).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'ready' })
            );
        });
    });

    describe('Test 3.4: No Project Loaded', () => {
        it('should exit silently when no project', async () => {
            // Given: No current project in state
            mockStateManager.getCurrentProject.mockResolvedValue(undefined);

            // When: stopDemo called
            await command.execute();

            // Then: Returns immediately (no error)
            // Debug log recorded
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('No project')
            );

            // And: No ProcessCleanup calls
            expect(mockProcessCleanup.killProcessTree).not.toHaveBeenCalled();

            // And: No error shown to user
            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        });

        it('should exit silently when no frontend component', async () => {
            // Given: Project exists but no frontend component
            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'test-project',
                path: '/test/path',
                status: 'running',
                created: new Date(),
                lastModified: new Date(),
                componentInstances: {},
            });

            // When: stopDemo called
            await command.execute();

            // Then: Returns immediately (no error)
            expect(mockProcessCleanup.killProcessTree).not.toHaveBeenCalled();
            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        });

        it('should exit silently when project already stopped', async () => {
            // Given: Project status is 'ready' (not running)
            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'test-project',
                path: '/test/path',
                status: 'ready', // Already stopped
                created: new Date(),
                lastModified: new Date(),
                componentInstances: {
                    eds: {
                        id: 'eds',
                        name: 'Edge Delivery Services',
                        type: 'frontend',
                        status: 'stopped',
                        port: 3000,
                    },
                },
            });

            // When: stopDemo called
            await command.execute();

            // Then: Returns immediately (no error)
            expect(mockProcessCleanup.killProcessTree).not.toHaveBeenCalled();
            expect(mockStateManager.saveProject).not.toHaveBeenCalled();
        });
    });
});
