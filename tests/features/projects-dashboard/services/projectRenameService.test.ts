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
jest.mock('@/features/project-creation/services', () => ({
    generateAIContextFiles: (...args: unknown[]) => mockGenerateAIContextFiles(...args),
}));

import { renameProjectCore } from '@/features/projects-dashboard/services/projectRenameService';
import { createMockLogger } from '../../../helpers/loggerFake';

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
            saveProjectConfigOnly: jest.fn().mockResolvedValue(undefined),
            removeFromRecentProjects: jest.fn().mockResolvedValue(undefined),
        } as unknown as HandlerContext['stateManager'],
        logger: createMockLogger() as unknown as HandlerContext['logger'],
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

/**
 * Own setup, deliberately.
 *
 * These sit outside the original `describe('renameProjectCore')`, so they do NOT
 * inherit its `beforeEach` -- a first draft of them read `mockRename` call
 * history left over from earlier tests and failed on counts that had nothing to
 * do with the code under test.
 */
beforeEach(() => {
    jest.clearAllMocks();
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    mockValidateName.mockImplementation(() => undefined);
    mockRename.mockReset().mockResolvedValue(undefined);
    mockGenerateAIContextFiles.mockReset().mockResolvedValue({ skills: [] });
});

describe('renaming by TITLE', () => {
    /**
     * What arrives is a title as typed. The slug is derived from it, exactly as
     * project creation does, so the folder tracks what the user sees.
     *
     * That tracking is the whole point: the folder is browsable on disk, so a
     * title that stopped matching its directory would be worse than not offering
     * titles at all.
     */
    it('moves the folder to the slug derived from the title', async () => {
        const project = createMockProject();
        const context = createMockContext();

        await renameProjectCore(context, project, 'Bodea B2B Demo');

        expect(mockRename).toHaveBeenCalledWith('/projects/old-name', '/projects/bodea-b2b-demo');
    });

    it('stores the title as typed and the slug beside it', async () => {
        const project = createMockProject();
        const context = createMockContext();

        await renameProjectCore(context, project, 'Bodea B2B Demo');

        expect(project.title).toBe('Bodea B2B Demo');
        expect(project.name).toBe('bodea-b2b-demo');
    });

    it('rewrites component paths onto the new folder', async () => {
        const project = createMockProject();
        const context = createMockContext();

        await renameProjectCore(context, project, 'Bodea B2B Demo');

        expect(project.componentInstances?.['eds-storefront'].path).toBe(
            '/projects/bodea-b2b-demo/storefront',
        );
    });

    it('refuses a title with nothing to build a folder name from', async () => {
        // "!!!" normalises to an empty slug. Renaming to it would compute
        // `path.join(root, '')` -- the projects ROOT -- and move the project
        // directory onto it.
        const project = createMockProject();
        const context = createMockContext();

        const result = await renameProjectCore(context, project, '!!!');

        expect(result.success).toBe(false);
        expect(mockRename).not.toHaveBeenCalled();
    });
});

describe('rollback when the save fails after the move', () => {
    /**
     * The folder has already moved by the time the manifest is written, so a
     * failed save leaves the directory at the new path and the manifest naming
     * the old one. `projectFileLoader` reads `manifest.name`, so the project
     * would render under its old name from a folder carrying the new one --
     * exactly the disagreement titles exist to prevent.
     *
     * Every step is local filesystem work, so this is undoable in a way the
     * cloud operations elsewhere in this codebase are not.
     */
    const failSave = (context: HandlerContext) => {
        (context.stateManager.saveProject as jest.Mock).mockRejectedValue(new Error('disk full'));
    };

    it('moves the folder back', async () => {
        const project = createMockProject();
        const context = createMockContext();
        failSave(context);

        await renameProjectCore(context, project, 'Bodea B2B Demo').catch(() => undefined);

        expect(mockRename).toHaveBeenNthCalledWith(2, '/projects/bodea-b2b-demo', '/projects/old-name');
    });

    it('restores the project to exactly what it was', async () => {
        const project = createMockProject();
        const context = createMockContext();
        failSave(context);

        await renameProjectCore(context, project, 'Bodea B2B Demo').catch(() => undefined);

        expect(project.name).toBe('old-name');
        expect(project.path).toBe('/projects/old-name');
        expect(project.title).toBeUndefined();
        expect(project.componentInstances?.['eds-storefront'].path).toBe(
            '/projects/old-name/storefront',
        );
    });

    it('reports the unrecoverable case rather than pretending it rolled back', async () => {
        // Both directions failed. This is the one state a user cannot infer from
        // the UI, because the folder and the manifest genuinely disagree.
        const project = createMockProject();
        const context = createMockContext();
        failSave(context);
        mockRename
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('permission denied'));

        const result = await renameProjectCore(context, project, 'Bodea B2B Demo');

        expect(result.success).toBe(false);
        expect(String(result.error)).toMatch(/could not be undone/i);
    });
});

describe('remote Adobe I/O project title sync', () => {
    // The Console project title is set from the demo name when the wizard
    // provisions a project in-app. Renaming the demo re-syncs that title —
    // but ONLY when the remote title still matches the demo's old title/name:
    // project.adobe can reference a PRE-EXISTING Console project the user
    // selected, and a demo rename must never mutate shared infrastructure
    // named by someone else. Best-effort: a remote failure never fails the
    // local rename.
    const remoteRename = jest.fn().mockResolvedValue(true);

    function contextWithAuth(): HandlerContext {
        const ctx = createMockContext();
        (ctx as unknown as { authManager: unknown }).authManager = {
            renameRemoteProject: remoteRename,
        };
        return ctx;
    }

    function adobeProject(remoteTitle: string): Project {
        mockAccess.mockRejectedValue(new Error('ENOENT'));
        return createMockProject({
            title: 'Old Title',
            adobe: {
                organization: 'org-1',
                projectId: 'proj-1',
                projectTitle: remoteTitle,
            },
        } as Partial<Project>);
    }

    beforeEach(() => {
        remoteRename.mockClear();
        remoteRename.mockResolvedValue(true);
    });

    it('renames the remote project when its title matches the old demo title', async () => {
        const project = adobeProject('Old Title');
        const result = await renameProjectCore(contextWithAuth(), project, 'New Title');

        expect(result.success).toBe(true);
        expect(remoteRename).toHaveBeenCalledWith('org-1', 'proj-1', 'New Title');
        expect(project.adobe?.projectTitle).toBe('New Title');
    });

    it('does NOT touch a remote project whose title differs (user-selected shared project)', async () => {
        const project = adobeProject('Corporate Shared Project');
        const result = await renameProjectCore(contextWithAuth(), project, 'New Title');

        expect(result.success).toBe(true);
        expect(remoteRename).not.toHaveBeenCalled();
        expect(project.adobe?.projectTitle).toBe('Corporate Shared Project');
    });

    it('treats a remote rename failure as non-fatal (local rename still succeeds)', async () => {
        remoteRename.mockRejectedValue(new Error('403'));
        const project = adobeProject('Old Title');
        const ctx = contextWithAuth();

        const result = await renameProjectCore(ctx, project, 'New Title');

        expect(result.success).toBe(true);
        expect(ctx.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('remote'),
        );
    });

    it('skips silently when the context has no authManager', async () => {
        const project = adobeProject('Old Title');
        const result = await renameProjectCore(createMockContext(), project, 'New Title');

        expect(result.success).toBe(true);
        expect(remoteRename).not.toHaveBeenCalled();
    });
});
