/**
 * erpResetHandlers — the ERP pair's reset verb (plan step 05): undo, wipe and fill.
 *
 * The ERP client, the auth resolver, the catalog loader and the guards are
 * mocked (erpIntegrationHandlers.testUtils); assertions pin the ARGUMENTS each collaborator
 * receives and the shape the handler answers — a mock cannot see a malformed call.
 */

import {
    ERP,
    ERP_URLS,
    LIVE,
    allowDeveloperRole,
    handleResetErpRecords,
    mockCallErpApi,
    mockDetach,
    mockEnsureAdobeIOAuth,
    mockFillErpForProject,
    mockStatus,
    pairProject,
    resetErpHandlerMocks,
    setupMocks,
    vscode,
} from './erpIntegrationHandlers.testUtils';
import { ErrorCode } from '@/types/errorCodes';

/** An integration that closes off orders on a reset (AB-16n), and what its detach answers. */
const CLOSED = { cancelled: 2, commented: 1, alreadyClosed: 0, partsRemoved: 3, failed: [] };
const UNDONE = {
    reverted: { reverted: 2, failed: [] },
    orders: { cleared: 1, failed: [] },
    closed: CLOSED,
};

beforeEach(() => {
    resetErpHandlerMocks();
    mockStatus.mockResolvedValue({ ...LIVE, closesOrdersOnReset: true });
    mockDetach.mockResolvedValue(UNDONE);
});

describe('handleResetErpRecords', () => {
    it('closes off every order the ERPs hold as it undoes their writes, before any wipe (AB-16n)', async () => {
        const { mockContext } = setupMocks(pairProject());
        allowDeveloperRole();

        await handleResetErpRecords(mockContext, { id: 'erp-integration' });

        expect(mockDetach).toHaveBeenCalledWith({ closeOrders: true }, expect.any(Function));
        expect(mockDetach.mock.invocationCallOrder[0]).toBeLessThan(
            mockCallErpApi.mock.invocationCallOrder[0]
        );
    });

    it('shows the line the client reports while it follows an undo cut off at 60 seconds (AB-61)', async () => {
        const { mockContext } = setupMocks(pairProject());
        allowDeveloperRole();
        const line = "Still undoing the ERP's changes in Commerce";
        mockDetach.mockImplementation(
            async (_options: unknown, onProgress: (message: string) => void) => {
                onProgress(line);
                return UNDONE;
            }
        );

        await handleResetErpRecords(mockContext, { id: 'erp-integration', progress: 'modal' });

        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'operationProgress',
            expect.objectContaining({ id: 'erp-integration', state: 'running', step: line })
        );
    });

    it('refuses before touching anything when the integration cannot close off orders', async () => {
        const { mockContext } = setupMocks(pairProject());
        allowDeveloperRole();
        mockStatus.mockResolvedValue(LIVE);

        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });

        expect(result).toEqual({
            success: false,
            error: 'The ERP reset did not finish: Nordwind integration cannot close off orders on a reset. Update it, then reset again.',
        });
        expect(mockDetach).not.toHaveBeenCalled();
        expect(mockCallErpApi).not.toHaveBeenCalled();
    });

    it('stops before any wipe when the undo did not close off the orders', async () => {
        const { mockContext } = setupMocks(pairProject());
        allowDeveloperRole();
        mockDetach.mockResolvedValue({
            reverted: { reverted: 0, failed: [] },
            orders: { cleared: 0, failed: [] },
        });

        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/did not close off the orders; nothing was wiped/);
        expect(mockCallErpApi).not.toHaveBeenCalled();
    });

    it('stops before any wipe when some orders could not be closed off, and names them (AB-47)', async () => {
        const { mockContext } = setupMocks(pairProject());
        allowDeveloperRole();
        mockDetach.mockResolvedValue({
            ...UNDONE,
            closed: {
                ...CLOSED,
                cancelled: 1,
                failed: [{ orderId: '000000042', error: 'Commerce timed out' }],
            },
        });

        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });

        expect(result).toEqual({
            success: false,
            error: 'The ERP reset did not finish: Nordwind integration could not close off 1 order(s): 000000042 (Commerce timed out). Nothing was wiped; cancel or finish them in Commerce, then reset again.',
        });
        // The ERPs are untouched: the reset is run again once the order is dealt with.
        expect(mockCallErpApi).not.toHaveBeenCalled();
    });

    it('guards, then undoes, wipes and fills under one progress notification, and answers what each did', async () => {
        const { mockContext } = setupMocks(pairProject());
        allowDeveloperRole();

        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });

        expect(mockEnsureAdobeIOAuth).toHaveBeenCalledTimes(1);
        const titles = (vscode.window.withProgress as jest.Mock).mock.calls.map(
            ([options]: [{ title: string }]) => options.title
        );
        expect(titles).toEqual(['Resetting Nordwind records']);
        expect(mockDetach).toHaveBeenCalledTimes(1);
        // The ERP's own wipe, at its own URLs, with the sign-in.
        expect(mockCallErpApi).toHaveBeenCalledWith(
            ERP_URLS,
            expect.objectContaining({ imsOrgId: 'ABC@AdobeOrg' }),
            'POST',
            'admin/wipe',
            undefined
        );
        // Each ERP by its own id: an integration can serve several (AB-16).
        expect(mockFillErpForProject).toHaveBeenCalledWith(
            expect.any(Object),
            'erp-integration',
            expect.any(Object),
            'demo-erp'
        );
        expect(result).toEqual({
            success: true,
            data: {
                id: 'erp-integration',
                erp: {
                    id: 'demo-erp',
                    name: 'Nordwind',
                    status: 'deployed',
                    url: ERP.url,
                    lastDeployed: ERP.lastDeployed,
                },
                report: {
                    undone: UNDONE,
                    erps: [
                        {
                            id: 'demo-erp',
                            name: 'Nordwind',
                            wiped: { products: 40 },
                            loaded: { partners: 3, products: 40, skipped: 0 },
                        },
                    ],
                },
            },
        });
    });

    it('refuses an undeployed integration before any call', async () => {
        const { mockContext } = setupMocks(pairProject({ status: 'error' }));
        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });
        expect(result).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect(mockDetach).not.toHaveBeenCalled();
    });

    it('a failed guard blocks before the reset runs', async () => {
        const { mockContext } = setupMocks(pairProject());
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false, error: 'Sign in first' });
        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });
        expect(result.success).toBe(false);
        expect(mockDetach).not.toHaveBeenCalled();
    });

    it("a wipe the ERP refuses stops the reset before the fill, in the ERP's words", async () => {
        const { mockContext } = setupMocks(pairProject());
        allowDeveloperRole();
        mockCallErpApi.mockResolvedValue({
            ok: false,
            status: 503,
            body: {},
            detail: 'database unavailable',
        });
        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });
        expect(result).toEqual({
            success: false,
            error: "The ERP reset did not finish: Nordwind's wipe answered 503: database unavailable",
        });
        expect(mockFillErpForProject).not.toHaveBeenCalled();
    });

    it('a fill that stops after the wipe says the ERP was wiped but not filled', async () => {
        const { mockContext } = setupMocks(pairProject());
        allowDeveloperRole();
        mockFillErpForProject.mockResolvedValue({
            status: 'failed',
            detail: 'Commerce answered 401 for products',
        });
        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });
        expect(result).toEqual({
            success: false,
            error: 'The ERP reset did not finish: Nordwind was wiped but not filled again: Commerce answered 401 for products',
        });
    });

    it("answers a reset whose prices were not published as done, with the fill's warning (AB-26z)", async () => {
        const { mockContext } = setupMocks(pairProject());
        allowDeveloperRole();
        const warning =
            'Demo data loaded; prices were not published: ERP prices answered 500: boom. Load demo data again to retry.';
        mockFillErpForProject.mockResolvedValue({
            status: 'filled',
            erpId: 'demo-erp',
            result: { partners: 3, products: 40, skipped: 0 },
            warning,
        });

        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });

        expect(result).toMatchObject({ success: true, data: { warning } });
        expect(result.data).not.toHaveProperty('note');
    });

    it('ends the progress window on that warning when the reset was started from a screen', async () => {
        const { mockContext } = setupMocks(pairProject());
        allowDeveloperRole();
        const warning =
            'Demo data loaded; prices were not published: ERP prices answered 500: boom. Load demo data again to retry.';
        mockFillErpForProject.mockResolvedValue({
            status: 'filled',
            erpId: 'demo-erp',
            result: { partners: 3, products: 40, skipped: 0 },
            warning,
        });

        await handleResetErpRecords(mockContext, { id: 'erp-integration', progress: 'modal' });

        expect(mockContext.sendMessage).toHaveBeenLastCalledWith('operationProgress', {
            id: 'erp-integration',
            state: 'succeeded',
            warning,
        });
    });

    // Prices still being published after the fill is nothing the SC must act on: the reset
    // ends as a plain success that says so, in the modal and in the answer (owner, 2026-10-09).
    it("ends on the fill's note as a plain success, not a warning", async () => {
        const { mockContext } = setupMocks(pairProject());
        allowDeveloperRole();
        const note =
            'Demo data loaded. Prices are still being published and will finish by themselves in a few minutes.';
        mockFillErpForProject.mockResolvedValue({
            status: 'filled',
            erpId: 'demo-erp',
            result: { partners: 3, products: 40, skipped: 0 },
            note,
        });

        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration', progress: 'modal' });

        expect(result).toMatchObject({ success: true, data: { note } });
        expect(result.data).not.toHaveProperty('warning');
        expect(mockContext.sendMessage).toHaveBeenLastCalledWith('operationProgress', {
            id: 'erp-integration',
            state: 'succeeded',
            note,
        });
    });

    it("answers the website mappings each fill filled and kept, as one block (AB-26y)", async () => {
        const { mockContext } = setupMocks(pairProject());
        allowDeveloperRole();
        mockFillErpForProject.mockResolvedValue({
            status: 'filled',
            erpId: 'demo-erp',
            result: { partners: 3, products: 40, skipped: 0 },
            mapping: {
                filled: [{ erp: 'demo-erp', website: 'base', salesOrg: '1000' }],
                kept: [{ erp: 'demo-erp', website: 'eu', salesOrg: '3000', erpSalesOrg: '2000' }],
            },
        });

        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });

        expect(result).toMatchObject({
            success: true,
            data: {
                mapping: {
                    filled: [{ erp: 'demo-erp', website: 'base', salesOrg: '1000' }],
                    kept: [{ erp: 'demo-erp', website: 'eu', salesOrg: '3000', erpSalesOrg: '2000' }],
                },
            },
        });
        expect(result.data).not.toHaveProperty('warning');
    });

    it('needs an id, even with no payload at all', async () => {
        const { mockContext } = setupMocks(pairProject());
        const result = await handleResetErpRecords(mockContext, undefined);
        expect(result.success).toBe(false);
    });
});
