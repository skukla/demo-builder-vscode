/**
 * What a wipe of one website must respect from every project on this machine (datapack-engine
 * step 10, owner 2026-10-30): a website another project records as its own is refused, naming that
 * project, and what any project's install records list on the website is left.
 */

import { type InstallRecord, installRecordPath } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { readWipeClaims } from '@/features/data-installer/services/demoDataWipe/wipeClaims';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../../helpers/projectFake';
import { memoryFiles } from '../demoBuilderEngine/demoBuilderEngine.testUtils';
import { PROJECT_RECORDS } from './wipe.testUtils';

function accsProject(name: string, websiteCode: string, title?: string): Project {
    return createMockProject({
        name,
        ...(title ? { title } : {}),
        path: `/nonexistent/projects/${name}`,
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: { 'adobe-commerce-accs': { ACCS_WEBSITE_CODE: websiteCode, ACCS_STORE_VIEW_CODE: `${websiteCode}_view` } },
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

/** scratch-1028's shape: its own website is JustRite's. */
const SCRATCH = accsProject('scratch-1028', 'justrite');
const JUSTRITE = accsProject('JustRite', 'justrite');
const TEST_SITE = 'justrite_test_website';

describe('readWipeClaims', () => {
    it('refuses a website another project records as its own, naming it, reading no record', async () => {
        const files = filesWith([[SCRATCH, PROJECT_RECORDS[0]]]);
        const read = jest.spyOn(files, 'read');
        const list = jest.spyOn(files, 'list');

        const claims = await readWipeClaims(files, SCRATCH, [JUSTRITE, accsProject('bodea-demo', 'bodea')], 'justrite');

        expect(claims).toEqual({
            refusal: "The website justrite is also JustRite's own website (project JustRite). Clear it from that project, if at all.",
        });
        expect(read).not.toHaveBeenCalled();
        expect(list).not.toHaveBeenCalled();
    });

    it('names the project as a person knows it, and its folder name', async () => {
        const claims = await readWipeClaims(memoryFiles(), SCRATCH, [accsProject('justrite-demo', 'justrite', 'JustRite')], 'justrite');

        expect(claims).toEqual({
            refusal: "The website justrite is also JustRite's own website (project justrite-demo). Clear it from that project, if at all.",
        });
    });

    it('names every project that claims it', async () => {
        const claims = await readWipeClaims(memoryFiles(), SCRATCH, [JUSTRITE, accsProject('justrite-copy', 'justrite')], 'justrite');

        expect(claims).toEqual({
            refusal:
                "The website justrite is also JustRite's and justrite-copy's own website (projects JustRite and justrite-copy). " +
                'Clear it from one of those projects, if at all.',
        });
    });

    it('does not count the project itself, if the list holds it', async () => {
        const files = filesWith([[SCRATCH, PROJECT_RECORDS[0]]]);

        expect(await readWipeClaims(files, SCRATCH, [SCRATCH], 'justrite')).toEqual({ records: PROJECT_RECORDS });
    });

    it("keeps every record of the project's own, as before, when no other project claims the website", async () => {
        const own = record('own-pack', 'bodea', 'OWN-ELSEWHERE');
        const files = filesWith([
            [SCRATCH, PROJECT_RECORDS[0]],
            [SCRATCH, own],
        ]);

        const claims = await readWipeClaims(files, SCRATCH, [JUSTRITE], TEST_SITE);

        expect(claims).toEqual({ records: [PROJECT_RECORDS[0], own] });
    });

    it("adds another project's records for this website, and only those", async () => {
        const other = accsProject('other-demo', 'bodea');
        const onTestSite = record('their-pack', TEST_SITE, 'THEIRS-ON-TEST');
        const onBodea = record('their-bodea-pack', 'bodea', 'THEIRS-ON-BODEA');
        const files = filesWith([
            [SCRATCH, PROJECT_RECORDS[0]],
            [other, onTestSite],
            [other, onBodea],
        ]);

        const claims = await readWipeClaims(files, SCRATCH, [other], TEST_SITE);

        expect(claims).toEqual({ records: [PROJECT_RECORDS[0], onTestSite] });
    });

    it("reads a record with no website at its project's own website, as every record reader does", async () => {
        const other = accsProject('other-demo', 'bodea');
        const files = filesWith([[other, record('old-pack', undefined, 'OLD-ON-BODEA')]]);

        expect(await readWipeClaims(files, SCRATCH, [other], TEST_SITE)).toEqual({ records: [] });
    });

    it('keeps a record whose website nothing says: it may be on this one', async () => {
        const nowhere = createMockProject({ name: 'no-website', path: '/nonexistent/projects/no-website', componentConfigs: {} });
        const old = record('old-pack', undefined, 'OLD-SOMEWHERE');
        const files = filesWith([[nowhere, old]]);

        expect(await readWipeClaims(files, SCRATCH, [nowhere], TEST_SITE)).toEqual({ records: [old] });
    });

    it("refuses when another project's record cannot be read: what it lists could be taken", async () => {
        const other = accsProject('other-demo', 'bodea');
        const files = memoryFiles({ [installRecordPath(other.path, { name: 'broken', version: '1' })]: '{not json' });

        await expect(readWipeClaims(files, SCRATCH, [other], TEST_SITE)).rejects.toThrow('The install record for broken@1 cannot be read.');
    });
});
