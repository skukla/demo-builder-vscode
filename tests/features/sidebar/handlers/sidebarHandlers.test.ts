/**
 * Tests for Sidebar Handlers
 *
 * Tests navigation and context management handlers.
 */

import {
    handleNavigate,
    handleGetContext,
    handleSetContext,
} from '@/features/sidebar/handlers/sidebarHandlers';
import type { HandlerContext } from '@/types/handlers';
import type { SidebarContext } from '@/features/sidebar/types';

// Mock VS Code
jest.mock('vscode', () => ({
    commands: {
        executeCommand: jest.fn(),
    },
}));

describe('sidebarHandlers', () => {
    // Create a mock context for each test
    function createMockContext(overrides?: Partial<HandlerContext>): HandlerContext {
        return {
            stateManager: {
                getCurrentProject: jest.fn().mockResolvedValue(undefined),
                getAllProjects: jest.fn().mockResolvedValue([]),
                loadProjectFromPath: jest.fn(),
                saveProject: jest.fn(),
            } as unknown as HandlerContext['stateManager'],
            logger: {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
            } as unknown as HandlerContext['logger'],
            panel: {
                webview: {
                    postMessage: jest.fn(),
                },
            } as unknown as HandlerContext['panel'],
            ...overrides,
        };
    }

    describe('handleNavigate', () => {
        it('should execute navigate command successfully', async () => {
            const vscode = require('vscode');
            const context = createMockContext();

            const result = await handleNavigate(context, { target: 'projects' });

            expect(result.success).toBe(true);
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder.navigate',
                { target: 'projects' }
            );
        });

        it('should return error when target is missing', async () => {
            const context = createMockContext();

            const result = await handleNavigate(context, undefined);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Navigation target is required');
        });

        it('should return error when target is empty', async () => {
            const context = createMockContext();

            const result = await handleNavigate(context, { target: '' });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Navigation target is required');
        });

        it('should handle navigation errors gracefully', async () => {
            const vscode = require('vscode');
            vscode.commands.executeCommand.mockRejectedValueOnce(new Error('Command failed'));
            const context = createMockContext();

            const result = await handleNavigate(context, { target: 'projects' });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Navigation failed');
            expect(context.logger.error).toHaveBeenCalled();
        });
    });

    describe('handleGetContext', () => {
        it('should return projects context when no project is current', async () => {
            const context = createMockContext();
            (context.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(undefined);

            const result = await handleGetContext(context);

            expect(result.success).toBe(true);
            expect(result.data?.context).toEqual({ type: 'projects' });
        });

        it('should return project context when project is current', async () => {
            const mockProject = {
                name: 'Test Project',
                path: '/test/path',
                status: 'stopped',
            };
            const context = createMockContext();
            (context.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);

            const result = await handleGetContext(context);

            expect(result.success).toBe(true);
            expect(result.data?.context.type).toBe('project');
            expect((result.data?.context as { type: 'project'; project: typeof mockProject }).project).toEqual(mockProject);
        });

        it('should handle errors gracefully', async () => {
            const context = createMockContext();
            (context.stateManager.getCurrentProject as jest.Mock).mockRejectedValue(
                new Error('State error')
            );

            const result = await handleGetContext(context);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Failed to get sidebar context');
            expect(context.logger.error).toHaveBeenCalled();
        });
    });

    describe('handleSetContext', () => {
        it('should accept wizard context', async () => {
            const context = createMockContext();
            const wizardContext: SidebarContext = {
                type: 'wizard',
                step: 3,
                total: 6,
            };

            const result = await handleSetContext(context, { context: wizardContext });

            expect(result.success).toBe(true);
            expect(context.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('wizard')
            );
        });

        it('should accept projects context', async () => {
            const context = createMockContext();
            const projectsContext: SidebarContext = { type: 'projects' };

            const result = await handleSetContext(context, { context: projectsContext });

            expect(result.success).toBe(true);
            expect(context.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('projects')
            );
        });

        it('should return error when context is missing', async () => {
            const context = createMockContext();

            const result = await handleSetContext(context, undefined);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Context is required');
        });
    });
});
