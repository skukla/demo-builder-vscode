/**
 * Clear Commerce Instance (datapack-simplification step 06 C4, with its review fixes):
 * `check-demo-data` with `websites: []` answers the instance's websites, each with the local projects
 * on THIS instance using it; with websites named, the list for clearing them; `clear-commerce-instance`
 * uninstalls each project's datapack first, only a pack every record of which is on a chosen website
 * of this instance, then wipes, behind `confirm` and `understood`.
 *
 * The projects live on a fake disk behind the state manager: the clearing reads each one right
 * before its step, and the removal's own forget step (`forgetRemovedPack`, real) writes it back, so
 * what reaches each manifest is asserted, not assumed. The engine's removal is faked per project.
 */

import { instanceClearRequest } from '@/features/ai/server/datapackAnswerArgs';
import {
    createDemoDataHandlers,
    type DemoDataDeps,
} from '@/features/data-installer/handlers/demoDataHandlers';
import type { DatapackRemovalChanges } from '@/features/data-installer/removalChanges';
import {
    type InstallRecord,
    installRecordPath,
} from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { shownClearFor } from '@/features/data-installer/services/demoDataWipe/shownClears';
import {
    forgetRemovedPack,
    type SaveAsAnswer,
} from '@/features/eds/services/reset/edsResetSampleData';
import type { DatapackRemoval } from '@/features/eds/services/reset/resetDatapackStep';
import type { Project } from '@/types/base';
import type {
    ClearCheck,
    ClearInstanceRequest,
    DemoDataRequest,
    InstanceChoices,
} from '@/types/demoDataWipe';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext } from '@/types/handlers';
import type { OperationRow } from '@/types/webviewPayloads';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { PROJECT_RECORDS } from '../services/demoDataWipe/wipe.testUtils';
import { NEIGHBOUR, PROJECT, type Files, type Store, cleanStore, setUp } from './demoDataHandlers.testUtils';

const TENANT = 'https://na1-sandbox.api.commerce.adobe.com/ZzTenantOne/graphql';
const SITE = 'justrite_test_website';

/** A project on this instance (or the tenant given), its install target on the website given. */
function on(project: Project, websiteCode = SITE, endpoint = TENANT): Project {
    return {
        ...project,
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: {
            'adobe-commerce-accs': {
                ACCS_STORE_VIEW_CODE: `${websiteCode}_view`,
                ACCS_WEBSITE_CODE: websiteCode,
                ACCS_GRAPHQL_ENDPOINT: endpoint,
            },
        },
    };
}
const named = (name: string, title: string, pack?: string): Project =>
    createMockProject({
        name,
        title,
        path: `/nonexistent/projects/${name}`,
        ...(pack ? { datapack: { name: pack, version: '1' } } : {}),
    });
const recordOf = (pack: string, websiteCode: string, ids: string[]): InstallRecord => ({
    ...PROJECT_RECORDS[0],
    pack: { name: pack, version: '1' },
    target: { websiteCode, storeCode: `${websiteCode}_view` },
    created: ids.map((id) => ({ kind: 'products', id })),
});

const OPEN = on({ ...PROJECT, title: 'Zz Tester' });
const NB = on({ ...NEIGHBOUR, datapack: { name: 'nb-pack', version: '1' } });
const NB_RECORD = recordOf('nb-pack', SITE, ['ZZ-ONLY-HERE']);
/** On this instance, on a website not chosen, with no datapack. */
const ELSEWHERE = on(named('elsewhere', 'Elsewhere'), 'justrite');
/** The same website code, on ANOTHER tenant: it may be this store's website or not. */
const FAR = on(
    named('far', 'Far Away', 'far-pack'),
    SITE,
    'https://na1-sandbox.api.commerce.adobe.com/ZzTenantTwo/graphql'
);
const FAR_RECORD = recordOf('far-pack', SITE, ['ZZ-JACKET']);

interface Seen {
    paths: string[];
    given: SaveAsAnswer[];
    writesBefore: number[];
    leaving: Array<readonly string[]>;
    objects: Project[];
}

interface How {
    fails?: Record<string, DatapackRemoval>;
    /** Removals that leave their pack's record and data in place on purpose. */
    leaves?: string[];
}

/** The engine's removal, per project: its pack's record lists leave the store, the record goes, and the real forget step saves the project. */
function removal(store: Store, files: Files, seen: Seen, how: How) {
    return async (
        project: Project,
        context: HandlerContext,
        _report: unknown,
        given: SaveAsAnswer,
        leaving: readonly string[]
    ): Promise<DatapackRemoval> => {
        seen.paths.push(project.path);
        seen.objects.push(project);
        seen.given.push(given);
        seen.writesBefore.push(store.sent.length);
        seen.leaving.push(leaving);
        const failed = how.fails?.[project.path];
        if (failed) return failed;
        if (how.leaves?.includes(project.path)) return { leftInStore: true };
        const pack = project.datapack;
        if (!pack) return { kept: 'No datapack.' };
        const path = installRecordPath(project.path, pack);
        const record = JSON.parse(files.data.get(path) ?? '{"created":[]}') as InstallRecord;
        const ids = new Set(record.created.map((o) => o.id));
        store.data.products = store.data.products.filter((p) => !ids.has(p.sku));
        store.data.customers = store.data.customers.filter((c) => !ids.has(String(c.id)));
        files.data.delete(path);
        await forgetRemovedPack(project, context);
        return {};
    };
}

const NB_CHANGES: DatapackRemovalChanges = {
    count: 2,
    kinds: [],
    alwaysSave: false,
    sentence: 'You changed 2 products.',
};

interface Options extends How {
    others?: Project[];
    records?: Array<[Project, InstallRecord]>;
    changes?: Record<string, DatapackRemovalChanges>;
    store?: Store;
}

function instanceSetUp(options: Options = {}) {
    const made = setUp({}, options.store, OPEN);
    const others = options.others ?? [NB, ELSEWHERE, FAR];
    const records = options.records ?? [
        [NB, NB_RECORD],
        [FAR, FAR_RECORD],
    ];
    for (const [project, record] of records)
        made.files.data.set(installRecordPath(project.path, record.pack), JSON.stringify(record));
    // The manifests on disk: every load is a fresh copy, every save replaces it.
    const disk = new Map<string, Project>(others.map((p) => [p.path, structuredClone(p)]));
    const read = async (path: string): Promise<Project | null> =>
        disk.has(path) ? structuredClone(disk.get(path) as Project) : null;
    const write = async (project: Project): Promise<void> =>
        void disk.set(project.path, structuredClone(project));
    const stateManager = createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue(made.current),
        loadProjectFromPath: jest.fn(read),
        saveProject: jest.fn(write),
        saveProjectConfigOnly: jest.fn(write),
    });
    const context = createMockHandlerContext({ stateManager }) as HandlerContext;
    const seen: Seen = { paths: [], given: [], writesBefore: [], leaving: [], objects: [] };
    const deps: DemoDataDeps = {
        ...made.deps,
        others: async () => Promise.all(others.map(async (p) => (await read(p.path)) as Project)),
        changes: async (_context, project) => options.changes?.[project.path],
        ownNames: async () => ['My Luma'],
        remove: jest.fn(removal(made.store, made.files, seen, options)),
    };
    return {
        ...made,
        context,
        stateManager,
        disk,
        deps,
        seen,
        handlers: createDemoDataHandlers(deps),
    };
}
type Made = ReturnType<typeof instanceSetUp>;

async function shown(made: Made, websites = [SITE]): Promise<ClearCheck> {
    const res = await made.handlers['check-demo-data'](made.context, { websites });
    expect(res.success).toBe(true);
    return res.data as ClearCheck;
}

const consent = (
    token: string,
    more: Partial<ClearInstanceRequest> = {}
): ClearInstanceRequest => ({ token, confirm: true, understood: true, ...more });
const writes = (made: Made): string[] => made.store.sent.map((w) => w.path);

describe('check-demo-data, the instance (step 06 C4)', () => {
    it("lists the instance's websites, each with the projects on THIS instance using it; a website none uses has none", async () => {
        const made = instanceSetUp();

        const res = await made.handlers['check-demo-data'](made.context, { websites: [] });

        expect(res.data as InstanceChoices).toEqual({
            websites: [
                { code: 'base', name: 'Main Website', projects: [] },
                { code: 'justrite', name: 'JustRite', projects: ['Elsewhere'] },
                { code: 'bodea', name: 'Bodea', projects: [] },
                { code: SITE, name: 'JustRite Test', projects: ['Zz Tester', 'Neighbour Demo'] },
            ],
        });
    });

    it('lists each project on the websites named: the datapacks it uninstalls first, and why another keeps its data', async () => {
        const made = instanceSetUp({ changes: { [NB.path]: NB_CHANGES } });

        const check = await shown(made);

        // The neighbour's record lists ZZ-ONLY-HERE: Clear Demo Data keeps it, the instance clearing takes it.
        expect(check.records.products.removed).toContain('ZZ-ONLY-HERE');
        expect(check.records.products.removed).not.toContain('ZZ-JACKET');
        expect(check.instance).toEqual({
            projects: [
                {
                    path: OPEN.path,
                    name: 'Zz Tester',
                    datapack: { name: 'zz-test', changes: 'unchecked' },
                },
                {
                    path: NB.path,
                    name: 'Neighbour Demo',
                    datapack: { name: 'nb-pack', changes: 'asks' },
                },
                {
                    path: FAR.path,
                    name: 'Far Away',
                    kept: 'Far Away keeps its data on these websites: it may be on another Commerce instance with a website of the same code.',
                },
            ],
            ownNames: ['My Luma'],
            alwaysSave: false,
        });
    });

    it('refuses a website list that is not a list of codes', async () => {
        const made = instanceSetUp();
        // As an agent might send it: parsed, so no cast stands between the test and the handler's own check.
        const malformed: DemoDataRequest = JSON.parse(`{ "websites": ["${SITE}", 7] }`);

        expect(await made.handlers['check-demo-data'](made.context, malformed)).toMatchObject({
            success: false,
            code: ErrorCode.INVALID_OPERATION,
        });
    });
});

describe('clear-commerce-instance (step 06 C4)', () => {
    it("uninstalls each project's datapack first, each read from disk at its step with its own answer, then wipes", async () => {
        const made = instanceSetUp({ changes: { [NB.path]: NB_CHANGES } });
        const { token } = await shown(made);

        const res = await made.handlers['clear-commerce-instance'](
            made.context,
            consent(token, { changes: { [NB.path]: { saveAs: 'My Neighbour' } } })
        );

        expect(res.success).toBe(true);
        expect(made.seen.objects[0]).toBe(made.current);
        expect(made.seen.paths).toEqual([OPEN.path, NB.path]);
        expect(made.seen.given).toEqual([undefined, { saveAs: 'My Neighbour' }]);
        // No wipe write before every removal went through.
        expect(made.seen.writesBefore).toEqual([0, 0]);
        expect(made.store.sent.length).toBeGreaterThan(0);
        // The neighbour's manifest names no datapack, written to disk only: the open project never moved.
        expect(made.disk.get(NB.path)?.datapack).toBeUndefined();
        expect(made.stateManager.saveProjectConfigOnly.mock.calls.map(([p]) => p.path)).toEqual([
            NB.path,
        ]);
        expect(made.stateManager.saveProject.mock.calls.map(([p]) => p.path)).toEqual([OPEN.path]);
        expect(res.note).toContain('Each datapack can be installed again from the library.');
    });

    it('hands each removal the products the shown list deletes', async () => {
        const made = instanceSetUp();
        const { token } = await shown(made);

        await made.handlers['clear-commerce-instance'](made.context, consent(token));

        expect(made.seen.leaving[0]).toEqual(made.seen.leaving[1]);
        expect(made.seen.leaving[0]).toContain('ZZ-ONLY-HERE');
    });

    it('never uninstalls a pack also on a website not chosen, and keeps its data on the chosen one too (review 1)', async () => {
        const wide = recordOf('nb-pack', 'justrite', ['ZZ-SHARED-WITH-JUSTRITE']);
        const onSite = recordOf('nb-older', SITE, ['ZZ-ONLY-HERE']);
        const made = instanceSetUp({
            records: [
                [NB, wide],
                [NB, onSite],
            ],
        });
        const check = await shown(made);

        const res = await made.handlers['clear-commerce-instance'](
            made.context,
            consent(check.token)
        );

        const kept =
            'Neighbour Demo keeps its datapack nb-pack, which is also on the website justrite, and its data on these websites.';
        expect(check.instance?.projects.find((p) => p.path === NB.path)?.kept).toBe(kept);
        expect(made.seen.paths).toEqual([OPEN.path]);
        expect(writes(made)).not.toContain('products/ZZ-ONLY-HERE');
        expect(made.store.data.products.map((p) => p.sku)).toEqual(
            expect.arrayContaining(['ZZ-ONLY-HERE', 'ZZ-SHARED-WITH-JUSTRITE'])
        );
        expect(made.disk.get(NB.path)?.datapack).toEqual({ name: 'nb-pack', version: '1' });
        expect(res.note).toContain(kept);
    });

    it('keeps the data of a project on a website of the same code it cannot match to this instance (review 2)', async () => {
        const made = instanceSetUp();
        const { token } = await shown(made);

        await made.handlers['clear-commerce-instance'](made.context, consent(token));

        expect(made.seen.paths).not.toContain(FAR.path);
        expect(writes(made)).not.toContain('products/ZZ-JACKET');
    });

    it('respects what a removal left in Commerce on purpose when it clears (review 3)', async () => {
        const made = instanceSetUp({ leaves: [NB.path] });
        const { token } = await shown(made);

        const res = await made.handlers['clear-commerce-instance'](made.context, consent(token));

        expect(res.success).toBe(true);
        expect(writes(made)).not.toContain('products/ZZ-ONLY-HERE');
        expect(res.note).toContain(
            'Part of nb-pack (Neighbour Demo) was left in Commerce on purpose'
        );
    });

    it('has a project whose pack the service installed stop naming it after a full clearing (review 7)', async () => {
        const service = on(named('service', 'Service Demo', 'service-pack'));
        // A store where the clearing takes everything: nothing kept, nothing only taken off a website.
        const made = instanceSetUp({ others: [NB, service], records: [[NB, NB_RECORD]], store: cleanStore() });
        const { token } = await shown(made);

        const res = await made.handlers['clear-commerce-instance'](made.context, consent(token));

        expect(made.seen.paths).toEqual([OPEN.path, NB.path]);
        expect(made.disk.get(service.path)?.datapack).toBeUndefined();
        expect(res.note).toContain('Service Demo no longer names a datapack');
    });

    it('keeps the service pack named when the clearing only took a product off the website, as Clear Demo Data does (re-review 1)', async () => {
        const service = on(named('service', 'Service Demo', 'service-pack'));
        // ZZ-SHARED-WITH-JUSTRITE is also on JustRite: it is taken off this website, not deleted.
        const made = instanceSetUp({ others: [NB, service], records: [[NB, NB_RECORD]] });
        const { token } = await shown(made);

        const res = await made.handlers['clear-commerce-instance'](made.context, consent(token));

        expect(res.success).toBe(true);
        expect(writes(made)).toContain('products/ZZ-SHARED-WITH-JUSTRITE/websites/5');
        expect(made.disk.get(service.path)?.datapack).toEqual({ name: 'service-pack', version: '1' });
        expect(res.note).not.toContain('no longer names a datapack');
    });

    it("uninstalls only the project's current pack: an older pack's record on the chosen website keeps what it lists (re-review 4)", async () => {
        const older = recordOf('nb-older', SITE, ['ZZ-LONE-VARIANT']);
        const made = instanceSetUp({ records: [[NB, NB_RECORD], [NB, older]] });
        const check = await shown(made);

        const res = await made.handlers['clear-commerce-instance'](made.context, consent(check.token));

        const note = 'Neighbour Demo keeps what the older datapack nb-older put on these websites: only its current datapack is uninstalled.';
        expect(check.instance?.projects.find((p) => p.path === NB.path)?.note).toBe(note);
        expect(made.seen.paths).toEqual([OPEN.path, NB.path]);
        expect(writes(made)).not.toContain('products/ZZ-LONE-VARIANT');
        expect(res.note).toContain(note);
    });

    it('stops before any write, and gives the token back, when a listed pack is no longer one to uninstall (re-review 6)', async () => {
        const made = instanceSetUp();
        const { token } = await shown(made);
        // Since the list was made, the neighbour's pack was installed to a website not chosen.
        made.files.data.set(installRecordPath(NB.path, NB_RECORD.pack), JSON.stringify(recordOf('nb-pack', 'justrite', ['ZZ-ONLY-HERE'])));

        const res = await made.handlers['clear-commerce-instance'](made.context, consent(token));

        expect(res).toMatchObject({ success: false });
        expect(res.error).toContain('nb-pack (Neighbour Demo)');
        expect(made.seen.paths).toStrictEqual([]);
        expect(made.store.sent).toStrictEqual([]);
        made.files.data.set(installRecordPath(NB.path, NB_RECORD.pack), JSON.stringify(NB_RECORD));
        expect((await made.handlers['clear-commerce-instance'](made.context, consent(token))).success).toBe(true);
    });

    it('gives the token back when the re-plan after the removals throws, and Retry skips the packs already out (re-review 5b)', async () => {
        const made = instanceSetUp();
        const { token } = await shown(made);
        const broken = installRecordPath(ELSEWHERE.path, { name: 'broken', version: '1' });
        const remove = made.deps.remove as jest.Mock;
        const real = remove.getMockImplementation();
        // The neighbour's removal goes through, then a record nobody can read makes the re-plan throw.
        remove.mockImplementation(async (...args: Parameters<DemoDataDeps['remove']>) => {
            const done = await real?.(...args);
            if (args[0].path === NB.path) made.files.data.set(broken, '{not json');
            return done;
        });

        const first = await made.handlers['clear-commerce-instance'](made.context, consent(token));
        expect(first.success).toBe(false);
        expect(made.store.sent).toStrictEqual([]);
        made.files.data.delete(broken);
        made.seen.paths.length = 0;

        const again = await made.handlers['clear-commerce-instance'](made.context, consent(token));

        expect(again.success).toBe(true);
        expect(made.seen.paths).toStrictEqual([]);
    });

    it.each<[string, Partial<ClearInstanceRequest>]>([
        ['without confirm', { confirm: false }],
        ['without "I understand"', { understood: undefined }],
    ])('refuses %s, and runs nothing', async (_what, missing) => {
        const made = instanceSetUp();
        const { token } = await shown(made);

        const res = await made.handlers['clear-commerce-instance'](
            made.context,
            consent(token, missing)
        );

        expect(res).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect(res.error).toContain("can't be undone");
        expect(made.seen.paths).toStrictEqual([]);
        expect(made.store.sent).toStrictEqual([]);
    });

    it("asks before anything runs when a project's changes in a pack not the SC's have no answer", async () => {
        const made = instanceSetUp({ changes: { [NB.path]: NB_CHANGES } });
        const { token } = await shown(made);

        const res = await made.handlers['clear-commerce-instance'](made.context, consent(token));

        expect(res).toMatchObject({ success: false, code: ErrorCode.CHANGES_NEED_ANSWER });
        expect(res.error).toContain('Neighbour Demo');
        expect(made.seen.paths).toStrictEqual([]);
    });

    it('stops with a clear error, before anything runs, when the changes cannot be read (review 5)', async () => {
        const made = instanceSetUp();
        made.deps.changes = async () => Promise.reject(new Error('library offline'));
        const handlers = createDemoDataHandlers(made.deps);
        const { token } = (await handlers['check-demo-data'](made.context, { websites: [SITE] }))
            .data as ClearCheck;

        const res = await handlers['clear-commerce-instance'](made.context, consent(token));

        expect(res).toMatchObject({
            success: false,
            error: "The datapacks' changes could not be read, so nothing was cleared. Try again.",
        });
        expect(made.seen.paths).toStrictEqual([]);
    });

    it('stops before any wipe write when a removal fails, and names the project and its datapack', async () => {
        const made = instanceSetUp({
            fails: { [NB.path]: { kept: 'Commerce refused the product delete.' } },
        });
        const { token } = await shown(made);

        const res = await made.handlers['clear-commerce-instance'](made.context, consent(token));

        expect(res.error).toBe(
            "The datapack nb-pack (Neighbour Demo) wasn't uninstalled, so nothing was cleared: Commerce refused the product delete."
        );
        expect(made.store.sent).toStrictEqual([]);
        const rows = (res as { rows?: OperationRow[] }).rows ?? [];
        expect(rows.slice(0, 2).map((r) => r.status)).toEqual(['success', 'error']);
        expect(rows.slice(2).every((r) => r.status === 'pending')).toBe(true);
    });

    it('lets Retry run with the same token after the third removal failed, reading from disk which packs are already out (review 8)', async () => {
        const third = on(named('third', 'Third Demo', 'third-pack'));
        const fails = { [third.path]: { kept: 'Commerce refused the product delete.' } };
        const made = instanceSetUp({
            others: [NB, third],
            records: [
                [NB, NB_RECORD],
                [third, recordOf('third-pack', SITE, ['ZZ-LONE-VARIANT'])],
            ],
            fails,
        });
        const { token } = await shown(made);
        await made.handlers['clear-commerce-instance'](made.context, consent(token));
        expect(made.disk.get(NB.path)?.datapack).toBeUndefined();
        made.seen.paths.length = 0;
        delete fails[third.path];

        const res = await made.handlers['clear-commerce-instance'](made.context, consent(token));

        expect(res.success).toBe(true);
        expect(made.seen.paths).toEqual([third.path]);
    });

    it("refuses a token Clear Demo Data's check gave, and Clear Demo Data refuses this one", async () => {
        const made = instanceSetUp();
        const projectToken = (
            (await made.handlers['check-demo-data'](made.context)).data as ClearCheck
        ).token;
        const { token } = await shown(made);

        expect(
            (await made.handlers['clear-commerce-instance'](made.context, consent(projectToken)))
                .error
        ).toMatch(/no longer known/);
        expect(
            (await made.handlers['clear-demo-data'](made.context, { token, confirm: true })).error
        ).toMatch(/no longer known/);
    });
});

/**
 * The agent's call (step 06 C6): `clear_commerce_instance` sends the answers by project path as
 * `changes` and `saveAs`, read by `instanceClearRequest` (`datapackAnswerArgs`, as reset, delete and
 * Clear Demo Data read theirs); its consent reads the projects the instance check noted by its token.
 */
describe('clear_commerce_instance reaching clear-commerce-instance (step 06 C6)', () => {
    it("notes each project's fate by the instance check's token, for the consent", async () => {
        const made = instanceSetUp();

        const { token } = await shown(made);

        expect(shownClearFor(token)).toMatchObject({
            websites: [SITE],
            projects: [
                { path: OPEN.path, name: 'Zz Tester', datapack: 'zz-test' },
                { path: NB.path, name: 'Neighbour Demo', datapack: 'nb-pack' },
                { path: FAR.path, name: 'Far Away', kept: true },
            ],
        });
    });

    it('refuses keep with no name for a pack not the SC\'s, naming the project, before any removal or write', async () => {
        const made = instanceSetUp({ changes: { [NB.path]: NB_CHANGES } });
        const { token } = await shown(made);

        const res = await made.handlers['clear-commerce-instance'](
            made.context,
            instanceClearRequest({ token, confirm: true, understood: true, changes: { [NB.path]: 'keep' } })
        );

        expect(res).toMatchObject({ success: false, code: ErrorCode.CHANGES_NEED_ANSWER });
        expect(res.error).toContain('Neighbour Demo');
        expect(made.seen.paths).toStrictEqual([]);
        expect(made.store.sent).toStrictEqual([]);
    });

    it('hands each removal its answer: keep with a name saves under it, drop loses the changes', async () => {
        const made = instanceSetUp({ changes: { [NB.path]: NB_CHANGES } });
        const { token } = await shown(made);

        const res = await made.handlers['clear-commerce-instance'](
            made.context,
            instanceClearRequest({
                token,
                confirm: true,
                understood: true,
                changes: { [OPEN.path]: 'drop', [NB.path]: 'keep' },
                saveAs: { [NB.path]: 'My Neighbour' },
            })
        );

        expect(res.success).toBe(true);
        expect(made.seen.given).toEqual(['drop', { saveAs: 'My Neighbour' }]);
    });
});
