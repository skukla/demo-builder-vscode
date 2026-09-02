/**
 * DeleteProjectCommand - Lifecycle Tests
 *
 * Tests for dispose-before-delete pattern and project lifecycle management:
 * - Delete project with active watcher (watcher disposed first)
 * - Delete running project (stops demo first)
 * - State cleanup on success (project removed from state and recent list)
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

describe('DeleteProjectCommand - Lifecycle', () => {
    let command: DeleteProjectCommand;
    let mockStateManager: jest.Mocked<StateManager>;
    const testProjectPath = '/tmp/test-project-delete';

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

    describe('Test 1: Delete project with active watcher', () => {
        it('should wait for OS to release handles before deletion', async () => {
            // Given: Project exists at path
            // Project status is 'stopped' (default mock)

            // Track timing to verify 100ms wait
            const startTime = Date.now();
            let deleteTime = 0;

            mockRm.mockImplementation(async () => {
                deleteTime = Date.now();
            });
            mockAccess.mockRejectedValue({ code: 'ENOENT' });

            // When: User executes deleteProject command
            await command.execute();

            // Then: Should have waited ~100ms before deletion attempt
            const waitDuration = deleteTime - startTime;
            // Allow some tolerance for execution time
            expect(waitDuration).toBeGreaterThanOrEqual(90);
        });

        it('should delete directory after waiting for handle release', async () => {
            // Given: Project exists with stopped status
            // When: deleteProject command executes
            await command.execute();

            // Then: Directory should be deleted with recursive and force options
            expect(mockRm).toHaveBeenCalledWith(testProjectPath, { recursive: true, force: true });

            // And: State should be cleaned up
            expect(mockStateManager.clearProject).toHaveBeenCalled();
            expect(mockStateManager.removeFromRecentProjects).toHaveBeenCalledWith(testProjectPath);
        });
    });

    describe('Test 2: Delete running project (stops demo first)', () => {
        it('should stop demo before deleting if project is running', async () => {
            // Given: Project with status 'running'
            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'test-project',
                path: testProjectPath,
                status: 'running',
            } as any);

            // When: deleteProject command executes
            await command.execute();

            // Then: stopDemo command should be called first
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.stopDemo');

            // And: Deletion should happen after stopDemo
            expect(mockRm).toHaveBeenCalledWith(testProjectPath, { recursive: true, force: true });
        });

        it('should not call stopDemo if project is already stopped', async () => {
            // Given: Project with status 'stopped'
            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'test-project',
                path: testProjectPath,
                status: 'stopped',
            } as any);

            // When: deleteProject command executes
            await command.execute();

            // Then: stopDemo should NOT be called
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('demoBuilder.stopDemo');

            // But showProjectsList should still be called at the end
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.showProjectsList');
        });
    });

    describe('Test 5: State cleanup on success', () => {
        it('should remove project from recent projects list', async () => {
            // Given: Project exists in state and recent projects list
            // When: Deletion succeeds
            await command.execute();

            // Then: Project should be removed from recent projects
            expect(mockStateManager.removeFromRecentProjects).toHaveBeenCalledWith(testProjectPath);
        });

        it('should clear current project state', async () => {
            // Given: Project exists in state
            // When: Deletion succeeds
            await command.execute();

            // Then: Current project should be cleared
            expect(mockStateManager.clearProject).toHaveBeenCalled();
        });

        it('should open Projects List after successful deletion', async () => {
            // Given: Project exists
            // When: Deletion succeeds
            await command.execute();

            // Then: Projects List should be opened
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.showProjectsList');
        });
    });

    describe('Edge cases', () => {
        it('should not delete if user cancels confirmation', async () => {
            // Given: User cancels confirmation dialog
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('No');

            // When: deleteProject command executes
            await command.execute();

            // Then: No deletion should occur
            expect(mockRm).not.toHaveBeenCalled();
            expect(mockStateManager.clearProject).not.toHaveBeenCalled();
        });

        it('should handle missing project gracefully', async () => {
            // Given: No project loaded
            mockStateManager.getCurrentProject.mockResolvedValue(undefined);

            // When: deleteProject command executes
            await command.execute();

            // Then: Should show warning and not attempt deletion
            expect(mockRm).not.toHaveBeenCalled();
        });
    });
});
