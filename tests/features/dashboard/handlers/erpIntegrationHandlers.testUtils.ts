/**
 * Shared set-up for the erpIntegrationHandlers suites: the mocks (the ERP client, the auth
 * resolver, the catalog loader, the guards), the pair's fixtures, and the handlers themselves.
 * This file owns the handler import so the mocks above it apply (jest hoists a mock only
 * within its own module).
 */

import type { AppBuilderComponentState, Project } from '@/types/base';

export const mockResolveAppManagementAuth = jest.fn();
jest.mock('@/features/project-creation/services/appBuilderComponentRunnerDeps', () => ({
    buildDefaultRunnerDeps: jest.fn(),
    buildRunnerDepsContext: jest.fn(async () => ({})),
    resolveAppManagementAuth: (...a: unknown[]) => mockResolveAppManagementAuth(...a),
}));

export const mockStatus = jest.fn();
export const mockDetach = jest.fn();
export const mockLookup = jest.fn();
export const mockTraceOrder = jest.fn();
export const mockResolvedSettings = jest.fn();
export const mockUpdateErpSettings = jest.fn();
export const mockCallErpApi = jest.fn();
export const mockClientCtor = jest.fn();
jest.mock('@/features/app-builder/services/erpIntegrationClient', () => ({
    ...jest.requireActual('@/features/app-builder/services/erpIntegrationClient'),
    callErpApi: (...args: unknown[]) => mockCallErpApi(...args),
    ErpIntegrationClient: class {
        constructor(...args: unknown[]) {
            mockClientCtor(...args);
        }
        status = (erpId?: string) => mockStatus(erpId);
        detach = (options?: { closeOrders?: boolean }) => mockDetach(options);
        lookup = (query: unknown) => mockLookup(query);
        traceOrder = (orderNumber: string) => mockTraceOrder(orderNumber);
        resolvedSettings = (websites: string[], erpId?: string) =>
            mockResolvedSettings(websites, erpId);
        updateErpSettings = (id: string, website: string | undefined, values: unknown) =>
            mockUpdateErpSettings(id, website, values);
    },
}));

export const mockFillErpForProject = jest.fn();
jest.mock('@/features/project-creation/services/erpFillForProject', () => ({
    ...jest.requireActual('@/features/project-creation/services/erpFillForProject'),
    fillErpForProject: (...args: unknown[]) => mockFillErpForProject(...args),
}));

jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    // listedAs as the bundled catalog declares it (app-builder-components.json, demo-erp).
    getAppBuilderComponentCatalog: jest.fn(() => [
        {
            id: 'demo-erp',
            kind: 'system',
            boundTo: 'erp-integration',
            listedAs: { envVar: 'ERP_ID', adapter: 'demo-erp' },
        },
    ]),
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

export const mockEnsureAdobeIOAuth = jest.fn();
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: (...a: unknown[]) => mockEnsureAdobeIOAuth(...a),
}));
export const mockDetectProjectOrgMismatch = jest.fn();
jest.mock('@/features/authentication/services/detectProjectOrgMismatch', () => ({
    detectProjectOrgMismatch: (...a: unknown[]) => mockDetectProjectOrgMismatch(...a),
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

// Below the mocks on purpose: the handlers must bind to them.
export { setupMocks } from './dashboardHandlers.testUtils';
// The mocked vscode, as dashboardHandlers.testUtils installs it: a spec importing vscode itself
// before this file would bind to the unmocked module.
import * as vscode from 'vscode';
export { vscode };
export {
    handleFollowErpOrder,
    handleGetErpStatus,
    handleLookupErpRecord,
    handleReadErpApi,
    handleWriteErpApi,
} from '@/features/dashboard/handlers/erpIntegrationHandlers';
export { handleResetErpRecords } from '@/features/dashboard/handlers/erpResetHandlers';
export {
    handleGetErpSettings,
    handleSetErpSettings,
} from '@/features/dashboard/handlers/erpSettingsHandlers';
export {
    handleEndErpDowntime,
    handleGetErpDemoControls,
    handleSetErpAppearance,
    handleStartErpDowntime,
} from '@/features/dashboard/handlers/erpDemoControlHandlers';

export const INT_URLS = {
    'runtime/erp/status': 'https://ns.adobeioruntime.net/api/v1/web/erp/status',
    'runtime/erp/reset': 'https://ns.adobeioruntime.net/api/v1/web/erp/reset',
};
export const INTEGRATION: AppBuilderComponentState = {
    kind: 'integration',
    status: 'deployed',
    name: 'Nordwind integration',
    source: { owner: 'skukla', repo: 'commerce-erp-integration' },
    deployedUrls: INT_URLS,
};
export const ERP_URLS = {
    'runtime/demo-erp/partners': 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/partners',
    'runtime/demo-erp/orders': 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/orders',
};
export const ERP: AppBuilderComponentState = {
    kind: 'system',
    status: 'deployed',
    name: 'Nordwind',
    source: { owner: 'skukla', repo: 'demo-erp' },
    deployedUrls: ERP_URLS,
    url: 'https://ns.adobeio-static.net/index.html',
    lastDeployed: '2026-09-14T00:00:00Z',
};
export function pairProject(over: Partial<AppBuilderComponentState> = {}): Partial<Project> {
    return {
        appBuilderComponents: {
            'erp-integration': { ...INTEGRATION, ...over },
            'demo-erp': { ...ERP },
        },
    };
}

/** setupMocks installs its own auth service; the guard chain's third step needs this on it. */
export function allowDeveloperRole(): void {
    const { ServiceLocator } = require('@/core/di/serviceLocator');
    ServiceLocator.getAuthenticationService().testDeveloperPermissions = jest
        .fn()
        .mockResolvedValue({ hasPermissions: true });
}
export const LIVE = {
    app: { id: 'erp', version: '1' },
    erp: { reachable: true, ok: true },
    erpBaseUrl: 'x',
    ledger: { entries: 3 },
};

/** Each spec calls this from its own beforeEach: a beforeEach here would not reach it. */
export function resetErpHandlerMocks(): void {
    jest.clearAllMocks();
    mockResolveAppManagementAuth.mockResolvedValue({
        accessToken: 'fake-test-pw-not-a-secret',
        imsOrgId: 'ABC@AdobeOrg',
    });
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockDetectProjectOrgMismatch.mockResolvedValue({ reachable: true });
    mockStatus.mockResolvedValue(LIVE);
    mockDetach.mockResolvedValue({
        reverted: { reverted: 2, failed: [] },
        orders: { cleared: 1, failed: [] },
    });
    mockCallErpApi.mockResolvedValue({
        ok: true,
        status: 200,
        body: { wiped: { products: 40 } },
        detail: '',
    });
    mockFillErpForProject.mockResolvedValue({
        status: 'filled',
        erpId: 'demo-erp',
        result: { partners: 3, products: 40, skipped: 0 },
    });
}
