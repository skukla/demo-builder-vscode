/**
 * erpFillHandler.testUtils — the mock preamble, fixtures and SUT import shared by the
 * `loadErpDemoData` specs (erpFillHandler.test.ts, erpFillHandler-prices.test.ts). Owns the
 * SUT import so every `jest.mock` here binds before the handler loads; specs import from
 * here and never reach for the handler themselves.
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
        resolvedSettings = (codes: string[], erp?: string) => mockResolvedSettings(codes, erp);
        keepsKeyMap = () => true;
        readKeyMap = () => mockReadKeyMap();
        replaceKeyMap = (entries: unknown) => mockReplaceKeyMap(entries);
        publishesPrices = () => mockPublishesPrices();
        publishPrices = (erpId?: string, onProgress?: (line: string) => void) =>
            mockPublishPrices(erpId, onProgress);
        keepsErpList = () => mockKeepsErpList();
        listErps = () => mockListErps();
        updateErpSettings = (id: string, website: string | undefined, values: unknown) =>
            mockUpdateErpSettings(id, website, values);
    },
}));
// Unset (a deployment before `erp/erps`), the mapping step is skipped: the suites above run as before.
const mockKeepsErpList = jest.fn();
const mockListErps = jest.fn();
const mockUpdateErpSettings = jest.fn();
const mockReadKeyMap = jest.fn();
const mockReplaceKeyMap = jest.fn();
const mockPublishesPrices = jest.fn();
const mockPublishPrices = jest.fn();

const mockFillErp = jest.fn();
jest.mock('@/features/app-builder/services/erpFill', () => ({
    fillErp: (...args: unknown[]) => mockFillErp(...args),
}));

// The ownership pass (AB-70) reads the store and each ERP's rule, then each ERP's products:
// here the rules are read off the project's ERPs (everything each), the ERPs hold nothing, so
// the pass is the fills, which this suite drives for real.
jest.mock('@/features/project-creation/services/erpOwnershipSync', () => ({
    readErpOwnershipOptionsForProject: async (project: { appBuilderComponents?: Record<string, { kind?: string; name?: string }> }) => {
        const { erpListIdOf } = jest.requireActual('@/features/app-builder/services/erpList');
        const { getAppBuilderComponentCatalog } = require('@/features/components/services/appBuilderComponentCatalogLoader');
        const erps = Object.entries(project.appBuilderComponents ?? {})
            .filter(([, state]) => state.kind === 'system')
            .map(([id, state]) => ({ erp: erpListIdOf(project, id, getAppBuilderComponentCatalog()), name: state.name, owns: { mode: 'all' } }));
        return { websites: [], products: [], erps, takenListIds: erps.map((erp) => erp.erp) };
    },
    saveErpOwnership: jest.fn(),
}));
const mockListErpProducts = jest.fn();
jest.mock('@/features/app-builder/services/erpProducts', () => ({
    DISCONTINUED: 'discontinued',
    listErpProducts: (...a: unknown[]) => mockListErpProducts(...a),
    discontinueErpProduct: jest.fn(),
}));

const mockResolveRestTarget = jest.fn();
const mockRequestRest = jest.fn();
jest.mock('@/features/ai/server/commerceRestClient', () => ({
    resolveRestTargetFor: (...args: unknown[]) => mockResolveRestTarget(...args),
    requestRest: (...args: unknown[]) => mockRequestRest(...args),
}));

jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
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

const mockEnsureAdobeIOAuth = jest.fn();
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: (...a: unknown[]) => mockEnsureAdobeIOAuth(...a),
}));
jest.mock('@/features/authentication/services/detectProjectOrgMismatch', () => ({
    detectProjectOrgMismatch: jest.fn(async () => ({ reachable: true })),
}));
jest.mock('@/features/dashboard/handlers/statusHandlers', () => ({
    handleRequestStatus: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        refreshStatus: jest.fn(),
    },
}));
jest.mock('@/features/dashboard/services/projectPanelPushes', () => ({
    sendAppBuilderComponentStatusUpdate: jest.fn(),
    sendAppBuilderComponentsSnapshot: jest.fn(),
}));

import { setupMocks } from './dashboardHandlers.testUtils';
import type { ErpFillDeps } from '@/features/app-builder/services/erpFill';
import { ErpIntegrationApiError } from '@/features/app-builder/services/erpIntegrationClient';
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
                deployedUrls: {
                    'runtime/erp/status': 'https://ns.adobeioruntime.net/api/v1/web/erp/status',
                },
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
    ServiceLocator.getAuthenticationService().testDeveloperPermissions = jest
        .fn()
        .mockResolvedValue({ hasPermissions: true });
    return mocks;
}

/** The deps the handler handed the fill, from its first call. */
const handedDeps = (): ErpFillDeps => mockFillErp.mock.calls[0][0] as ErpFillDeps;

/** Every mock as the specs read it, plus the fixtures and the SUT (owned here so the mocks bind first). */
export {
    AUTH,
    ERP_URLS,
    TARGET,
    ErrorCode,
    ErpIntegrationApiError,
    handedDeps,
    handleLoadErpDemoData,
    mockCallErpApi,
    mockFillErp,
    mockKeepsErpList,
    mockListErps,
    mockPublishPrices,
    mockPublishesPrices,
    mockReadKeyMap,
    mockReplaceKeyMap,
    mockRequestRest,
    mockResolveRestTarget,
    mockResolvedSettings,
    mockUpdateErpSettings,
    pairProject,
    setup,
};
export type { ErpFillDeps };

/** Each spec's beforeEach: cleared mocks, a signed-in SC, a fill of 182 products and a clean publish. */
export function resetFillMocks(): void {
    jest.clearAllMocks();
    mockResolveAppManagementAuth.mockResolvedValue(AUTH);
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockResolveRestTarget.mockResolvedValue(TARGET);
    mockListErpProducts.mockResolvedValue([]);
    mockFillErp.mockResolvedValue({ partners: 4, products: 182, skipped: 0 });
    mockPublishesPrices.mockReturnValue(true);
    mockPublishPrices.mockResolvedValue({
        erps: ['northwind'],
        written: 6,
        removed: 1,
        unchanged: 2,
        skipped: [],
        failed: [],
    });
}
