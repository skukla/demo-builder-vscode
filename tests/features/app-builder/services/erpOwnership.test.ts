/**
 * erpOwnership — which products each ERP owns (AB-64, AB-72): the settings a rule saves, the
 * rule a setting reads back as, the one resolver every reader uses (specific rules first, then
 * the ERP on everything for what nobody claims, then website rules — the integration's
 * `ownersOfLine`), the default rule, and the narrowing an ERP on everything is given only when
 * a website-rule ERP is added beside it.
 */

import {
    countOwnedAfterAdd,
    defaultOwnsRule,
    describeOwns,
    existingRulesToChange,
    overlapsIn,
    ownedSkusAcross,
    ownersAcross,
    ownsProblem,
    ownsRuleOf,
    ownsSettingsOf,
    rulesAfterAdd,
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

describe('ownersAcross — who owns each product, by the integration\'s precedence', () => {
    const JUSTRITE: ErpOwnsEntry = { erp: 'justrite', owns: { mode: 'all' } };
    const ACCUFORM: ErpOwnsEntry = { erp: 'accuform', owns: { mode: 'attribute', attribute: 'erp_owner=accuform' } };
    const STORE: ErpOwnedProductRow[] = [
        row({ sku: 'tagged', websiteCodes: ['base'], attributes: { erp_owner: 'accuform' } }),
        row({ sku: 'untagged', websiteCodes: ['base'], attributes: {} }),
        row({ sku: 'other-tag', websiteCodes: ['evo'], attributes: { erp_owner: 'justrite' } }),
    ];

    it('an ERP on everything is the catch-all: it owns what no product rule claims, and never competes for a tagged product', () => {
        expect(ownersAcross(STORE, [JUSTRITE, ACCUFORM])).toStrictEqual(
            new Map([
                ['tagged', ['accuform']],
                ['untagged', ['justrite']],
                ['other-tag', ['justrite']],
            ]),
        );
        expect(ownedSkusAcross(STORE, [JUSTRITE, ACCUFORM], 'justrite')).toStrictEqual(new Set(['untagged', 'other-tag']));
        expect(ownedSkusAcross(STORE, [JUSTRITE, ACCUFORM], 'accuform')).toStrictEqual(new Set(['tagged']));
    });

    it('a website rule comes last: it owns only what no product rule and no catch-all took', () => {
        const byWebsite: ErpOwnsEntry = { erp: 'evo', owns: { mode: 'websites', websites: ['evo'] } };
        expect(ownersAcross(STORE, [JUSTRITE, byWebsite])).toStrictEqual(
            new Map([
                ['tagged', ['justrite']],
                ['untagged', ['justrite']],
                ['other-tag', ['justrite']],
            ]),
        );
        const narrowed: ErpOwnsEntry = { erp: 'justrite', owns: { mode: 'websites', websites: ['base'] } };
        expect(ownersAcross(STORE, [narrowed, ACCUFORM, byWebsite])).toStrictEqual(
            new Map([
                ['tagged', ['accuform']],
                ['untagged', ['justrite']],
                ['other-tag', ['evo']],
            ]),
        );
    });

    it('a product no rule claims has no owner; two specific rules that both match both own it', () => {
        const byBrand: ErpOwnsEntry = { erp: 'brand', owns: { mode: 'attribute', attribute: 'brand=kukla' } };
        const products = [
            row({ sku: 'both', attributes: { erp_owner: 'accuform', brand: 'kukla' } }),
            row({ sku: 'nobody', attributes: {} }),
        ];
        expect(ownersAcross(products, [ACCUFORM, byBrand])).toStrictEqual(
            new Map([
                ['both', ['accuform', 'brand']],
                ['nobody', []],
            ]),
        );
    });
});

describe('overlapsIn — the products two rules both claim', () => {
    it('groups the claimed products by the ERPs that claim them, and skips the single-owner rest', () => {
        const owners = new Map([
            ['a', ['x', 'y']],
            ['b', ['x', 'y']],
            ['c', ['y', 'z']],
            ['d', ['x']],
            ['e', []],
        ]);
        expect(overlapsIn(owners)).toStrictEqual([
            { erps: ['x', 'y'], count: 2 },
            { erps: ['y', 'z'], count: 1 },
        ]);
    });
});

describe('describeOwns — the rule in the fill\'s words', () => {
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

describe('existingRulesToChange — only a website-rule ERP needs the catch-all narrowed', () => {
    const erps = [{ erp: 'acme', owns: { mode: 'all' as const } }];

    it('an ERP on everything is left alone when the new ERP is split by attribute: it keeps what the attribute does not claim', () => {
        expect(existingRulesToChange({ websites: WEBSITES, erps }, { mode: 'attribute', attribute: 'erp_owner=brand-b' }))
            .toStrictEqual([]);
    });

    it('an ERP on everything is given the websites left over when the new ERP is split by website, since the catch-all comes before a website rule', () => {
        expect(existingRulesToChange({ websites: WEBSITES, erps }, { mode: 'websites', websites: ['justrite'] }))
            .toStrictEqual([{ erp: 'acme', owns: { mode: 'websites', websites: ['base', 'evo'] } }]);
    });

    it('with no website left over it is left on everything (the new ERP then owns nothing, and the pass says so)', () => {
        expect(existingRulesToChange({ websites: WEBSITES, erps }, { mode: 'websites', websites: ['base', 'justrite', 'evo'] }))
            .toStrictEqual([]);
    });

    it('an ERP with a rule of its own is left alone; websites another ERP owns are not handed out', () => {
        const two: ErpOwnsEntry[] = [
            { erp: 'acme', owns: { mode: 'all' } },
            { erp: 'other', owns: { mode: 'websites', websites: ['evo'] } },
        ];
        expect(existingRulesToChange({ websites: WEBSITES, erps: two }, { mode: 'websites', websites: ['justrite'] }))
            .toStrictEqual([{ erp: 'acme', owns: { mode: 'websites', websites: ['base'] } }]);
    });
});

describe('rulesAfterAdd and countOwnedAfterAdd — what the dialog counts is what the add leaves', () => {
    const erps = [{ erp: 'acme', owns: { mode: 'all' as const } }];

    it('the rules once the new ERP is added: the existing ones, narrowed where needed, and the new one', () => {
        const added: ErpOwnsEntry = { erp: 'brand-b', owns: { mode: 'websites', websites: ['justrite'] } };
        expect(rulesAfterAdd({ websites: WEBSITES, erps }, added)).toStrictEqual([
            { erp: 'acme', owns: { mode: 'websites', websites: ['base', 'evo'] } },
            added,
        ]);
        const byAttribute: ErpOwnsEntry = { erp: 'brand-b', owns: { mode: 'attribute', attribute: 'erp_owner=brand-b' } };
        expect(rulesAfterAdd({ websites: WEBSITES, erps }, byAttribute)).toStrictEqual([erps[0], byAttribute]);
    });

    it('counts what the new ERP would own across every rule, not what its rule alone matches', () => {
        // By attribute: only the tagged product, whatever the catch-all holds.
        expect(countOwnedAfterAdd(PRODUCTS, { websites: WEBSITES, erps }, { erp: 'brand-b', owns: { mode: 'attribute', attribute: 'erp_owner=brand-b' } })).toBe(1);
        // By website: justrite's two, once the catch-all is narrowed to base and evo.
        expect(countOwnedAfterAdd(PRODUCTS, { websites: WEBSITES, erps }, { erp: 'brand-b', owns: { mode: 'websites', websites: ['justrite'] } })).toBe(2);
        // By website with nothing left over: the catch-all keeps everything, so the new ERP would own nothing.
        expect(countOwnedAfterAdd(PRODUCTS, { websites: WEBSITES, erps }, { erp: 'brand-b', owns: { mode: 'websites', websites: ['base', 'justrite', 'evo'] } })).toBe(0);
        // Beside a specific rule the product keeps its tagged owner: C is brand-b's, not a website ERP's.
        const specific = [{ erp: 'acme', owns: { mode: 'attribute' as const, attribute: 'erp_owner=acme' } }, { erp: 'brand-b', owns: { mode: 'attribute' as const, attribute: 'erp_owner=brand-b' } }];
        expect(countOwnedAfterAdd(PRODUCTS, { websites: WEBSITES, erps: specific }, { erp: 'evo', owns: { mode: 'websites', websites: ['evo'] } })).toBe(0);
        expect(countOwnedAfterAdd(PRODUCTS, { websites: WEBSITES, erps: specific }, { erp: 'evo', owns: { mode: 'websites', websites: ['justrite'] } })).toBe(1);
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
