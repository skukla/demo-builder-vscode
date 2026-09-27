/**
 * erpFillHandler — `loadErpDemoData`, Demo Builder filling the ERP (AB-26y step 1).
 *
 * The fill itself is `erpFill`'s suite; here the handler is driven with the fill mocked,
 * and the assertions are on what the fill is HANDED: the Commerce read over the signed
 * target, the integration's settings call, and the ERP import at the ERP's own URLs.
 */

import type { AppBuilderComponentState, Project } from '@/types/base';

const mockResolveAppManagementAuth = jest.fn();
jest.mock('@/features/project-creation/services/appBuilderComponentRunnerDeps', () => ({
    buildDefaultRunnerDeps: jest.fn(),
    buildRunnerDepsContext: jest.fn(async () => ({})),
    resolveAppManagementAuth: (...a: unknown[]) => mockResolveAppManagementAuth(...a),
}));

const mockResolvedSettings = jest.fn();
const mockCallErpApi = jest.fn();
jest.mock('@/features/app-builder/services/erpIntegrationClient', () => ({
    ...jest.requireActual('@/features/app-builder/services/erpIntegrationClient'),
    callErpApi: (...args: unknown[]) => mockCallErpApi(...args),
    ErpIntegrationClient: class {
        resolvedSettings = (codes: string[]) => mockResolvedSettings(codes);
    },
}));

const mockFillErp = jest.fn();
jest.mock('@/features/app-builder/services/erpFill', () => ({
    fillErp: (...args: unknown[]) => mockFillErp(...args),
}));

const mockResolveRestTarget = jest.fn();
const mockRequestRest = jest.fn();
jest.mock('@/features/ai/server/commerceRestClient', () => ({
    resolveRestTarget: (...args: unknown[]) => mockResolveRestTarget(...args),
    requestRest: (...args: unknown[]) => mockRequestRest(...args),
}));

jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    getAppBuilderComponentCatalog: jest.fn(() => [{ id: 'demo-erp', kind: 'system', boundTo: 'erp-integration' }]),
    getAppBuilderComponentEntry: jest.fn(),
    buildCustomIntegrationEntry: jest.fn(),
    entryFitsProjectAxes: jest.fn().mockReturnValue(true),
}));

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            getTokenManager: () => ({ inspectToken: jest.fn(async () => ({ valid: false })) }),
            getCachedOrganization: jest.fn(),
            testDeveloperPermissions: jest.fn().mockResolvedValue({ hasPermissions: true }),
        })),
        getCommandExecutor: jest.fn(() => ({ execute: jest.fn() })),
    },
}));

const mockEnsureAdobeIOAuth = jest.fn();
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: (...a: unknown[]) => mockEnsureAdobeIOAuth(...a),
}));
jest.mock('@/features/authentication/services/detectProjectOrgMismatch', () => ({
    detectProjectOrgMismatch: jest.fn(async () => ({ reachable: true })),
}));
jest.mock('@/features/dashboard/handlers/dashboardHandlers', () => ({
    handleRequestStatus: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        sendAppBuilderComponentStatusUpdate: jest.fn(),
        sendAppBuilderComponentsSnapshot: jest.fn(),
        refreshStatus: jest.fn(),
    },
}));

import { setupMocks } from './dashboardHandlers.testUtils';
import type { ErpFillDeps } from '@/features/app-builder/services/erpFill';
import { handleLoadErpDemoData } from '@/features/dashboard/handlers/erpFillHandler';
import { ErrorCode } from '@/types/errorCodes';

const ERP_URLS = {
    'runtime/demo-erp/admin': 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/admin',
    'runtime/demo-erp/orders': 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/orders',
};
const AUTH = { accessToken: 'fake-test-pw-not-a-secret', imsOrgId: 'ABC@AdobeOrg' };
const TARGET = { base: 'https://tenant.example', token: 't', clientId: 'c', imsOrgCode: 'o' };

function pairProject(erpStatus: AppBuilderComponentState['status'] = 'deployed'): Partial<Project> {
    return {
        name: 'bodea',
        appBuilderComponents: {
            'erp-integration': {
                kind: 'integration',
                status: 'deployed',
                name: 'Northwind ERP Integration',
                source: { owner: 'skukla', repo: 'commerce-erp-integration' },
                deployedUrls: { 'runtime/erp/status': 'https://ns.adobeioruntime.net/api/v1/web/erp/status' },
            },
            'demo-erp': {
                kind: 'system',
                status: erpStatus,
                name: 'Northwind ERP',
                source: { owner: 'skukla', repo: 'demo-erp' },
                deployedUrls: ERP_URLS,
            },
        },
    };
}

/** The dashboard context over this project, with the developer role the guards check. */
function setup(project: Partial<Project> = pairProject()) {
    const mocks = setupMocks(project);
    const { ServiceLocator } = require('@/core/di/serviceLocator');
    ServiceLocator.getAuthenticationService().testDeveloperPermissions = jest.fn().mockResolvedValue({ hasPermissions: true });
    return mocks;
}

/** The deps the handler handed the fill, from its first call. */
const handedDeps = (): ErpFillDeps => mockFillErp.mock.calls[0][0] as ErpFillDeps;

beforeEach(() => {
    jest.clearAllMocks();
    mockResolveAppManagementAuth.mockResolvedValue(AUTH);
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockResolveRestTarget.mockResolvedValue(TARGET);
    mockFillErp.mockResolvedValue({ partners: 4, products: 182, skipped: 0 });
});

describe('handleLoadErpDemoData', () => {
    it("fills the ERP for the project and answers what went in beside the ERP's row", async () => {
        const { mockContext } = setup();

        const result = await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        expect(mockFillErp).toHaveBeenCalledWith(expect.any(Object), 'bodea');
        expect(result).toMatchObject({
            success: true,
            data: { id: 'erp-integration', erp: { id: 'demo-erp', name: 'Northwind ERP' }, loaded: { partners: 4, products: 182, skipped: 0 } },
        });
    });

    it("hands the fill an import that POSTs admin/import at the ERP's own URLs with the sign-in", async () => {
        mockCallErpApi.mockResolvedValue({ ok: true, status: 200, body: {}, detail: '' });
        const { mockContext } = setup();
        await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        await handedDeps().importRecords({ products: [] });
        expect(mockCallErpApi).toHaveBeenCalledWith(ERP_URLS, AUTH, 'POST', 'admin/import', { products: [] });
    });

    it("hands the fill an import that throws the ERP's own words when it refuses", async () => {
        mockCallErpApi.mockResolvedValue({ ok: false, status: 400, body: {}, detail: 'import needs a products array' });
        const { mockContext } = setup();
        await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        await expect(handedDeps().importRecords({})).rejects.toThrow("The ERP's import answered 400: import needs a products array");
    });

    it("hands the fill a Commerce read over the signed target, and the integration's settings", async () => {
        mockRequestRest.mockResolvedValue({ ok: true, status: 200, text: '[{"id":1,"code":"bodea","name":"Bodea"}]' });
        mockResolvedSettings.mockResolvedValue({ default: {}, websites: {} });
        const { mockContext } = setup();
        await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        await expect(handedDeps().get('store/websites')).resolves.toStrictEqual([{ id: 1, code: 'bodea', name: 'Bodea' }]);
        expect(mockRequestRest).toHaveBeenCalledWith('GET', TARGET, 'store/websites', undefined, expect.any(Function));
        await handedDeps().settings(['bodea']);
        expect(mockResolvedSettings).toHaveBeenCalledWith(['bodea']);
    });

    it('hands the fill a Commerce read that carries the status when Commerce refuses', async () => {
        mockRequestRest.mockResolvedValue({ ok: false, status: 404, text: 'no route' });
        const { mockContext } = setup();
        await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });

        await expect(handedDeps().get('inventory/sources?x=1')).rejects.toMatchObject({ status: 404 });
    });

    it('refuses before any call when the ERP is not deployed', async () => {
        const { mockContext } = setup(pairProject('error'));
        const result = await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });
        expect(result).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
        expect(mockFillErp).not.toHaveBeenCalled();
    });

    it('stops with the Commerce refusal when the project cannot sign a Commerce call', async () => {
        mockResolveRestTarget.mockResolvedValue({ refusal: 'Error: Adobe sign-in required.' });
        const { mockContext } = setup();
        const result = await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });
        expect(result).toStrictEqual({ success: false, error: 'Adobe sign-in required.' });
        expect(mockFillErp).not.toHaveBeenCalled();
    });

    it("answers a fill that stops as a failure in the fill's words", async () => {
        mockFillErp.mockRejectedValue(new Error('Commerce answered 401 for products'));
        const { mockContext } = setup();
        const result = await handleLoadErpDemoData(mockContext, { id: 'erp-integration' });
        expect(result).toStrictEqual({ success: false, error: 'Loading demo data did not finish: Commerce answered 401 for products' });
    });
});
