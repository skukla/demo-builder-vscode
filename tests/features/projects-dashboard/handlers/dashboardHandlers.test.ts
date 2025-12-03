/**
 * Tests for Projects Dashboard handlers
 */

import {
    handleGetProjects,
    handleSelectProject,
    handleCreateProject,
} from '@/features/projects-dashboard/handlers/dashboardHandlers';
import {
    createMockProject,
    createMockProjects,
    createMockHandlerContext,
} from '../testUtils';

// Mock vscode
jest.mock('vscode', () => ({
    commands: {
        executeCommand: jest.fn(),
    },
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue('cards'),
        }),
    },
}), { virtual: true });

describe('dashboardHandlers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset vscode config mock to default
        const vscode = require('vscode');
        vscode.workspace.getConfiguration.mockReturnValue({
            get: jest.fn().mockReturnValue('cards'),
        });
    });

    describe('handleGetProjects', () => {
        it('should return all projects from StateManager', async () => {
            const projects = createMockProjects(3);
            const context = createMockHandlerContext(projects);

            const result = await handleGetProjects(context as any);

            expect(context.stateManager.getAllProjects).toHaveBeenCalled();
            // loadProjectFromPath should be called for each project
            expect(context.stateManager.loadProjectFromPath).toHaveBeenCalledTimes(3);
            expect(result.success).toBe(true);
            expect((result.data as any).projects).toHaveLength(3);
        });

        it('should include projectsViewMode from config', async () => {
            const vscode = require('vscode');
            vscode.workspace.getConfiguration.mockReturnValue({
                get: jest.fn().mockReturnValue('rows'),
            });
            const context = createMockHandlerContext([]);

            const result = await handleGetProjects(context as any);

            expect(result.success).toBe(true);
            expect((result.data as any).projectsViewMode).toBe('rows');
        });

        it('should return empty array when no projects exist', async () => {
            const context = createMockHandlerContext([]);

            const result = await handleGetProjects(context as any);

            expect(result).toEqual({
                success: true,
                data: { projects: [], projectsViewMode: 'cards' },
            });
        });

        it('should handle errors gracefully', async () => {
            const context = createMockHandlerContext([]);
            context.stateManager.getAllProjects.mockRejectedValue(
                new Error('Database error')
            );

            const result = await handleGetProjects(context as any);

            expect(result).toEqual({
                success: false,
                error: 'Failed to load projects',
            });
            expect(context.logger.error).toHaveBeenCalled();
        });

        it('should NOT use sendMessage (Pattern B)', async () => {
            const projects = createMockProjects(2);
            const context = createMockHandlerContext(projects);

            await handleGetProjects(context as any);

            expect(context.sendMessage).not.toHaveBeenCalled();
        });
    });

    describe('handleSelectProject', () => {
        it('should load and save project in StateManager', async () => {
            const project = createMockProject({ name: 'Selected Project' });
            const context = createMockHandlerContext([project]);

            const result = await handleSelectProject(context as any, {
                projectPath: project.path,
            });

            expect(context.stateManager.loadProjectFromPath).toHaveBeenCalledWith(
                project.path
            );
            expect(context.stateManager.saveProject).toHaveBeenCalledWith(project);
            expect(result.success).toBe(true);
            expect((result.data as any).project.name).toBe('Selected Project');
        });

        it('should return error if project path is outside demo-builder directory', async () => {
            const context = createMockHandlerContext([]);

            const result = await handleSelectProject(context as any, {
                projectPath: '/nonexistent/path',
            });

            // Path validation fails before project lookup
            expect(result).toEqual({
                success: false,
                error: 'Invalid project path',
            });
            expect(context.logger.error).toHaveBeenCalled();
        });

        it('should return error if project not found at valid path', async () => {
            const context = createMockHandlerContext([]);
            const os = require('os');
            const path = require('path');
            const validButEmptyPath = path.join(os.homedir(), '.demo-builder', 'projects', 'nonexistent');

            const result = await handleSelectProject(context as any, {
                projectPath: validButEmptyPath,
            });

            expect(result).toEqual({
                success: false,
                error: 'Project not found',
            });
        });

        it('should return error if project path not provided', async () => {
            const context = createMockHandlerContext([]);

            const result = await handleSelectProject(context as any, undefined);

            expect(result).toEqual({
                success: false,
                error: 'Project path is required',
            });
        });

        it('should log selection event', async () => {
            const project = createMockProject({ name: 'Logged Project' });
            const context = createMockHandlerContext([project]);

            await handleSelectProject(context as any, {
                projectPath: project.path,
            });

            expect(context.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Logged Project')
            );
        });

        it('should NOT use sendMessage (Pattern B)', async () => {
            const project = createMockProject();
            const context = createMockHandlerContext([project]);

            await handleSelectProject(context as any, {
                projectPath: project.path,
            });

            expect(context.sendMessage).not.toHaveBeenCalled();
        });

        describe('path traversal prevention (CWE-22)', () => {
            const PATH_TRAVERSAL_PAYLOADS = [
                '../../../etc/passwd',
                '..\\..\\..\\Windows\\System32\\config\\SAM',
                '/etc/passwd',
                'C:\\Windows\\System32',
                '/tmp/../etc/shadow',
                '....//....//etc/passwd',
            ];

            PATH_TRAVERSAL_PAYLOADS.forEach((payload) => {
                it(`should block path traversal attempt: ${payload}`, async () => {
                    const context = createMockHandlerContext([]);

                    const result = await handleSelectProject(context as any, {
                        projectPath: payload,
                    });

                    expect(result.success).toBe(false);
                    expect(result.error).toBe('Invalid project path');
                    // Should NOT attempt to load from filesystem
                    expect(context.stateManager.loadProjectFromPath).not.toHaveBeenCalled();
                });
            });
        });
    });

    describe('handleCreateProject', () => {
        it('should execute create project command', async () => {
            const context = createMockHandlerContext([]);
            const vscode = require('vscode');

            const result = await handleCreateProject(context as any);

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder.createProject'
            );
            expect(result).toEqual({
                success: true,
            });
        });

        it('should log create event', async () => {
            const context = createMockHandlerContext([]);

            await handleCreateProject(context as any);

            expect(context.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Creating new project')
            );
        });

        it('should handle command execution error', async () => {
            const context = createMockHandlerContext([]);
            const vscode = require('vscode');
            vscode.commands.executeCommand.mockRejectedValue(
                new Error('Command failed')
            );

            const result = await handleCreateProject(context as any);

            expect(result).toEqual({
                success: false,
                error: 'Failed to start project creation',
            });
        });

        it('should NOT use sendMessage (Pattern B)', async () => {
            const context = createMockHandlerContext([]);

            await handleCreateProject(context as any);

            expect(context.sendMessage).not.toHaveBeenCalled();
        });
    });
});
