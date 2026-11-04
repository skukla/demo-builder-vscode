/**
 * Reset Selected and Delete Selected, the extension's half (owner, 2026-11-04): what the questions
 * read (and that they write nothing), and the run, one project at a time, each into its own row, a
 * failure never stopping the rest. The single delete and reset it reuses are faked; their own
 * suites test them.
 */

jest.mock('@/features/projects-dashboard/services/projectDeletionService', () => ({ runProjectDelete: jest.fn() }));
jest.mock('@/features/projects-dashboard/services/demoPackDeletion', () => ({ deletablePackOf: jest.fn() }));
jest.mock('@/features/data-installer/handlers/removalChanges', () => ({ readRemovalChangesOf: jest.fn() }));
jest.mock('@/features/eds/services/storefront/sharedRepoProjects', () => ({ sharedOnlineOf: jest.fn() }));

import * as vscode from 'vscode';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { readRemovalChangesOf } from '@/features/data-installer/handlers/removalChanges';
import { sharedOnlineOf } from '@/features/eds/services/storefront/sharedRepoProjects';
import { deletablePackOf } from '@/features/projects-dashboard/services/demoPackDeletion';
import { runProjectDelete } from '@/features/projects-dashboard/services/projectDeletionService';
import {
    byOrganization,
    prepareDeleteBatch,
    prepareResetBatch,
    runDeleteBatch,
    runResetBatch,
} from '@/features/projects-dashboard/services/projectsBatch';
import type { Project } from '@/types/base';
import type { ProjectsBatchRowStatus } from '@/types/projectsBatch';

const mockedShared = sharedOnlineOf as jest.MockedFunction<typeof sharedOnlineOf>;
const mockedPack = deletablePackOf as jest.MockedFunction<typeof deletablePackOf>;
const mockedChanges = readRemovalChangesOf as jest.MockedFunction<typeof readRemovalChangesOf>;
const mockedDelete = runProjectDelete as jest.MockedFunction<typeof runProjectDelete>;

const storefront = (name: string, org?: string): Project =>
    createMockProject({
        name,
        path: `/projects/${name}`,
        ...(org ? { adobe: { organization: org } as Project['adobe'] } : {}),
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { githubRepo: `acme/${name}`, daLiveOrg: 'acme', daLiveSite: name },
            },
        },
    });

function contextWith(...projects: Project[]) {
    const context = createMockHandlerContext();
    (context.stateManager.loadProjectFromPath as jest.Mock).mockImplementation(async (path: string) => projects.find((p) => p.path === path) ?? null);
    return context;
}

const setting = (value: string) => (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({ get: () => value });

beforeEach(() => {
    jest.clearAllMocks();
    mockedShared.mockResolvedValue({ repo: [], site: [] });
    mockedPack.mockResolvedValue(undefined);
    setting('ask');
});

describe('prepareDeleteBatch', () => {
    it('offers each project the options it has, unticked under ask, and the pack when it may go', async () => {
        const a = storefront('a');
        mockedPack.mockResolvedValueOnce({ name: 'a-pack', displayName: 'A Pack' });

        const rows = await prepareDeleteBatch(contextWith(a), [a.path]);

        expect(rows).toStrictEqual([
            { path: a.path, name: 'a', repo: { name: 'acme/a', ticked: false }, site: { name: 'acme/a', ticked: false }, datapack: { name: 'A Pack', ticked: false } },
        ]);
        // The batch's own projects are going: a pack only they use may go.
        expect(mockedPack).toHaveBeenCalledWith(expect.anything(), a, [a.path]);
        expect(mockedShared).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ githubRepo: 'acme/a' }), [a.path]);
    });

    it('ticks the repository and the site under deleteAll, never the pack', async () => {
        setting('deleteAll');
        const a = storefront('a');
        mockedPack.mockResolvedValueOnce({ name: 'a-pack', displayName: 'A Pack' });

        const [row] = await prepareDeleteBatch(contextWith(a), [a.path]);

        expect(row).toMatchObject({ repo: { ticked: true }, site: { ticked: true }, datapack: { ticked: false } });
    });

    it('offers nothing under localOnly, and nothing another project still uses', async () => {
        const a = storefront('a');
        setting('localOnly');
        expect(await prepareDeleteBatch(contextWith(a), [a.path])).toStrictEqual([{ path: a.path, name: 'a' }]);

        setting('ask');
        mockedShared.mockResolvedValueOnce({ repo: ['other'], site: ['other'] });
        expect(await prepareDeleteBatch(contextWith(a), [a.path])).toStrictEqual([{ path: a.path, name: 'a' }]);
    });

    it('leaves out a project that no longer loads', async () => {
        expect(await prepareDeleteBatch(contextWith(), ['/projects/gone'])).toStrictEqual([]);
    });
});

describe('prepareResetBatch', () => {
    const BACKEND = 'adobe-commerce-accs';
    const withPack = (name: string): Project => ({
        ...storefront(name),
        datapack: { name: 'bodea', version: 'main', store: 'library' },
        // The field every real project carries, and the one `commerceBackendOf` reads.
        componentSelections: { backend: BACKEND },
    });

    it("says whether a pack's changes save into the SC's own pack or need a name", async () => {
        const mine = withPack('mine');
        const theirs = withPack('theirs');
        const quiet = withPack('quiet');
        mockedChanges.mockImplementation(async (_c, project) => {
            if (project.name === 'mine') return { count: 2, kinds: [], packName: 'My Bodea', alwaysSave: false };
            if (project.name === 'theirs') return { count: 1, kinds: [], alwaysSave: false };
            return { count: 0, kinds: [], alwaysSave: false };
        });

        const rows = await prepareResetBatch(contextWith(mine, theirs, quiet), [mine.path, theirs.path, quiet.path]);

        expect(rows.map((row) => row.datapack)).toStrictEqual([
            { name: 'My Bodea', changes: 'saves' },
            { name: 'bodea', changes: 'asks' },
            { name: 'bodea' },
        ]);
    });

    it('offers no datapack for a project without one', async () => {
        const plain = storefront('plain');

        expect(await prepareResetBatch(contextWith(plain), [plain.path])).toStrictEqual([{ path: plain.path, name: 'plain' }]);
        expect(mockedChanges).not.toHaveBeenCalled();
    });
});

describe('runDeleteBatch', () => {
    it('tells every row waiting, then runs each in turn, and a failure does not stop the rest', async () => {
        const a = storefront('a');
        const b = storefront('b');
        const c = storefront('c');
        mockedDelete
            .mockImplementationOnce(async (_ctx, _p, _answered, report) => {
                report('Deleting the repository');
                return {};
            })
            .mockResolvedValueOnce({ stopped: 'Pages are still live.' })
            .mockRejectedValueOnce(new Error('disk full'));
        const told: ProjectsBatchRowStatus[] = [];
        const answer = (p: Project) => ({ path: p.path, deleteGitHubRepo: true, deleteDaLiveSite: false, deleteDatapack: false });

        const failed = await runDeleteBatch(contextWith(a, b, c), [answer(a), answer(b), answer(c)], (s) => told.push(s), jest.fn());

        expect(failed).toBe(2);
        expect(told).toStrictEqual([
            { path: a.path, state: 'waiting' },
            { path: b.path, state: 'waiting' },
            { path: c.path, state: 'waiting' },
            { path: a.path, state: 'running' },
            { path: a.path, state: 'running', message: 'Deleting the repository' },
            { path: a.path, state: 'done' },
            { path: b.path, state: 'running' },
            { path: b.path, state: 'failed', message: 'Pages are still live.' },
            { path: c.path, state: 'running' },
            { path: c.path, state: 'failed', message: 'disk full' },
        ]);
        expect(mockedDelete.mock.calls[0][2]).toMatchObject({ cleanupOptions: { deleteGitHubRepo: true, deleteDaLiveSite: false, deleteDatapack: false } });
    });

    it('takes the pack only when ticked, as the batch sees it', async () => {
        const a = storefront('a');
        mockedDelete.mockResolvedValue({});
        mockedPack.mockResolvedValue({ name: 'a-pack', displayName: 'A Pack' });

        await runDeleteBatch(contextWith(a), [{ path: a.path, deleteGitHubRepo: false, deleteDaLiveSite: false, deleteDatapack: true }], jest.fn(), jest.fn());

        expect(mockedPack).toHaveBeenCalledWith(expect.anything(), a, [a.path]);
        expect(mockedDelete.mock.calls[0][2]).toMatchObject({ ownPack: { name: 'a-pack' } });
    });
});

describe('runResetBatch', () => {
    it('runs grouped by IMS organization, in the order picked within each, with each answer', async () => {
        const one = storefront('one', 'org-1');
        const two = storefront('two', 'org-2');
        const three = storefront('three', 'org-1');
        const runReset = jest.fn().mockResolvedValue({ success: true });
        const answers = [one, two, three].map((p) => ({ path: p.path, removeDatapack: false }));

        const failed = await runResetBatch(contextWith(one, two, three), answers, { tell: jest.fn(), report: jest.fn(), runReset });

        expect(failed).toBe(0);
        expect(runReset.mock.calls.map((call) => call[1].name)).toStrictEqual(['one', 'three', 'two']);
        expect(runReset.mock.calls[0][2]).toStrictEqual({ path: one.path, removeDatapack: false });
    });

    it("marks a reset that did not finish with its own reason", async () => {
        const one = storefront('one');
        const told: ProjectsBatchRowStatus[] = [];
        const runReset = jest.fn().mockResolvedValue({ success: false, error: 'Sign in to DA.live.' });

        await runResetBatch(contextWith(one), [{ path: one.path, removeDatapack: false }], { tell: (s) => told.push(s), report: jest.fn(), runReset });

        expect(told.at(-1)).toStrictEqual({ path: one.path, state: 'failed', message: 'Sign in to DA.live.' });
    });
});

describe('byOrganization', () => {
    it('keeps the first appearance order of each organization, and projects with none together', () => {
        const org: Record<string, string | undefined> = { a: 'x', b: undefined, c: 'y', d: 'x', e: undefined };
        const ordered = byOrganization(['a', 'b', 'c', 'd', 'e'].map((path) => ({ path })), (path) => org[path]);

        expect(ordered.map((answer) => answer.path)).toStrictEqual(['a', 'd', 'b', 'e', 'c']);
    });
});
