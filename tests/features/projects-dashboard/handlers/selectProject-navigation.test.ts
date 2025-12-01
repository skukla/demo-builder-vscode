/**
 * Tests for selectProject handler navigation enhancement
 *
 * Tests that selectProject navigates to dashboard after selecting a project.
 */

// Mock vscode - must be before imports due to hoisting
jest.mock('vscode', () => ({
    commands: {
        executeCommand: jest.fn(),
    },
}), { virtual: true });

import * as vscode from 'vscode';
import {
    handleSelectProject,
} from '@/features/projects-dashboard/handlers/dashboardHandlers';
import {
    createMockProject,
    createMockHandlerContext,
} from '../testUtils';

const mockExecuteCommand = vscode.commands.executeCommand as jest.Mock;

describe('handleSelectProject - Navigation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('showDashboard command execution', () => {
        it('should execute demoBuilder.showDashboard command after saving project', async () => {
            // Given: A valid project exists
            const project = createMockProject({ name: 'Navigation Test Project' });
            const context = createMockHandlerContext([project]);

            // When: selectProject is called
            await handleSelectProject(context as any, {
                projectPath: project.path,
            });

            // Then: showDashboard command should be executed
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showDashboard');
        });

        it('should execute showDashboard after saveProject completes', async () => {
            // Given: A valid project
            const project = createMockProject({ name: 'Order Test Project' });
            const context = createMockHandlerContext([project]);
            const callOrder: string[] = [];

            context.stateManager.saveProject.mockImplementation(async () => {
                callOrder.push('saveProject');
            });
            mockExecuteCommand.mockImplementation(async (cmd: string) => {
                callOrder.push(`command:${cmd}`);
            });

            // When: selectProject is called
            await handleSelectProject(context as any, {
                projectPath: project.path,
            });

            // Then: saveProject should be called before showDashboard
            expect(callOrder).toEqual([
                'saveProject',
                'command:demoBuilder.showDashboard',
            ]);
        });

        it('should NOT execute showDashboard if project not found', async () => {
            // Given: No projects exist at the valid path
            const context = createMockHandlerContext([]);
            const os = require('os');
            const path = require('path');
            const validPath = path.join(os.homedir(), '.demo-builder', 'projects', 'missing');

            // When: selectProject is called with valid but empty path
            const result = await handleSelectProject(context as any, {
                projectPath: validPath,
            });

            // Then: showDashboard should NOT be executed
            expect(mockExecuteCommand).not.toHaveBeenCalled();
            expect(result.success).toBe(false);
        });

        it('should NOT execute showDashboard if path validation fails', async () => {
            // Given: An invalid path (security violation)
            const context = createMockHandlerContext([]);

            // When: selectProject is called with invalid path
            const result = await handleSelectProject(context as any, {
                projectPath: '/etc/passwd',
            });

            // Then: showDashboard should NOT be executed
            expect(mockExecuteCommand).not.toHaveBeenCalled();
            expect(result.success).toBe(false);
        });

        it('should return success even if showDashboard fails', async () => {
            // Given: A valid project but showDashboard command fails
            const project = createMockProject({ name: 'Error Test Project' });
            const context = createMockHandlerContext([project]);
            mockExecuteCommand.mockRejectedValue(new Error('Command failed'));

            // When: selectProject is called
            const result = await handleSelectProject(context as any, {
                projectPath: project.path,
            });

            // Then: Should still return success (project was selected)
            // Navigation failure is non-critical
            expect(result.success).toBe(true);
            expect(context.logger.error).toHaveBeenCalled();
        });
    });
});
