/**
 * A removal never reaches the wrong Commerce instance (step-07 D6, owner 2026-11-14). The install
 * record notes the instance the pack went into; when the project now points at another one, every
 * door stops before writing anything, saving included, and says where the data is. A record written
 * before instances were kept removes as it always did (rule 3).
 *
 * Real chain: the doors, `removeProjectSampleDataOutcome`, the real `settleChangesBeforeRemoval`
 * and the record on disk. The deps are the edge (`buildSampleDataDeps`), so what reaches the
 * delete is asserted. Clear Demo Data and Clear Commerce Instance remove through
 * `removeProjectSampleDataOutcome` (`demoDataHandlers.ts`), and Edit too (`executorEditDatapack.ts`);
 * the screen's Uninstall and the agent's `reset_datapack` are `reset-datapack`.
 */

jest.mock('@/features/data-installer/services/sampleDataInstallDeps', () => ({
    buildSampleDataDeps: jest.fn(),
}));
jest.mock('@/features/data-installer/services/buildDatapackEngine', () => ({
    ...jest.requireActual('@/features/data-installer/services/buildDatapackEngine'),
    installedByDemoBuilder: jest.fn(async () => true),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import {
    type InstanceRecordFixture,
    recordOnInstance,
} from '../../../../helpers/installRecordFixtures';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockProject } from '../../../../helpers/projectFake';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import {
    nodeRecordFiles,
    writeInstallRecord,
} from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { PACK_NAMES_KEY } from '@/features/data-installer/services/packNames';
import type { SampleDataDeps } from '@/features/data-installer/services/sampleDataInstall';
import { buildSampleDataDeps } from '@/features/data-installer/services/sampleDataInstallDeps';
import { removeProjectSampleDataOutcome } from '@/features/eds/services/reset/edsResetSampleData';
import { removeAnsweredDatapack } from '@/features/eds/services/reset/resetDatapackStep';
import { removeDataBeforeDelete } from '@/features/projects-dashboard/services/datapackDataRemoval';
import type { Project } from '@/types/base';

const mockedDeps = buildSampleDataDeps as jest.MockedFunction<typeof buildSampleDataDeps>;
const ACCS = 'adobe-commerce-accs';
const NOW_TENANT = 'NowTenant0123456789AB';
const OTHER =
    'Bodea is installed on another Commerce instance. Switch the project back to remove it.';
const DROP = { removeDatapack: true, changes: 'drop' } as const;

let dir: string;

beforeEach(() => {
    jest.clearAllMocks();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'removal-instance-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

/** The project now: pointed at NOW_TENANT, the pack recorded where `record` says. */
async function projectWith(record: InstanceRecordFixture): Promise<Project> {
    await writeInstallRecord(nodeRecordFiles, dir, recordOnInstance(record));
    return createMockProject({
        name: 'acme',
        path: dir,
        datapack: { name: 'bodea', version: 'main', store: 'library' },
        componentSelections: { backend: ACCS },
        componentConfigs: {
            [ACCS]: {
                ACCS_GRAPHQL_ENDPOINT: `https://na1-sandbox.api.commerce.adobe.com/${NOW_TENANT}/graphql`,
                ACCS_WEBSITE_CODE: 'acme',
                ACCS_STORE_VIEW_CODE: 'acme_en',
            },
        },
    });
}

/** The deps at the edge: a delete that takes everything. */
function edge() {
    const startDelete = jest.fn(async () => ({ activationId: 'act-1' }));
    const deps: SampleDataDeps = {
        inventory: async () => ['products'],
        startImport: async () => ({ activationId: 'never' }),
        startDelete,
        watch: async () => ({ outcome: 'success', perType: { products: 'success' } }),
        installRecordOf: async () => ({ target: { websiteCode: 'acme', storeCode: 'acme_en' } }),
    };
    mockedDeps.mockReturnValue(deps);
    return startDelete;
}

/** A context whose remembered pack names give Bodea its display name, with `project` open. */
function context(project?: Project) {
    const ctx = createMockHandlerContext({ logger: createMockLogger() });
    (ctx.context.globalState.get as jest.Mock).mockImplementation((key: string) =>
        key === PACK_NAMES_KEY ? { bodea: 'Bodea' } : undefined
    );
    if (project) (ctx.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(project);
    return ctx;
}

describe('a pack installed on another Commerce instance', () => {
    it('the shared removal (Clear Demo Data, Clear Commerce Instance, Edit) stops, keeping the pack', async () => {
        const startDelete = edge();
        const project = await projectWith({ instance: 'OldTenant0123456789AB' });

        await expect(
            removeProjectSampleDataOutcome(project, context(), jest.fn())
        ).resolves.toStrictEqual({ kept: OTHER });

        expect(startDelete).not.toHaveBeenCalled();
        expect(project.datapack).toEqual({ name: 'bodea', version: 'main', store: 'library' });
    });

    it('Delete stops, keeping the project, and says why', async () => {
        const startDelete = edge();
        const project = await projectWith({ instance: 'OldTenant0123456789AB' });

        await expect(removeDataBeforeDelete(context(), project, jest.fn())).resolves.toStrictEqual({
            stopped: `Its datapack was not uninstalled, so the project was kept: ${OTHER}`,
        });
        expect(startDelete).not.toHaveBeenCalled();
    });

    it('Reset stops, even with the changes dropped, and the row says why', async () => {
        const startDelete = edge();
        const project = await projectWith({ instance: 'OldTenant0123456789AB' });

        await expect(
            removeAnsweredDatapack(project, context(), jest.fn(), DROP)
        ).resolves.toMatchObject({
            kept: OTHER,
        });
        expect(startDelete).not.toHaveBeenCalled();
    });

    it("Uninstall (the screen's and reset_datapack) refuses before anything is saved or removed", async () => {
        const project = await projectWith({ instance: 'OldTenant0123456789AB' });

        const answer = await importHandlers['reset-datapack'](context(project), {
            datapackName: 'bodea',
            version: 'main',
            commerceInstance: NOW_TENANT,
            confirm: true,
            changes: 'keep',
        });

        expect(answer).toMatchObject({ success: false, error: OTHER });
    });
});

describe('a pack installed on this instance, or recorded before instances were kept', () => {
    it.each([
        ['the same instance', { instance: NOW_TENANT }],
        ['a record with no instance (rule 3)', {}],
    ])('%s: Reset removes it as before', async (_label, record: InstanceRecordFixture) => {
        const startDelete = edge();
        const project = await projectWith(record);

        await expect(
            removeAnsweredDatapack(project, context(), jest.fn(), DROP)
        ).resolves.toStrictEqual({});
        expect(startDelete).toHaveBeenCalledTimes(1);
    });
});
