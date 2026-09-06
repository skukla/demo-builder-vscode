/**
 * projectRenameService Tests — validation, the move, and the AI-bundle refresh
 *
 * The shared rename core called by both the projects-list kebab handler and the
 * dashboard More menu. Operates on an already-loaded project + new name:
 * validates, renames the folder on disk, updates componentInstances paths +
 * recent-projects, saves, and re-runs the AI-bundle writers for the new path.
 *
 * Rollback and the remote Adobe I/O title sync live in
 * `projectRenameService-recovery.test.ts`. The harness both share — including
 * the subject import that makes its hoisting work — is in
 * `projectRenameService.testUtils.ts`.
 */

import {
    createMockContext,
    mockAccess,
    mockGenerateAIContextFiles,
    mockRename,
    mockValidateName,
    projectToRename,
    renameProjectCore,
    resetRenameMocks,
} from './projectRenameService.testUtils';

jest.setTimeout(5000);

beforeEach(() => {
    resetRenameMocks();
});

describe('renameProjectCore', () => {
    // The message matters: whitespace also normalises to an empty slug, so both
    // guards refuse the same input and only the wording says which one fired.
    it('should reject an empty name', async () => {
        const project = projectToRename();
        const context = createMockContext();

        const result = await renameProjectCore(context, project, '   ');

        expect(result).toStrictEqual({
            success: false,
            error: 'Project name cannot be empty',
        });
        expect(mockRename).not.toHaveBeenCalled();
    });

    // What arrives is a title as typed, and the folder is a slug derived from it.
    // Padding kept on the title would render on every surface.
    it('trims the requested title before using it', async () => {
        const project = projectToRename();
        const context = createMockContext();

        await renameProjectCore(context, project, '  Bodea B2B Demo  ');

        expect(project.title).toBe('Bodea B2B Demo');
        expect(project.name).toBe('bodea-b2b-demo');
    });

    it('reports a generic message when validation throws something that is not an Error', async () => {
        const project = projectToRename();
        const context = createMockContext();
        mockValidateName.mockImplementation(() => {
            throw 'not an Error';
        });

        const result = await renameProjectCore(context, project, 'new-name');

        expect(result).toStrictEqual({ success: false, error: 'Invalid project name' });
    });

    it('should block rename while the demo is running', async () => {
        const project = projectToRename({ status: 'running' });
        const context = createMockContext();

        const result = await renameProjectCore(context, project, 'new-name');

        expect(result.success).toBe(false);
        expect(mockRename).not.toHaveBeenCalled();
    });

    it('should reject an invalid project name', async () => {
        const project = projectToRename();
        const context = createMockContext();
        mockValidateName.mockImplementation(() => {
            throw new Error('Invalid name');
        });

        const result = await renameProjectCore(context, project, 'Bad Name');

        expect(result.success).toBe(false);
        expect(mockRename).not.toHaveBeenCalled();
    });

    it('should error when the target folder already exists', async () => {
        const project = projectToRename();
        const context = createMockContext();
        mockAccess.mockResolvedValue(undefined); // folder exists

        const result = await renameProjectCore(context, project, 'new-name');

        expect(result.success).toBe(false);
        expect(mockRename).not.toHaveBeenCalled();
    });

    it('should rename the folder on disk', async () => {
        const project = projectToRename();
        const context = createMockContext();

        await renameProjectCore(context, project, 'new-name');

        expect(mockRename).toHaveBeenCalledWith('/projects/old-name', '/projects/new-name');
    });

    it('should update project path and componentInstances paths', async () => {
        const project = projectToRename();
        const context = createMockContext();

        await renameProjectCore(context, project, 'new-name');

        expect(project.path).toBe('/projects/new-name');
        expect(project.componentInstances!['eds-storefront'].path).toBe(
            '/projects/new-name/storefront'
        );
    });

    it('should remove the old path from recent projects', async () => {
        const project = projectToRename();
        const context = createMockContext();

        await renameProjectCore(context, project, 'new-name');

        expect(context.stateManager.removeFromRecentProjects as jest.Mock).toHaveBeenCalledWith(
            '/projects/old-name'
        );
    });

    it('should save the renamed project', async () => {
        const project = projectToRename();
        const context = createMockContext();

        await renameProjectCore(context, project, 'new-name');

        expect(context.stateManager.saveProject as jest.Mock).toHaveBeenCalledWith(project);
        expect(project.name).toBe('new-name');
    });

    it('should return success with the new name and path', async () => {
        const project = projectToRename();
        const context = createMockContext();

        const result = await renameProjectCore(context, project, 'new-name');

        expect(result.success).toBe(true);
        expect(result.data).toEqual(
            expect.objectContaining({
                success: true,
                newName: 'new-name',
                newPath: '/projects/new-name',
            })
        );
    });

    it('regenerates AI context files for the new path (fixes stale MCP paths)', async () => {
        const project = projectToRename();
        const context = createMockContext();

        await renameProjectCore(context, project, 'new-name');

        // Regenerated with the NEW path + the mutated project + the extension path.
        expect(mockGenerateAIContextFiles).toHaveBeenCalledWith(
            '/projects/new-name',
            project,
            '/ext'
        );
    });

    it('does not regenerate AI context for a no-op rename (path unchanged)', async () => {
        const project = projectToRename();
        const context = createMockContext();

        await renameProjectCore(context, project, 'old-name');

        expect(mockGenerateAIContextFiles).not.toHaveBeenCalled();
    });

    // Renaming a project to the name it already has must not touch the disk at
    // all — moving a folder onto itself and dropping it from recent projects are
    // both real actions with nothing to undo them.
    it('touches neither the folder nor the recent list for a no-op rename', async () => {
        const project = projectToRename();
        const context = createMockContext();

        const result = await renameProjectCore(context, project, 'old-name');

        expect(result.success).toBe(true);
        expect(mockAccess).not.toHaveBeenCalled();
        expect(mockRename).not.toHaveBeenCalled();
        expect(context.stateManager.removeFromRecentProjects as jest.Mock).not.toHaveBeenCalled();
    });

    describe('rewriting component paths', () => {
        it('renames a project that has no componentInstances at all', async () => {
            const project = projectToRename({ componentInstances: undefined });
            const context = createMockContext();

            const result = await renameProjectCore(context, project, 'new-name');

            expect(result.success).toBe(true);
            expect(project.path).toBe('/projects/new-name');
        });

        // A component instance need not have a path (nothing has been installed
        // for it yet), and one may sit outside the project folder entirely.
        // Neither can be re-pointed, and reaching into either must not throw.
        it('leaves alone a component with no path, and one outside the project', async () => {
            const project = projectToRename({
                componentInstances: {
                    'not-installed': {
                        id: 'not-installed',
                        name: 'Not installed',
                        status: 'ready',
                    },
                    elsewhere: {
                        id: 'elsewhere',
                        name: 'Elsewhere',
                        status: 'ready',
                        path: '/somewhere/else',
                    },
                    'eds-storefront': {
                        id: 'eds-storefront',
                        name: 'EDS Storefront',
                        status: 'ready',
                        path: '/projects/old-name/storefront',
                    },
                },
            });
            const context = createMockContext();

            const result = await renameProjectCore(context, project, 'new-name');

            expect(result.success).toBe(true);
            expect(project.componentInstances!['not-installed'].path).toBeUndefined();
            expect(project.componentInstances!['elsewhere'].path).toBe('/somewhere/else');
            expect(project.componentInstances!['eds-storefront'].path).toBe(
                '/projects/new-name/storefront'
            );
        });
    });

    it('treats AI context regeneration failure as non-fatal (rename still succeeds)', async () => {
        const project = projectToRename();
        const context = createMockContext();
        mockGenerateAIContextFiles.mockRejectedValueOnce(new Error('regen boom'));

        const result = await renameProjectCore(context, project, 'new-name');

        expect(result.success).toBe(true);
        expect(context.logger.warn as jest.Mock).toHaveBeenCalled();
    });

    // The bundle writers stamp `aiContextVersion` on the project as they go.
    // Losing that stamp because the regeneration failed halfway leaves the
    // activation sweep refreshing the bundle on every start, for ever.
    it('still persists what the failed regeneration landed', async () => {
        const project = projectToRename();
        const context = createMockContext();
        mockGenerateAIContextFiles.mockRejectedValueOnce(new Error('regen boom'));

        await renameProjectCore(context, project, 'new-name');

        expect(context.stateManager.saveProjectConfigOnly as jest.Mock).toHaveBeenCalledWith(
            project
        );
    });

    it('reports a failure the caller can render when the move itself fails', async () => {
        const project = projectToRename();
        const context = createMockContext();
        mockRename.mockRejectedValue(new Error('EPERM'));

        const result = await renameProjectCore(context, project, 'new-name');

        expect(result).toStrictEqual({ success: false, error: 'Failed to rename project' });
    });
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
        const project = projectToRename();
        const context = createMockContext();

        await renameProjectCore(context, project, 'Bodea B2B Demo');

        expect(mockRename).toHaveBeenCalledWith('/projects/old-name', '/projects/bodea-b2b-demo');
    });

    it('stores the title as typed and the slug beside it', async () => {
        const project = projectToRename();
        const context = createMockContext();

        await renameProjectCore(context, project, 'Bodea B2B Demo');

        expect(project.title).toBe('Bodea B2B Demo');
        expect(project.name).toBe('bodea-b2b-demo');
    });

    it('rewrites component paths onto the new folder', async () => {
        const project = projectToRename();
        const context = createMockContext();

        await renameProjectCore(context, project, 'Bodea B2B Demo');

        expect(project.componentInstances?.['eds-storefront'].path).toBe(
            '/projects/bodea-b2b-demo/storefront'
        );
    });

    it('refuses a title with nothing to build a folder name from', async () => {
        // "!!!" normalises to an empty slug. Renaming to it would compute
        // `path.join(root, '')` -- the projects ROOT -- and move the project
        // directory onto it.
        const project = projectToRename();
        const context = createMockContext();

        const result = await renameProjectCore(context, project, '!!!');

        expect(result).toStrictEqual({
            success: false,
            error: '"!!!" has no letters or numbers to build a folder name from',
        });
        expect(mockRename).not.toHaveBeenCalled();
    });
});
