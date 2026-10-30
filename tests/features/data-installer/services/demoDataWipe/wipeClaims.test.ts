/**
 * What a wipe of some stores must respect from every project on this machine (datapack-engine
 * step 10, owner 2026-10-30): a store another project records as its own cannot be chosen, and the
 * refusal names that project; what any project's install records list on the chosen websites is left.
 */

import { type InstallRecord, installRecordPath } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { claimedStores, readWipeClaims } from '@/features/data-installer/services/demoDataWipe/wipeClaims';
import { resolveWipeScope } from '@/features/data-installer/services/demoDataWipe/wipeScope';
import type { Project } from '@/types/base';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import type { WipeStoreChoice } from '@/types/demoDataWipe';
import { SANDBOX_GROUPS, SANDBOX_VIEWS, SANDBOX_WEBSITES } from '../../../../helpers/commerceWipeFixtures';
import { createMockProject } from '../../../../helpers/projectFake';
import { memoryFiles } from '../demoBuilderEngine/demoBuilderEngine.testUtils';
import { PROJECT_RECORDS } from './wipe.testUtils';

const STRUCTURE: CommerceStoreStructure = { websites: SANDBOX_WEBSITES, storeGroups: SANDBOX_GROUPS, storeViews: SANDBOX_VIEWS };

function accsProject(name: string, websiteCode: string, viewCode: string, title?: string): Project {
    return createMockProject({
        name,
        ...(title ? { title } : {}),
        path: `/nonexistent/projects/${name}`,
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: { 'adobe-commerce-accs': { ACCS_WEBSITE_CODE: websiteCode, ACCS_STORE_VIEW_CODE: viewCode } },
    });
}

function record(name: string, websiteCode: string | undefined, productSku: string): InstallRecord {
    return {
        format: 1,
        pack: { name, version: '1' },
        engine: 'demo-builder',
        startedAt: '2026-10-30T10:00:00.000Z',
        ...(websiteCode ? { target: { websiteCode, storeCode: `${websiteCode}_view` } } : {}),
        created: [{ kind: 'products', id: productSku }],
    };
}

function filesWith(entries: Array<[Project, InstallRecord]>) {
    return memoryFiles(Object.fromEntries(entries.map(([p, r]) => [installRecordPath(p.path, r.pack), JSON.stringify(r)])));
}

const claims = (files: ReturnType<typeof memoryFiles>, project: Project, others: Project[], choices: WipeStoreChoice[]) =>
    readWipeClaims(files, project, others, STRUCTURE, resolveWipeScope(STRUCTURE, choices));

/** scratch-1028's shape: its own website and view are JustRite's. */
const SCRATCH = accsProject('scratch-1028', 'justrite', 'justrite_us');
const JUSTRITE = accsProject('JustRite', 'justrite', 'justrite_us');
const OUTLET_DEMO = accsProject('outlet-demo', 'bodea', 'bodea_outlet_en', 'Outlet Demo');
const TEST_STORE = [{ websiteCode: 'justrite_test_website', storeCode: 'justrite_test_store' }];
const CLAIMED = "The store justrite_store (website justrite) is also JustRite's own store (project JustRite). Clear it from that project, if at all.";

describe('readWipeClaims', () => {
    it('refuses a store another project records as its own, naming it, reading no record', async () => {
        const files = filesWith([[SCRATCH, PROJECT_RECORDS[0]]]);
        const read = jest.spyOn(files, 'read');
        const list = jest.spyOn(files, 'list');

        expect(await claims(files, SCRATCH, [JUSTRITE, OUTLET_DEMO], [{ websiteCode: 'justrite' }])).toEqual({ refusal: CLAIMED });
        expect(read).not.toHaveBeenCalled();
        expect(list).not.toHaveBeenCalled();
    });

    it("refuses a website when one of its stores is another project's, naming only that store", async () => {
        const result = await claims(memoryFiles(), SCRATCH, [OUTLET_DEMO], [{ websiteCode: 'bodea' }]);

        expect(result).toEqual({
            refusal: "The store bodea_outlet (website bodea) is also Outlet Demo's own store (project outlet-demo). Clear it from that project, if at all.",
        });
    });

    it("lets the other store of that website be cleared: a claim is the project's store, not its website", async () => {
        expect(await claims(memoryFiles(), SCRATCH, [OUTLET_DEMO], [{ websiteCode: 'bodea', storeCode: 'bodea_store' }])).toEqual({ records: [] });
    });

    it('names every project that claims it', async () => {
        const result = await claims(memoryFiles(), SCRATCH, [JUSTRITE, accsProject('justrite-copy', 'justrite', 'justrite_us')], [{ websiteCode: 'justrite' }]);

        expect(result).toEqual({
            refusal:
                "The store justrite_store (website justrite) is also JustRite's and justrite-copy's own store (projects JustRite and justrite-copy). " +
                'Clear it from one of those projects, if at all.',
        });
    });

    it('claims every store of its website for a project whose store view the store no longer has', async () => {
        const stale = accsProject('stale-demo', 'bodea', 'gone_view');

        expect([...claimedStores(STRUCTURE, SCRATCH, [stale]).keys()]).toEqual([3, 7]);
    });

    it('does not count the project itself, if the list holds it', async () => {
        const files = filesWith([[SCRATCH, PROJECT_RECORDS[0]]]);

        expect(await claims(files, SCRATCH, [SCRATCH], [{ websiteCode: 'justrite' }])).toEqual({ records: PROJECT_RECORDS });
    });

    it("keeps every record of the project's own, as before, when no other project claims the stores", async () => {
        const own = record('own-pack', 'bodea', 'OWN-ELSEWHERE');
        const files = filesWith([
            [SCRATCH, PROJECT_RECORDS[0]],
            [SCRATCH, own],
        ]);

        expect(await claims(files, SCRATCH, [JUSTRITE], TEST_STORE)).toEqual({ records: [PROJECT_RECORDS[0], own] });
    });

    it("adds another project's records for the chosen websites, and only those", async () => {
        const other = accsProject('other-demo', 'bodea', 'bodea_en');
        const onTestSite = record('their-pack', 'justrite_test_website', 'THEIRS-ON-TEST');
        const onBodea = record('their-bodea-pack', 'bodea', 'THEIRS-ON-BODEA');
        const files = filesWith([
            [SCRATCH, PROJECT_RECORDS[0]],
            [other, onTestSite],
            [other, onBodea],
        ]);

        expect(await claims(files, SCRATCH, [other], TEST_STORE)).toEqual({ records: [PROJECT_RECORDS[0], onTestSite] });
    });

    it("reads a record with no website at its project's own website, as every record reader does", async () => {
        const other = accsProject('other-demo', 'bodea', 'bodea_en');
        const files = filesWith([[other, record('old-pack', undefined, 'OLD-ON-BODEA')]]);

        expect(await claims(files, SCRATCH, [other], TEST_STORE)).toEqual({ records: [] });
    });

    it('keeps a record whose website nothing says: it may be on a chosen one', async () => {
        const nowhere = createMockProject({ name: 'no-website', path: '/nonexistent/projects/no-website', componentConfigs: {} });
        const old = record('old-pack', undefined, 'OLD-SOMEWHERE');

        expect(await claims(filesWith([[nowhere, old]]), SCRATCH, [nowhere], TEST_STORE)).toEqual({ records: [old] });
    });

    it("refuses when another project's record cannot be read: what it lists could be taken", async () => {
        const other = accsProject('other-demo', 'bodea', 'bodea_en');
        const files = memoryFiles({ [installRecordPath(other.path, { name: 'broken', version: '1' })]: '{not json' });

        await expect(claims(files, SCRATCH, [other], TEST_STORE)).rejects.toThrow('The install record for broken@1 cannot be read.');
    });
});
