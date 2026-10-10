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
    stepState,
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

describe('stepState', () => {
    it('is manual without a fix, applicable with one, done once marked, applied once recorded', () => {
        expect(stepState(STEPS[0], {})).toBe('manual');
        expect(stepState(STEPS[1], {})).toBe('applicable');
        expect(stepState(STEPS[1], { setupSteps: { 'price-scope': { state: 'done' } } })).toBe('done');
        expect(stepState(STEPS[1], { storePreparation: { at: 't', steps: { 'price-scope': { kind: 'config', previous: [] } } } })).toBe('applied');
    });
});

describe('previewPreparation', () => {
    it('lists every step with its state and what the applicable ones would change, writing nothing', async () => {
        const d = deps([['catalog/price/scope', '0']]);
        const reports = await previewPreparation(STEPS, {}, d);
        expect(reports.map((r) => [r.id, r.state, r.changes])).toEqual([
            ['status', 'manual', []],
            ['price-scope', 'applicable', ['catalog/price/scope at the default scope: 0 → 1']],
            ['returns', 'applicable', ['sales/magento_rma/enabled at the website scope: 0 → 1']],
        ]);
        expect(d.commerce.send).not.toHaveBeenCalled();
    });

    it('limits itself to the steps asked for', async () => {
        const reports = await previewPreparation(STEPS, {}, deps([]), ['returns']);
        expect(reports.map((r) => r.id)).toEqual(['returns']);
    });
});

describe('applyPreparation', () => {
    it('checks each applicable step first and SKIPS one its check finds done, writing nothing for it', async () => {
        const d = deps([['catalog/price/scope', '0']], { 'price-scope-website': true });
        const { reports, record } = await applyPreparation(STEPS, {}, d);
        expect(reports.find((r) => r.id === 'price-scope')).toMatchObject({ state: 'skipped', changes: ['price-scope-website: done'] });
        expect(reports.find((r) => r.id === 'returns')).toMatchObject({ state: 'applied' });
        expect(d.commerce.writes()).toEqual([
            ['PUT', 'system/config', { items: [{ path: 'sales/magento_rma/enabled', value: '1', scope: 'website', scope_code: 'acme' }] }],
        ]);
        expect(record?.steps).toEqual({
            returns: { kind: 'config', previous: [{ path: 'sales/magento_rma/enabled', scope: 'website', scopeCode: 'acme', stored: null, effective: '0' }] },
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
        expect(reports[1]).toMatchObject({ state: 'rejected', rejected: ['catalog/price/scope at the default scope: 0 → 1: Commerce answered 500 for system/config'] });
        expect(reports[2].state).toBe('applied');
        expect(Object.keys(record?.steps ?? {})).toEqual(['returns']);
    });

    it('leaves a done or already-applied step alone', async () => {
        const d = deps([]);
        const saved = { setupSteps: { 'price-scope': { state: 'done' as const } }, storePreparation: { at: 't', steps: { returns: { kind: 'config' as const, previous: [] } } } };
        const { reports } = await applyPreparation(STEPS, saved, d);
        expect(reports.map((r) => r.state)).toEqual(['manual', 'done', 'applied']);
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
