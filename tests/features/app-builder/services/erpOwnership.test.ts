/**
 * erpOwnership — which products an ERP owns, as "Add another ERP" asks it (AB-64): the
 * settings a rule saves, the rule a setting reads back as, the count each option would give,
 * the default rule, and the rule an existing ERP is given once it stops owning everything.
 */

import {
    countOwned,
    defaultOwnsRule,
    describeOwns,
    existingRulesToChange,
    ownsProblem,
    ownsRuleOf,
    ownsSettingsOf,
} from '@/features/app-builder/services/erpOwnership';
import type { ErpOwnedProductRow, ErpOwnsEntry } from '@/types/erpOwnership';

const WEBSITES = [
    { code: 'base', name: 'Main Website' },
    { code: 'justrite', name: 'Justrite' },
    { code: 'evo', name: 'Evo' },
];

function row(over: Partial<ErpOwnedProductRow> & Pick<ErpOwnedProductRow, 'sku'>): ErpOwnedProductRow {
    return { websiteCodes: [], attributes: {}, ...over };
}

const PRODUCTS: ErpOwnedProductRow[] = [
    row({ sku: 'A', websiteCodes: ['base'], attributes: { erp_owner: 'acme' } }),
    row({ sku: 'B', websiteCodes: ['justrite'], attributes: {} }),
    row({ sku: 'C', websiteCodes: ['justrite', 'evo'], attributes: { erp_owner: 'brand-b' } }),
];

describe('ownsSettingsOf — the erp/erps values a rule saves', () => {
    it('writes the mode and the one key the mode reads, nothing else', () => {
        expect(ownsSettingsOf({ mode: 'websites', websites: ['justrite', 'evo'] })).toStrictEqual({
            structure_owns: 'websites',
            structure_owns_websites: 'justrite,evo',
        });
        expect(ownsSettingsOf({ mode: 'attribute', attribute: 'erp_owner=brand-b' })).toStrictEqual({
            structure_owns: 'attribute',
            structure_owns_attribute: 'erp_owner=brand-b',
        });
        expect(ownsSettingsOf({ mode: 'all' })).toStrictEqual({ structure_owns: 'all' });
    });
});

describe('ownsRuleOf — the rule an ERP holds, read off its resolved settings', () => {
    it('reads each mode with its list, and an unset mode as "all"', () => {
        expect(ownsRuleOf({ structure_owns: 'websites', structure_owns_websites: 'justrite, evo' }))
            .toStrictEqual({ mode: 'websites', websites: ['justrite', 'evo'] });
        expect(ownsRuleOf({ structure_owns: 'attribute', structure_owns_attribute: 'erp_owner=acme' }))
            .toStrictEqual({ mode: 'attribute', attribute: 'erp_owner=acme' });
        // The sources mode was deleted (AB-70): an entry still carrying it reads as "all".
        expect(ownsRuleOf({ structure_owns: 'sources', structure_owns_sources: 'east' }))
            .toStrictEqual({ mode: 'all' });
        expect(ownsRuleOf({})).toStrictEqual({ mode: 'all' });
        expect(ownsRuleOf(undefined)).toStrictEqual({ mode: 'all' });
    });
});

describe('countOwned and describeOwns — what each option would give, by the fill\'s own predicate', () => {
    it('counts the products each rule owns', () => {
        expect(countOwned(PRODUCTS, { mode: 'websites', websites: ['justrite'] })).toBe(2);
        expect(countOwned(PRODUCTS, { mode: 'websites', websites: ['evo'] })).toBe(1);
        expect(countOwned(PRODUCTS, { mode: 'websites', websites: [] })).toBe(0);
        expect(countOwned(PRODUCTS, { mode: 'attribute', attribute: 'erp_owner=brand-b' })).toBe(1);
        expect(countOwned(PRODUCTS, { mode: 'all' })).toBe(3);
    });

    it('says the rule in the fill\'s words', () => {
        expect(describeOwns({ mode: 'websites', websites: ['justrite'] })).toBe('products sold on justrite');
        expect(describeOwns({ mode: 'attribute', attribute: 'erp_owner=brand-b' })).toBe('products whose erp_owner is brand-b');
        expect(describeOwns({ mode: 'all' })).toBe('every product');
    });
});

describe('defaultOwnsRule — the rule offered before the SC changes anything', () => {
    // Owner, 2026-10-09 (AB-70): the attribute, whatever the store's websites.
    it('is the attribute, erp_owner=<its list id>', () => {
        expect(defaultOwnsRule({ listId: 'brand-b' }))
            .toStrictEqual({ mode: 'attribute', attribute: 'erp_owner=brand-b' });
    });
});

describe('existingRulesToChange — the first ERP stops owning everything once there are two', () => {
    it('an ERP still on "all" is given the websites left over, else the attribute', () => {
        const erps = [{ erp: 'acme', owns: { mode: 'all' as const } }];
        expect(existingRulesToChange({ websites: WEBSITES, erps }, { mode: 'websites', websites: ['justrite'] }))
            .toStrictEqual([{ erp: 'acme', owns: { mode: 'websites', websites: ['base', 'evo'] } }]);
        expect(existingRulesToChange({ websites: WEBSITES, erps }, { mode: 'websites', websites: ['base', 'justrite', 'evo'] }))
            .toStrictEqual([{ erp: 'acme', owns: { mode: 'attribute', attribute: 'erp_owner=acme' } }]);
        expect(existingRulesToChange({ websites: [WEBSITES[0]], erps }, { mode: 'attribute', attribute: 'erp_owner=brand-b' }))
            .toStrictEqual([{ erp: 'acme', owns: { mode: 'attribute', attribute: 'erp_owner=acme' } }]);
    });

    it('an ERP with a rule of its own is left alone; websites another ERP owns are not handed out', () => {
        const erps: ErpOwnsEntry[] = [
            { erp: 'acme', owns: { mode: 'all' } },
            { erp: 'other', owns: { mode: 'websites', websites: ['evo'] } },
        ];
        expect(existingRulesToChange({ websites: WEBSITES, erps }, { mode: 'websites', websites: ['justrite'] }))
            .toStrictEqual([{ erp: 'acme', owns: { mode: 'websites', websites: ['base'] } }]);
    });
});

describe('ownsProblem — a rule that cannot be saved', () => {
    it('a list mode with nothing ticked, an attribute without code=value', () => {
        expect(ownsProblem({ mode: 'websites', websites: [] })).toBe('Tick at least one website.');
        expect(ownsProblem({ mode: 'attribute', attribute: 'erp_owner' })).toBe('The attribute is code=value, e.g. erp_owner=acme.');
        expect(ownsProblem({ mode: 'websites', websites: ['base'] })).toBeUndefined();
        expect(ownsProblem({ mode: 'all' })).toBeUndefined();
    });
});
