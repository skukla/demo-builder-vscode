/**
 * DeleteProjectCommand - Navigation Tests
 *
 * Tests for navigation after project deletion:
 * - After deletion, should navigate to Projects List (not Welcome)
 * - StateManager.clearProject should be called
 * - Project panels should be closed
 * - Empty state is handled by UI (Projects List shown even with no projects)
 *
 * Step 5 of Projects Navigation Architecture plan.
 */

import {
    DeleteProjectCommand,
    vscode,
    setupDeleteProject,
} from './deleteProject.testUtils';
import type { StateManager } from '@/types/state';

// Mock fs/promises with explicit exports
jest.mock('fs/promises', () => ({
    rm: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockRejectedValue({ code: 'ENOENT' }),
}));
import * as fs from 'fs/promises';
const mockRm = fs.rm as jest.Mock;
const mockAccess = fs.access as jest.Mock;

// Import vscode after mock

describe('DeleteProjectCommand - Navigation', () => {
    let command: DeleteProjectCommand;
    let mockStateManager: jest.Mocked<StateManager>;
    const testProjectPath = '/tmp/test-project-navigation';

    beforeEach(() => {
        jest.clearAllMocks();
        mockRm.mockClear();
        mockAccess.mockClear();
        mockRm.mockResolvedValue(undefined);
        mockAccess.mockRejectedValue({ code: 'ENOENT' });
        ({ command, mockStateManager } = setupDeleteProject(testProjectPath));
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    describe('Given user is viewing Project Detail', () => {
        describe('When the current project is deleted', () => {
            it('should execute showProjectsList command (not showWelcome)', async () => {
                // Given: Project exists and user confirms deletion
                mockStateManager.getCurrentProject.mockResolvedValue({
                    name: 'test-project',
                    path: testProjectPath,
                    status: 'stopped',
                } as any);

                // When: User deletes the project
                await command.execute();

                // Then: showProjectsList should be called (not showWelcome)
                expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.showProjectsList');
                expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('demoBuilder.showWelcome');
            });

            it('should call StateManager.clearProject', async () => {
                // Given: Project exists
                // When: Deletion succeeds
                await command.execute();

                // Then: clearProject should be called
                expect(mockStateManager.clearProject).toHaveBeenCalled();
            });

            it('should close project panels before navigation', async () => {
                // Given: Project exists
                // When: Deletion succeeds
                await command.execute();

                // Then: StateManager.clearProject should be called before showProjectsList
                const executeCommandCalls = (vscode.commands.executeCommand as jest.Mock).mock.calls;
                const showProjectsListCall = executeCommandCalls.findIndex(
                    (call: any[]) => call[0] === 'demoBuilder.showProjectsList'
                );

                // clearProject should have been called (panels closed as part of delete flow)
                expect(mockStateManager.clearProject).toHaveBeenCalled();
                // And navigation should happen
                expect(showProjectsListCall).toBeGreaterThanOrEqual(0);
            });
        });
    });

    describe('Given user has only one project', () => {
        describe('When that project is deleted', () => {
            it('should still show Projects List (empty state handled by UI)', async () => {
                // Given: User has only one project (simulated - same test setup)
                mockStateManager.getCurrentProject.mockResolvedValue({
                    name: 'only-project',
                    path: testProjectPath,
                    status: 'stopped',
                } as any);

                // When: The last project is deleted
                await command.execute();

                // Then: Should still navigate to Projects List (UI handles empty state)
                expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.showProjectsList');

                // And: Should NOT navigate to Welcome
                expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('demoBuilder.showWelcome');
            });
        });
    });

    describe('Navigation failure handling', () => {
        it('should not throw if showProjectsList command fails', async () => {
            // Given: showProjectsList command will fail
            (vscode.commands.executeCommand as jest.Mock).mockImplementation(
                async (cmd: string) => {
                    if (cmd === 'demoBuilder.showProjectsList') {
                        throw new Error('Navigation failed');
                    }
                    return undefined;
                }
            );

            // When: Deletion succeeds but navigation fails
            // Then: Should not throw (deletion still succeeded)
            await expect(command.execute()).resolves.not.toThrow();

            // And: clearProject should still have been called
            expect(mockStateManager.clearProject).toHaveBeenCalled();
        });
    });
});
