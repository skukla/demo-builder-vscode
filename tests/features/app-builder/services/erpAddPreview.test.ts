/**
 * erpAddPreview — what every ERP will own once a new one is added (AB-75), through the one
 * resolver (`ownersAcross`) over the rules as the add leaves them. The product rows are the
 * shape `readErpOwnershipOptions` answers (`ErpOwnedProductRow`); the four cases are the ones
 * the owner named: the catch-all beside a tagged ERP, a website rule, an overlap, nothing owned.
 */

import {
    ownsNothingNext,
    previewAsItStands,
    previewErpAdd,
    previewLines,
    productCount,
} from '@/features/app-builder/services/erpAddPreview';
import { rulesAfterAdd } from '@/features/app-builder/services/erpOwnership';
import type { ErpOwnedProductRow, ErpOwnsEntry } from '@/types/erpOwnership';

const row = (sku: string, websiteCodes: string[], attributes: Record<string, string> = {}): ErpOwnedProductRow => ({
    sku,
    websiteCodes,
    attributes,
});

const PRODUCTS = [
    row('J-1', ['justrite']),
    row('J-2', ['justrite']),
    row('A-1', ['justrite'], { erp_owner: 'accuform' }),
    row('A-2', ['base'], { erp_owner: 'accuform' }),
    row('B-1', ['base']),
];
const WEBSITES = [{ code: 'base' }, { code: 'justrite' }];
/** The same websites with the names the dialog shows. */
const NAMED = [{ code: 'base', name: 'Main Website' }, { code: 'justrite', name: 'Justrite' }];
const JUSTRITE_ALL: ErpOwnsEntry & { name: string } = { erp: 'justrite', name: 'Justrite ERP', owns: { mode: 'all' } };

describe('previewErpAdd', () => {
    it('the catch-all keeps what the tagged ERP does not claim', () => {
        const preview = previewErpAdd(PRODUCTS, { websites: WEBSITES, erps: [JUSTRITE_ALL] }, {
            erp: 'accuform',
            name: 'Accuform ERP',
            owns: { mode: 'attribute', attribute: 'erp_owner=accuform' },
        });
        expect(preview.erps).toStrictEqual([
            { erp: 'justrite', name: 'Justrite ERP', count: 3, describe: 'every product no other ERP claims', examples: ['J-1', 'J-2', 'B-1'], isNew: false, narrowed: false },
            { erp: 'accuform', name: 'Accuform ERP', count: 2, describe: 'products whose erp_owner is accuform', examples: ['A-1', 'A-2'], isNew: true, narrowed: false },
        ]);
        expect(preview.nobody).toStrictEqual({ count: 0, examples: [] });
        expect(preview.overlap).toStrictEqual({ count: 0, examples: [] });
    });

    it('a website rule narrows the catch-all to the websites left over, and says so', () => {
        const preview = previewErpAdd(PRODUCTS, { websites: WEBSITES, erps: [JUSTRITE_ALL] }, {
            erp: 'basebrand',
            name: 'Base ERP',
            owns: { mode: 'websites', websites: ['base'] },
        });
        expect(preview.erps.map(({ name, count, narrowed }) => ({ name, count, narrowed }))).toStrictEqual([
            { name: 'Justrite ERP', count: 3, narrowed: true },
            { name: 'Base ERP', count: 2, narrowed: false },
        ]);
        const rules = rulesAfterAdd({ websites: WEBSITES, erps: [JUSTRITE_ALL] }, { erp: 'basebrand', owns: { mode: 'websites', websites: ['base'] } });
        expect(previewLines(preview, rules, NAMED)).toStrictEqual([
            { who: 'Justrite ERP', count: '3 products', says: 'Products sold on Justrite (changes when this ERP is added)' },
            { who: 'Base ERP', count: '2 products', says: 'Products sold on Main Website' },
        ]);
    });

    // Owner, 2026-10-18: the dialog says a rule in the words of the button the SC presses,
    // Assign products, never the attribute code. Only an ERP's OWN tag is said that way; a
    // rule naming another ERP's tag keeps its exact words, so the odd setup stays visible.
    // The preview itself keeps the exact rule and the SKUs: an agent works with those.
    it("the dialog's lines say an ERP's own tag in the SC's words, any other attribute exactly", () => {
        const kukla: ErpOwnsEntry & { name: string } = { erp: 'kukla', name: 'Kukla ERP', owns: { mode: 'attribute', attribute: 'erp_owner=accuform' } };
        const accuform: ErpOwnsEntry & { name: string } = { erp: 'accuform', name: 'Accuform ERP', owns: { mode: 'attribute', attribute: 'erp_owner=accuform' } };
        const preview = previewErpAdd(PRODUCTS, { websites: WEBSITES, erps: [kukla] }, accuform);

        expect(previewLines(preview, [kukla, accuform], NAMED)).toStrictEqual([
            // Both claim A-1 and A-2: each counts them, and the overlap line says so.
            { who: 'Kukla ERP', count: '2 products', says: 'Products whose erp_owner is accuform' },
            { who: 'Accuform ERP', count: '2 products', says: 'Products assigned to it' },
            { who: 'Nobody', count: '3 products', says: 'Products no ERP owns' },
            { who: 'Two ERPs', count: '2 products', says: 'Their orders are refused until a rule changes' },
        ]);
        expect(preview.erps.map((erp) => erp.describe)).toStrictEqual([
            'products whose erp_owner is accuform',
            'products whose erp_owner is accuform',
        ]);
    });

    // Owner, 2026-10-19: an ERP already added that owns nothing gets Assign products on its
    // line. Not the one being added (it does not exist yet), and not one holding products.
    it('marks an ERP already added, owning nothing by its own tag, as one to assign to', () => {
        const acme: ErpOwnsEntry & { name: string } = { erp: 'acme', name: 'Acme ERP', owns: { mode: 'attribute', attribute: 'erp_owner=acme' } };
        const fresh: ErpOwnsEntry & { name: string } = { erp: 'fresh', name: 'Fresh ERP', owns: { mode: 'attribute', attribute: 'erp_owner=fresh' } };
        const accuform: ErpOwnsEntry & { name: string } = { erp: 'accuform', name: 'Accuform ERP', owns: { mode: 'attribute', attribute: 'erp_owner=accuform' } };
        const input = { websites: WEBSITES, erps: [JUSTRITE_ALL, accuform, acme] };
        const preview = previewErpAdd(PRODUCTS, input, fresh);
        expect(previewLines(preview, [JUSTRITE_ALL, accuform, acme, fresh], NAMED)).toStrictEqual([
            { who: 'Justrite ERP', count: '3 products', says: 'All products not assigned to another ERP' },
            { who: 'Accuform ERP', count: '2 products', says: 'Products assigned to it' },
            { who: 'Acme ERP', count: '0 products', says: 'None yet', assignable: true },
            { who: 'Fresh ERP', count: '0 products', says: 'None yet: assign products to it after adding' },
        ]);
    });

    it('says the catch-all and an ERP holding its own products plainly', () => {
        const accuform = { erp: 'accuform', name: 'Accuform ERP', owns: { mode: 'attribute' as const, attribute: 'erp_owner=accuform' } };
        const preview = previewErpAdd(PRODUCTS, { websites: WEBSITES, erps: [JUSTRITE_ALL] }, accuform);
        expect(previewLines(preview, [JUSTRITE_ALL, accuform], NAMED)).toStrictEqual([
            { who: 'Justrite ERP', count: '3 products', says: 'All products not assigned to another ERP' },
            { who: 'Accuform ERP', count: '2 products', says: 'Products assigned to it' },
        ]);
    });

    // Before a name is typed the dialog shows the ERPs as they stand: an empty name once
    // previewed "The new ERP" owning the products tagged `erp` (owner, 2026-10-18).
    it('previews the ERPs as they stand, with no new ERP, before one is named', () => {
        const preview = previewAsItStands(PRODUCTS, { websites: WEBSITES, erps: [JUSTRITE_ALL] });
        expect(preview.erps.map(({ name, count, isNew, narrowed }) => ({ name, count, isNew, narrowed }))).toStrictEqual([
            { name: 'Justrite ERP', count: 5, isNew: false, narrowed: false },
        ]);
        expect(preview.nobody.count).toBe(0);
    });

    it('counts products two product rules both claim, and what nobody owns', () => {
        const kukla: ErpOwnsEntry & { name: string } = { erp: 'kukla', name: 'Kukla ERP', owns: { mode: 'attribute', attribute: 'erp_owner=accuform' } };
        const preview = previewErpAdd(PRODUCTS, { websites: WEBSITES, erps: [kukla] }, {
            erp: 'accuform',
            name: 'Accuform ERP',
            owns: { mode: 'attribute', attribute: 'erp_owner=accuform' },
        });
        expect(preview.overlap).toStrictEqual({ count: 2, examples: ['A-1', 'A-2'] });
        expect(preview.nobody).toStrictEqual({ count: 3, examples: ['J-1', 'J-2', 'B-1'] });
        expect(preview.erps.map((erp) => erp.count)).toStrictEqual([2, 2]);
    });

    it('says what to do next when the new ERP would own nothing', () => {
        const rule = { mode: 'attribute' as const, attribute: 'erp_owner=evo' };
        const preview = previewErpAdd(PRODUCTS, { websites: WEBSITES, erps: [JUSTRITE_ALL] }, { erp: 'evo', name: 'Evo ERP', owns: rule });
        expect(preview.erps[1].count).toBe(0);
        expect(ownsNothingNext(preview, rule)).toBe('Evo ERP will own no products yet. After adding, use Assign products on its card.');
        const byWebsite = { mode: 'websites' as const, websites: ['nowhere'] };
        const empty = previewErpAdd(PRODUCTS, { websites: WEBSITES, erps: [JUSTRITE_ALL] }, { erp: 'evo', name: 'Evo ERP', owns: byWebsite });
        expect(ownsNothingNext(empty, byWebsite)).toBe('Evo ERP will own no products yet. No product in the store matches its rule.');
    });

    it('says nothing next when the new ERP owns products', () => {
        const rule = { mode: 'attribute' as const, attribute: 'erp_owner=accuform' };
        const preview = previewErpAdd(PRODUCTS, { websites: WEBSITES, erps: [JUSTRITE_ALL] }, { erp: 'accuform', name: 'Accuform ERP', owns: rule });
        expect(ownsNothingNext(preview, rule)).toBeUndefined();
        expect(productCount(1)).toBe('1 product');
    });
});
