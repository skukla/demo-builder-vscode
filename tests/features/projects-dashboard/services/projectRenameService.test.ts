/**
 * projectRenameService Tests
 *
 * Tests for the shared rename core extracted from the kebab handler. Operates on
 * an already-loaded project + new name: validates, renames the folder on disk,
 * updates componentInstances paths + recent-projects, and saves the project.
 *
 * Both the projects-list kebab handler and the dashboard More handler call this.
 */

import { HandlerContext } from '@/types/handlers';
import { Project } from '@/types';

jest.setTimeout(5000);

// fs/promises - control rename + access
const mockRename = jest.fn().mockResolvedValue(undefined);
const mockAccess = jest.fn();
jest.mock('fs/promises', () => ({
    rename: (...args: unknown[]) => mockRename(...args),
    access: (...args: unknown[]) => mockAccess(...args),
}));

// validation - validateProjectNameSecurity throws on invalid
const mockValidateName = jest.fn();
jest.mock('@/core/validation', () => ({
    validateProjectNameSecurity: (...args: unknown[]) => mockValidateName(...args),
}));

// project finalization - AI context regeneration (dynamic import inside the service).
// Rename must re-run this so the MCP configs (which bake the absolute project path)
// point at the new path instead of the old one.
const mockGenerateAIContextFiles = jest.fn().mockResolvedValue({ skills: [] });
jest.mock('@/features/project-creation/services/projectFinalizationService', () => ({
    generateAIContextFiles: (...args: unknown[]) => mockGenerateAIContextFiles(...args),
}));

import { renameProjectCore } from '@/features/projects-dashboard/services/projectRenameService';

function createMockProject(overrides?: Partial<Project>): Project {
    return {
        name: 'old-name',
        path: '/projects/old-name',
        status: 'ready',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                path: '/projects/old-name/storefront',
            },
        },
        ...overrides,
    } as unknown as Project;
}

function createMockContext(): HandlerContext {
    return {
        stateManager: {
            saveProject: jest.fn().mockResolvedValue(undefined),
            removeFromRecentProjects: jest.fn().mockResolvedValue(undefined),
        } as unknown as HandlerContext['stateManager'],
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        } as unknown as HandlerContext['logger'],
        context: { extensionPath: '/ext' } as unknown as HandlerContext['context'],
    } as unknown as HandlerContext;
}

describe('renameProjectCore', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default: new folder does NOT exist (access rejects)
        mockAccess.mockRejectedValue(new Error('ENOENT'));
        mockValidateName.mockImplementation(() => undefined);
        mockGenerateAIContextFiles.mockReset().mockResolvedValue({ skills: [] });
    });

    it('should reject an empty name', async () => {
        const project = createMockProject();
        const context = createMockContext();

        const result = await renameProjectCore(context, project, '   ');

        expect(result.success).toBe(false);
        expect(mockRename).not.toHaveBeenCalled();
    });

    it('should block rename while the demo is running', async () => {
        const project = createMockProject({ status: 'running' });
        const context = createMockContext();

        const result = await renameProjectCore(context, project, 'new-name');

        expect(result.success).toBe(false);
        expect(mockRename).not.toHaveBeenCalled();
    });

    it('should reject an invalid project name', async () => {
        const project = createMockProject();
        const context = createMockContext();
        mockValidateName.mockImplementation(() => { throw new Error('Invalid name'); });

        const result = await renameProjectCore(context, project, 'Bad Name');

        expect(result.success).toBe(false);
        expect(mockRename).not.toHaveBeenCalled();
    });

    it('should error when the target folder already exists', async () => {
        const project = createMockProject();
        const context = createMockContext();
        mockAccess.mockResolvedValue(undefined); // folder exists

        const result = await renameProjectCore(context, project, 'new-name');

        expect(result.success).toBe(false);
        expect(mockRename).not.toHaveBeenCalled();
    });

    it('should rename the folder on disk', async () => {
        const project = createMockProject();
        const context = createMockContext();

        await renameProjectCore(context, project, 'new-name');

        expect(mockRename).toHaveBeenCalledWith('/projects/old-name', '/projects/new-name');
    });

    it('should update project path and componentInstances paths', async () => {
        const project = createMockProject();
        const context = createMockContext();

        await renameProjectCore(context, project, 'new-name');

        expect(project.path).toBe('/projects/new-name');
        expect(project.componentInstances!['eds-storefront'].path).toBe('/projects/new-name/storefront');
    });

    it('should remove the old path from recent projects', async () => {
        const project = createMockProject();
        const context = createMockContext();

        await renameProjectCore(context, project, 'new-name');

        expect((context.stateManager.removeFromRecentProjects as jest.Mock)).toHaveBeenCalledWith('/projects/old-name');
    });

    it('should save the renamed project', async () => {
        const project = createMockProject();
        const context = createMockContext();

        await renameProjectCore(context, project, 'new-name');

        expect((context.stateManager.saveProject as jest.Mock)).toHaveBeenCalledWith(project);
        expect(project.name).toBe('new-name');
    });

    it('should return success with the new name and path', async () => {
        const project = createMockProject();
        const context = createMockContext();

        const result = await renameProjectCore(context, project, 'new-name');

        expect(result.success).toBe(true);
        expect(result.data).toEqual(
            expect.objectContaining({ success: true, newName: 'new-name', newPath: '/projects/new-name' }),
        );
    });

    it('regenerates AI context files for the new path (fixes stale MCP paths)', async () => {
        const project = createMockProject();
        const context = createMockContext();

        await renameProjectCore(context, project, 'new-name');

        // Regenerated with the NEW path + the mutated project + the extension path.
        expect(mockGenerateAIContextFiles).toHaveBeenCalledWith('/projects/new-name', project, '/ext');
    });

    it('does not regenerate AI context for a no-op rename (path unchanged)', async () => {
        const project = createMockProject();
        const context = createMockContext();

        await renameProjectCore(context, project, 'old-name');

        expect(mockGenerateAIContextFiles).not.toHaveBeenCalled();
    });

    it('treats AI context regeneration failure as non-fatal (rename still succeeds)', async () => {
        const project = createMockProject();
        const context = createMockContext();
        mockGenerateAIContextFiles.mockRejectedValueOnce(new Error('regen boom'));

        const result = await renameProjectCore(context, project, 'new-name');

        expect(result.success).toBe(true);
        expect((context.logger.warn as jest.Mock)).toHaveBeenCalled();
    });
});
