/**
 * setupChecklistHandlers — an integration's demo setup checklist (AB-26x): read it, mark a
 * step, run the checks. The catalog is the real bundled one (the ERP integration's steps);
 * the Commerce REST client is mocked and asserted by the path it is sent.
 */

const mockSendRest = jest.fn();
const mockResolveRestTarget = jest.fn();
jest.mock('@/features/ai/server/commerceRestClient', () => ({
    resolveRestTarget: (...a: unknown[]) => mockResolveRestTarget(...a),
    sendRest: (...a: unknown[]) => mockSendRest(...a),
}));
const mockSnapshot = jest.fn();
jest.mock('@/features/dashboard/handlers/appBuilderComponentHandlers', () => ({
    ...jest.requireActual('@/features/dashboard/handlers/appBuilderComponentHandlers'),
    postComponentsSnapshot: (...a: unknown[]) => mockSnapshot(...a),
}));

import {
    handleCheckSetupSteps,
    handleGetSetupChecklist,
    handleSetSetupStep,
} from '@/features/dashboard/handlers/setupChecklistHandlers';
import type { Project, SetupStepRecord } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { makeStateManager } from '../../../helpers/stateManagerFake';

const TARGET = { base: 'https://tenant.example', token: 't', clientId: 'c', imsOrgCode: 'o' };

function setup(setupSteps?: Record<string, SetupStepRecord>) {
    const project = createMockProject({
        appBuilderComponents: {
            'erp-integration': {
                kind: 'integration',
                status: 'deployed',
                source: { owner: 'skukla', repo: 'commerce-erp-integration' },
                ...(setupSteps ? { setupSteps } : {}),
            },
        },
    });
    const stateManager = makeStateManager(project);
    const context = createMockHandlerContext({ stateManager }) as HandlerContext;
    const saved = () => (stateManager.saveProject as jest.Mock).mock.calls.at(-1)?.[0] as Project | undefined;
    return { context, saved, project };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockResolveRestTarget.mockResolvedValue(TARGET);
});

describe('getSetupChecklist', () => {
    it('answers the steps as saved, running no check', async () => {
        const { context } = setup();
        const result = await handleGetSetupChecklist(context, { id: 'erp-integration' });
        expect(result.success).toBe(true);
        expect((result.data as { items: { id: string }[] }).items.map((item) => item.id)).toEqual([
            'confirmed-status',
            'company-catalogs',
        ]);
        expect(mockSendRest).not.toHaveBeenCalled();
    });
});

describe('setSetupStep', () => {
    it('marks a step done, saves it on the component, and pushes the snapshot', async () => {
        const { context, saved } = setup();
        const result = await handleSetSetupStep(context, { id: 'erp-integration', stepId: 'confirmed-status', state: 'done' });
        expect(result.success).toBe(true);
        expect(saved()?.appBuilderComponents?.['erp-integration'].setupSteps).toEqual({
            'confirmed-status': { state: 'done' },
        });
        expect(mockSnapshot).toHaveBeenCalledTimes(1);
    });

    it('reopening drops the state and keeps the last check note', async () => {
        const { context, saved } = setup({ 'company-catalogs': { state: 'done', note: 'fine', checkedAt: 'x' } });
        await handleSetSetupStep(context, { id: 'erp-integration', stepId: 'company-catalogs', state: 'open' });
        expect(saved()?.appBuilderComponents?.['erp-integration'].setupSteps).toEqual({
            'company-catalogs': { note: 'fine', checkedAt: 'x' },
        });
    });

    it('refuses a step the entry does not declare, and a state that is not one', async () => {
        const { context } = setup();
        expect(await handleSetSetupStep(context, { id: 'erp-integration', stepId: 'nope', state: 'done' })).toMatchObject({
            success: false,
            code: ErrorCode.CONFIG_INVALID,
        });
        expect(await handleSetSetupStep(context, { id: 'erp-integration', stepId: 'confirmed-status', state: 'maybe' })).toMatchObject({
            success: false,
            code: ErrorCode.CONFIG_INVALID,
        });
    });
});

describe('checkSetupSteps', () => {
    it('reads the companies through the signed client and marks the step done when each has its own group', async () => {
        mockSendRest.mockResolvedValue(JSON.stringify({ items: [{ id: 1, company_name: 'Acme', customer_group_id: 4 }] }));
        const { context, saved } = setup();
        await handleCheckSetupSteps(context, { id: 'erp-integration' });
        expect(mockSendRest).toHaveBeenCalledWith(
            'GET',
            TARGET,
            'company/?searchCriteria[pageSize]=200&fields=items[id,company_name,customer_group_id]',
            undefined,
            expect.any(Function),
        );
        const step = saved()?.appBuilderComponents?.['erp-integration'].setupSteps?.['company-catalogs'];
        expect(step).toMatchObject({ state: 'done', note: expect.stringMatching(/its own/) });
        expect(step?.checkedAt).toEqual(expect.any(String));
    });

    it('opens a step again when the check finds companies sharing a group', async () => {
        mockSendRest.mockResolvedValue(JSON.stringify({
            items: [{ id: 1, company_name: 'Acme', customer_group_id: 1 }, { id: 2, company_name: 'Globex', customer_group_id: 1 }],
        }));
        const { context, saved } = setup({ 'company-catalogs': { state: 'done' } });
        await handleCheckSetupSteps(context, { id: 'erp-integration' });
        const step = saved()?.appBuilderComponents?.['erp-integration'].setupSteps?.['company-catalogs'];
        expect(step?.state).toBeUndefined();
        expect(step?.note).toBe('Acme, Globex share customer group 1.');
    });

    it('leaves the state alone when Adobe sign-in is missing, and says why', async () => {
        mockResolveRestTarget.mockResolvedValue({ refusal: 'Error: Adobe sign-in required.' });
        const { context, saved } = setup({ 'company-catalogs': { state: 'done' } });
        await handleCheckSetupSteps(context, { id: 'erp-integration' });
        expect(mockSendRest).not.toHaveBeenCalled();
        expect(saved()?.appBuilderComponents?.['erp-integration'].setupSteps?.['company-catalogs']).toMatchObject({
            state: 'done',
            note: 'Could not check: Adobe sign-in required.',
        });
    });

    it('skips a dismissed step', async () => {
        const { context } = setup({ 'company-catalogs': { state: 'dismissed' } });
        await handleCheckSetupSteps(context, { id: 'erp-integration' });
        expect(mockSendRest).not.toHaveBeenCalled();
    });
});
