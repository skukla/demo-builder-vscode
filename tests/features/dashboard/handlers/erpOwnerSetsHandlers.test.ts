/**
 * erpOwnerSetsHandlers — the attribute-set fix and its undo (AB-74), with Commerce behind the
 * set service mocked. Asserted: which sets each write is handed, the record saved on the ERP
 * integration, and that a call without `confirm` changes nothing.
 */

import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import type { AppManagementAuth } from '@/features/app-builder/services/appManagementClient';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';

const AUTH: AppManagementAuth = { accessToken: 't', imsOrgId: 'o' };
const COMMERCE = { get: jest.fn(), send: jest.fn() };

const mockOpenErpCall = jest.fn();
jest.mock('@/features/dashboard/handlers/erpCall', () => ({
    ...jest.requireActual('@/features/dashboard/handlers/erpCall'),
    openErpCall: (...a: unknown[]) => mockOpenErpCall(...a),
}));
jest.mock('@/features/dashboard/handlers/appBuilderComponentHandlers', () => ({
    guardOrBlock: jest.fn(async () => undefined),
    postComponentsSnapshot: jest.fn(async () => undefined),
}));
jest.mock('@/features/project-creation/services/erpAssignProducts', () => ({
    openCommerce: async () => COMMERCE,
}));
const mockMissing = jest.fn();
const mockAdd = jest.fn();
const mockRemove = jest.fn();
jest.mock('@/features/app-builder/services/erpOwnerAttributeSets', () => ({
    readProductSets: async () => [],
    setsWithoutOwner: (...a: unknown[]) => mockMissing(...a),
    addOwnerToSets: (...a: unknown[]) => mockAdd(...a),
    removeOwnerFromSets: (...a: unknown[]) => mockRemove(...a),
}));
const mockList = jest.fn();
jest.mock('@/features/app-builder/services/erpAssignSelection', () => ({
    listAssignableProducts: (...a: unknown[]) => mockList(...a),
}));

// Imported after the mocks, which jest hoists above it.
import {
    handleAddErpOwnerToAttributeSets,
    handleRemoveErpOwnerFromAttributeSets,
} from '@/features/dashboard/handlers/erpOwnerSetsHandlers';

const DEFAULT_SET = { id: 4, name: 'Default', products: 12 };

function setup(integration: Partial<AppBuilderComponentState> = {}) {
    const state: AppBuilderComponentState = { kind: 'integration', status: 'deployed', name: 'ERP Integration', source: { owner: 's', repo: 'erp' }, ...integration };
    const p = createMockProject({ appBuilderComponents: { 'erp-integration': state } });
    mockOpenErpCall.mockResolvedValue({ id: 'erp-integration', project: p, integration: state, auth: AUTH, erps: [] });
    return { context: createMockHandlerContext(), p };
}

const savedIntegration = (context: ReturnType<typeof createMockHandlerContext>) =>
    ((context.stateManager.saveProject as jest.Mock).mock.calls[0][0] as Project).appBuilderComponents?.['erp-integration'];

beforeEach(() => {
    jest.clearAllMocks();
    mockMissing.mockResolvedValue([DEFAULT_SET]);
    mockAdd.mockResolvedValue({ changed: [{ id: 4, name: 'Default' }] });
    mockRemove.mockResolvedValue({ changed: [{ id: 4, name: 'Default' }] });
    mockList.mockResolvedValue([]);
});

describe('addErpOwnerToAttributeSets', () => {
    it('without confirm, answers the sets that lack erp_owner and changes nothing', async () => {
        const { context } = setup();
        const result = await handleAddErpOwnerToAttributeSets(context, { id: 'erp-integration' });
        expect(result).toStrictEqual({ success: true, data: { confirmed: false, setsWithoutOwner: [DEFAULT_SET] } });
        expect(mockAdd).not.toHaveBeenCalled();
    });

    it('with confirm, adds erp_owner to those sets and records which, merged with an earlier addition', async () => {
        const { context } = setup({ erpOwnerSets: { at: '2026-10-01T00:00:00Z', sets: [{ id: 15, name: 'Gear' }] } });
        const result = await handleAddErpOwnerToAttributeSets(context, { id: 'erp-integration', confirm: true });
        expect(mockAdd).toHaveBeenCalledWith(COMMERCE.get, COMMERCE.send, [DEFAULT_SET]);
        expect(savedIntegration(context)?.erpOwnerSets).toEqual({
            at: expect.any(String),
            sets: [{ id: 15, name: 'Gear' }, { id: 4, name: 'Default' }],
        });
        expect(result).toStrictEqual({ success: true, data: { confirmed: true, added: [{ id: 4, name: 'Default' }] } });
    });

    it('a refusal before any set changed is a failure in Commerce\'s words, and nothing is recorded', async () => {
        mockAdd.mockResolvedValue({ changed: [], error: 'Default: The attribute with "erp_owner" attributeCode does not exist.' });
        const { context } = setup();
        const result = await handleAddErpOwnerToAttributeSets(context, { id: 'erp-integration', confirm: true });
        expect(result).toMatchObject({ success: false, error: 'Commerce refused: Default: The attribute with "erp_owner" attributeCode does not exist.' });
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    });
});

describe('removeErpOwnerFromAttributeSets', () => {
    const RECORD = { at: '2026-10-09T00:00:00Z', sets: [{ id: 4, name: 'Default' }] };

    it('refuses when Demo Builder added erp_owner to no set', async () => {
        const { context } = setup();
        expect(await handleRemoveErpOwnerFromAttributeSets(context, { id: 'erp-integration', confirm: true })).toMatchObject({
            success: false,
            code: ErrorCode.INVALID_OPERATION,
        });
    });

    it('refuses while a product in those sets is tagged, so no tag is lost', async () => {
        mockList.mockResolvedValue([{ sku: 'A', attributeSetId: 4, owner: 'accuform' }, { sku: 'B', attributeSetId: 9, owner: 'x' }]);
        const { context } = setup({ erpOwnerSets: RECORD });
        const result = await handleRemoveErpOwnerFromAttributeSets(context, { id: 'erp-integration', confirm: true });
        expect(result).toMatchObject({ success: false, error: expect.stringContaining('1 products in those sets carry an erp_owner value') });
        expect(mockRemove).not.toHaveBeenCalled();
    });

    it('with confirm, takes erp_owner out of the recorded sets and drops the record', async () => {
        const { context } = setup({ erpOwnerSets: RECORD });
        const result = await handleRemoveErpOwnerFromAttributeSets(context, { id: 'erp-integration', confirm: true });
        expect(mockRemove).toHaveBeenCalledWith(COMMERCE.send, RECORD.sets);
        expect(savedIntegration(context)).not.toHaveProperty('erpOwnerSets');
        expect(result).toStrictEqual({ success: true, data: { confirmed: true, removed: [{ id: 4, name: 'Default' }] } });
    });
});
