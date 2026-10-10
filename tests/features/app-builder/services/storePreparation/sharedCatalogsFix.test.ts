/**
 * sharedCatalogsFix — a custom shared catalog per company without one of its own (AB-77).
 * Asserted on the Commerce fake: which companies get one (the check's own rule), the POST
 * bodies, the record, and the undo's unassign-then-delete.
 */

import { CATALOGS, COMPANIES, commerceFake } from '../../../../helpers/commercePreparationFixtures';
import { companiesNeedingCatalogs, sharedCatalogsFix } from '@/features/app-builder/services/storePreparation/sharedCatalogsFix';

const DEPS = { websiteCode: 'acme', erpNames: [] };

function store(nextId = 9) {
    return commerceFake({ 'company/': COMPANIES, 'sharedCatalog/': CATALOGS }, (_m, path) => (path === 'sharedCatalog' ? nextId : null));
}

describe('companiesNeedingCatalogs', () => {
    it('is the companies in no catalog, and all but the first of those sharing a custom one; public is fine', () => {
        const needing = companiesNeedingCatalogs(
            [...(COMPANIES.items ?? []), { id: 4, company_name: 'Orphan', customer_group_id: 9 }],
            CATALOGS.items ?? [],
        );
        expect(needing.map((c) => c.company_name)).toEqual(['Harbor', 'Orphan']);
    });
});

describe('preview', () => {
    it('names the catalog each company would get', async () => {
        expect(await sharedCatalogsFix.preview({ commerce: store(), ...DEPS })).toEqual({
            changes: ['Create the shared catalog Harbor Catalog and assign Harbor to it'],
        });
    });
});

describe('apply', () => {
    it('POSTs a custom catalog, assigns the company to it, and records both', async () => {
        const commerce = store(9);
        const applied = await sharedCatalogsFix.apply({ commerce, ...DEPS });
        expect(commerce.writes()).toEqual([
            ['POST', 'sharedCatalog', { sharedCatalog: { name: 'Harbor Catalog', type: 0, store_id: 0, tax_class_id: 3 } }],
            ['POST', 'sharedCatalog/9/assignCompanies', { companies: [{ id: 3 }] }],
        ]);
        expect(applied).toEqual({
            changes: ['Created the shared catalog Harbor Catalog and assigned Harbor to it'],
            rejected: [],
            record: { kind: 'shared-catalogs', catalogs: [{ id: 9, name: 'Harbor Catalog', companyId: 3, companyName: 'Harbor' }] },
        });
    });

    it('a refused create is named and nothing is recorded for it', async () => {
        const commerce = store();
        commerce.send.mockImplementation(async () => {
            throw new Error('Commerce answered 400 for sharedCatalog: no');
        });
        const applied = await sharedCatalogsFix.apply({ commerce, ...DEPS });
        expect(applied.rejected).toEqual(['Create the shared catalog Harbor Catalog: Commerce answered 400 for sharedCatalog: no']);
        expect(applied.record).toBeUndefined();
    });
});

describe('undo', () => {
    it('unassigns the company and deletes only the catalog this run created', async () => {
        const commerce = store();
        const undone = await sharedCatalogsFix.undo(
            { commerce, ...DEPS },
            { kind: 'shared-catalogs', catalogs: [{ id: 9, name: 'Harbor Catalog', companyId: 3, companyName: 'Harbor' }] },
        );
        expect(commerce.writes()).toEqual([
            ['POST', 'sharedCatalog/9/unassignCompanies', { companies: [{ id: 3 }] }],
            ['DELETE', 'sharedCatalog/9', undefined],
        ]);
        expect(undone.changes).toEqual(['Deleted the shared catalog Harbor Catalog; Harbor is back on the public catalog']);
    });
});
