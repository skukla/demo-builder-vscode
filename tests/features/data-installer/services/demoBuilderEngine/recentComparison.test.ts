/**
 * A re-import's run uses the comparison its form just made (walk F74): the form's preview and the
 * run's first step were the same read (`planRepeat`), about a minute each on Luma. These prove the
 * run takes the form's plans only while they still describe what it would read, and that a run on
 * them does exactly what a run that read again does.
 */

import { NOW, PACK, PROJECT, memoryFiles } from './demoBuilderEngine.testUtils';
import { memoryStore } from './memoryStore.testUtils';
import type { CreatedObject } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { openInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import {
    resolveEngineTarget,
    sessionFor,
} from '@/features/data-installer/services/demoBuilderEngine/installTarget';
import type { KindContext } from '@/features/data-installer/services/demoBuilderEngine/kindContext';
import {
    forgetComparisons,
    rememberComparison,
    reuseComparison,
    takeComparison,
} from '@/features/data-installer/services/demoBuilderEngine/recentComparison';
import type { KindPlan } from '@/features/data-installer/services/demoBuilderEngine/repeatInstall';
import {
    type PackItems,
    installPack,
} from '@/features/data-installer/services/demoBuilderEngine/runPack';
import { previewChanges } from '@/features/data-installer/services/demoBuilderEngine/storeChanges';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { CommerceGet, CommerceSend } from '@/types/commerceWire';

const TARGET = { websiteCode: 'base', storeCode: 'default' };
const PLACE = { projectPath: PROJECT, pack: PACK, target: TARGET };
const AT = 1_000_000;

const CREATED: CreatedObject[] = [{ kind: 'products', id: 'tee', key: 'tee', fingerprint: 'f1' }];
const ROWS: PackItems = {
    products: [{ product: { sku: 'tee' } }],
    customer_groups: [{ customer_group: { code: 'VIP' } }],
};
// In the order a read gives them (`READABLE_KINDS`).
const PLANS: KindPlan[] = [
    { kind: 'products', packKind: 'products', objects: [], added: [] },
    { kind: 'customer_groups', packKind: 'customer_groups', objects: [], added: ['VIP'] },
];

beforeEach(() => forgetComparisons());

describe('takeComparison', () => {
    it('gives back the plans the form made, for the same place, record and rows', () => {
        rememberComparison(PLACE, CREATED, ROWS, PLANS, AT);

        expect(takeComparison(PLACE, CREATED, ROWS, AT + 1000)).toEqual({
            plans: PLANS,
            ageMs: 1000,
        });
    });

    it('gives a run of fewer data types only their plans, in the order a read would', () => {
        rememberComparison(PLACE, CREATED, ROWS, PLANS, AT);

        const taken = takeComparison(PLACE, CREATED, { products: ROWS.products }, AT);

        expect(taken?.plans.map((p) => p.kind)).toEqual(['products']);
    });

    it.each([
        [
            'the comparison is older than the reuse window',
            PLACE,
            CREATED,
            ROWS,
            AT + TIMEOUTS.DATAPACK_COMPARISON_REUSE + 1,
        ],
        [
            'the install record changed since',
            PLACE,
            [...CREATED, { kind: 'products', id: 'cap' }],
            ROWS,
            AT,
        ],
        [
            "a data type's rows differ",
            PLACE,
            CREATED,
            { ...ROWS, products: [{ product: { sku: 'cap' } }] },
            AT,
        ],
        [
            'the run asks for a data type the form did not compare',
            PLACE,
            CREATED,
            { ...ROWS, categories: { categories: [] } },
            AT,
        ],
        [
            'the run goes to another store view',
            { ...PLACE, target: { ...TARGET, storeCode: 'fr' } },
            CREATED,
            ROWS,
            AT,
        ],
        [
            'the run is for another version',
            { ...PLACE, pack: { ...PACK, version: '9.9.9' } },
            CREATED,
            ROWS,
            AT,
        ],
    ])('reads again when %s', (_why, place, created, rows, now) => {
        rememberComparison(PLACE, CREATED, ROWS, PLANS, AT);

        expect(takeComparison(place, created, rows, now)).toBeUndefined();
    });

    it('is taken once: a second run reads again', () => {
        rememberComparison(PLACE, CREATED, ROWS, PLANS, AT);
        takeComparison(PLACE, CREATED, ROWS, AT);

        expect(takeComparison(PLACE, CREATED, ROWS, AT)).toBeUndefined();
    });

    it('reads again when nothing was compared', () => {
        expect(takeComparison(PLACE, CREATED, ROWS, AT)).toBeUndefined();
    });
});

/** A pack of a category, a product in it, and a customer group. */
const PACK_ROWS: PackItems = {
    categories: {
        categories: [
            {
                category: {
                    name: 'Reuse Racks',
                    path: 'Default Category',
                    is_active: true,
                    custom_attributes: [{ attribute_code: 'url_key', value: 'reuse-racks' }],
                },
            },
        ],
    },
    customer_groups: [{ customer_group: { code: 'Reuse VIP', tax_class_id: 3 } }],
    products: [
        {
            product: {
                sku: 'reuse-tee',
                name: 'Reuse Tee',
                type_id: 'simple',
                attribute_set_id: 'Default',
                price: 20,
                status: 1,
                visibility: 4,
                custom_attributes: [{ attribute_code: 'url_key', value: 'reuse-tee' }],
                extension_attributes: {
                    category_links: [{ category_id: 'reuse-racks', position: 0 }],
                },
            },
        },
    ],
};

/** The memory store, counting its reads. */
function countedStore() {
    const store = memoryStore();
    const reads = { count: 0 };
    const get: CommerceGet = (route) => {
        reads.count += 1;
        return store.get(route);
    };
    const send: CommerceSend = (method, route, body, via) => store.send(method, route, body, via);
    return { store, reads, access: { get, send } };
}

async function opened(
    access: { get: CommerceGet; send: CommerceSend },
    files: ReturnType<typeof memoryFiles>
): Promise<KindContext> {
    const session = sessionFor(await resolveEngineTarget(access.get, TARGET));
    const recorder = await openInstallRecord(files, PROJECT, PACK, NOW, TARGET);
    return { ...access, recorder, session, log: () => undefined };
}

/** Install once, preview as the form does, then install again with or without the form's plans. */
async function reinstall(reuse: boolean) {
    const { store, reads, access } = countedStore();
    const files = memoryFiles();
    const first = await installPack(await opened(access, files), PACK_ROWS);
    await previewChanges(
        {
            commerce: async () => access,
            readPack: async () => PACK_ROWS,
            describe: async () => ({ displayName: 'Reuse' }),
            projectPath: PROJECT,
            target: TARGET,
            files,
            log: () => undefined,
        },
        PACK,
        'installer'
    );
    const ctx = await opened(access, files);
    store.sent.length = 0;
    reads.count = 0;
    const logged: string[] = [];
    const earlier = reuse
        ? reuseComparison(
              { projectPath: PROJECT, log: (line) => void logged.push(line) },
              PACK,
              TARGET
          )
        : undefined;
    const again = await installPack(ctx, PACK_ROWS, undefined, earlier);
    return {
        first,
        again,
        sent: store.sent.map((c) => `${c.method} ${c.path}`),
        reads: reads.count,
        logged,
    };
}

describe("a re-import run on the form's comparison", () => {
    it('reads the store less than a run that compares again, and does the same', async () => {
        const fresh = await reinstall(false);
        forgetComparisons();
        const reused = await reinstall(true);

        expect(reused.reads).toBeLessThan(fresh.reads);
        expect(reused.sent).toStrictEqual(fresh.sent);
        expect(reused.again).toStrictEqual(fresh.again);
    });

    it('sends nothing when the pack is unchanged', async () => {
        const { sent, again } = await reinstall(true);

        expect(sent).toStrictEqual([]);
        expect(again).toMatchObject({ tookOut: [], notTakenOut: [], kept: [] });
    });

    it('says in Debug Logs that it used the comparison, and how old it was', async () => {
        const { logged } = await reinstall(true);

        expect(logged).toStrictEqual([
            expect.stringMatching(/bodea-main@1\.2\.0: using the comparison made \d+ s ago$/),
        ]);
    });

    it('says products were written on the first install, and not on an unchanged second', async () => {
        const { first, again } = await reinstall(true);

        expect(first.productsWritten).toBe(true);
        expect(again.productsWritten).toBe(false);
    });
});
