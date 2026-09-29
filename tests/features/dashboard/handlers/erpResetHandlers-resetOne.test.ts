/**
 * handleResetErpRecords with one ERP named (AB-16c, `.rptc/plans/several-erps/per-erp-reset.md`):
 * the integration undoes only that ERP's writes (`erp/detach?erp=`), and only that ERP is wiped
 * and filled. An integration deployed before it could do that would undo every ERP, so it is
 * asked first (`detachesPerErp` on its status) and refused when it cannot.
 */

import {
    ERP,
    INTEGRATION,
    LIVE,
    allowDeveloperRole,
    handleResetErpRecords,
    mockCallErpApi,
    mockDetach,
    mockFillErpForProject,
    mockStatus,
    resetErpHandlerMocks,
    setupMocks,
    vscode,
} from './erpIntegrationHandlers.testUtils';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';

const CONTOSO_URLS = {
    'runtime/demo-erp/orders': 'https://ns2.adobeioruntime.net/api/v1/web/demo-erp/orders',
};

function twoErpProject(): Partial<Project> {
    const contoso: AppBuilderComponentState = {
        ...ERP,
        catalogId: 'demo-erp',
        name: 'Contoso',
        usedBy: 'erp-integration',
        deployedUrls: CONTOSO_URLS,
    };
    return {
        appBuilderComponents: {
            'erp-integration': { ...INTEGRATION, systems: ['demo-erp', 'demo-erp-2'] },
            'demo-erp': { ...ERP },
            'demo-erp-2': contoso,
        },
    };
}

beforeEach(() => {
    resetErpHandlerMocks();
    mockStatus.mockResolvedValue({ ...LIVE, detachesPerErp: true });
    mockDetach.mockImplementation(async (erp?: string) => ({
        ...(erp ? { erp } : {}),
        reverted: { reverted: 1, failed: [] },
        orders: { cleared: 0, failed: [] },
    }));
});

describe('handleResetErpRecords with one ERP named', () => {
    it("undoes, wipes and fills only that ERP, asking the integration by the ERP's list id", async () => {
        const { mockContext } = setupMocks(twoErpProject());
        allowDeveloperRole();

        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration', erp: 'demo-erp-2' });

        expect(mockDetach).toHaveBeenCalledWith('demo-erp-2');
        expect(mockCallErpApi).toHaveBeenCalledTimes(1);
        expect(mockCallErpApi).toHaveBeenCalledWith(CONTOSO_URLS, expect.any(Object), 'POST', 'admin/wipe', undefined);
        expect(mockFillErpForProject).toHaveBeenCalledTimes(1);
        expect(mockFillErpForProject).toHaveBeenCalledWith(expect.any(Object), 'erp-integration', expect.any(Object), 'demo-erp-2');
        const titles = (vscode.window.withProgress as jest.Mock).mock.calls.map(([o]: [{ title: string }]) => o.title);
        expect(titles).toEqual(['Resetting Contoso records']);
        expect(result).toMatchObject({
            success: true,
            data: { erp: { id: 'demo-erp-2', name: 'Contoso' }, report: { erps: [{ id: 'demo-erp-2', name: 'Contoso' }] } },
        });
    });

    it("names the first ERP by the integration's own list id", async () => {
        const { mockContext } = setupMocks(twoErpProject());
        allowDeveloperRole();

        await handleResetErpRecords(mockContext, { id: 'erp-integration', erp: 'demo-erp' });

        expect(mockDetach).toHaveBeenCalledWith('erp');
        expect(mockFillErpForProject).toHaveBeenCalledWith(expect.any(Object), 'erp-integration', expect.any(Object), 'demo-erp');
    });

    it('refuses before any undo when the deployed integration can only undo every ERP', async () => {
        const { mockContext } = setupMocks(twoErpProject());
        allowDeveloperRole();
        mockStatus.mockResolvedValue(LIVE);

        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration', erp: 'demo-erp-2' });

        expect(result).toEqual({
            success: false,
            error: 'The ERP reset did not finish: Nordwind integration can only reset every ERP at once. Redeploy it to reset Contoso alone.',
        });
        expect(mockDetach).not.toHaveBeenCalled();
        expect(mockCallErpApi).not.toHaveBeenCalled();
    });

    it('stops before the wipe when the undo did not say it was for that ERP alone', async () => {
        const { mockContext } = setupMocks(twoErpProject());
        allowDeveloperRole();
        mockDetach.mockResolvedValue({ reverted: { reverted: 4, failed: [] }, orders: { cleared: 2, failed: [] } });

        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration', erp: 'demo-erp-2' });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/undid every ERP's writes, not only Contoso's/);
        expect(mockCallErpApi).not.toHaveBeenCalled();
    });

    it('with no ERP named, still resets every ERP without asking', async () => {
        const { mockContext } = setupMocks(twoErpProject());
        allowDeveloperRole();

        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration' });

        expect(mockStatus).not.toHaveBeenCalled();
        expect(mockDetach).toHaveBeenCalledWith(undefined);
        expect(mockFillErpForProject).toHaveBeenCalledTimes(2);
        expect(result.success).toBe(true);
    });

    it('refuses an ERP the integration does not serve before any call', async () => {
        const { mockContext } = setupMocks(twoErpProject());

        const result = await handleResetErpRecords(mockContext, { id: 'erp-integration', erp: 'demo-erp-9' });

        expect(result).toMatchObject({ success: false, code: ErrorCode.CONFIG_INVALID });
        expect(mockDetach).not.toHaveBeenCalled();
    });
});
