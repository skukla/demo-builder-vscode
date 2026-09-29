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
    allowDeveloperRole,
    handleResetErpRecords,
    mockCallErpApi,
    mockDetach,
    mockEnsureAdobeIOAuth,
    mockFillErpForProject,
    pairProject,
    resetErpHandlerMocks,
    setupMocks,
    vscode,
} from './erpIntegrationHandlers.testUtils';
import { ErrorCode } from '@/types/errorCodes';

beforeEach(() => {
    resetErpHandlerMocks();
});

describe('handleResetErpRecords', () => {
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
                    undone: {
                        reverted: { reverted: 2, failed: [] },
                        orders: { cleared: 1, failed: [] },
                    },
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

    it('answers a reset whose prices were not published as done, with the note as its warning (AB-26z)', async () => {
        const { mockContext } = setupMocks(pairProject());
        allowDeveloperRole();
        const note =
            'Demo data loaded; prices were not published: ERP prices answered 500: boom. Load demo data again to retry.';
        mockFillErpForProject.mockResolvedValue({
            status: 'filled',
            erpId: 'demo-erp',
            result: { partners: 3, products: 40, skipped: 0 },
            note,
        });

        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });

        expect(result).toMatchObject({ success: true, data: { warning: note } });
    });

    it('needs an id, even with no payload at all', async () => {
        const { mockContext } = setupMocks(pairProject());
        const result = await handleResetErpRecords(mockContext, undefined);
        expect(result.success).toBe(false);
    });
});
