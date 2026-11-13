/**
 * What a wipe of a project's websites must respect from every project on this machine
 * (datapack-engine step 10; datapack-simplification step 06): the websites are every one the project
 * uses; another project using one of them is a warning naming it, never a refusal (P6-Q2); what any
 * project's install records list on the chosen websites is left.
 */

import { type InstallRecord, installRecordPath } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { projectWebsites } from '@/features/data-installer/services/demoDataWipe/recordWebsites';
import { readWipeClaims } from '@/features/data-installer/services/demoDataWipe/wipeClaims';
import type { Project } from '@/types/base';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import type { StorePreparationRecord } from '@/types/storePreparation';
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

const claims = (files: ReturnType<typeof memoryFiles>, project: Project, others: Project[]) => readWipeClaims(files, project, others, STRUCTURE);

/** A project on the test website, as PROJECT_RECORDS' target says. */
const TESTER = accsProject('tester', 'justrite_test_website', 'justrite_test_view', 'Tester');
const JUSTRITE = accsProject('JustRite', 'justrite', 'justrite_us');

describe('projectWebsites', () => {
    it("names the project's own website and every website its records were installed to, each once, sorted", () => {
        const records = [record('a', 'bodea', 'A'), record('b', 'justrite_test_website', 'B'), record('c', undefined, 'C')];

        expect(projectWebsites(JUSTRITE, records)).toEqual(['bodea', 'justrite', 'justrite_test_website']);
    });

    it('names none for a project with no website and no record', () => {
        expect(projectWebsites(createMockProject({ name: 'bare', componentConfigs: {} }), [])).toStrictEqual([]);
    });
});

describe('readWipeClaims, project scope', () => {
    it("covers every website the project uses: its own and its records'", async () => {
        const files = filesWith([[JUSTRITE, PROJECT_RECORDS[0]]]);

        const answer = await claims(files, JUSTRITE, []);

        expect(answer.scope.key).toBe('justrite,justrite_test_website');
    });

    it('warns, naming the project, when another project uses one of these websites, and still answers what to respect', async () => {
        const files = filesWith([[TESTER, PROJECT_RECORDS[0]]]);
        const read = jest.spyOn(files, 'read');

        const answer = await claims(files, TESTER, [accsProject('other', 'justrite_test_website', 'justrite_test_view', 'Other Demo'), JUSTRITE]);

        expect(answer.warning).toBe('The project Other Demo also uses the website justrite_test_website. Clearing it also removes what was added there by hand for that project.');
        expect(answer.respects.records).toEqual(PROJECT_RECORDS);
        expect(read).toHaveBeenCalled();
    });

    it("counts another project's record on these websites as using them, and names every project", async () => {
        const other = accsProject('bodea-demo', 'bodea', 'bodea_en', 'Bodea Demo');
        const files = filesWith([
            [TESTER, PROJECT_RECORDS[0]],
            [other, record('theirs', 'justrite_test_website', 'THEIRS')],
        ]);

        const answer = await claims(files, TESTER, [other, accsProject('copy', 'justrite_test_website', 'justrite_test_view', 'Copy')]);

        expect(answer.warning).toBe(
            'The projects Bodea Demo and Copy also use the website justrite_test_website. Clearing it also removes what was added there by hand for those projects.',
        );
    });

    it('warns of nothing when no other project uses these websites, and skips the project itself if listed', async () => {
        const files = filesWith([[TESTER, PROJECT_RECORDS[0]]]);

        expect((await claims(files, TESTER, [TESTER, JUSTRITE])).warning).toBeUndefined();
    });

    it("respects this project's own records and the settings they wrote, as well as every other project's", async () => {
        const own = record('own-pack', 'justrite_test_website', 'OWN');
        const other = accsProject('other-demo', 'bodea', 'bodea_en');
        const theirs = record('their-pack', 'justrite_test_website', 'THEIRS-ON-TEST');
        const files = filesWith([
            [TESTER, own],
            [other, theirs],
        ]);

        const answer = await claims(files, TESTER, [other]);

        expect(answer.respects).toMatchObject({ records: [own, theirs], everyRecord: [own, theirs] });
    });

    it("drops the record of the datapack the clearing uninstalls first, and its website settings, keeping the rest (C3)", async () => {
        const layer: InstallRecord = {
            ...record('own-pack', 'justrite_test_website', 'OWN'),
            created: [
                { kind: 'products', id: 'OWN' },
                { kind: 'store_config', id: 'catalog/frontend/grid_per_page@website', key: 'catalog/frontend/grid_per_page@website' },
            ],
        };
        const leftover = record('old-pack', 'justrite_test_website', 'OLD');
        const other = accsProject('other-demo', 'bodea', 'bodea_en');
        const theirs = record('their-pack', 'justrite_test_website', 'OWN');
        const files = filesWith([
            [TESTER, layer],
            [TESTER, leftover],
            [other, theirs],
        ]);

        const answer = await readWipeClaims(files, TESTER, [other], STRUCTURE, { asIfRemoved: { name: 'own-pack', version: '1' } });

        expect(answer.respects.records).toEqual([leftover, theirs]);
        expect(answer.respects.everyRecord).toEqual([leftover, theirs]);
        expect([...answer.respects.settingsKept]).toStrictEqual([]);
        expect(answer.removing).toEqual({ setBack: ['justrite_test_website/catalog/frontend/grid_per_page'] });
    });

    it('drops nothing, and names no removal, when the datapack named has no record here (a pack the service installed)', async () => {
        const files = filesWith([[TESTER, PROJECT_RECORDS[0]]]);

        const answer = await readWipeClaims(files, TESTER, [], STRUCTURE, { asIfRemoved: { name: 'service-pack', version: '1' } });

        expect(answer.respects.records).toEqual([PROJECT_RECORDS[0]]);
        expect(answer.removing).toBeUndefined();
    });

    it('names what is true when the project records no website at all', async () => {
        const bare = createMockProject({ name: 'bare', path: '/nonexistent/projects/bare', componentConfigs: {} });

        await expect(claims(memoryFiles(), bare, [])).rejects.toThrow('This project records no website to clear.');
    });

    it("hands on another project's records for ANY website as the instance-wide list, without treating their products as on these websites", async () => {
        const other = accsProject('other-demo', 'bodea', 'bodea_en');
        const onBodea = record('their-bodea-pack', 'bodea', 'THEIRS-ON-BODEA');
        const files = filesWith([
            [TESTER, PROJECT_RECORDS[0]],
            [other, onBodea],
        ]);

        const answer = await claims(files, TESTER, [other]);

        expect(answer.respects).toMatchObject({ records: [PROJECT_RECORDS[0]], everyRecord: [PROJECT_RECORDS[0], onBodea] });
    });

    it('says which website settings a datapack, the setup guide or set_commerce_config wrote, on any project', async () => {
        const storePreparation: StorePreparationRecord = {
            at: '2026-10-30',
            steps: {
                pay: { kind: 'config', previous: [{ path: 'payment/companycredit/active', scope: 'website', scopeCode: 'justrite_test_website', stored: null, effective: '0' }] },
                both: { kind: 'config', previous: [{ path: 'catalog/price/scope', scope: 'default', stored: '0', effective: '0' }] },
            },
        };
        const other: Project = {
            ...accsProject('other-demo', 'bodea', 'bodea_en'),
            appBuilderComponents: { erp: { kind: 'integration', status: 'deployed', source: { owner: 'zz', repo: 'zz' }, storePreparation } },
            commerceConfigChange: { at: '2026-10-30', previous: [{ path: 'sales/totals_sort/tax', scope: 'website', scopeCode: 'bodea', stored: null, effective: '40' }] },
        };
        const layer: InstallRecord = {
            ...PROJECT_RECORDS[0],
            created: [
                { kind: 'store_config', id: 'catalog/frontend/grid_per_page@website', key: 'catalog/frontend/grid_per_page@website' },
                { kind: 'store_config', id: 'catalog/x/y@default', key: 'catalog/x/y@default' },
            ],
        };
        const files = filesWith([[TESTER, layer]]);

        const answer = await claims(files, TESTER, [other]);

        expect([...answer.respects.settingsKept].sort()).toEqual([
            'bodea/sales/totals_sort/tax',
            'justrite_test_website/catalog/frontend/grid_per_page',
            'justrite_test_website/payment/companycredit/active',
        ]);
    });

    it("reads a record with no website at its project's own website, as every record reader does", async () => {
        const other = accsProject('other-demo', 'bodea', 'bodea_en');
        const files = filesWith([[other, record('old-pack', undefined, 'OLD-ON-BODEA')]]);

        expect((await claims(files, TESTER, [other])).respects.records).toStrictEqual([]);
    });

    it('keeps a record whose website nothing says: it may be on a chosen one', async () => {
        const nowhere = createMockProject({ name: 'no-website', path: '/nonexistent/projects/no-website', componentConfigs: {} });
        const old = record('old-pack', undefined, 'OLD-SOMEWHERE');

        expect((await claims(filesWith([[nowhere, old]]), TESTER, [nowhere])).respects.records).toEqual([old]);
    });

    it("refuses when another project's record cannot be read: what it lists could be taken", async () => {
        const other = accsProject('other-demo', 'bodea', 'bodea_en');
        const files = memoryFiles({ [installRecordPath(other.path, { name: 'broken', version: '1' })]: '{not json' });

        await expect(claims(files, TESTER, [other])).rejects.toThrow('The install record for broken@1 cannot be read.');
    });

    it('names a website the project uses that the store no longer has', async () => {
        await expect(claims(memoryFiles(), accsProject('gone', 'gone_website', 'gone_view'), [])).rejects.toThrow('Commerce has no website gone_website.');
    });
});
