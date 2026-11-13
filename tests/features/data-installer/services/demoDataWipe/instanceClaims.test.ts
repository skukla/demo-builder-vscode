/**
 * What Clear Commerce Instance respects, and what it does with each project's datapack (step 06 C4,
 * review fixes): a project's records on the chosen websites stop being respected only when its pack
 * is uninstalled first, and a pack is uninstalled only when every record of it is on a chosen website
 * of THIS instance; the engine's uninstall deletes everything a record lists, wherever it is.
 */

import {
    type InstallRecord,
    installRecordPath,
} from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { readInstanceClaims } from '@/features/data-installer/services/demoDataWipe/instanceClaims';
import { resolveWipeScope } from '@/features/data-installer/services/demoDataWipe/wipeScope';
import type { Project } from '@/types/base';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import {
    SANDBOX_GROUPS,
    SANDBOX_VIEWS,
    SANDBOX_WEBSITES,
} from '../../../../helpers/commerceWipeFixtures';
import { createMockProject } from '../../../../helpers/projectFake';
import { memoryFiles } from '../demoBuilderEngine/demoBuilderEngine.testUtils';
import { PROJECT_RECORDS } from './wipe.testUtils';

const STRUCTURE: CommerceStoreStructure = {
    websites: SANDBOX_WEBSITES,
    storeGroups: SANDBOX_GROUPS,
    storeViews: SANDBOX_VIEWS,
};
const SITE = 'justrite_test_website';

function project(name: string, websiteCode: string | undefined, pack?: string): Project {
    return createMockProject({
        name,
        path: `/nonexistent/projects/${name}`,
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: websiteCode
            ? {
                  'adobe-commerce-accs': {
                      ACCS_WEBSITE_CODE: websiteCode,
                      ACCS_STORE_VIEW_CODE: `${websiteCode}_view`,
                  },
              }
            : {},
        ...(pack ? { datapack: { name: pack, version: '1' } } : {}),
    });
}

function record(pack: string, websiteCode: string | undefined, sku: string): InstallRecord {
    return {
        format: 1,
        pack: { name: pack, version: '1' },
        engine: 'demo-builder',
        startedAt: '2026-10-30T10:00:00.000Z',
        ...(websiteCode ? { target: { websiteCode, storeCode: `${websiteCode}_view` } } : {}),
        created: [{ kind: 'products', id: sku }],
    };
}

function filesWith(entries: Array<[Project, InstallRecord]>) {
    return memoryFiles(
        Object.fromEntries(
            entries.map(([p, r]) => [installRecordPath(p.path, r.pack), JSON.stringify(r)])
        )
    );
}

const OPEN = project('open', SITE, 'zz-test');
const claims = (
    files: ReturnType<typeof memoryFiles>,
    others: Project[],
    websites: string[],
    options: { matched?: Project[]; uninstalled?: Project[] } = {}
) =>
    readInstanceClaims(files, OPEN, others, resolveWipeScope(STRUCTURE, websites), {
        matched: new Set((options.matched ?? [OPEN, ...others]).map((p) => p.path)),
        ...(options.uninstalled
            ? { uninstalled: new Set(options.uninstalled.map((p) => p.path)) }
            : {}),
    });

it("covers the websites named and warns of nothing: its window names each website's projects", async () => {
    const answer = await claims(memoryFiles(), [], ['justrite', 'bodea']);

    expect(answer.scope.key).toBe('bodea,justrite');
    expect(answer.warning).toBeUndefined();
});

it('uninstalls a pack whose records are all on chosen websites, and stops respecting them there only', async () => {
    const nb = project('nb', SITE, 'nb-pack');
    const onSite = record('nb-pack', SITE, 'NB-ON-SITE');
    const oldOnBodea = record('nb-old', 'bodea', 'NB-OLD-ON-BODEA');
    const files = filesWith([
        [OPEN, PROJECT_RECORDS[0]],
        [nb, onSite],
        [nb, oldOnBodea],
    ]);

    const answer = await claims(files, [nb], [SITE]);

    expect(answer.users.map((u) => [u.project.path, u.decision])).toEqual([
        [OPEN.path, 'uninstall'],
        [nb.path, 'uninstall'],
    ]);
    expect(answer.respects.records).toStrictEqual([]);
    expect(answer.respects.everyRecord).toEqual([oldOnBodea]);
});

it('keeps a pack also installed on a website not chosen, and every record of its project respected', async () => {
    const nb = project('nb', SITE, 'nb-pack');
    const onJustrite = record('nb-pack', 'justrite', 'NB-ON-JUSTRITE');
    const files = filesWith([[nb, onJustrite]]);

    const answer = await claims(files, [nb], [SITE]);

    expect(answer.users.find((u) => u.project.path === nb.path)).toMatchObject({
        decision: 'elsewhere',
        elsewhere: ['justrite'],
    });
    expect(answer.respects.everyRecord).toEqual([onJustrite]);
});

it('keeps a pack whose record names no website its project names either', async () => {
    const nb = project('nb', undefined, 'nb-pack');
    const lost = record('nb-pack', undefined, 'NB-SOMEWHERE');
    const onSite = record('nb-pack-2', SITE, 'NB-2');
    const both: Project = { ...nb, datapack: { name: 'nb-pack', version: '1' } };
    const files = filesWith([
        [both, lost],
        [both, onSite],
    ]);

    const answer = await claims(files, [both], [SITE]);

    expect(answer.users.find((u) => u.project.path === nb.path)?.decision).toBe('nowhere');
    expect(answer.respects.records).toEqual([lost, onSite]);
});

it('names a pack the service installed for forgetting only when every website its project uses is chosen', async () => {
    const service = project('service', SITE, 'service-pack');
    const wider = project('wider', SITE, 'wider-pack');
    const files = filesWith([[wider, record('older', 'bodea', 'W-OLD')]]);

    const answer = await claims(files, [service, wider], [SITE]);

    expect(answer.users.find((u) => u.project.path === service.path)?.decision).toBe('forget');
    expect(answer.users.find((u) => u.project.path === wider.path)?.decision).toBe('nothing');
});

it('respects every record of a project on a website of the same code that is not matched to this instance', async () => {
    const far = project('far', SITE, 'far-pack');
    const onSite = record('far-pack', SITE, 'FAR-ON-SITE');
    const files = filesWith([[far, onSite]]);

    const answer = await claims(files, [far], [SITE], { matched: [OPEN] });

    expect(answer.users.find((u) => u.project.path === far.path)?.decision).toBe('unmatched');
    expect(answer.respects.records).toEqual([onSite]);
});

it('in the re-plan, respects what a removal left on purpose: only the packs that came out whole stop being respected', async () => {
    const nb = project('nb', SITE, 'nb-pack');
    const left = record('nb-pack', SITE, 'NB-LEFT');
    const files = filesWith([
        [OPEN, PROJECT_RECORDS[0]],
        [nb, left],
    ]);

    const answer = await claims(files, [nb], [SITE], { uninstalled: [OPEN] });

    expect(answer.respects.records).toEqual([left]);
});

it('sets back what the dropped records wrote, and keeps only the settings written elsewhere', async () => {
    const layer: InstallRecord = {
        ...PROJECT_RECORDS[0],
        created: [
            {
                kind: 'store_config',
                id: 'catalog/frontend/grid_per_page@website',
                key: 'catalog/frontend/grid_per_page@website',
            },
        ],
    };
    const other = project('other-demo', 'bodea');
    const bodeaLayer: InstallRecord = {
        ...record('their-bodea-pack', 'bodea', 'B'),
        created: [
            {
                kind: 'store_config',
                id: 'catalog/frontend/list_mode@website',
                key: 'catalog/frontend/list_mode@website',
            },
        ],
    };
    const files = filesWith([
        [OPEN, layer],
        [other, bodeaLayer],
    ]);

    const answer = await claims(files, [other], [SITE]);

    expect(answer.removing).toEqual({
        setBack: ['justrite_test_website/catalog/frontend/grid_per_page'],
    });
    expect([...answer.respects.settingsKept]).toEqual(['bodea/catalog/frontend/list_mode']);
});
