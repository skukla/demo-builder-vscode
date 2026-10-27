/**
 * configFix — a setup step whose fix is settings (AB-77): the preview reads current values,
 * the apply writes only what differs in one PUT and reads the answer's `errors`, the record
 * holds each row's previous value, and the undo writes those back.
 */

import { commerceFake, configList, configRefused, configSaved } from '../../../../helpers/commercePreparationFixtures';
import { configFix, configListPath } from '@/features/app-builder/services/storePreparation/configFix';
import type { SetupConfigFix } from '@/types/appBuilderComponents';
import type { CommerceSystemConfigPutAnswer } from '@/types/commerceWire';

const FIX: SetupConfigFix = {
    kind: 'config',
    items: [
        { path: 'catalog/price/scope', value: '1', scope: 'default', field: 'Catalog Price Scope', values: { '0': 'Global', '1': 'Website' } },
        { path: 'payment/companycredit/active', value: '1', scope: 'website', field: 'Payment on Account', values: { '0': 'No', '1': 'Yes' } },
    ],
    manual: 'Connect PayPal by hand.',
};

/** Default scope stores price scope 0; the website stores nothing (it inherits 0). */
function store(defaults: Array<[string, string | null]>, website: Array<[string, string | null]> = []) {
    return commerceFake(
        {
            'system/config?scope=default': configList(defaults),
            'system/config?scope=website': configList(website, 'website', 'justrite'),
        },
        (_m, _p, body) => configSaved(((body as { items: CommerceSystemConfigPutAnswer['items'] }).items ?? []).map((row) => ({ ...row, value: row.value ?? null }))),
    );
}

describe('configListPath', () => {
    it('filters by path with conditionType in, at the default or the named website', () => {
        expect(configListPath(['a/b/c', 'd/e/f'], 'default')).toBe(
            'system/config?scope=default&searchCriteria[filterGroups][0][filters][0][field]=path&searchCriteria[filterGroups][0][filters][0][value]=a%2Fb%2Fc%2Cd%2Fe%2Ff&searchCriteria[filterGroups][0][filters][0][conditionType]=in',
        );
        expect(configListPath(['a/b/c'], 'website', 'justrite')).toContain('scope=website&scopeCode=justrite&');
    });
});

describe('preview', () => {
    it('reads current values and lists only the rows that differ, with the manual part', async () => {
        const commerce = store([['catalog/price/scope', '0']]);
        const preview = await configFix(FIX).preview({ commerce, websiteCode: 'justrite', erpNames: [] });
        expect(preview).toEqual({
            changes: ['Catalog Price Scope: Global → Website', 'Payment on Account for the website: No → Yes'],
            manual: 'Connect PayPal by hand.',
        });
        expect(commerce.send).not.toHaveBeenCalled();
    });

    it('lists nothing for a value already in force (inherited from the default counts)', async () => {
        const commerce = store([['catalog/price/scope', '1'], ['payment/companycredit/active', '1']]);
        const preview = await configFix(FIX).preview({ commerce, websiteCode: 'justrite', erpNames: [] });
        expect(preview.changes).toStrictEqual([]);
    });

    it('refuses a website item when the project names no website', async () => {
        const commerce = store([]);
        await expect(configFix(FIX).preview({ commerce, erpNames: [] })).rejects.toThrow('names no Commerce website');
    });
});

describe('apply', () => {
    it('writes only the differing rows in one PUT, scoped, and records what each held before', async () => {
        const commerce = store([['catalog/price/scope', '1']]);
        const applied = await configFix(FIX).apply({ commerce, websiteCode: 'justrite', erpNames: [] });
        expect(commerce.writes()).toEqual([
            ['PUT', 'system/config', { items: [{ path: 'payment/companycredit/active', value: '1', scope: 'website', scope_code: 'justrite' }] }],
        ]);
        expect(applied).toEqual({
            changes: ['Payment on Account for the website: No → Yes'],
            rejected: [],
            record: { kind: 'config', previous: [{ path: 'payment/companycredit/active', scope: 'website', scopeCode: 'justrite', stored: null, effective: '0' }] },
            manual: 'Connect PayPal by hand.',
        });
    });

    it('writes nothing and records nothing when every value stands', async () => {
        const commerce = store([['catalog/price/scope', '1'], ['payment/companycredit/active', '1']]);
        const applied = await configFix(FIX).apply({ commerce, websiteCode: 'justrite', erpNames: [] });
        expect(commerce.send).not.toHaveBeenCalled();
        expect(applied.record).toBeUndefined();
    });

    it('names a row the answer refused (under HTTP 200), records the others, and keeps going', async () => {
        const commerce = commerceFake(
            { 'system/config?scope=default': configList([['catalog/price/scope', '0']]), 'system/config?scope=website': configList([], 'website', 'justrite') },
            () => configRefused([{ path: 'catalog/price/scope', value: '1', scope: 'default' }], 'payment/companycredit/active', 'website', 'The path is not allowed'),
        );
        const applied = await configFix(FIX).apply({ commerce, websiteCode: 'justrite', erpNames: [] });
        expect(applied.changes).toEqual(['Catalog Price Scope: Global → Website']);
        expect(applied.rejected).toEqual(['Payment on Account for the website: No → Yes: The path is not allowed']);
        expect(applied.record).toEqual({ kind: 'config', previous: [{ path: 'catalog/price/scope', scope: 'default', stored: '0', effective: '0' }] });
    });

    it('a PUT that throws rejects every row it carried and records nothing', async () => {
        const commerce = commerceFake(
            { 'system/config?scope=default': configList([['catalog/price/scope', '0']]), 'system/config?scope=website': configList([], 'website', 'justrite') },
            () => {
                throw new Error('Commerce answered 500 for system/config');
            },
        );
        const applied = await configFix(FIX).apply({ commerce, websiteCode: 'justrite', erpNames: [] });
        expect(applied.rejected).toHaveLength(2);
        expect(applied.record).toBeUndefined();
    });
});

// A setting the step does not name (the agent's set_commerce_config hands bare paths) says
// its path and stored values.
describe('a setting with no Admin name', () => {
    it('says its path and stored values', async () => {
        const commerce = store([['catalog/price/scope', '0']]);
        const bare: SetupConfigFix = { kind: 'config', items: [{ path: 'catalog/price/scope', value: '1', scope: 'default' }] };
        const preview = await configFix(bare).preview({ commerce, websiteCode: 'justrite', erpNames: [] });
        expect(preview.changes).toEqual(['catalog/price/scope: 0 → 1']);
    });
});

describe('undo', () => {
    it('writes each recorded row back to the value in force before, in the Admin\'s words', async () => {
        const commerce = store([['catalog/price/scope', '1']], [['payment/companycredit/active', '1']]);
        const undone = await configFix(FIX).undo(
            { commerce, websiteCode: 'justrite', erpNames: [] },
            {
                kind: 'config',
                previous: [
                    { path: 'catalog/price/scope', scope: 'default', stored: '0', effective: '0' },
                    { path: 'payment/companycredit/active', scope: 'website', scopeCode: 'justrite', stored: null, effective: '0' },
                ],
            },
        );
        expect(commerce.writes()).toEqual([
            [
                'PUT',
                'system/config',
                {
                    items: [
                        { path: 'catalog/price/scope', value: '0', scope: 'default' },
                        { path: 'payment/companycredit/active', value: '0', scope: 'website', scope_code: 'justrite' },
                    ],
                },
            ],
        ]);
        expect(undone).toEqual({
            changes: [
                'Catalog Price Scope: Website → Global',
                'Payment on Account for the website: Yes → No',
            ],
            rejected: [],
        });
    });

    it('refuses a record of another kind', async () => {
        const commerce = store([]);
        const undone = await configFix(FIX).undo({ commerce, erpNames: [] }, { kind: 'shared-catalogs', catalogs: [] });
        expect(undone.rejected).toEqual(['The record is not a settings record (shared-catalogs).']);
    });
});
