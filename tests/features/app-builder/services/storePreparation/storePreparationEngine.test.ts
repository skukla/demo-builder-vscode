/**
 * storePreparationEngine — "Prepare this store" over a catalog entry's steps (AB-77): each
 * step's state, the preview, the apply in order with the datapack-already-did-it skip and
 * the per-step record, and the undo newest first. The fixes behind the steps are the real
 * `configFix` over a Commerce fake, so what reaches Commerce is asserted, not mocked.
 */

import { commerceFake, configList, configSaved } from '../../../../helpers/commercePreparationFixtures';
import {
    applyPreparation,
    previewPreparation,
    undoPreparation,
    type PreparationDeps,
} from '@/features/app-builder/services/storePreparation/storePreparationEngine';
import type { SetupStep } from '@/types/appBuilderComponents';
import type { CommerceSystemConfigPutAnswer } from '@/types/commerceWire';
import type { StorePreparationRecord } from '@/types/storePreparation';

const STEPS: SetupStep[] = [
    { id: 'status', title: 'Create the status', why: 'w', where: 'Admin', label: 'Status' },
    {
        id: 'price-scope',
        title: 'Set the price scope',
        why: 'w',
        where: 'Admin',
        label: 'Price scope',
        check: 'price-scope-website',
        fix: { kind: 'config', items: [{ path: 'catalog/price/scope', value: '1', scope: 'default' }] },
    },
    {
        id: 'returns',
        title: 'Switch on returns',
        why: 'w',
        where: 'Admin',
        label: 'Returns',
        check: 'storefront-returns-enabled',
        fix: { kind: 'config', items: [{ path: 'sales/magento_rma/enabled', value: '1', scope: 'website' }] },
    },
];

function deps(defaults: Array<[string, string | null]>, checks: Partial<Record<string, boolean>> = {}): PreparationDeps & { commerce: ReturnType<typeof commerceFake> } {
    const commerce = commerceFake(
        { 'system/config?scope=default': configList(defaults), 'system/config?scope=website': configList([], 'website', 'acme') },
        (_m, _p, body) => configSaved(((body as { items: CommerceSystemConfigPutAnswer['items'] }).items ?? []).map((row) => ({ ...row, value: row.value ?? null }))),
    );
    return {
        commerce,
        websiteCode: 'acme',
        erpNames: ['Justrite ERP'],
        runCheck: jest.fn(async (check) => ({ done: checks[check] ?? false, note: `${check}: ${checks[check] ? 'done' : 'not yet'}` })),
    };
}

describe('the store NOW decides, never the saved checklist', () => {
    const SAVED_DONE = { setupSteps: { 'price-scope': { state: 'done' as const, lastCheck: 'passed' as const, note: 'Catalog Price Scope is Website.' } } };

    it('a step saved done whose fresh check says not done previews as Will apply, with the change line', async () => {
        const d = deps([['catalog/price/scope', '0']]);
        const { reports, checks } = await previewPreparation(STEPS, SAVED_DONE, d, ['price-scope']);
        expect(reports[0]).toMatchObject({ state: 'applicable', changes: ['catalog/price/scope: 0 → 1'], note: 'price-scope-website: not yet' });
        expect(checks).toEqual({ 'price-scope': { done: false, note: 'price-scope-website: not yet' } });
    });

    it('and the apply writes it', async () => {
        const d = deps([['catalog/price/scope', '0']]);
        const { reports, record } = await applyPreparation(STEPS, SAVED_DONE, d, ['price-scope']);
        expect(reports[0].state).toBe('applied');
        expect(d.commerce.writes()).toEqual([['PUT', 'system/config', { items: [{ path: 'catalog/price/scope', value: '1', scope: 'default' }] }]]);
        expect(Object.keys(record?.steps ?? {})).toEqual(['price-scope']);
    });

    it('a step saved open whose fresh check says done is Done, and nothing is written', async () => {
        const d = deps([['catalog/price/scope', '0']], { 'price-scope-website': true });
        const preview = await previewPreparation(STEPS, {}, d, ['price-scope']);
        expect(preview.reports[0]).toMatchObject({ state: 'done', changes: [], note: 'price-scope-website: done' });
        const applied = await applyPreparation(STEPS, {}, d, ['price-scope']);
        expect(applied.reports[0]).toMatchObject({ state: 'skipped', note: 'price-scope-website: done' });
        expect(d.commerce.send).not.toHaveBeenCalled();
        expect(applied.record).toBeUndefined();
    });

    it('runs the check once per selected step that has one, by its name, and none for a step without', async () => {
        const d = deps([['catalog/price/scope', '0']]);
        await previewPreparation(STEPS, SAVED_DONE, d);
        expect((d.runCheck as jest.Mock).mock.calls).toEqual([['price-scope-website'], ['storefront-returns-enabled']]);
        (d.runCheck as jest.Mock).mockClear();
        await applyPreparation(STEPS, SAVED_DONE, d, ['returns']);
        expect((d.runCheck as jest.Mock).mock.calls).toEqual([['storefront-returns-enabled']]);
    });

    it('a step with no check is never Done: by hand without a fix, whatever was saved', async () => {
        const { reports } = await previewPreparation(STEPS, { setupSteps: { status: { state: 'done' } } }, deps([]), ['status']);
        expect(reports[0].state).toBe('manual');
    });

    it('a step Demo Builder applied and the store still shows done stays Applied; one the store lost is applied again, keeping the first record', async () => {
        const recorded = { storePreparation: { at: 't', steps: { 'price-scope': { kind: 'config' as const, previous: [{ path: 'catalog/price/scope', scope: 'default' as const, stored: null, effective: '0' }] } } } };
        const still = deps([['catalog/price/scope', '1']], { 'price-scope-website': true });
        expect((await previewPreparation(STEPS, recorded, still, ['price-scope'])).reports[0].state).toBe('applied');
        const lost = deps([['catalog/price/scope', '5']]);
        const { reports, record } = await applyPreparation(STEPS, recorded, lost, ['price-scope']);
        expect(reports[0].state).toBe('applied');
        // The value before Demo Builder first touched it is what an undo restores.
        expect(record?.steps['price-scope']).toEqual(recorded.storePreparation.steps['price-scope']);
    });
});

describe('a check that could not tell', () => {
    const COULD_NOT = { note: 'Could not check the attribute sets: Unterminated string in JSON.' };
    const NO_FIX_CHECKED: SetupStep = { id: 'held', title: 'Create the held status', why: 'w', where: 'Admin', label: 'Held', check: 'partially-held-status' };

    it("previews from the fix's own read with the check's words; without a fix it is unknown", async () => {
        const d = deps([['catalog/price/scope', '0']]);
        (d.runCheck as jest.Mock).mockResolvedValue(COULD_NOT);
        const { reports } = await previewPreparation([STEPS[1], NO_FIX_CHECKED], {}, d);
        expect(reports[0]).toMatchObject({ state: 'applicable', changes: ['catalog/price/scope: 0 → 1'], note: COULD_NOT.note });
        expect(reports[1]).toMatchObject({ state: 'unknown', note: COULD_NOT.note, changes: [] });
    });

    it('a check that throws is the same: could not check, in its words', async () => {
        const d = deps([['catalog/price/scope', '0']]);
        (d.runCheck as jest.Mock).mockRejectedValue(new Error('socket hang up'));
        const { reports } = await previewPreparation([NO_FIX_CHECKED], {}, d);
        expect(reports[0]).toMatchObject({ state: 'unknown', note: 'Could not check: socket hang up' });
    });

    it('is "could not check" when the fix cannot preview either, with the reason', async () => {
        const d = deps([['catalog/price/scope', '0']]);
        d.commerce.get.mockImplementation(async () => {
            throw new Error('Commerce answered 500 for system/config');
        });
        const { reports } = await previewPreparation(STEPS, {}, d, ['price-scope']);
        expect(reports[0]).toMatchObject({ state: 'unknown', rejected: ['Could not read what would change: Commerce answered 500 for system/config'] });
    });

    it('is never skipped on apply: the fix applies from its own read', async () => {
        const d = deps([['catalog/price/scope', '0']]);
        (d.runCheck as jest.Mock).mockResolvedValue(COULD_NOT);
        const { reports, record } = await applyPreparation(STEPS, {}, d, ['price-scope']);
        expect(reports[0].state).toBe('applied');
        expect(Object.keys(record?.steps ?? {})).toEqual(['price-scope']);
    });
});

describe('previewPreparation', () => {
    it('lists every step with its state and what the applicable ones would change, writing nothing', async () => {
        const d = deps([['catalog/price/scope', '0']]);
        const { reports } = await previewPreparation(STEPS, {}, d);
        expect(reports.map((r) => [r.id, r.state, r.changes])).toEqual([
            ['status', 'manual', []],
            ['price-scope', 'applicable', ['catalog/price/scope: 0 → 1']],
            ['returns', 'applicable', ['sales/magento_rma/enabled for the website: 0 → 1']],
        ]);
        expect(d.commerce.send).not.toHaveBeenCalled();
    });

    it('limits itself to the steps asked for', async () => {
        const { reports } = await previewPreparation(STEPS, {}, deps([]), ['returns']);
        expect(reports.map((r) => r.id)).toEqual(['returns']);
    });
});

describe('applyPreparation', () => {
    it('checks each applicable step first and SKIPS one its check finds done, writing nothing for it', async () => {
        const d = deps([['catalog/price/scope', '0']], { 'price-scope-website': true });
        const { reports, record } = await applyPreparation(STEPS, {}, d);
        expect(reports.find((r) => r.id === 'price-scope')).toMatchObject({ state: 'skipped', note: 'price-scope-website: done' });
        expect(reports.find((r) => r.id === 'returns')).toMatchObject({ state: 'applied' });
        expect(d.commerce.writes()).toEqual([
            ['PUT', 'system/config', { items: [{ path: 'sales/magento_rma/enabled', value: '1', scope: 'website', scope_code: 'acme' }] }],
        ]);
        expect(record?.steps).toEqual({
            returns: { kind: 'config', previous: [{ path: 'sales/magento_rma/enabled', scope: 'website', scopeCode: 'acme', stored: null, effective: '0', wrote: '1' }] },
        });
    });

    it('applies in the guide order, records each step under its id, and keeps an earlier record', async () => {
        const d = deps([['catalog/price/scope', '0']]);
        const earlier: StorePreparationRecord = { at: 'before', steps: { other: { kind: 'shared-catalogs', catalogs: [] } } };
        const { reports, record } = await applyPreparation(STEPS, { storePreparation: earlier }, d);
        expect(reports.map((r) => r.state)).toEqual(['manual', 'applied', 'applied']);
        expect(Object.keys(record?.steps ?? {})).toEqual(['other', 'price-scope', 'returns']);
        expect(d.runCheck).toHaveBeenCalledTimes(2);
    });

    it('a step that throws is reported as rejected by name and the others still apply', async () => {
        const d = deps([['catalog/price/scope', '0']]);
        d.commerce.send.mockImplementationOnce(async () => {
            throw new Error('Commerce answered 500 for system/config');
        });
        const { reports, record } = await applyPreparation(STEPS, {}, d);
        expect(reports[1]).toMatchObject({ state: 'rejected', rejected: ['catalog/price/scope: 0 → 1: Commerce answered 500 for system/config'] });
        expect(reports[2].state).toBe('applied');
        expect(Object.keys(record?.steps ?? {})).toEqual(['returns']);
    });

    it('leaves alone a step the store shows done, applied by Demo Builder or not', async () => {
        const d = deps([], { 'price-scope-website': true, 'storefront-returns-enabled': true });
        const saved = { storePreparation: { at: 't', steps: { returns: { kind: 'config' as const, previous: [] } } } };
        const { reports } = await applyPreparation(STEPS, saved, d);
        expect(reports.map((r) => r.state)).toEqual(['manual', 'skipped', 'applied']);
        expect(d.commerce.send).not.toHaveBeenCalled();
    });

    it('reports where it is, step by step', async () => {
        const d = { ...deps([['catalog/price/scope', '0']]), onProgress: jest.fn() };
        await applyPreparation(STEPS, {}, d, ['price-scope']);
        expect(d.onProgress.mock.calls.map(([step, what]) => [step.id, what])).toEqual([
            ['price-scope', 'Checking whether it is already done'],
            ['price-scope', 'Applying'],
        ]);
    });
});

describe('undoPreparation', () => {
    const RECORD: StorePreparationRecord = {
        at: 't',
        steps: {
            'price-scope': { kind: 'config', previous: [{ path: 'catalog/price/scope', scope: 'default', stored: '0', effective: '0' }] },
            returns: { kind: 'config', previous: [{ path: 'sales/magento_rma/enabled', scope: 'website', scopeCode: 'acme', stored: null, effective: '0' }] },
        },
    };

    it('puts the recorded steps back newest first and clears the record', async () => {
        const d = deps([['catalog/price/scope', '1'], ['sales/magento_rma/enabled', '1']]);
        const { reports, record } = await undoPreparation(STEPS, RECORD, d);
        expect(reports.map((r) => [r.id, r.state])).toEqual([['returns', 'undone'], ['price-scope', 'undone']]);
        expect(record).toBeUndefined();
        expect(d.commerce.writes().map(([, , body]) => (body as { items: Array<{ path: string }> }).items[0].path)).toEqual([
            'sales/magento_rma/enabled',
            'catalog/price/scope',
        ]);
    });

    it('undoes one step and keeps the rest recorded', async () => {
        const d = deps([['catalog/price/scope', '1'], ['sales/magento_rma/enabled', '1']]);
        const { record } = await undoPreparation(STEPS, RECORD, d, 'returns');
        expect(Object.keys(record?.steps ?? {})).toEqual(['price-scope']);
    });

    // Step 06: what an undo kept is not a refusal. The step is undone, its record goes, and the
    // report carries the one line the result screen and the agent show.
    it('reports what an undo kept as a line on an undone step, and lets its record go', async () => {
        const d = deps([['catalog/price/scope', '1'], ['sales/magento_rma/enabled', '0']]);
        const changed: StorePreparationRecord = {
            at: 't',
            steps: { returns: { kind: 'config', previous: [{ path: 'sales/magento_rma/enabled', scope: 'website', scopeCode: 'acme', stored: '2', effective: '2', wrote: '1' }] } },
        };
        const { reports, record } = await undoPreparation(STEPS, changed, d);
        expect(reports).toEqual([expect.objectContaining({ id: 'returns', state: 'undone', changes: [], rejected: [], kept: expect.stringMatching(/^Kept .+ as it is: it was changed after Demo Builder set it\.$/) })]);
        expect(d.commerce.send).not.toHaveBeenCalled();
        expect(record).toBeUndefined();
    });

    // Owner 2026-10-29, as step 05's container rule: a kept catalog or stock stays on the
    // record, so a later undo takes it once it is empty. Driven through the real catalog fix.
    it('keeps on the record a catalog the undo kept, and reports the step undone', async () => {
        const catalog = { id: 9, name: 'Harbor Catalog', companyId: 3, companyName: 'Harbor', held: { companies: [3], products: [], categories: [] } };
        const commerce = commerceFake({
            'sharedCatalog/9/companies': '["3"]',
            'sharedCatalog/9/products': ['RACK-1'],
            'sharedCatalog/9/categories': [],
            'sharedCatalog/': { items: [{ id: 9, name: 'Harbor Catalog', customer_group_id: 6, type: 0 }] },
        });
        const steps: SetupStep[] = [{ id: 'catalogs', title: 'Shared catalogs', why: 'w', where: 'Admin', fix: { kind: 'handler', handler: 'company-shared-catalogs' } }];
        const record: StorePreparationRecord = { at: 't', steps: { catalogs: { kind: 'shared-catalogs', catalogs: [catalog] } } };
        const out = await undoPreparation(steps, record, { ...deps([]), commerce });
        expect(commerce.writes().map(([m, p]) => `${m} ${p}`)).toEqual(['POST sharedCatalog/9/unassignCompanies']);
        expect(out.reports).toEqual([expect.objectContaining({ id: 'catalogs', state: 'undone', kept: expect.stringContaining('Kept the shared catalog Harbor Catalog') })]);
        expect(out.record).toEqual(record);
    });

    it('keeps the record of a step Commerce refused to put back', async () => {
        const d = deps([['catalog/price/scope', '1'], ['sales/magento_rma/enabled', '1']]);
        d.commerce.send.mockImplementation(async () => {
            throw new Error('Commerce answered 500 for system/config');
        });
        const { reports, record } = await undoPreparation(STEPS, RECORD, d);
        expect(reports.every((r) => r.state === 'rejected')).toBe(true);
        expect(Object.keys(record?.steps ?? {})).toEqual(['price-scope', 'returns']);
    });
});
