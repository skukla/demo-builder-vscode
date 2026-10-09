/**
 * erpOwnershipReconcile — the pass that runs after anything changes who owns what (AB-70).
 * The store read, the rule save, the fills and the ERP's product routes are their own
 * services' (each has its suite); here they are handed in as mocks and the assertions are on
 * what the pass HANDS them, in what order, and on what it says.
 */

import type { ErpOwnershipOptions } from '@/types/erpOwnership';

const mockRead = jest.fn();
const mockSave = jest.fn();
jest.mock('@/features/project-creation/services/erpOwnershipSync', () => ({
    readErpOwnershipOptionsForProject: (...a: unknown[]) => mockRead(...a),
    saveErpOwnership: (...a: unknown[]) => mockSave(...a),
}));
const mockFillEvery = jest.fn();
jest.mock('@/features/project-creation/services/erpFillForProject', () => ({
    fillEveryErp: (...a: unknown[]) => mockFillEvery(...a),
}));
const mockList = jest.fn();
const mockSetStatus = jest.fn();
jest.mock('@/features/app-builder/services/erpProducts', () => ({
    DISCONTINUED: 'discontinued',
    SELLABLE: 'sellable',
    listErpProducts: (...a: unknown[]) => mockList(...a),
    setErpProductStatus: (...a: unknown[]) => mockSetStatus(...a),
}));
jest.mock('@/features/app-builder/services/erpIntegrationClient', () => ({
    ErpIntegrationClient: jest.fn(function (this: { urls: unknown }, urls: unknown) {
        this.urls = urls;
    }),
}));

import { applyErpOwnership } from '@/features/project-creation/services/erpOwnershipReconcile';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

const AUTH = { accessToken: 'fake-test-pw-not-a-secret', imsOrgId: 'ABC@AdobeOrg' };
const authManager = {} as AuthenticationService;

/** Two ERPs, both demo-erp systems of the integration; the catalog's `listedAs` names their list ids. */
function project(systems: string[] = ['demo-erp', 'demo-erp-2']): Project {
    return createMockProject({
        name: 'bodea',
        appBuilderComponents: {
            'erp-integration': {
                kind: 'integration',
                status: 'deployed',
                name: 'ERP Integration',
                systems,
                source: { owner: 'skukla', repo: 'commerce-erp-integration' },
                deployedUrls: { 'runtime/erp/erps': 'https://ns.adobeioruntime.net/api/v1/web/erp/erps' },
            },
            'demo-erp': {
                kind: 'system',
                status: 'deployed',
                name: 'Justrite ERP',
                usedBy: 'erp-integration',
                catalogId: 'demo-erp',
                listId: 'justrite',
                source: { owner: 'skukla', repo: 'demo-erp' },
                deployedUrls: { 'runtime/demo-erp/products': 'https://a.adobeioruntime.net/api/v1/web/demo-erp/products' },
            },
            'demo-erp-2': {
                kind: 'system',
                status: 'deployed',
                name: 'Kukla ERP',
                usedBy: 'erp-integration',
                catalogId: 'demo-erp',
                listId: 'kukla',
                source: { owner: 'skukla', repo: 'demo-erp' },
                deployedUrls: { 'runtime/demo-erp/products': 'https://b.adobeioruntime.net/api/v1/web/demo-erp/products' },
            },
        },
    });
}

const OPTIONS: ErpOwnershipOptions = {
    websites: [{ code: 'justrite', name: 'Justrite' }],
    products: [
        { sku: 'J1', websiteCodes: ['justrite'], attributes: { erp_owner: 'justrite' } },
        { sku: 'J2', websiteCodes: ['justrite'], attributes: { erp_owner: 'justrite' } },
        { sku: 'N1', websiteCodes: ['justrite'], attributes: {} },
    ],
    erps: [
        { erp: 'justrite', name: 'Justrite ERP', owns: { mode: 'attribute', attribute: 'erp_owner=justrite' } },
        { erp: 'kukla', name: 'Kukla ERP', owns: { mode: 'attribute', attribute: 'erp_owner=kukla' } },
    ],
    takenListIds: ['justrite', 'kukla'],
};

function deps(onProgress = jest.fn()) {
    return { authManager, getAuth: async () => AUTH, onProgress, fetchImpl: jest.fn() as unknown as typeof fetch };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRead.mockResolvedValue(OPTIONS);
    mockSave.mockResolvedValue(undefined);
    mockFillEvery.mockResolvedValue([]);
    mockList.mockResolvedValue([]);
    mockSetStatus.mockResolvedValue(undefined);
});

describe('applyErpOwnership', () => {
    it('reads the store, fills every ERP, and says what each owns and what the SC still has to do', async () => {
        const d = deps();
        const result = await applyErpOwnership(project(), 'erp-integration', d, 'add');

        expect(mockRead).toHaveBeenCalledWith(expect.objectContaining({ name: 'bodea' }), 'erp-integration', AUTH, authManager, d.fetchImpl);
        expect(mockFillEvery).toHaveBeenCalledWith(expect.objectContaining({ name: 'bodea' }), 'erp-integration', d);
        expect(result).toStrictEqual({
            status: 'applied',
            fills: [],
            unowned: 1,
            erps: [
                { erp: 'demo-erp', listId: 'justrite', name: 'Justrite ERP', owns: OPTIONS.erps[0].owns, ownsNow: 2, discontinued: 0, restored: 0 },
                { erp: 'demo-erp-2', listId: 'kukla', name: 'Kukla ERP', owns: OPTIONS.erps[1].owns, ownsNow: 0, discontinued: 0, restored: 0 },
            ],
            notes: [
                'Kukla ERP owns no products yet: use Assign products on its card to give it some.',
                '1 product belongs to no ERP.',
            ],
        });
        expect(mockSave).not.toHaveBeenCalled();
    });

    it('still says to tag products in Commerce for a rule on an attribute Assign products does not write (AB-74)', async () => {
        mockRead.mockResolvedValue({
            ...OPTIONS,
            erps: [OPTIONS.erps[0], { ...OPTIONS.erps[1], owns: { mode: 'attribute', attribute: 'brand=kukla' } }],
        });
        const result = await applyErpOwnership(project(), 'erp-integration', deps(), 'assign');
        expect(result).toMatchObject({
            notes: expect.arrayContaining(['Kukla ERP owns no products yet: tag products with brand=kukla in Commerce, then Load demo data.']),
        });
    });

    it('an ERP on everything is the catch-all (AB-72): it owns what no product rule claims, so nothing belongs to nobody', async () => {
        mockRead.mockResolvedValue({
            ...OPTIONS,
            products: [
                { sku: 'J1', websiteCodes: ['justrite'], attributes: { erp_owner: 'justrite' } },
                { sku: 'K1', websiteCodes: ['justrite'], attributes: { erp_owner: 'kukla' } },
                { sku: 'N1', websiteCodes: ['justrite'], attributes: {} },
            ],
            erps: [
                { erp: 'justrite', name: 'Justrite ERP', owns: { mode: 'all' } },
                { erp: 'kukla', name: 'Kukla ERP', owns: { mode: 'attribute', attribute: 'erp_owner=kukla' } },
            ],
        });
        mockList.mockImplementation(async (urls: Record<string, string>) =>
            urls['runtime/demo-erp/products'].startsWith('https://a.')
                ? [{ sku: 'K1', type: 'simple', salesStatus: 'sellable' }, { sku: 'N1', type: 'simple', salesStatus: 'sellable' }]
                : [],
        );

        const result = await applyErpOwnership(project(), 'erp-integration', deps(), 'add');

        // The catch-all keeps J1 and N1; K1 is Kukla's, so Justrite ERP discontinues it.
        expect(mockSetStatus.mock.calls.map((call) => [call[2], call[3]])).toStrictEqual([['K1', 'discontinued']]);
        expect(result).toMatchObject({
            status: 'applied',
            unowned: 0,
            erps: [
                { erp: 'demo-erp', ownsNow: 2, discontinued: 1 },
                { erp: 'demo-erp-2', ownsNow: 1, discontinued: 0 },
            ],
            notes: [],
        });
    });

    it('two specific rules claiming the same product are said by count and both names, with what it means for orders', async () => {
        mockRead.mockResolvedValue({
            ...OPTIONS,
            products: [
                { sku: 'BOTH', websiteCodes: ['justrite'], attributes: { erp_owner: 'justrite', brand: 'kukla' } },
                { sku: 'J2', websiteCodes: ['justrite'], attributes: { erp_owner: 'justrite' } },
            ],
            erps: [
                { erp: 'justrite', name: 'Justrite ERP', owns: { mode: 'attribute', attribute: 'erp_owner=justrite' } },
                { erp: 'kukla', name: 'Kukla ERP', owns: { mode: 'attribute', attribute: 'brand=kukla' } },
            ],
        });

        const result = await applyErpOwnership(project(), 'erp-integration', deps(), 'settings');

        expect(result).toMatchObject({
            status: 'applied',
            unowned: 0,
            erps: [{ erp: 'demo-erp', ownsNow: 2 }, { erp: 'demo-erp-2', ownsNow: 1 }],
            notes: ['1 product is claimed by both Justrite ERP and Kukla ERP; orders for it are refused until one rule changes.'],
        });
    });

    it('marks the products an ERP holds but no longer owns discontinued there, parents and already-marked rows left', async () => {
        mockList.mockImplementation(async (urls: Record<string, string>) =>
            urls['runtime/demo-erp/products'].startsWith('https://a.')
                ? [
                      { sku: 'J1', type: 'simple', salesStatus: 'sellable' },
                      { sku: 'N1', type: 'simple', salesStatus: 'sellable' },
                      { sku: 'OLD', type: 'simple', salesStatus: 'discontinued' },
                      { sku: 'P', type: 'configurable' },
                      { sku: 'GONE', type: 'simple', salesStatus: 'sellable' },
                  ]
                : [],
        );
        const d = deps();

        const result = await applyErpOwnership(project(), 'erp-integration', d, 'load');

        // N1 (nobody\'s) and GONE (not in Commerce) are marked; J1 is owned, OLD is marked already, P is a parent.
        const marked = mockSetStatus.mock.calls.map((call) => [call[2], call[3]]);
        expect(marked).toStrictEqual([['N1', 'discontinued'], ['GONE', 'discontinued']]);
        expect(mockSetStatus.mock.calls[0][0]).toStrictEqual({ 'runtime/demo-erp/products': 'https://a.adobeioruntime.net/api/v1/web/demo-erp/products' });
        expect(result).toMatchObject({ status: 'applied', erps: [{ erp: 'demo-erp', discontinued: 2, restored: 0 }, { erp: 'demo-erp-2', discontinued: 0, restored: 0 }] });
        expect(d.onProgress).toHaveBeenCalledWith('Justrite ERP: Marking 1 of 2 products discontinued');
    });

    it('a refusal while marking stops that ERP\'s marking, is its note, and the pass stands', async () => {
        mockList.mockResolvedValue([
            { sku: 'N1', type: 'simple', salesStatus: 'sellable' },
            { sku: 'N2', type: 'simple', salesStatus: 'sellable' },
        ]);
        mockSetStatus.mockRejectedValueOnce(new Error('The ERP answered 400: salesStatus must be sellable or blocked'));

        const result = await applyErpOwnership(project(['demo-erp']), 'erp-integration', deps(), 'load');

        expect(mockSetStatus).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({
            status: 'applied',
            erps: [
                {
                    erp: 'demo-erp',
                    discontinued: 0,
                    note: 'Justrite ERP: 2 products it no longer owns could not be marked discontinued: The ERP answered 400: salesStatus must be sellable or blocked',
                },
            ],
        });
    });

    it('a removal that leaves one ERP sets its rule back to everything first, and says so', async () => {
        mockRead.mockResolvedValue({ ...OPTIONS, erps: [OPTIONS.erps[0]] });
        mockList.mockResolvedValue([{ sku: 'N1', type: 'simple', salesStatus: 'sellable' }]);

        const result = await applyErpOwnership(project(['demo-erp']), 'erp-integration', deps(), 'remove');

        expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ urls: { 'runtime/erp/erps': 'https://ns.adobeioruntime.net/api/v1/web/erp/erps' } }), [
            { erp: 'justrite', owns: { mode: 'all' } },
        ]);
        expect(mockSave.mock.invocationCallOrder[0]).toBeLessThan(mockFillEvery.mock.invocationCallOrder[0]);
        // Owning everything, nothing is marked and nothing is unowned.
        expect(mockSetStatus).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            status: 'applied',
            unowned: 0,
            erps: [{ erp: 'demo-erp', owns: { mode: 'all' }, ownsNow: 3 }],
            notes: ['Justrite ERP owns every product again.'],
        });
    });

    it('makes the products an ERP owns again sellable again, and says how many (blocked stays)', async () => {
        mockRead.mockResolvedValue({ ...OPTIONS, erps: [OPTIONS.erps[0]] });
        mockList.mockResolvedValue([
            { sku: 'J1', type: 'simple', salesStatus: 'discontinued' },
            { sku: 'J2', type: 'simple', salesStatus: 'blocked' },
            { sku: 'N1', type: 'simple', salesStatus: 'discontinued' },
            { sku: 'GONE', type: 'simple', salesStatus: 'sellable' },
        ]);

        const result = await applyErpOwnership(project(['demo-erp']), 'erp-integration', deps(), 'remove');

        // Owning everything: J1 and N1 come back; J2 is the ERP user's own decision; GONE is not in Commerce.
        const changes = mockSetStatus.mock.calls.map((call) => [call[2], call[3]]);
        expect(changes).toStrictEqual([['J1', 'sellable'], ['N1', 'sellable'], ['GONE', 'discontinued']]);
        expect(result).toMatchObject({
            status: 'applied',
            erps: [{ erp: 'demo-erp', discontinued: 1, restored: 2 }],
            notes: ['Justrite ERP owns every product again.', 'Justrite ERP: 2 products are sellable again.'],
        });
    });

    it('a refusal while restoring names what is left on both sides', async () => {
        mockRead.mockResolvedValue({ ...OPTIONS, erps: [OPTIONS.erps[0]] });
        mockList.mockResolvedValue([
            { sku: 'J1', type: 'simple', salesStatus: 'discontinued' },
            { sku: 'GONE', type: 'simple', salesStatus: 'sellable' },
        ]);
        mockSetStatus.mockRejectedValueOnce(new Error('The ERP answered 500'));

        const result = await applyErpOwnership(project(['demo-erp']), 'erp-integration', deps(), 'remove');

        expect(result).toMatchObject({
            erps: [{ erp: 'demo-erp', discontinued: 0, restored: 0, note: 'Justrite ERP: 1 product it no longer owns could not be marked discontinued, and 1 product it owns again could not be made sellable: The ERP answered 500' }],
        });
    });

    it('an ERP owning everything in an empty store is told nothing', async () => {
        mockRead.mockResolvedValue({ ...OPTIONS, products: [], erps: [{ erp: 'justrite', name: 'Justrite ERP', owns: { mode: 'all' } }] });

        const result = await applyErpOwnership(project(['demo-erp']), 'erp-integration', deps(), 'load');

        expect(result).toMatchObject({ status: 'applied', unowned: 0, notes: [] });
    });

    it('any other moment leaves a single ERP\'s rule alone', async () => {
        mockRead.mockResolvedValue({ ...OPTIONS, erps: [OPTIONS.erps[0]] });

        await applyErpOwnership(project(['demo-erp']), 'erp-integration', deps(), 'settings');

        expect(mockSave).not.toHaveBeenCalled();
    });

    it('a per-website rule naming a website Commerce no longer has is said by name', async () => {
        mockRead.mockResolvedValue({
            ...OPTIONS,
            erps: [
                { erp: 'justrite', name: 'Justrite ERP', owns: { mode: 'websites', websites: ['justrite', 'old_site'] } },
                { erp: 'kukla', name: 'Kukla ERP', owns: { mode: 'websites', websites: ['gone'] } },
            ],
        });

        const result = await applyErpOwnership(project(), 'erp-integration', deps(), 'load');

        expect(result).toMatchObject({
            status: 'applied',
            notes: expect.arrayContaining([
                "Justrite ERP's rule names website old_site, which Commerce no longer has.",
                "Kukla ERP's rule names website gone, which Commerce no longer has, so it owns nothing.",
                'Kukla ERP owns no products: no Commerce product is sold on gone.',
            ]),
        });
    });

    it('a store that could not be read is a failed outcome with the reason, and nothing runs', async () => {
        mockRead.mockResolvedValue({ refusal: 'No Commerce credential on this project.' });

        const result = await applyErpOwnership(project(), 'erp-integration', deps(), 'add');

        expect(result).toStrictEqual({ status: 'failed', detail: 'No Commerce credential on this project.' });
        expect(mockFillEvery).not.toHaveBeenCalled();
    });
});
