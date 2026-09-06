/**
 * projectRenameService Tests — putting a half-finished rename back, and the
 * remote Adobe I/O title sync
 *
 * Split from `projectRenameService.test.ts`. Both halves share
 * `projectRenameService.testUtils.ts`, which owns the fs/validation/AI-bundle
 * mocks AND the subject import that makes their hoisting work.
 *
 * Own setup, deliberately: a first draft of these read `mockRename` call
 * history left over from the other half and failed on counts that had nothing
 * to do with the code under test. `resetRenameMocks` is called here too.
 */

import type { HandlerContext } from '@/types/handlers';
import type { Project } from '@/types/base';
import {
    createMockContext,
    failSave,
    mockAccess,
    mockRename,
    projectToRename,
    renameProjectCore,
    resetRenameMocks,
} from './projectRenameService.testUtils';

beforeEach(() => {
    resetRenameMocks();
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
    it('moves the folder back', async () => {
        const project = projectToRename();
        const context = createMockContext();
        failSave(context);

        await renameProjectCore(context, project, 'Bodea B2B Demo').catch(() => undefined);

        expect(mockRename).toHaveBeenNthCalledWith(
            2,
            '/projects/bodea-b2b-demo',
            '/projects/old-name'
        );
    });

    // A rollback that worked leaves nothing for the user to repair, so the
    // caller must NOT be told the folder and the manifest disagree.
    it('reports the plain failure once the folder is back', async () => {
        const project = projectToRename();
        const context = createMockContext();
        failSave(context);

        const result = await renameProjectCore(context, project, 'Bodea B2B Demo');

        expect(result).toStrictEqual({ success: false, error: 'Failed to rename project' });
    });

    // Nothing moved, so there is nothing to move back — attempting it would
    // rename the folder onto itself on the way out of a failed save.
    it('does not move anything back when the rename was a no-op', async () => {
        const project = projectToRename();
        const context = createMockContext();
        failSave(context);

        const result = await renameProjectCore(context, project, 'old-name');

        expect(mockRename).not.toHaveBeenCalled();
        expect(result).toStrictEqual({ success: false, error: 'Failed to rename project' });
    });

    it('rolls back a project that has no componentInstances', async () => {
        const project = projectToRename({ componentInstances: undefined });
        const context = createMockContext();
        failSave(context);

        const result = await renameProjectCore(context, project, 'Bodea B2B Demo');

        expect(project.path).toBe('/projects/old-name');
        expect(result).toStrictEqual({ success: false, error: 'Failed to rename project' });
    });

    it('rolls back past a component with no path, and one outside the project', async () => {
        const project = projectToRename({
            componentInstances: {
                'not-installed': { id: 'not-installed', name: 'Not installed', status: 'ready' },
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
        failSave(context);

        const result = await renameProjectCore(context, project, 'Bodea B2B Demo');

        expect(result).toStrictEqual({ success: false, error: 'Failed to rename project' });
        expect(project.componentInstances!['not-installed'].path).toBeUndefined();
        expect(project.componentInstances!['elsewhere'].path).toBe('/somewhere/else');
        expect(project.componentInstances!['eds-storefront'].path).toBe(
            '/projects/old-name/storefront'
        );
    });

    it('restores the project to exactly what it was', async () => {
        const project = projectToRename();
        const context = createMockContext();
        failSave(context);

        await renameProjectCore(context, project, 'Bodea B2B Demo').catch(() => undefined);

        expect(project.name).toBe('old-name');
        expect(project.path).toBe('/projects/old-name');
        expect(project.title).toBeUndefined();
        expect(project.componentInstances?.['eds-storefront'].path).toBe(
            '/projects/old-name/storefront'
        );
    });

    it('reports the unrecoverable case rather than pretending it rolled back', async () => {
        // Both directions failed. This is the one state a user cannot infer from
        // the UI, because the folder and the manifest genuinely disagree.
        const project = projectToRename();
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
        return projectToRename({
            title: 'Old Title',
            adobe: {
                organization: 'org-1',
                projectId: 'proj-1',
                projectTitle: remoteTitle,
            },
        });
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
        expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining('remote'));
    });

    it('skips silently when the context has no authManager', async () => {
        const project = adobeProject('Old Title');
        const result = await renameProjectCore(createMockContext(), project, 'New Title');

        expect(result.success).toBe(true);
        expect(remoteRename).not.toHaveBeenCalled();
    });

    // Most projects have no Adobe I/O project attached at all. Reaching into
    // `project.adobe` unguarded turns a working local rename into a failed one.
    it('renames a project with no Adobe I/O project attached', async () => {
        const project = projectToRename({ adobe: undefined });

        const result = await renameProjectCore(contextWithAuth(), project, 'New Title');

        expect(result.success).toBe(true);
        expect(project.name).toBe('new-title');
        expect(remoteRename).not.toHaveBeenCalled();
    });

    // Half an Adobe reference is not a reference. Calling the Console API with
    // an undefined project id is a request against someone else's org.
    it('does not call the Console API when the project id is missing', async () => {
        const project = projectToRename({
            title: 'Old Title',
            adobe: { organization: 'org-1', projectTitle: 'Old Title' },
        } as Partial<Project>);

        const result = await renameProjectCore(contextWithAuth(), project, 'New Title');

        expect(result.success).toBe(true);
        expect(remoteRename).not.toHaveBeenCalled();
    });

    // A refusal the SDK reports rather than throws. The demo is renamed either
    // way, but recording a remote title that was never applied would make the
    // next rename skip the sync as "already diverged".
    it('leaves the recorded remote title alone when the Console refuses', async () => {
        remoteRename.mockResolvedValue(false);
        const project = adobeProject('Old Title');

        const result = await renameProjectCore(contextWithAuth(), project, 'New Title');

        expect(result.success).toBe(true);
        expect(project.adobe?.projectTitle).toBe('Old Title');
    });
});
