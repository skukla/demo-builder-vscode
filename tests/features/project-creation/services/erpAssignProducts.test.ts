/**
 * erpAssignProducts — the composition behind "Assign products" (AB-74): the value an ERP's rule
 * gives, the write's bulk call, the record, and the undo's plan against Commerce as it stands.
 * The Commerce products are the Bodea capture's shape (tests/fixtures/commerce-rest/
 * products-page.json) with erp_owner added; the bulk answers are the typed fixtures.
 */

import fs from 'fs';
import path from 'path';
import { bulkAccepted, bulkStatus } from '../../../helpers/commerceAssignFixtures';
import { createMockProject } from '../../../helpers/projectFake';
import type { AppManagementAuth } from '@/features/app-builder/services/appManagementClient';
import type { AssignProductRow } from '@/features/app-builder/services/erpAssignSelection';

const mockRules = jest.fn();
jest.mock('@/features/project-creation/services/erpRules', () => ({
    listedErpNames: () => [{ listId: 'justrite', name: 'Justrite ERP' }, { listId: 'accuform', name: 'Accuform ERP' }],
    readErpRules: (...a: unknown[]) => mockRules(...a),
}));
jest.mock('@/features/app-builder/services/erpList', () => ({
    erpListIdOf: (_p: unknown, id: string) => (id === 'demo-erp-2' ? 'accuform' : 'justrite'),
}));

// Imported after the mocks, which jest hoists above it.
import {
    assignmentRecord,
    planErpAssignment,
    planUndo,
    readErpAssignOptions,
    writeOwnerValues,
} from '@/features/project-creation/services/erpAssignProducts';

const AUTH: AppManagementAuth = { accessToken: 't', imsOrgId: 'o' };
const FIXTURES = path.join(__dirname, '../../../fixtures/commerce-rest');

interface CapturedPage {
    items: Array<{ sku: string; custom_attributes: Array<{ attribute_code: string; value: unknown }> }>;
    total_count: number;
}

/** The Bodea capture's two products, with the erp_owner values given. */
function products(owners: Record<string, string>): CapturedPage {
    const page = (JSON.parse(fs.readFileSync(path.join(FIXTURES, 'products-page.json'), 'utf8')) as { body: CapturedPage }).body;
    const items = page.items.map((item) => ({
        ...item,
        custom_attributes: [...item.custom_attributes, ...(owners[item.sku] ? [{ attribute_code: 'erp_owner', value: owners[item.sku] }] : [])],
    }));
    return { ...page, items, total_count: items.length };
}

/** Commerce for the store: products, websites, categories, and sets 15 and 16 both carrying erp_owner. */
function commerce(owners: Record<string, string>) {
    const get = jest.fn(async (requested: string) => {
        if (requested.startsWith('products?')) return products(owners);
        if (requested === 'store/websites') return [{ id: 2, code: 'bodea', name: 'Bodea' }];
        if (requested.startsWith('categories/list')) return { items: [{ id: 7, name: 'Plans' }], total_count: 1 };
        if (requested.startsWith('products/attribute-sets/sets/list')) return { items: [] };
        if (requested.startsWith('products/attribute-sets/')) return [{ attribute_code: 'erp_owner' }];
        if (requested.startsWith('products/attributes/brand')) throw new Error('404');
        throw new Error(`unexpected read ${requested}`);
    });
    return { get, send: jest.fn() };
}

const project = createMockProject({
    appBuilderComponents: {
        'erp-integration': { kind: 'integration', status: 'deployed', source: { owner: 's', repo: 'erp' }, deployedUrls: {} },
        'demo-erp-2': { kind: 'system', status: 'deployed', name: 'Accuform ERP', source: { owner: 's', repo: 'demo-erp' } },
    },
});
const TARGET = { project, integrationId: 'erp-integration', erpId: 'demo-erp-2' };

beforeEach(() => {
    mockRules.mockResolvedValue([
        { erp: 'justrite', name: 'Justrite ERP', owns: { mode: 'all' } },
        { erp: 'accuform', name: 'Accuform ERP', owns: { mode: 'attribute', attribute: 'erp_owner=accuform' } },
    ]);
});

describe('planErpAssignment', () => {
    it("tags with the value in the ERP's own rule, and says what moves from the catch-all", async () => {
        const plan = await planErpAssignment(TARGET, { auth: AUTH, commerce: commerce({}) }, { by: 'skuPrefix', prefix: 'essentials' });
        expect(plan).toMatchObject({
            value: 'accuform',
            preview: { matched: 1, toWrite: 1, examples: ['essentials-plan'], movedFrom: [{ name: 'Justrite ERP', count: 1 }] },
        });
    });

    it('refuses an ERP whose rule is not erp_owner, in words', async () => {
        mockRules.mockResolvedValue([
            { erp: 'justrite', name: 'Justrite ERP', owns: { mode: 'all' } },
            { erp: 'accuform', name: 'Accuform ERP', owns: { mode: 'websites', websites: ['bodea'] } },
        ]);
        const plan = await planErpAssignment(TARGET, { auth: AUTH, commerce: commerce({}) }, { by: 'skuPrefix', prefix: 'e' });
        expect(plan).toStrictEqual({
            refusal:
                'Accuform ERP owns the products sold on bodea, not the products tagged with erp_owner, so there is nothing to assign to it. Change its rule to erp_owner in its Settings first.',
        });
    });
});

describe('readErpAssignOptions', () => {
    it('answers the products, who owns each today, and the choices, so the modal previews locally', async () => {
        const options = await readErpAssignOptions(TARGET, { auth: AUTH, commerce: commerce({ DigiWristQuantum: 'accuform' }) });
        expect(options).toMatchObject({
            erp: { id: 'demo-erp-2', name: 'Accuform ERP', listId: 'accuform' },
            ownerValue: 'accuform',
            categories: expect.arrayContaining([{ value: '7', label: 'Plans', count: 1 }]),
            setsWithoutOwner: [],
            owners: { 'essentials-plan': ['justrite'], DigiWristQuantum: ['accuform'] },
            names: { justrite: 'Justrite ERP', accuform: 'Accuform ERP' },
        });
        expect(options.products).toEqual([
            { sku: 'essentials-plan', attributeSetId: 15, categoryIds: ['7'], owner: '' },
            { sku: 'DigiWristQuantum', attributeSetId: 16, categoryIds: ['3', '9'], owner: 'accuform' },
        ]);
    });
});

describe('the write, the record and the undo', () => {
    it('writes every product in one bulk PUT products/bySku and follows it', async () => {
        const client = { get: jest.fn(async () => bulkStatus([1, 1])), send: jest.fn(async () => bulkAccepted(2, 'u-9')) };
        const outcome = await writeOwnerValues(client, [{ sku: 'A', value: 'accuform' }, { sku: 'B', value: '' }], {
            sleep: async () => undefined,
            now: () => 0,
            intervalMs: 1,
            deadlineMs: 10,
        });
        expect(client.send).toHaveBeenCalledWith(
            'PUT',
            'products/bySku',
            [
                { product: { sku: 'A', custom_attributes: [{ attribute_code: 'erp_owner', value: 'accuform' }] } },
                { product: { sku: 'B', custom_attributes: [{ attribute_code: 'erp_owner', value: '' }] } },
            ],
            { bulk: true },
        );
        expect(client.get).toHaveBeenCalledWith('bulk/u-9/status');
        expect(outcome.complete).toBe(2);
    });

    it("records each product's value before, the empty string for none", () => {
        const row = (sku: string, owner: string): AssignProductRow => ({ sku, owner, attributeSetId: 4, categoryIds: [], websiteIds: [], attributes: {} });
        expect(assignmentRecord([row('A', 'justrite'), row('B', '')], 'accuform', 'now')).toEqual({
            at: 'now',
            value: 'accuform',
            previous: [{ sku: 'A', value: 'justrite' }, { sku: 'B', value: '' }],
        });
    });

    it('the undo restores only products that still carry the value written', async () => {
        const client = commerce({ 'essentials-plan': 'accuform', DigiWristQuantum: 'someone-else' });
        const plan = await planUndo(client, {
            at: 'now',
            value: 'accuform',
            previous: [{ sku: 'essentials-plan', value: '' }, { sku: 'DigiWristQuantum', value: 'justrite' }],
        });
        expect(plan).toEqual({ restore: [{ sku: 'essentials-plan', value: '' }], changedSince: ['DigiWristQuantum'] });
    });
});
