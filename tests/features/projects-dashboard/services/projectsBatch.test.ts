/**
 * Reset Selected and Delete Selected, the extension's half (owner, 2026-11-04): what the questions
 * read (and that they write nothing), and the run, one project at a time, each into its own row, a
 * failure never stopping the rest. The single delete and reset it reuses are faked; their own
 * suites test them.
 */

jest.mock('@/features/projects-dashboard/services/projectDeletionService', () => ({ runProjectDelete: jest.fn() }));
jest.mock('@/features/projects-dashboard/services/datapackDataRemoval', () => ({ hasRemovableData: jest.fn() }));
jest.mock('@/features/data-installer/handlers/removalChanges', () => ({ readRemovalChangesOf: jest.fn() }));
jest.mock('@/features/eds/services/storefront/sharedRepoProjects', () => ({ sharedOnlineOf: jest.fn() }));
jest.mock('@/features/data-installer/handlers/packSave', () => ({ ownNames: jest.fn() }));
// The library, for a pack's display name: unreachable unless a test says otherwise.
jest.mock('@/features/data-installer/handlers/libraryWriter', () => ({
    openLibraryWriter: jest.fn(async () => ({ ok: false, reason: 'not in this test' })),
    libraryDisplayName: jest.fn(async () => undefined),
}));

import * as vscode from 'vscode';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { libraryDisplayName } from '@/features/data-installer/handlers/libraryWriter';
import { ownNames } from '@/features/data-installer/handlers/packSave';
import { readRemovalChangesOf } from '@/features/data-installer/handlers/removalChanges';
import { sharedOnlineOf } from '@/features/eds/services/storefront/sharedRepoProjects';
import { hasRemovableData } from '@/features/projects-dashboard/services/datapackDataRemoval';
import { runProjectDelete } from '@/features/projects-dashboard/services/projectDeletionService';
import {
    byOrganization,
    prepareDeleteBatch,
    prepareResetBatch,
    runDeleteBatch,
    runResetBatch,
    saveNamesOf,
} from '@/features/projects-dashboard/services/projectsBatch';
import type { Project } from '@/types/base';
import type { ProjectsBatchRowStatus } from '@/types/projectsBatch';

const mockedShared = sharedOnlineOf as jest.MockedFunction<typeof sharedOnlineOf>;
const mockedHasData = hasRemovableData as jest.MockedFunction<typeof hasRemovableData>;
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
    mockedHasData.mockResolvedValue(false);
    setting('ask');
});

/** A storefront project whose datapack Demo Builder installed (the data a delete may remove). */
const withData = (name: string): Project => ({
    ...storefront(name),
    datapack: { name: 'bodea', version: 'main', store: 'library' },
    componentSelections: { backend: 'adobe-commerce-accs' },
});

describe('prepareDeleteBatch', () => {
    it('offers each project the options it has, unticked under ask', async () => {
        const a = storefront('a');

        const rows = await prepareDeleteBatch(contextWith(a), [a.path]);

        expect(rows).toStrictEqual([
            { path: a.path, name: 'a', repo: { name: 'acme/a', ticked: false }, site: { name: 'acme/a', ticked: false } },
        ]);
        expect(mockedShared).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ githubRepo: 'acme/a' }), [a.path]);
    });

    // Uninstall Datapack (walk F96): offered where Demo Builder installed the pack, with what the
    // reset batch reads about its changes, so the save question can ask for a name.
    it("offers the datapack's data where it can be removed, with whether its changes need a name", async () => {
        const mine = withData('mine');
        const theirs = withData('theirs');
        const none = withData('none');
        mockedHasData.mockImplementation(async (project) => project.name !== 'none');
        mockedChanges.mockImplementation(async (_c, project) =>
            project.name === 'mine' ? { count: 2, kinds: [], packName: 'My Bodea', alwaysSave: false } : { count: 1, kinds: [], alwaysSave: false },
        );

        const rows = await prepareDeleteBatch(contextWith(mine, theirs, none), [mine.path, theirs.path, none.path]);

        expect(rows.map((row) => row.datapack)).toStrictEqual([{ name: 'My Bodea', changes: 'saves' }, { name: 'bodea', changes: 'asks' }, undefined]);
        expect(mockedHasData).toHaveBeenCalledWith(mine);
    });

    it('ticks the repository and the site under deleteAll; the data has no box that starts ticked', async () => {
        setting('deleteAll');
        const a = withData('a');
        mockedHasData.mockResolvedValue(true);
        mockedChanges.mockResolvedValue({ count: 0, kinds: [], alwaysSave: false });

        const [row] = await prepareDeleteBatch(contextWith(a), [a.path]);

        expect(row).toStrictEqual({ path: a.path, name: 'a', repo: { name: 'acme/a', ticked: true }, site: { name: 'acme/a', ticked: true }, datapack: { name: 'bodea' } });
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

    // A pack whose changes could not be read stays installed (owner, 2026-11-04, option B): a
    // batch never discards changes nobody could see. It read as "no changes" until then, so the
    // pack was removed and whatever had changed was lost.
    it('marks a pack whose changes could not be read, so the batch keeps it', async () => {
        const unread = withPack('unread');
        mockedChanges.mockResolvedValue(undefined);

        const [row] = await prepareResetBatch(contextWith(unread), [unread.path]);

        expect(row.datapack).toStrictEqual({ name: 'bodea', changes: 'unchecked' });
    });

    // The save question names each pack, so it is the name the Datapacks screen shows, not its id (F17).
    it("names a library pack by its display name", async () => {
        const team = withPack('team');
        mockedChanges.mockResolvedValue({ count: 1, kinds: [], alwaysSave: false });
        (libraryDisplayName as jest.Mock).mockResolvedValueOnce('Team Bodea Pack');

        const [row] = await prepareResetBatch(contextWith(team), [team.path]);

        expect(row.datapack).toStrictEqual({ name: 'Team Bodea Pack', changes: 'asks' });
        expect(libraryDisplayName).toHaveBeenCalledWith(expect.anything(), team.datapack);
    });

    // The card's own line under each name, so the confirm reads like the list (owner, 2026-11-04:
    // bare names looked pitiful). Read from the real catalog, as the card reads it.
    it("carries the project's package and stack, as its card says them", async () => {
        const starter: Project = { ...storefront('starter'), selectedPackage: 'starter', selectedStack: 'eds-accs' };

        const [row] = await prepareResetBatch(contextWith(starter), [starter.path]);

        expect(row.summary).toBe('Starter (B2B + B2C), Edge Delivery + ACCS');
    });

    // The run heads each org's projects when a batch spans several (owner, 2026-11-04).
    it("carries the project's IMS organization by its name, its id when it has no name", async () => {
        const named: Project = { ...storefront('named'), adobe: { organization: 'ORG1', organizationName: 'Adobe Demo Org' } };
        const bare: Project = { ...storefront('bare'), adobe: { organization: 'ORG2' } };

        const rows = await prepareResetBatch(contextWith(named, bare), [named.path, bare.path]);

        expect(rows.map((row) => row.org)).toStrictEqual(['Adobe Demo Org', 'ORG2']);
    });

    // A project by the name its card shows, not its folder (owner, 2026-11-04: "patch-canary-b2b"
    // in the window, "Patch Canary B2B" on the card behind it).
    it('names each project as its card does', async () => {
        const titled: Project = { ...storefront('patch-canary-b2b'), title: 'Patch Canary B2B' };

        const [reset] = await prepareResetBatch(contextWith(titled), [titled.path]);
        const [deleting] = await prepareDeleteBatch(contextWith(titled), [titled.path]);

        expect([reset.name, deleting.name]).toStrictEqual(['Patch Canary B2B', 'Patch Canary B2B']);
    });

    // The confirm names what a reset overwrites: the storefront's repository (owner, 2026-11-04).
    it("carries the storefront's repository", async () => {
        const one = storefront('one');

        const [row] = await prepareResetBatch(contextWith(one), [one.path]);

        expect(row.repository).toBe('acme/one');
    });

    it('offers no datapack for a project without one', async () => {
        const plain = storefront('plain');

        expect(await prepareResetBatch(contextWith(plain), [plain.path])).toStrictEqual([
            { path: plain.path, name: 'plain', repository: 'acme/plain', org: 'Acme Demo Org' },
        ]);
        expect(mockedChanges).not.toHaveBeenCalled();
    });
});

// What "Save Your Changes First?" needs (step-05 S1, J7-2): the names a new datapack may not take,
// and whether the setting saves into the SC's own without asking (P5-Q6).
describe('saveNamesOf', () => {
    const mockedOwnNames = ownNames as jest.MockedFunction<typeof ownNames>;

    it("reads the SC's datapacks' names when a pack has changes, and the setting", async () => {
        mockedOwnNames.mockResolvedValue(['My Luma', 'My Bodea']);
        setting('save');
        const context = createMockHandlerContext();

        const names = await saveNamesOf(context, [{ datapack: { name: 'Bodea', changes: 'asks' } }]);

        expect(mockedOwnNames).toHaveBeenCalledWith(context);
        expect(names).toStrictEqual({ ownNames: ['My Luma', 'My Bodea'], alwaysSave: true });
    });

    it('asks the library nothing when no pack has changes a save could take', async () => {
        const names = await saveNamesOf(createMockHandlerContext(), [
            { datapack: { name: 'Bodea' } },
            { datapack: { name: 'Unread', changes: 'unchecked' } },
            {},
        ]);

        expect(mockedOwnNames).not.toHaveBeenCalled();
        expect(names).toStrictEqual({ ownNames: [], alwaysSave: false });
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
        const answer = (p: Project) => ({ path: p.path, deleteGitHubRepo: true, deleteDaLiveSite: false, removeDatapackData: false });

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
        expect(mockedDelete.mock.calls[0][2]).toMatchObject({ cleanupOptions: { deleteGitHubRepo: true, deleteDaLiveSite: false, removeDatapackData: false } });
    });

    // The save question's answer goes in up front: the removal asks nothing in the window (walk F96).
    it("removes the data when ticked, answering the changes question with the save question's answer", async () => {
        const a = withData('a');
        mockedDelete.mockResolvedValue({});

        await runDeleteBatch(
            contextWith(a),
            [{ path: a.path, deleteGitHubRepo: false, deleteDaLiveSite: false, removeDatapackData: true, changes: { saveAs: 'My Copy' } }],
            jest.fn(),
            jest.fn(),
        );

        const answered = mockedDelete.mock.calls[0][2];
        expect(answered.cleanupOptions).toStrictEqual({ deleteGitHubRepo: false, deleteDaLiveSite: false, removeDatapackData: true });
        // Given, not asked: it goes with the first read, so it reaches the SC's own pack too (step-05 S1).
        expect(answered.askName).toStrictEqual({ given: { saveAs: 'My Copy' } });
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

/**
 * Resets run side by side (owner, 2026-11-04: a reset takes about six minutes, and the notification
 * approach let two run at once). Up to three at a time within one IMS organization, since the token
 * reaches one org; orgs one after another; and resets that remove a pack's data from the store take
 * turns, so two never plan the store's clearing at once.
 */
describe('runResetBatch, side by side', () => {
    /** A reset per project that waits until the test ends it, recording how many run at once. */
    function heldResets() {
        const ends = new Map<string, () => void>();
        let running = 0;
        let most = 0;
        const started: string[] = [];
        const runReset = jest.fn(
            (_c: unknown, project: Project) =>
                new Promise<{ success: boolean }>((resolve) => {
                    running++;
                    most = Math.max(most, running);
                    started.push(project.name);
                    ends.set(project.name, () => {
                        running--;
                        resolve({ success: true });
                    });
                }),
        );
        const settle = async () => {
            for (let i = 0; i < 10; i++) await Promise.resolve();
        };
        return { runReset, ends, started, most: () => most, settle };
    }

    it('runs up to three at once in one org, the fourth when one ends', async () => {
        const projects = ['a', 'b', 'c', 'd'].map((n) => storefront(n, 'org-1'));
        const held = heldResets();
        const answers = projects.map((p) => ({ path: p.path, removeDatapack: false }));

        const done = runResetBatch(contextWith(...projects), answers, { tell: jest.fn(), report: jest.fn(), runReset: held.runReset });
        await held.settle();
        expect(held.started).toStrictEqual(['a', 'b', 'c']);

        held.ends.get('b')?.();
        await held.settle();
        expect(held.started).toStrictEqual(['a', 'b', 'c', 'd']);

        ['a', 'c', 'd'].forEach((n) => held.ends.get(n)?.());
        await expect(done).resolves.toBe(0);
        expect(held.most()).toBe(3);
    });

    it("starts an org's projects only once the org before it has finished", async () => {
        const one = storefront('one', 'org-1');
        const two = storefront('two', 'org-2');
        const held = heldResets();
        const answers = [one, two].map((p) => ({ path: p.path, removeDatapack: false }));

        const done = runResetBatch(contextWith(one, two), answers, { tell: jest.fn(), report: jest.fn(), runReset: held.runReset });
        await held.settle();
        expect(held.started).toStrictEqual(['one']);

        held.ends.get('one')?.();
        await held.settle();
        expect(held.started).toStrictEqual(['one', 'two']);
        held.ends.get('two')?.();
        await done;
    });

    it('lets resets that remove a pack take turns, and the others run beside them', async () => {
        const [a, b, c] = ['a', 'b', 'c'].map((n) => storefront(n, 'org-1'));
        const held = heldResets();
        const answers = [
            { path: a.path, removeDatapack: true },
            { path: b.path, removeDatapack: true },
            { path: c.path, removeDatapack: false },
        ];

        const done = runResetBatch(contextWith(a, b, c), answers, { tell: jest.fn(), report: jest.fn(), runReset: held.runReset });
        await held.settle();
        expect(held.started).toStrictEqual(['a', 'c']);

        held.ends.get('a')?.();
        await held.settle();
        expect(held.started).toStrictEqual(['a', 'c', 'b']);
        ['b', 'c'].forEach((n) => held.ends.get(n)?.());
        await done;
    });
});

// The row says what the notification says: the stage and how far through it (owner, 2026-11-04).
describe('a running row', () => {
    it("says its stage with the count, as the background notification does", async () => {
        const one = storefront('one');
        const told: ProjectsBatchRowStatus[] = [];
        const runReset = jest.fn(async (_c, _p, _a, report) => {
            report('Warming product pages', undefined, { index: 9, total: 11 });
            return { success: true };
        });

        await runResetBatch(contextWith(one), [{ path: one.path, removeDatapack: false }], { tell: (s) => told.push(s), report: jest.fn(), runReset });

        expect(told).toContainEqual({ path: one.path, state: 'running', message: 'Warming product pages (9 of 11)' });
    });
});

describe('byOrganization', () => {
    it('keeps the first appearance order of each organization, and projects with none together', () => {
        const org: Record<string, string | undefined> = { a: 'x', b: undefined, c: 'y', d: 'x', e: undefined };
        const ordered = byOrganization(['a', 'b', 'c', 'd', 'e'].map((path) => ({ path })), (path) => org[path]);

        expect(ordered.map((answer) => answer.path)).toStrictEqual(['a', 'd', 'b', 'e', 'c']);
    });
});
