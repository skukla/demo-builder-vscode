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
const mockScope = jest.fn((): { websiteCode?: string } => ({}));
jest.mock('@/features/ai/server/commerceEndpointsTool', () => ({
    ...jest.requireActual('@/features/ai/server/commerceEndpointsTool'),
    buildCommerceEndpoints: () => ({ scope: mockScope() }),
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
    const saved = () =>
        (stateManager.saveProject as jest.Mock).mock.calls.at(-1)?.[0] as Project | undefined;
    return { context, saved, project };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockScope.mockReturnValue({});
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
            'price-scope-website',
            'second-source',
            'erp-attributes',
            'partially-held-status',
            'payment-on-account',
        ]);
        expect(mockSendRest).not.toHaveBeenCalled();
    });
});

describe('setSetupStep', () => {
    it('marks a step done, saves it on the component, and pushes the snapshot', async () => {
        const { context, saved } = setup();
        const result = await handleSetSetupStep(context, {
            id: 'erp-integration',
            stepId: 'confirmed-status',
            state: 'done',
        });
        expect(result.success).toBe(true);
        expect(saved()?.appBuilderComponents?.['erp-integration'].setupSteps).toEqual({
            'confirmed-status': { state: 'done' },
        });
        expect(mockSnapshot).toHaveBeenCalledTimes(1);
    });

    it('reopening drops the state and keeps the last check note', async () => {
        const { context, saved } = setup({
            'company-catalogs': { state: 'done', note: 'fine', checkedAt: 'x' },
        });
        await handleSetSetupStep(context, {
            id: 'erp-integration',
            stepId: 'company-catalogs',
            state: 'open',
        });
        expect(saved()?.appBuilderComponents?.['erp-integration'].setupSteps).toEqual({
            'company-catalogs': { note: 'fine', checkedAt: 'x' },
        });
    });

    it('refuses a step the entry does not declare, and a state that is not one', async () => {
        const { context } = setup();
        expect(
            await handleSetSetupStep(context, {
                id: 'erp-integration',
                stepId: 'nope',
                state: 'done',
            })
        ).toMatchObject({
            success: false,
            code: ErrorCode.CONFIG_INVALID,
        });
        expect(
            await handleSetSetupStep(context, {
                id: 'erp-integration',
                stepId: 'confirmed-status',
                state: 'maybe',
            })
        ).toMatchObject({
            success: false,
            code: ErrorCode.CONFIG_INVALID,
        });
    });
});

describe('checkSetupSteps', () => {
    /** Commerce as the check reads it: companies on one path, shared catalogs on the other. */
    const answerByPath = (companies: object[], catalogs: object[]) =>
        mockSendRest.mockImplementation(async (_method: string, _target: unknown, path: string) =>
            JSON.stringify({ items: path.startsWith('company/') ? companies : catalogs })
        );

    it('reads the companies through the signed client and marks the step done when each has its own catalog', async () => {
        answerByPath(
            [{ id: 1, company_name: 'Acme', customer_group_id: 4 }],
            [{ id: 7, name: 'Acme', customer_group_id: 4, type: 0 }]
        );
        const { context, saved } = setup();
        await handleCheckSetupSteps(context, { id: 'erp-integration' });
        expect(mockSendRest).toHaveBeenCalledWith(
            'GET',
            TARGET,
            'company/?searchCriteria[pageSize]=200&fields=items[id,company_name,customer_group_id]',
            undefined,
            expect.any(Function)
        );
        const step =
            saved()?.appBuilderComponents?.['erp-integration'].setupSteps?.['company-catalogs'];
        expect(step).toMatchObject({
            state: 'done',
            note: expect.stringMatching(/1 with their own/),
        });
        expect(step?.checkedAt).toEqual(expect.any(String));
    });

    it('opens a step again when the check finds a company in no shared catalog', async () => {
        answerByPath(
            [
                { id: 1, company_name: 'Acme', customer_group_id: 1 },
                { id: 2, company_name: 'Globex', customer_group_id: 18 },
            ],
            [{ id: 1, name: 'Default (General)', customer_group_id: 1, type: 1 }]
        );
        const { context, saved } = setup({ 'company-catalogs': { state: 'done' } });
        await handleCheckSetupSteps(context, { id: 'erp-integration' });
        const step =
            saved()?.appBuilderComponents?.['erp-integration'].setupSteps?.['company-catalogs'];
        expect(step?.state).toBeUndefined();
        expect(step?.note).toBe('Globex is in no shared catalog (customer group 18 has none).');
    });

    it('leaves the state alone when Adobe sign-in is missing, and says why', async () => {
        mockResolveRestTarget.mockResolvedValue({ refusal: 'Error: Adobe sign-in required.' });
        const { context, saved } = setup({ 'company-catalogs': { state: 'done' } });
        await handleCheckSetupSteps(context, { id: 'erp-integration' });
        expect(mockSendRest).not.toHaveBeenCalled();
        expect(
            saved()?.appBuilderComponents?.['erp-integration'].setupSteps?.['company-catalogs']
        ).toMatchObject({
            state: 'done',
            note: 'Could not check: Adobe sign-in required.',
        });
    });

    it('skips a dismissed step, and still runs the others', async () => {
        answerByPath([], []);
        const { context } = setup({ 'company-catalogs': { state: 'dismissed' } });
        await handleCheckSetupSteps(context, { id: 'erp-integration' });
        const paths = mockSendRest.mock.calls.map((call) => call[2]);
        expect(paths.some((path) => String(path).startsWith('company/'))).toBe(false);
        expect(paths).toContain('inventory/sources?searchCriteria[pageSize]=200');
    });

    it("hands the project's website to the check that reads one website's setting", async () => {
        mockScope.mockReturnValue({ websiteCode: 'acme' });
        mockSendRest.mockResolvedValue(JSON.stringify({ items: [] }));
        const { context } = setup();
        await handleCheckSetupSteps(context, { id: 'erp-integration' });
        const paths = mockSendRest.mock.calls.map((call) => call[2] as string);
        expect(paths).toContain(
            'system/config?scope=websites&scopeCode=acme&searchCriteria[filterGroups][0][filters][0][field]=path' +
                '&searchCriteria[filterGroups][0][filters][0][value]=payment/companycredit/active',
        );
    });

    it('checks only the step asked for, which is how the setup guide asks', async () => {
        answerByPath([{ id: 1, company_name: 'Acme', customer_group_id: 4 }], []);
        const { context, saved } = setup();
        await handleCheckSetupSteps(context, { id: 'erp-integration', stepId: 'company-catalogs' });
        const paths = mockSendRest.mock.calls.map((call) => call[2] as string);
        expect(paths.every((path) => path.startsWith('company/') || path.startsWith('sharedCatalog/'))).toBe(true);
        const steps = saved()?.appBuilderComponents?.['erp-integration'].setupSteps ?? {};
        expect(Object.keys(steps)).toStrictEqual(['company-catalogs']);
    });

    it('refuses a step that does not exist or has no check, reading nothing', async () => {
        const { context } = setup();
        const result = await handleCheckSetupSteps(context, { id: 'erp-integration', stepId: 'no-such-step' });
        expect(result).toStrictEqual({
            success: false,
            error: 'There is no setup step "no-such-step" Demo Builder can check.',
            code: ErrorCode.CONFIG_INVALID,
        });
        expect(mockSendRest).not.toHaveBeenCalled();
    });

    it('checks nothing once every checkable step is dismissed', async () => {
        const { context } = setup({
            'confirmed-status': { state: 'dismissed' },
            'company-catalogs': { state: 'dismissed' },
            'price-scope-website': { state: 'dismissed' },
            'second-source': { state: 'dismissed' },
            'erp-attributes': { state: 'dismissed' },
            'partially-held-status': { state: 'dismissed' },
            'payment-on-account': { state: 'dismissed' },
        });
        await handleCheckSetupSteps(context, { id: 'erp-integration' });
        expect(mockSendRest).not.toHaveBeenCalled();
    });
});
