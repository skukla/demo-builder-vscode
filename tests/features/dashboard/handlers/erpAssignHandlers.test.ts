/**
 * erpAssignHandlers — "Assign products" and its undo (AB-74), driven with Commerce and the
 * integration behind the composition module mocked. The assertions are on what each
 * collaborator is HANDED: the entries the bulk write gets, the record saved on the ERP, the
 * moment the ownership pass runs at. A call without `confirm` must write nothing.
 */

import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import type { AppManagementAuth } from '@/features/app-builder/services/appManagementClient';
import type { AssignProductRow } from '@/features/app-builder/services/erpAssignSelection';
import type { AppBuilderComponentState, Project } from '@/types/base';
import type { CommerceBulkOutcome, ErpAssignPreview } from '@/types/erpAssign';
import { ErrorCode } from '@/types/errorCodes';

const AUTH: AppManagementAuth = { accessToken: 't', imsOrgId: 'o' };
const COMMERCE = { get: jest.fn(), send: jest.fn() };

const mockOpenErpCall = jest.fn();
jest.mock('@/features/dashboard/handlers/erpCall', () => ({
    ...jest.requireActual('@/features/dashboard/handlers/erpCall'),
    openErpCall: (...a: unknown[]) => mockOpenErpCall(...a),
}));
const mockGuard = jest.fn();
jest.mock('@/features/dashboard/handlers/appBuilderComponentHandlers', () => ({
    guardOrBlock: (...a: unknown[]) => mockGuard(...a),
    postComponentsSnapshot: jest.fn(async () => undefined),
}));
const mockPlan = jest.fn();
const mockWrite = jest.fn();
const mockPlanUndo = jest.fn();
const mockReadOptions = jest.fn();
jest.mock('@/features/project-creation/services/erpAssignProducts', () => ({
    ...jest.requireActual('@/features/project-creation/services/erpAssignProducts'),
    openCommerce: async () => COMMERCE,
    planErpAssignment: (...a: unknown[]) => mockPlan(...a),
    writeOwnerValues: (...a: unknown[]) => mockWrite(...a),
    planUndo: (...a: unknown[]) => mockPlanUndo(...a),
    readErpAssignOptions: (...a: unknown[]) => mockReadOptions(...a),
}));
const mockApply = jest.fn();
jest.mock('@/features/project-creation/services/erpOwnershipReconcile', () => ({
    applyErpOwnership: (...a: unknown[]) => mockApply(...a),
}));

// Imported after the mocks, which jest hoists above it.
import {
    handleAssignErpProducts,
    handleGetErpAssignOptions,
    handleUndoErpAssignment,
} from '@/features/dashboard/handlers/erpAssignHandlers';

const ERP = { id: 'demo-erp-2', kind: 'system' as const, status: 'deployed' as const, name: 'Accuform ERP', listId: 'accuform', source: { owner: 's', repo: 'demo-erp' } };
const INTEGRATION = { kind: 'integration' as const, status: 'deployed' as const, name: 'ERP Integration', source: { owner: 's', repo: 'erp' } };

function project(erp: Partial<AppBuilderComponentState> = {}): Project {
    const { id: _id, ...erpState } = ERP;
    return createMockProject({ name: 'bodea', appBuilderComponents: { 'erp-integration': INTEGRATION, 'demo-erp-2': { ...erpState, ...erp } } });
}

function opened(p: Project) {
    const erp = { id: 'demo-erp-2', ...p.appBuilderComponents!['demo-erp-2'] };
    return { id: 'erp-integration', project: p, integration: INTEGRATION, auth: AUTH, erp, erps: [erp] };
}

const row = (sku: string, owner: string): AssignProductRow => ({
    sku, owner, attributeSetId: 4, categoryIds: [], websiteIds: [1], attributes: {},
});
const PREVIEW: ErpAssignPreview = {
    erp: { id: 'demo-erp-2', name: 'Accuform ERP', listId: 'accuform' },
    matched: 3,
    toWrite: 2,
    examples: ['ACC-1', 'ACC-2'],
    alreadyTagged: 1,
    movedFrom: [{ name: 'Justrite ERP', count: 2 }],
    outsideSets: { count: 0, sets: [] },
    unknownSkus: [],
};
const BULK: CommerceBulkOutcome = { uuid: 'u', total: 2, complete: 2, failed: [], open: 0, timedOut: false };

function setup(p = project()) {
    mockOpenErpCall.mockResolvedValue(opened(p));
    const context = createMockHandlerContext();
    return { context, p };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGuard.mockResolvedValue(undefined);
    mockPlan.mockResolvedValue({ preview: PREVIEW, toWrite: [row('ACC-1', 'justrite'), row('ACC-2', '')], value: 'accuform' });
    mockWrite.mockResolvedValue(BULK);
    mockApply.mockResolvedValue({ status: 'applied', erps: [{ erp: 'demo-erp-2', name: 'Accuform ERP', ownsNow: 2 }], unowned: 0, notes: [], fills: [] });
});

const SELECTION = { by: 'brand' as const, brand: 'Accuform' };

describe('assignErpProducts', () => {
    it('without confirm, previews and writes nothing', async () => {
        const { context } = setup();
        const result = await handleAssignErpProducts(context, { id: 'erp-integration', erp: 'demo-erp-2', selection: SELECTION });
        expect(result).toStrictEqual({ success: true, data: { preview: PREVIEW, confirmed: false } });
        expect(mockWrite).not.toHaveBeenCalled();
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
        expect(mockApply).not.toHaveBeenCalled();
    });

    it('with confirm, writes the value on each product, records the previous values, then runs the pass', async () => {
        const { context, p } = setup();
        const result = await handleAssignErpProducts(context, { id: 'erp-integration', erp: 'demo-erp-2', selection: SELECTION, confirm: true });

        expect(mockPlan).toHaveBeenCalledWith({ project: p, integrationId: 'erp-integration', erpId: 'demo-erp-2' }, { auth: AUTH, commerce: COMMERCE }, SELECTION);
        expect(mockWrite).toHaveBeenCalledWith(COMMERCE, [{ sku: 'ACC-1', value: 'accuform' }, { sku: 'ACC-2', value: 'accuform' }], expect.objectContaining({ intervalMs: 3000 }));
        const saved = (context.stateManager.saveProject as jest.Mock).mock.calls[0][0] as Project;
        expect(saved.appBuilderComponents?.['demo-erp-2']?.erpAssignment).toEqual({
            at: expect.any(String),
            value: 'accuform',
            previous: [{ sku: 'ACC-1', value: 'justrite' }, { sku: 'ACC-2', value: '' }],
        });
        expect(mockApply).toHaveBeenCalledWith(p, 'erp-integration', expect.any(Object), 'assign');
        expect(result).toMatchObject({ success: true, data: { confirmed: true, written: 2, bulk: { complete: 2, failed: 0, timedOut: false } } });
    });

    it("says what Commerce refused and what is still queued, and the assignment stands", async () => {
        mockWrite.mockResolvedValue({ ...BULK, complete: 0, failed: [{ index: 0, message: 'The product was unable to be saved.' }], open: 1, timedOut: true });
        const { context } = setup();
        const result = await handleAssignErpProducts(context, { id: 'erp-integration', erp: 'demo-erp-2', selection: SELECTION, confirm: true });
        expect(result).toMatchObject({ success: true });
        const { warning } = (result as { data: { warning: string } }).data;
        expect(warning).toContain('Commerce refused 1 of 2 product saves (first: The product was unable to be saved.)');
        expect(warning).toContain('1 product saves were still queued');
    });

    it("refuses an ERP whose rule is not erp_owner, writing nothing", async () => {
        mockPlan.mockResolvedValue({ refusal: 'Justrite ERP owns every product no other ERP claims.' });
        const { context } = setup();
        const result = await handleAssignErpProducts(context, { id: 'erp-integration', erp: 'demo-erp-2', selection: SELECTION, confirm: true });
        expect(result).toMatchObject({ success: false, error: 'Justrite ERP owns every product no other ERP claims.' });
        expect(mockWrite).not.toHaveBeenCalled();
    });

    it('refuses an empty selection and an unnamed ERP before reading anything', async () => {
        const { context } = setup();
        expect(await handleAssignErpProducts(context, { id: 'erp-integration', erp: 'demo-erp-2' })).toMatchObject({ success: false, code: ErrorCode.CONFIG_INVALID });
        expect(await handleAssignErpProducts(context, { id: 'erp-integration', selection: SELECTION })).toMatchObject({ success: false, code: ErrorCode.CONFIG_INVALID });
        expect(mockPlan).not.toHaveBeenCalled();
    });

    it('stops at the guard, writing nothing', async () => {
        mockGuard.mockResolvedValue({ success: false, blocked: true, error: 'Sign in again.' });
        const { context } = setup();
        const result = await handleAssignErpProducts(context, { id: 'erp-integration', erp: 'demo-erp-2', selection: SELECTION, confirm: true });
        expect(result).toMatchObject({ success: false, error: 'Sign in again.' });
        expect(mockWrite).not.toHaveBeenCalled();
    });
});

describe('getErpAssignOptions', () => {
    it("answers the modal's options for the named ERP", async () => {
        mockReadOptions.mockResolvedValue({ erp: PREVIEW.erp, ownerValue: 'accuform' });
        const { context } = setup();
        const result = await handleGetErpAssignOptions(context, { id: 'erp-integration', erp: 'demo-erp-2' });
        expect(result).toStrictEqual({ success: true, data: { erp: PREVIEW.erp, ownerValue: 'accuform' } });
    });
});

describe('undoErpAssignment', () => {
    const RECORD = { at: '2026-10-09T10:00:00Z', value: 'accuform', previous: [{ sku: 'ACC-1', value: 'justrite' }, { sku: 'ACC-2', value: '' }] };

    it('refuses when there is nothing to undo', async () => {
        const { context } = setup();
        expect(await handleUndoErpAssignment(context, { id: 'erp-integration', erp: 'demo-erp-2', confirm: true })).toMatchObject({
            success: false,
            error: 'Accuform ERP has no assignment to undo.',
        });
    });

    it('without confirm, says what it would put back', async () => {
        mockPlanUndo.mockResolvedValue({ restore: [{ sku: 'ACC-1', value: 'justrite' }], changedSince: ['ACC-2'] });
        const { context } = setup(project({ erpAssignment: RECORD }));
        const result = await handleUndoErpAssignment(context, { id: 'erp-integration', erp: 'demo-erp-2' });
        expect(result).toStrictEqual({
            success: true,
            data: { confirmed: false, assignedAt: RECORD.at, value: 'accuform', restore: 1, changedSince: 1, examples: ['ACC-1'] },
        });
        expect(mockWrite).not.toHaveBeenCalled();
    });

    it('with confirm, puts the recorded values back, drops the record, and runs the pass', async () => {
        mockPlanUndo.mockResolvedValue({ restore: [{ sku: 'ACC-1', value: 'justrite' }], changedSince: ['ACC-2'] });
        const { context, p } = setup(project({ erpAssignment: RECORD }));
        const result = await handleUndoErpAssignment(context, { id: 'erp-integration', erp: 'demo-erp-2', confirm: true });

        expect(mockPlanUndo).toHaveBeenCalledWith(COMMERCE, RECORD);
        expect(mockWrite).toHaveBeenCalledWith(COMMERCE, [{ sku: 'ACC-1', value: 'justrite' }], expect.any(Object));
        const saved = (context.stateManager.saveProject as jest.Mock).mock.calls[0][0] as Project;
        expect(saved.appBuilderComponents?.['demo-erp-2']).not.toHaveProperty('erpAssignment');
        expect(mockApply).toHaveBeenCalledWith(p, 'erp-integration', expect.any(Object), 'assign');
        expect(result).toMatchObject({
            success: true,
            data: { undone: true, warning: '1 products were left as they are: their erp_owner has changed since the assignment.' },
        });
    });
});
