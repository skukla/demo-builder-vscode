/**
 * Where a removal goes when Configure no longer names a website and store view (review,
 * 2026-11-14). The owner's rule is "no target was EVER recorded": a pack Demo Builder's engine
 * installed has an install record that says where it went, and every door removes it there. Only
 * with no record at all is there nothing to remove, and then every door carries on with no line.
 *
 * Real chain: the doors, `removeProjectSampleDataOutcome` and `removeSampleData`. The deps are the
 * edge (`buildSampleDataDeps`), so what reaches the delete is asserted. Clear Demo Data and Clear
 * Commerce Instance remove through `removeProjectSampleDataOutcome` too (`demoDataHandlers.ts`).
 */

jest.mock('@/features/data-installer/handlers/removalChanges', () => ({
    contextForProject: jest.fn((context: unknown) => context),
    settleChangesBeforeRemoval: jest.fn(async () => ({})),
}));
jest.mock('@/features/data-installer/services/sampleDataInstallDeps', () => ({
    buildSampleDataDeps: jest.fn(),
}));
jest.mock('@/features/data-installer/services/buildDatapackEngine', () => ({
    installedByDemoBuilder: jest.fn(async () => true),
}));

import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockProject } from '../../../../helpers/projectFake';
import type { ImportRequest } from '@/features/data-installer/services/importRequest';
import type { SampleDataDeps } from '@/features/data-installer/services/sampleDataInstall';
import { buildSampleDataDeps } from '@/features/data-installer/services/sampleDataInstallDeps';
import { removeProjectSampleDataOutcome } from '@/features/eds/services/reset/edsResetSampleData';
import { removeAnsweredDatapack } from '@/features/eds/services/reset/resetDatapackStep';
import { removeDataBeforeDelete } from '@/features/projects-dashboard/services/datapackDataRemoval';
import type { Project } from '@/types/base';

const mockedDeps = buildSampleDataDeps as jest.MockedFunction<typeof buildSampleDataDeps>;
const ACCS = 'adobe-commerce-accs';
const RECORDED = { websiteCode: 'acme', storeCode: 'acme_en' };

/** A project whose website and store view were cleared in Configure; its instance is still named. */
const cleared = (): Project =>
    createMockProject({
        name: 'acme',
        path: '/nonexistent/acme',
        datapack: { name: 'bodea', version: 'main', store: 'library' },
        componentSelections: { backend: ACCS },
        componentConfigs: {
            [ACCS]: {
                ACCS_GRAPHQL_ENDPOINT:
                    'https://na1-sandbox.api.commerce.adobe.com/TENANT123/graphql',
            },
        },
    });

/** The deps at the edge: a delete that takes everything, and the install record given. */
function edge(record: { target?: typeof RECORDED } | undefined) {
    const startDelete = jest.fn(async (_request: ImportRequest) => ({ activationId: 'act-1' }));
    const deps: SampleDataDeps = {
        inventory: async () => ['products'],
        startImport: async () => ({ activationId: 'never' }),
        startDelete,
        watch: async () => ({ outcome: 'success', perType: { products: 'success' } }),
        installRecordOf: async () => record,
    };
    mockedDeps.mockReturnValue(deps);
    return startDelete;
}

const context = () => createMockHandlerContext({ logger: createMockLogger() });

beforeEach(() => jest.clearAllMocks());

describe('a pack with an install record, the website and store view cleared since', () => {
    it("is removed at the record's target, and the project stops naming it (the shared removal)", async () => {
        const startDelete = edge({ target: RECORDED });
        const project = cleared();

        await expect(
            removeProjectSampleDataOutcome(project, context(), jest.fn())
        ).resolves.toStrictEqual({});

        expect(startDelete).toHaveBeenCalledWith(expect.objectContaining({ target: RECORDED }));
        expect(project.datapack).toBeUndefined();
    });

    it('Delete: removes it there before the files go, with no stop', async () => {
        const startDelete = edge({ target: RECORDED });

        await expect(
            removeDataBeforeDelete(context(), cleared(), jest.fn())
        ).resolves.toStrictEqual({});

        expect(startDelete).toHaveBeenCalledWith(expect.objectContaining({ target: RECORDED }));
    });

    it('Reset: removes it there, and the row says it was uninstalled', async () => {
        const startDelete = edge({ target: RECORDED });

        await expect(
            removeAnsweredDatapack(cleared(), context(), jest.fn(), {
                removeDatapack: true,
                changes: 'drop',
            })
        ).resolves.toStrictEqual({});

        expect(startDelete).toHaveBeenCalledWith(expect.objectContaining({ target: RECORDED }));
    });

    it('Delete stops, keeping the project, when the record names no target either', async () => {
        const startDelete = edge({});

        const removal = await removeDataBeforeDelete(context(), cleared(), jest.fn());

        expect(startDelete).not.toHaveBeenCalled();
        expect(removal.stopped).toMatch(
            /^Its datapack was not uninstalled, so the project was kept: No website and store view are set/u
        );
    });
});

/** A project whose website and store view were changed in Configure after the install. */
const moved = (): Project => {
    const project = cleared();
    Object.assign(project.componentConfigs?.[ACCS] ?? {}, {
        ACCS_WEBSITE_CODE: 'other',
        ACCS_STORE_VIEW_CODE: 'other_en',
    });
    return project;
};

// D6 (owner, 2026-11-14): the record is where the data is, so its target wins over today's codes.
describe('a pack with an install record, the website and store view changed since', () => {
    it("is removed at the record's target, not today's (the shared removal)", async () => {
        const startDelete = edge({ target: RECORDED });

        await expect(
            removeProjectSampleDataOutcome(moved(), context(), jest.fn())
        ).resolves.toStrictEqual({});

        expect(startDelete).toHaveBeenCalledWith(expect.objectContaining({ target: RECORDED }));
    });

    it("Delete and Reset: remove it at the record's target", async () => {
        const startDelete = edge({ target: RECORDED });

        await removeDataBeforeDelete(context(), moved(), jest.fn());
        await removeAnsweredDatapack(moved(), context(), jest.fn(), {
            removeDatapack: true,
            changes: 'drop',
        });

        expect(startDelete.mock.calls.map(([request]) => request.target)).toStrictEqual([
            RECORDED,
            RECORDED,
        ]);
    });

    it("CONTROL: a record written before targets were kept removes at today's codes", async () => {
        const startDelete = edge({});

        await removeProjectSampleDataOutcome(moved(), context(), jest.fn());

        expect(startDelete).toHaveBeenCalledWith(
            expect.objectContaining({ target: { websiteCode: 'other', storeCode: 'other_en' } })
        );
    });
});

describe('a pack with no install record and no website and store view', () => {
    it('is nothing to remove: Delete carries on, Reset has no step', async () => {
        const startDelete = edge(undefined);

        await expect(
            removeDataBeforeDelete(context(), cleared(), jest.fn())
        ).resolves.toStrictEqual({ nothingInstalled: true });
        await expect(
            removeAnsweredDatapack(cleared(), context(), jest.fn(), {
                removeDatapack: true,
                changes: 'drop',
            })
        ).resolves.toBeUndefined();

        expect(startDelete).not.toHaveBeenCalled();
    });
});
