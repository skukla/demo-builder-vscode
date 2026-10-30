/**
 * storePreparationHandlers — "Prepare this store", its undo and setCommerceConfig (AB-77),
 * with the engine mocked and asserted by what it is handed, and the record saved on the
 * component. The catalog is the real bundled one (the ERP integration's steps); a call
 * without `confirm` changes nothing.
 */

import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager, makeStateManager } from '../../../helpers/stateManagerFake';
import { ProjectConfigWriter } from '@/core/state/projectConfigWriter';
import { ProjectFileLoader } from '@/core/state/projectFileLoader';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext } from '@/types/handlers';
import type { CommerceConfigPrevious, StorePreparationRecord } from '@/types/storePreparation';
import type { SetCommerceConfigRequestPayload } from '@/types/webviewRequests';
import type { OperationProgressPayload } from '@/types/webviewPayloads';
import type { PreparationDeps } from '@/features/app-builder/services/storePreparation/storePreparationEngine';

const COMMERCE = { get: jest.fn(), send: jest.fn() };
jest.mock('@/features/dashboard/handlers/appBuilderComponentHandlers', () => ({
    ...jest.requireActual('@/features/dashboard/handlers/appBuilderComponentHandlers'),
    guardOrBlock: jest.fn(async () => undefined),
    postComponentsSnapshot: jest.fn(async () => undefined),
}));
jest.mock('@/features/project-creation/services/erpAssignProducts', () => ({
    openCommerce: async () => COMMERCE,
}));
const mockRunCheck = jest.fn();
jest.mock('@/features/app-builder/services/setupChecks', () => ({
    runSetupCheck: (...a: unknown[]) => mockRunCheck(...a),
}));
jest.mock('@/features/dashboard/services/setupCheckReader', () => ({
    erpNamesOf: () => ['Justrite ERP'],
    setupCheckReader: async () => ({ read: jest.fn(), scope: { websiteCode: 'acme' } }),
}));
const mockPreview = jest.fn();
const mockApply = jest.fn();
const mockUndo = jest.fn();
jest.mock('@/features/app-builder/services/storePreparation/storePreparationEngine', () => ({
    previewPreparation: (...a: unknown[]) => mockPreview(...a),
    applyPreparation: (...a: unknown[]) => mockApply(...a),
    undoPreparation: (...a: unknown[]) => mockUndo(...a),
}));
const mockConfigFix = { preview: jest.fn(), apply: jest.fn(), undo: jest.fn(), previewUndo: jest.fn() };
jest.mock('@/features/app-builder/services/storePreparation/configFix', () => ({
    // The path rule is the real one: the handler validates with it, and a pack's settings share it.
    SETTING_PATH: jest.requireActual('@/features/app-builder/services/storePreparation/configFix').SETTING_PATH,
    configFix: jest.fn(() => mockConfigFix),
}));

// Imported after the mocks, which jest hoists above it.
import { configFix } from '@/features/app-builder/services/storePreparation/configFix';
import {
    handlePrepareCommerceStore,
    handleSetCommerceConfig,
    handleUndoCommerceStorePreparation,
} from '@/features/dashboard/handlers/storePreparationHandlers';

const STATE: AppBuilderComponentState = { kind: 'integration', status: 'deployed', name: 'ERP Integration', source: { owner: 's', repo: 'erp' } };
const APPLIED_REPORT = { id: 'price-scope-website', label: 'Price scope', title: 't', state: 'applied', changes: ['catalog/price/scope at the default scope: 0 → 1'], rejected: [] };
const RECORD: StorePreparationRecord = { at: '2026-10-10T00:00:00Z', steps: { 'price-scope-website': { kind: 'config', previous: [{ path: 'catalog/price/scope', scope: 'default', stored: '0', effective: '0' }] } } };

function setup(integration: Partial<AppBuilderComponentState> = {}, projectOver: Partial<Project> = {}) {
    const project = createMockProject({ appBuilderComponents: { 'erp-integration': { ...STATE, ...integration } }, ...projectOver });
    const stateManager = makeStateManager(project);
    const context: HandlerContext = createMockHandlerContext({ stateManager });
    const saved = () => (stateManager.saveProject as jest.Mock).mock.calls.at(-1)?.[0] as Project | undefined;
    return { context, saved };
}

/** Every progress push the screen got, in order. */
function pushes(context: HandlerContext): OperationProgressPayload[] {
    return (context.sendMessage as jest.Mock).mock.calls
        .filter(([type]) => type === 'operationProgress')
        .map(([, payload]) => payload as OperationProgressPayload);
}

/** The last push: the result screen. */
const endPush = (context: HandlerContext): OperationProgressPayload | undefined => pushes(context).at(-1);

beforeEach(() => {
    jest.clearAllMocks();
    mockRunCheck.mockResolvedValue({ done: true, note: 'Catalog Price Scope is Website.' });
    mockPreview.mockResolvedValue({ reports: [{ ...APPLIED_REPORT, state: 'applicable' }], checks: {} });
    mockApply.mockResolvedValue({ reports: [APPLIED_REPORT], record: RECORD, checks: {} });
    mockUndo.mockResolvedValue({ reports: [{ ...APPLIED_REPORT, state: 'undone' }], record: undefined, checks: {} });
});

describe('prepareCommerceStore', () => {
    it('refuses an integration with no setup steps', async () => {
        const { context } = setup({}, { appBuilderComponents: { 'erp-integration': STATE, 'app-builder-shell': STATE } });
        expect(await handlePrepareCommerceStore(context, { id: 'app-builder-shell' })).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
    });

    it('hands the engine a runCheck that runs the named check against the store, with the project scope', async () => {
        const { context } = setup();
        await handlePrepareCommerceStore(context, { id: 'erp-integration' });
        const deps = mockPreview.mock.calls[0][2] as { runCheck: (check: string) => Promise<unknown> };
        await deps.runCheck('payment-on-account-enabled');
        expect(mockRunCheck).toHaveBeenCalledWith('payment-on-account-enabled', expect.any(Function), {
            websiteCode: 'acme',
            erpNames: ['Justrite ERP'],
        });
    });

    it('a preview saves what its fresh checks found, so the guide and the card agree with it', async () => {
        mockPreview.mockResolvedValue({
            reports: [{ ...APPLIED_REPORT, state: 'applicable' }],
            checks: { 'price-scope-website': { done: false, note: 'Catalog Price Scope is Global; it must be Website.' } },
        });
        const { context, saved } = setup({ setupSteps: { 'price-scope-website': { state: 'done', lastCheck: 'passed', note: 'Catalog Price Scope is Website.' } } });
        await handlePrepareCommerceStore(context, { id: 'erp-integration' });
        const step = saved()?.appBuilderComponents?.['erp-integration'].setupSteps?.['price-scope-website'];
        expect(step).toMatchObject({ lastCheck: 'failed', note: 'Catalog Price Scope is Global; it must be Website.' });
        expect(step).not.toHaveProperty('state');
        // The preview's own checks are the record; no second read of the store.
        expect(mockRunCheck).not.toHaveBeenCalled();
    });

    it('an apply saves the fresh check of a step it skipped, and rechecks only what it wrote', async () => {
        mockApply.mockResolvedValue({
            reports: [APPLIED_REPORT, { ...APPLIED_REPORT, id: 'storefront-returns', label: 'Returns', state: 'skipped', changes: [] }],
            record: RECORD,
            checks: {
                'price-scope-website': { done: false, note: 'Catalog Price Scope is Global; it must be Website.' },
                'storefront-returns': { done: true, note: 'Returns are on for the Acme storefront.' },
            },
        });
        const { context, saved } = setup();
        await handlePrepareCommerceStore(context, { id: 'erp-integration', confirm: true });
        const steps = saved()?.appBuilderComponents?.['erp-integration'].setupSteps;
        expect(steps?.['storefront-returns']).toMatchObject({ state: 'done', lastCheck: 'passed', note: 'Returns are on for the Acme storefront.' });
        expect(steps?.['price-scope-website']).toMatchObject({ state: 'done', lastCheck: 'passed', note: 'Catalog Price Scope is Website.' });
        expect(mockRunCheck.mock.calls.map(([check]) => check)).toEqual(['price-scope-website']);
    });

    it('without confirm, answers the preview from the engine and writes nothing to Commerce', async () => {
        const { context, saved } = setup();
        const result = await handlePrepareCommerceStore(context, { id: 'erp-integration', stepIds: ['price-scope-website'] });
        expect(result).toStrictEqual({ success: true, data: { confirmed: false, steps: [{ ...APPLIED_REPORT, state: 'applicable' }] } });
        const [steps, state, deps, stepIds] = mockPreview.mock.calls[0];
        expect(steps.map((s: { id: string }) => s.id)).toContain('price-scope-website');
        expect(state).toMatchObject({ kind: 'integration' });
        expect(deps).toMatchObject({ commerce: COMMERCE, websiteCode: 'acme', erpNames: ['Justrite ERP'] });
        expect(stepIds).toEqual(['price-scope-website']);
        expect(mockApply).not.toHaveBeenCalled();
        expect(COMMERCE.send).not.toHaveBeenCalled();
        // No check ran in this preview, so there is nothing to save.
        expect(saved()).toBeUndefined();
    });

    it('with confirm, applies through the engine, saves the record and the rechecked step, and answers the counts', async () => {
        const { context, saved } = setup();
        const result = await handlePrepareCommerceStore(context, { id: 'erp-integration', confirm: true });
        expect(mockApply).toHaveBeenCalledTimes(1);
        const component = saved()?.appBuilderComponents?.['erp-integration'];
        expect(component?.storePreparation).toEqual(RECORD);
        expect(component?.setupSteps?.['price-scope-website']).toMatchObject({ state: 'done', lastCheck: 'passed', note: 'Catalog Price Scope is Website.' });
        expect(result).toMatchObject({ success: true, data: { confirmed: true, steps: [APPLIED_REPORT], counts: { applied: 1 }, recorded: ['price-scope-website'] } });
    });

    it('names what Commerce refused as the warning, and still records what it took', async () => {
        mockApply.mockResolvedValue({ reports: [{ ...APPLIED_REPORT, state: 'rejected', rejected: ['x: no'] }], record: RECORD, checks: {} });
        mockRunCheck.mockResolvedValue({ done: false, note: 'still Global' });
        const { context } = setup();
        const result = await handlePrepareCommerceStore(context, { id: 'erp-integration', confirm: true });
        expect(result).toMatchObject({ success: true, data: { warning: 'Price scope: x: no', counts: { rejected: 1 } } });
    });

    // Live release test, 2026-10-22: the result said only "Store prepared for ERP Integration"
    // after erp_owner went into twelve attribute sets. It lists what changed, step by step.
    it('lists what each step changed on the result screen, and what Commerce refused', async () => {
        const sets = ['Default', 'Phones', 'Watches'];
        mockApply.mockResolvedValue({
            reports: [
                { id: 'erp-attributes', label: 'Product attributes', title: 't', state: 'applied', changes: sets.map((set) => `Added erp_owner to the attribute set ${set}`), rejected: [] },
                // The preview says only that a step leaves a part by hand; the result says what.
                {
                    id: 'card-payments', label: 'Card payments', title: 't', state: 'applied', rejected: [],
                    changes: ['payment/payment_services/active at the website scope: 0 → 1'], manual: 'Connect the PayPal sandbox.',
                },
                { ...APPLIED_REPORT, state: 'rejected', changes: [], rejected: ['catalog/price/scope: no'] },
                { ...APPLIED_REPORT, id: 'storefront-returns', label: 'Returns', state: 'skipped', changes: [] },
            ],
            record: RECORD,
            checks: {},
        });
        const { context } = setup();
        await handlePrepareCommerceStore(context, { id: 'erp-integration', confirm: true, progress: 'modal' });
        const end = endPush(context);
        expect(end).toMatchObject({ state: 'succeeded', warning: 'Price scope: catalog/price/scope: no' });
        expect(end?.changes).toStrictEqual([
            {
                label: 'Product attributes',
                lines: [
                    'Added erp_owner to the attribute set Default',
                    'Added erp_owner to the attribute set Phones',
                    'Added erp_owner to the attribute set Watches',
                ],
            },
            {
                label: 'Card payments',
                lines: ['payment/payment_services/active at the website scope: 0 → 1', 'By hand: Connect the PayPal sandbox.'],
            },
        ]);
        expect(end).not.toHaveProperty('details');
    });

    it('says nothing changed when every step was already done', async () => {
        mockApply.mockResolvedValue({ reports: [{ ...APPLIED_REPORT, state: 'skipped', changes: [] }], record: undefined, checks: {} });
        const { context } = setup();
        await handlePrepareCommerceStore(context, { id: 'erp-integration', confirm: true, progress: 'modal' });
        expect(endPush(context)?.details).toStrictEqual(['Nothing changed: every step was already done in the store.']);
        expect(endPush(context)).not.toHaveProperty('changes');
    });

    it('refuses without the Adobe sign-in, as an answer', async () => {
        const { context } = setup();
        const signedOut: HandlerContext = { ...context, authManager: undefined };
        const result = await handlePrepareCommerceStore(signedOut, { id: 'erp-integration' });
        expect(result).toMatchObject({ success: false, code: ErrorCode.AUTH_REQUIRED });
    });
});

describe('undoCommerceStorePreparation', () => {
    it('refuses when nothing is recorded, or the named step is not', async () => {
        const { context } = setup();
        expect(await handleUndoCommerceStorePreparation(context, { id: 'erp-integration', confirm: true })).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        const recorded = setup({ storePreparation: RECORD });
        expect(await handleUndoCommerceStorePreparation(recorded.context, { id: 'erp-integration', stepId: 'returns', confirm: true })).toMatchObject({ success: false });
    });

    it('without confirm, answers what is recorded', async () => {
        const { context } = setup({ storePreparation: RECORD });
        const result = await handleUndoCommerceStorePreparation(context, { id: 'erp-integration' });
        expect(result).toStrictEqual({ success: true, data: { confirmed: false, at: RECORD.at, steps: [{ id: 'price-scope-website', recorded: RECORD.steps['price-scope-website'] }] } });
        expect(mockUndo).not.toHaveBeenCalled();
    });

    it('with confirm, undoes through the engine with the record and clears it', async () => {
        const { context, saved } = setup({ storePreparation: RECORD });
        const result = await handleUndoCommerceStorePreparation(context, { id: 'erp-integration', confirm: true, stepId: 'price-scope-website' });
        const [, record, , stepId] = mockUndo.mock.calls[0];
        expect(record).toEqual(RECORD);
        expect(stepId).toBe('price-scope-website');
        expect(saved()?.appBuilderComponents?.['erp-integration']).not.toHaveProperty('storePreparation');
        expect(result).toMatchObject({ success: true, data: { confirmed: true, undone: true, counts: { undone: 1 } } });
    });

    // Live release test, 2026-10-22: an undo read "Preparing the store" under its spinner.
    it('says it is undoing while it runs, and lists what it put back', async () => {
        mockUndo.mockImplementation(async (_steps: unknown, _record: unknown, deps: PreparationDeps) => {
            deps.onProgress?.({ id: 'erp-attributes', label: 'Product attributes', title: 't', why: '', where: '' }, 'Putting it back');
            return { reports: [{ ...APPLIED_REPORT, state: 'undone', changes: ['Took erp_owner out of the attribute set Default'] }], record: undefined, checks: {} };
        });
        const { context } = setup({ storePreparation: RECORD });
        await handleUndoCommerceStorePreparation(context, { id: 'erp-integration', confirm: true, progress: 'modal' });
        const stages = pushes(context).filter((push) => push.stage).map((push) => [push.stage, push.step]);
        expect(stages).toContainEqual(['Undoing the demo setup', 'Product attributes: Putting it back']);
        expect(stages.map(([stage]) => stage)).not.toContain('Applying the demo setup');
        expect(endPush(context)?.changes).toStrictEqual([{ label: 'Price scope', lines: ['Took erp_owner out of the attribute set Default'] }]);
    });

    // Step 06: what an undo kept is said in one line, under its step on the result screen, and
    // on the step in the agent's answer.
    it('shows what an undo kept under its step, and answers it on the step', async () => {
        const KEPT = 'Kept Catalog Price Scope as it is: it was changed after Demo Builder set it.';
        mockUndo.mockResolvedValue({ reports: [{ ...APPLIED_REPORT, state: 'undone', changes: [], kept: KEPT }], record: undefined, checks: {} });
        const { context } = setup({ storePreparation: RECORD });
        const result = await handleUndoCommerceStorePreparation(context, { id: 'erp-integration', confirm: true, progress: 'modal' });
        expect(endPush(context)?.changes).toStrictEqual([{ label: 'Price scope', lines: [KEPT] }]);
        expect(result).toMatchObject({ success: true, data: { steps: [expect.objectContaining({ id: 'price-scope-website', kept: KEPT })] } });
    });

    it('without confirm, leaves the hashes out of what it answers is recorded', async () => {
        const warehouse: StorePreparationRecord = {
            at: 't',
            steps: { 'erp-warehouse': { kind: 'warehouse', createdSources: ['justrite_warehouse'], links: [], sourceFingerprints: { justrite_warehouse: 'a'.repeat(64) } } },
        };
        const { context } = setup({ storePreparation: warehouse });
        const result = await handleUndoCommerceStorePreparation(context, { id: 'erp-integration' });
        expect(result).toStrictEqual({
            success: true,
            data: { confirmed: false, at: 't', steps: [{ id: 'erp-warehouse', recorded: { kind: 'warehouse', createdSources: ['justrite_warehouse'], links: [] } }] },
        });
    });
});

describe('setCommerceConfig', () => {
    const ITEMS = [{ path: 'catalog/price/scope', value: '1', scope: 'default' as const }];
    const PREVIOUS: CommerceConfigPrevious[] = [{ path: 'catalog/price/scope', scope: 'default', stored: '0', effective: '0' }];

    beforeEach(() => {
        mockConfigFix.preview.mockResolvedValue({ changes: ['catalog/price/scope at the default scope: 0 → 1'] });
        mockConfigFix.apply.mockResolvedValue({ changes: ['catalog/price/scope at the default scope: 0 → 1'], rejected: [], record: { kind: 'config', previous: PREVIOUS } });
        mockConfigFix.undo.mockResolvedValue({ changes: ['catalog/price/scope at the default scope: 1 → 0 (restored)'], rejected: [] });
    });

    it('validates the items', async () => {
        const { context } = setup();
        expect(await handleSetCommerceConfig(context, { items: [] })).toMatchObject({ success: false, code: ErrorCode.CONFIG_INVALID });
        expect(await handleSetCommerceConfig(context, { items: [{ path: 'bad', value: '1', scope: 'default' }] })).toMatchObject({ success: false, error: expect.stringContaining('not a setting path') });
        // A wrong scope as the wire would carry it: parsed, not typed, so no cast silences the compiler.
        const storeScoped = JSON.parse('{"items":[{"path":"a/b/c","value":"1","scope":"store"}]}') as SetCommerceConfigRequestPayload;
        expect(await handleSetCommerceConfig(context, storeScoped)).toMatchObject({ success: false, error: 'a/b/c: scope must be default or website.' });
    });

    it('without confirm, previews through the config fix built from the items', async () => {
        const { context, saved } = setup();
        const result = await handleSetCommerceConfig(context, { items: ITEMS });
        expect(configFix).toHaveBeenCalledWith({ kind: 'config', items: ITEMS });
        expect(mockConfigFix.preview).toHaveBeenCalledWith({ commerce: COMMERCE, websiteCode: 'acme', erpNames: [] });
        expect(result).toStrictEqual({ success: true, data: { confirmed: false, changes: ['catalog/price/scope at the default scope: 0 → 1'] } });
        expect(saved()).toBeUndefined();
    });

    it('with confirm, writes and records the previous values on the project', async () => {
        const { context, saved } = setup();
        const result = await handleSetCommerceConfig(context, { items: ITEMS, confirm: true });
        expect(saved()?.commerceConfigChange).toEqual({ at: expect.any(String), previous: PREVIOUS });
        expect(result).toStrictEqual({ success: true, data: { confirmed: true, changes: ['catalog/price/scope at the default scope: 0 → 1'], rejected: [], previous: PREVIOUS } });
    });

    it('undo: true puts the recorded values back and forgets them; refused with nothing recorded', async () => {
        const { context } = setup();
        expect(await handleSetCommerceConfig(context, { undo: true, confirm: true })).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        const recorded = setup({}, { commerceConfigChange: { at: 't', previous: PREVIOUS } });
        const result = await handleSetCommerceConfig(recorded.context, { undo: true, confirm: true });
        // Built with no items: the record's `wrote`, not a guessed value, says what was written.
        expect(configFix).toHaveBeenLastCalledWith({ kind: 'config', items: [] });
        expect(mockConfigFix.undo).toHaveBeenCalledWith(expect.objectContaining({ commerce: COMMERCE }), { kind: 'config', previous: PREVIOUS });
        expect(recorded.saved()).not.toHaveProperty('commerceConfigChange');
        expect(result).toMatchObject({ success: true, data: { confirmed: true, undone: true } });
    });

    // Every call reads the project from disk (`getCurrentProject`), so the record has to be
    // ON disk: kept only in memory, every undo after a write answered "no settings change to
    // undo" (2026-10-10 to 2026-10-29). Real writer and loader over a temp folder.
    it('undo works on a later call, after the project is read back from disk', async () => {
        const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'commerce-config-undo-'));
        try {
            const logger = createMockLogger();
            const stateManager = createMockStateManager({
                getCurrentProject: jest.fn(async () => (await new ProjectFileLoader(logger).loadProject(dir, () => [])) ?? undefined),
                saveProject: jest.fn(async (project: Project) => new ProjectConfigWriter(logger).saveProjectConfig(project, dir)),
            });
            await stateManager.saveProject(createMockProject({ name: 'acme', path: dir, created: new Date('2026-10-29T00:00:00Z') }));
            const context = createMockHandlerContext({ stateManager });

            await handleSetCommerceConfig(context, { items: ITEMS, confirm: true });
            const result = await handleSetCommerceConfig(context, { undo: true, confirm: true });

            expect(mockConfigFix.undo).toHaveBeenCalledWith(expect.objectContaining({ commerce: COMMERCE }), { kind: 'config', previous: PREVIOUS });
            expect(result).toMatchObject({ success: true, data: { confirmed: true, undone: true } });
            expect((await stateManager.getCurrentProject())?.commerceConfigChange).toBeUndefined();
        } finally {
            await fsp.rm(dir, { recursive: true, force: true });
        }
    });

    it('undo: true without confirm previews the undo as it would run, keeping what changed since', async () => {
        mockConfigFix.previewUndo.mockResolvedValue({ changes: [], kept: 'Kept catalog/price/scope as it is: it was changed after Demo Builder set it.' });
        const recorded = setup({}, { commerceConfigChange: { at: 't', previous: PREVIOUS } });
        const result = await handleSetCommerceConfig(recorded.context, { undo: true });
        expect(mockConfigFix.previewUndo).toHaveBeenCalledWith({ commerce: COMMERCE, websiteCode: 'acme', erpNames: [] }, { kind: 'config', previous: PREVIOUS });
        expect(mockConfigFix.preview).not.toHaveBeenCalled();
        expect(result).toStrictEqual({ success: true, data: { confirmed: false, changes: [], kept: 'Kept catalog/price/scope as it is: it was changed after Demo Builder set it.' } });
    });
});
