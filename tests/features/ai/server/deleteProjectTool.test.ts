/**
 * delete_project tests — extra-strict confirm gate (confirm + name echo), name
 * resolution via getAllProjects + loadProjectFromPath, success/failure
 * passthrough, and what it SAYS while it runs. The deletion-service core is
 * mocked.
 */

// The shared wall first: it owns the subject import (webview-test-authoring §3).
import {
    cleanupBehavior,
    ctxFactory,
    fakeServer,
    getAllProjects,
    loadProjectFromPath,
    mockRunProjectDelete,
    registerDeleteProjectTool,
    useRealDelete,
} from './deleteProjectTool.testUtils';
import { z } from 'zod';
import { withPhaseSinks } from '@/core/utils/agentPhaseChannel';
import { deleteProjectFiles } from '@/features/projects-dashboard/services/projectFilesDeletion';
import type { AnsweredDelete, ProjectDeleteRun } from '@/features/projects-dashboard/services/projectDeletionService';

const deleteProjectFilesMock = deleteProjectFiles as jest.Mock;

/** What the tool handed the button's delete: the answered options of its one call. */
function handedToDelete(): AnsweredDelete {
    expect(mockRunProjectDelete).toHaveBeenCalledTimes(1);
    return mockRunProjectDelete.mock.calls[0][2] as AnsweredDelete;
}

/** The checklist the tool handed the delete, in the button's own option names. */
function ticked(deleteGitHubRepo: boolean, deleteDaLiveSite: boolean) {
    return { deleteGitHubRepo, deleteDaLiveSite, removeDatapackData: false, nobodyToAsk: true };
}

describe('delete_project', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getAllProjects.mockResolvedValue([
            { name: 'alpha', path: '/p/alpha' },
            { name: 'beta', path: '/p/beta' },
        ]);
        loadProjectFromPath.mockResolvedValue({ name: 'alpha', path: '/p/alpha' });
        deleteProjectFilesMock.mockResolvedValue(undefined);
        useRealDelete();
        cleanupBehavior('ask');
    });

    describe('what the tool declares to a client', () => {
        it('is announced as a destructive, non-read-only, unauthenticated tool', () => {
            const s = fakeServer();
            registerDeleteProjectTool(s, ctxFactory);

            expect(s.schema()).toMatchObject({
                needsAuth: false,
                annotations: { readOnlyHint: false, destructiveHint: true },
            });
        });

        // The gate the handler enforces has to be REACHABLE: an agent can only
        // send confirm/confirmName if the declared input shape accepts them.
        it("declares the name, both confirmation fields, the two cloud choices and the datapack data's", () => {
            const s = fakeServer();
            registerDeleteProjectTool(s, ctxFactory);
            const shape = s.schema().inputSchema as Record<string, z.ZodTypeAny>;

            // The two cloud choices mirror the checkboxes the button shows, and
            // like them they default to unticked (AI-9).
            expect(Object.keys(shape)).toEqual([
                'name',
                'confirm',
                'confirmName',
                'deleteGithubRepo',
                'deleteDaLiveSite',
                'removeData',
                'changes',
                'saveAs',
            ]);
            expect(z.object(shape).safeParse({ name: 'alpha' }).success).toBe(true);
            expect(z.object(shape).safeParse({}).success).toBe(false);
            expect(
                z.object(shape).safeParse({ name: 'alpha', confirm: 'yes' }).success
            ).toBe(false);
        });

        it('warns in its description that the deletion is local and irreversible', () => {
            const s = fakeServer();
            registerDeleteProjectTool(s, ctxFactory);

            expect(s.schema().description).toMatch(/Irreversible/);
        });
    });

    it('requires a name', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        expect(await s.call({ name: '' })).toMatchObject({
            error: expect.stringMatching(/name is required/),
        });
        expect(deleteProjectFilesMock).not.toHaveBeenCalled();
    });

    it('refuses without confirm + confirmName echo (irreversible)', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'alpha' });
        expect(res).toMatchObject({ irreversible: true });
        expect(res.error).toMatch(/confirmName:"alpha"/);
        expect(deleteProjectFilesMock).not.toHaveBeenCalled();
    });

    it('refuses when confirmName does not echo the name exactly', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'alpha', confirm: true, confirmName: 'beta' });
        expect(res).toMatchObject({ irreversible: true });
        expect(deleteProjectFilesMock).not.toHaveBeenCalled();
    });

    it('errors with the available names when the project is not found', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'gamma', confirm: true, confirmName: 'gamma' });
        expect(res).toMatchObject({
            error: expect.stringMatching(/No project named "gamma"/),
            projects: ['alpha', 'beta'],
        });
        expect(deleteProjectFilesMock).not.toHaveBeenCalled();
    });

    it('deletes the resolved project when confirm + confirmName echo exactly', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'alpha', confirm: true, confirmName: 'alpha' });
        expect(res).toEqual({ deleted: true, name: 'alpha' });
        expect(loadProjectFromPath).toHaveBeenCalledWith('/p/alpha');
        expect(deleteProjectFilesMock).toHaveBeenCalledWith(expect.anything(), {
            name: 'alpha',
            path: '/p/alpha',
        });
    });

    it('requires a name when called with no arguments at all', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        expect(await s.call()).toMatchObject({
            error: expect.stringMatching(/name is required/),
        });
        expect(getAllProjects).not.toHaveBeenCalled();
        expect(deleteProjectFilesMock).not.toHaveBeenCalled();
    });

    it('treats a whitespace-only name as missing', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        expect(await s.call({ name: '   ' })).toMatchObject({
            error: expect.stringMatching(/name is required/),
        });
        expect(deleteProjectFilesMock).not.toHaveBeenCalled();
    });

    // Each half of the gate on its own: an echoed confirmName with no confirm is
    // the case where a condition that only reads the second half still looks
    // correct on every other test in this file.
    it('refuses when confirmName echoes but confirm is absent', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'alpha', confirmName: 'alpha' });
        expect(res).toMatchObject({ irreversible: true });
        expect(deleteProjectFilesMock).not.toHaveBeenCalled();
    });

    it('refuses a truthy-but-not-true confirm', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'alpha', confirm: 'yes', confirmName: 'alpha' });
        expect(res).toMatchObject({ irreversible: true });
        expect(deleteProjectFilesMock).not.toHaveBeenCalled();
    });

    it('errors without deleting when the project record cannot be loaded', async () => {
        loadProjectFromPath.mockResolvedValueOnce(null);
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'alpha', confirm: true, confirmName: 'alpha' });
        expect(res).toEqual({ error: 'Failed to load project "alpha"' });
        expect(deleteProjectFilesMock).not.toHaveBeenCalled();
    });

    it('returns deleted:false with the error when deletion throws', async () => {
        deleteProjectFilesMock.mockRejectedValueOnce(new Error('EBUSY'));
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'alpha', confirm: true, confirmName: 'alpha' });
        expect(res).toMatchObject({ deleted: false, name: 'alpha', error: 'EBUSY' });
    });
});

/**
 * The steps an agent is shown (PL-59 slice 7, plan row 5b). The tool ran them
 * and reported none, so a delete that spends a minute unpublishing pages
 * announced itself once and went quiet.
 */
describe('what it says while it runs', () => {
    it('names the step it runs, so an agent notification has something to show', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const seen: string[] = [];

        await withPhaseSinks([(message) => seen.push(message)], () =>
            s.call({ name: 'alpha', confirm: true, confirmName: 'alpha' })
        );

        expect(seen).toEqual(['Deleting project files']);
        expect(deleteProjectFilesMock).toHaveBeenCalled();
    });
});

/**
 * The two cloud choices (AI-9), and the delete they go to: the button's own,
 * `runProjectDelete` (PL-104 fix 6), with nobody to ask. What the tool hands it is the
 * decision; the delete's steps are tested where they live (projectDeletionService and
 * edsExternalCleanup suites, `nobodyToAsk` included).
 */
describe('the two cloud choices', () => {
    const CONFIRMED = { name: 'alpha', confirm: true, confirmName: 'alpha' };
    const PROJECT = { name: 'alpha', path: '/p/alpha' };
    /** A storefront: what the delete reports online is read against these resources. */
    const STOREFRONT = {
        name: 'alpha',
        path: '/p/alpha',
        componentInstances: {
            'eds-storefront': { id: 'eds-storefront', metadata: { githubRepo: 'robin/alpha', daLiveOrg: 'robin', daLiveSite: 'alpha' } },
        },
    };

    /** The delete reports `rows` and answers `run`, as `runProjectDelete` does. */
    function deleteAnswers(rows: AnsweredDelete['cleanupResults'], run: ProjectDeleteRun = {}): void {
        mockRunProjectDelete.mockImplementation(async (_ctx: unknown, _project: unknown, answered: AnsweredDelete) => {
            answered.cleanupResults.push(...rows);
            return run;
        });
    }

    beforeEach(() => {
        jest.clearAllMocks();
        getAllProjects.mockResolvedValue([{ name: 'alpha', path: '/p/alpha' }]);
        loadProjectFromPath.mockResolvedValue(PROJECT);
        deleteProjectFilesMock.mockResolvedValue(undefined);
        useRealDelete();
        cleanupBehavior('ask');
    });

    it("runs the button's delete on the project, with nobody to ask", async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        await s.call(CONFIRMED);

        expect(mockRunProjectDelete).toHaveBeenCalledWith(expect.anything(), PROJECT, expect.anything(), expect.any(Function));
        expect(handedToDelete().cleanupOptions).toStrictEqual(ticked(false, false));
        expect(deleteProjectFilesMock).toHaveBeenCalledWith(expect.anything(), PROJECT);
    });

    it('asks for the repository alone when only that is ticked', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        await s.call({ ...CONFIRMED, deleteGithubRepo: true });

        expect(handedToDelete().cleanupOptions).toStrictEqual(ticked(true, false));
    });

    // What another project here still uses is kept, as the button never offers it (owner, 2026-11-04).
    it('keeps the repository and the site another local project uses, and says so', async () => {
        const storefront = (name: string, path: string) => ({
            name,
            path,
            componentInstances: {
                'eds-storefront': { id: 'eds-storefront', metadata: { githubRepo: 'acme/demo', daLiveOrg: 'acme', daLiveSite: 'demo' } },
            },
        });
        getAllProjects.mockResolvedValue([{ name: 'alpha', path: '/p/alpha' }, { name: 'beta', path: '/p/beta' }]);
        loadProjectFromPath.mockImplementation(async (path: string) => (path === '/p/beta' ? storefront('beta', '/p/beta') : storefront('alpha', '/p/alpha')));
        deleteAnswers([]);
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        const answer = await s.call({ ...CONFIRMED, deleteGithubRepo: true, deleteDaLiveSite: true });

        expect(handedToDelete().cleanupOptions).toMatchObject({ deleteGitHubRepo: false, deleteDaLiveSite: false });
        expect(answer).toMatchObject({
            deleted: true,
            kept: ['Kept the GitHub repository: beta also uses it.', 'Kept the DA.live site: beta also uses it.'],
        });
    });

    it('asks for the site alone when only that is ticked', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        await s.call({ ...CONFIRMED, deleteDaLiveSite: true });

        expect(handedToDelete().cleanupOptions).toStrictEqual(ticked(false, true));
    });

    // AI-71: a left-out choice was read as "no" before the setting was consulted, so
    // `deleteAll` never reached an agent's plain delete. The button ticks both boxes.
    it('under deleteAll, a plain call deletes the repository and site, as the button does', async () => {
        cleanupBehavior('deleteAll');
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        await s.call(CONFIRMED);

        expect(handedToDelete().cleanupOptions).toStrictEqual(ticked(true, true));
    });

    it('under deleteAll, a choice the call states is kept', async () => {
        cleanupBehavior('deleteAll');
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        await s.call({ ...CONFIRMED, deleteGithubRepo: false });

        expect(handedToDelete().cleanupOptions).toStrictEqual(ticked(false, true));
    });

    // Same bar as `confirm`: a word is not a tick.
    it('does not read a truthy word as a tick', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        await s.call({ ...CONFIRMED, deleteGithubRepo: 'yes', deleteDaLiveSite: 1 });

        expect(handedToDelete().cleanupOptions).toStrictEqual(ticked(false, false));
    });

    it('reports what the delete did online alongside the local delete', async () => {
        loadProjectFromPath.mockResolvedValue(STOREFRONT);
        deleteAnswers([{ type: 'github', name: 'robin/alpha', success: true }], {
            siteCode: { removed: 12, failed: [], stillServing: false },
        });
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        expect(await s.call({ ...CONFIRMED, deleteGithubRepo: true })).toEqual({
            deleted: true,
            name: 'alpha',
            githubRepo: { name: 'robin/alpha', deleted: true, siteCode: { removed: 12, notRemoved: 0, stillServing: false } },
        });
    });

    it("says why a sign-in it could not ask for skipped the repository", async () => {
        loadProjectFromPath.mockResolvedValue(STOREFRONT);
        const refused = 'Not signed in to GitHub, so the repository was not deleted. Sign in to GitHub, then delete again.';
        deleteAnswers([{ type: 'github', name: 'robin/alpha', success: false, skipped: true, error: refused }]);
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        expect(await s.call({ ...CONFIRMED, deleteGithubRepo: true })).toEqual({
            deleted: true,
            name: 'alpha',
            githubRepo: { name: 'robin/alpha', deleted: false, error: refused },
        });
    });

    it('still reports what the delete did online when the local delete then fails', async () => {
        loadProjectFromPath.mockResolvedValue(STOREFRONT);
        mockRunProjectDelete.mockImplementation(async (_ctx: unknown, _project: unknown, answered: AnsweredDelete) => {
            answered.cleanupResults.push({ type: 'github', name: 'robin/alpha', success: true });
            throw 'EBUSY';
        });
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        expect(await s.call({ ...CONFIRMED, deleteGithubRepo: true })).toEqual({
            deleted: false,
            name: 'alpha',
            githubRepo: { name: 'robin/alpha', deleted: true },
            error: 'EBUSY',
        });
    });

    // EDS-65: the project is how a second try finds the pages that are still live.
    it('keeps the project, and says why, when the delete stopped with pages still live', async () => {
        loadProjectFromPath.mockResolvedValue(STOREFRONT);
        const stopped = 'The pages could not be taken off the live site, so nothing else was deleted.';
        const torn = { contentDeleted: false, stillPublished: true, publishState: 'still-live' as const, publishSummary: 'Pages still answer.', stopped, error: stopped };
        deleteAnswers([{ type: 'daLive', name: 'robin/alpha', success: false, error: stopped }], { stopped, storefront: torn });
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        expect(await s.call({ ...CONFIRMED, deleteDaLiveSite: true, deleteGithubRepo: true })).toEqual({
            deleted: false,
            name: 'alpha',
            stopped,
            daLiveSite: { name: 'robin/alpha', contentDeleted: false, stillPublished: true, publishSummary: 'Pages still answer.', error: stopped },
            error: stopped,
        });
    });

    it('says the setting refused when "localOnly" overrode a tick', async () => {
        cleanupBehavior('localOnly');
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        const res = await s.call({ ...CONFIRMED, deleteDaLiveSite: true });

        expect(handedToDelete().cleanupOptions).toMatchObject({ deleteGitHubRepo: false, deleteDaLiveSite: false });
        expect(res).toEqual({
            deleted: true,
            name: 'alpha',
            note: 'demoBuilder.cleanupBehavior is "localOnly", so cloud resources are never deleted. Change the setting to delete them.',
        });
    });

    it('adds no note when nothing was refused', async () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);

        const res = await s.call({ ...CONFIRMED, deleteDaLiveSite: true });

        expect(res).toEqual({ deleted: true, name: 'alpha' });
    });
});

describe('what each input is described as', () => {
    it('tells the agent what every field is for', () => {
        const s = fakeServer();
        registerDeleteProjectTool(s, ctxFactory);
        const shape = s.schema().inputSchema as Record<string, z.ZodTypeAny>;

        expect(Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, v.description]))).toEqual({
            name: 'Name of the project to delete',
            confirm: 'Must be true to proceed',
            confirmName: 'Must equal the project name exactly — guards this irreversible deletion',
            deleteGithubRepo:
                "Also delete the project's GitHub repository (default: false, or true when the cleanupBehavior setting is deleteAll)",
            deleteDaLiveSite:
                "Also delete the project's DA.live site and take its pages off the CDN (default: false, or true when the cleanupBehavior setting is deleteAll)",
            removeData:
                "Also remove the project's datapack data from its Commerce instance, before anything else (default: false under every cleanupBehavior; refused under localOnly)",
            changes:
                "With removeData: keep saves the user's changes in the pack as a new datapack named by saveAs; drop loses them, in the user's own pack too. Left out, changes in the user's own pack are saved into it",
            saveAs: 'With changes:"keep": the new datapack of the user\'s that their changes are saved as',
        });
    });
});
