/**
 * erpAddPreview — what every ERP will own once a new one is added (AB-75), through the one
 * resolver (`ownersAcross`) over the rules as the add leaves them. The product rows are the
 * shape `readErpOwnershipOptions` answers (`ErpOwnedProductRow`); the four cases are the ones
 * the owner named: the catch-all beside a tagged ERP, a website rule, an overlap, nothing owned.
 */

import {
    ownsNothingNext,
    previewErpAdd,
    previewSentences,
    productCount,
} from '@/features/app-builder/services/erpAddPreview';
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
        expect(previewSentences(preview)[0]).toStrictEqual({
            line: 'Justrite ERP: 3 products.',
            detail: 'Products sold on justrite. Its rule changes to this when the ERP is added.',
            examples: 'For example: J-1, J-2, A-1.',
        });
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
        const lines = previewSentences(preview).map((sentence) => sentence.line);
        expect(lines).toContain('Nobody: 3 products.');
        expect(lines).toContain('Claimed by two ERPs: 2 products.');
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
