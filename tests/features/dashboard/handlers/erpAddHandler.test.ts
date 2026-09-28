/**
 * erpAddHandler — `addErp`, "Add another ERP" on the ERP integration's card (AB-16).
 *
 * The deploy is the runner's (its own suites); the list PUT and the fill are their services'.
 * Here they are mocked and the assertions are on what each is HANDED: the new ERP's entry
 * (its id, the catalog entry it is made from, the name recorded where its deploy reads it),
 * the link to the integration, the list sync and the fill of that one ERP. The catalog is the
 * real bundled one, so the demo-erp entry's `listedAs` is what the handler reads.
 */

import type { AppBuilderComponentState, Project } from '@/types/base';

const mockResolveAppManagementAuth = jest.fn();
jest.mock('@/features/project-creation/services/appBuilderComponentRunnerDeps', () => ({
    buildDefaultRunnerDeps: jest.fn(() => ({})),
    buildRunnerDepsContext: jest.fn(async () => ({})),
    resolveAppManagementAuth: (...a: unknown[]) => mockResolveAppManagementAuth(...a),
}));

const mockAdd = jest.fn();
jest.mock('@/features/app-builder/services/appBuilderComponentRunner', () => ({
    addAppBuilderComponent: (...a: unknown[]) => mockAdd(...a),
    deployAppBuilderComponent: jest.fn(),
    removeAppBuilderComponent: jest.fn(),
}));

const mockSync = jest.fn();
jest.mock('@/features/project-creation/services/erpListSync', () => ({
    syncErpList: (...a: unknown[]) => mockSync(...a),
}));

const mockFill = jest.fn();
jest.mock('@/features/project-creation/services/erpFillForProject', () => ({
    fillErpForProject: (...a: unknown[]) => mockFill(...a),
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
import { handleAddErp } from '@/features/dashboard/handlers/erpAddHandler';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import { ErrorCode } from '@/types/errorCodes';

const AUTH = { accessToken: 'fake-test-pw-not-a-secret', imsOrgId: 'ABC@AdobeOrg' };

function erpProject(extra: Record<string, AppBuilderComponentState> = {}): Partial<Project> {
    return {
        name: 'bodea',
        appBuilderComponents: {
            'erp-integration': {
                kind: 'integration',
                status: 'deployed',
                catalogId: undefined,
                name: 'Acme ERP Integration',
                systems: ['demo-erp'],
                source: { owner: 'skukla', repo: 'commerce-erp-integration' },
                deployedUrls: { 'runtime/erp/erps': 'https://ns.adobeioruntime.net/api/v1/web/erp/erps' },
            },
            'demo-erp': {
                kind: 'system',
                status: 'deployed',
                name: 'Acme ERP',
                usedBy: 'erp-integration',
                source: { owner: 'skukla', repo: 'demo-erp' },
            },
            ...extra,
        },
    };
}

function setup(project: Partial<Project> = erpProject()) {
    const mocks = setupMocks(project);
    const { ServiceLocator } = require('@/core/di/serviceLocator');
    ServiceLocator.getAuthenticationService().testDeveloperPermissions = jest.fn().mockResolvedValue({ hasPermissions: true });
    return mocks;
}

/** The entry the runner was handed, and the project it was handed with. */
const added = () => mockAdd.mock.calls[0] as [Project, AppBuilderComponentCatalogEntry];

beforeEach(() => {
    jest.clearAllMocks();
    mockResolveAppManagementAuth.mockResolvedValue(AUTH);
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockAdd.mockImplementation(async (project: Project, entry: AppBuilderComponentCatalogEntry) => {
        project.appBuilderComponents = {
            ...project.appBuilderComponents,
            [entry.id]: { kind: 'system', status: 'deployed', catalogId: 'demo-erp', name: 'Brand B ERP', source: { owner: 'skukla', repo: 'demo-erp' } },
        };
        return { success: true };
    });
    mockSync.mockResolvedValue({ status: 'registered', ids: ['erp', 'demo-erp-2'] });
    mockFill.mockResolvedValue({ status: 'filled', result: { partners: 2, products: 10, skipped: 0 }, erpId: 'demo-erp-2' });
});

describe('handleAddErp', () => {
    it('deploys a new demo-erp system named as typed, links it, lists every ERP and fills the new one', async () => {
        const { mockContext } = setup();

        const result = await handleAddErp(mockContext, { id: 'erp-integration', name: 'Brand B ERP' });

        const [project, entry] = added();
        expect(entry).toMatchObject({ id: 'demo-erp-2', catalogId: 'demo-erp', kind: 'system' });
        // Where the ERP's deploy reads its name (its nameFromEnvVar), so its workspace carries it.
        expect(project.componentConfigs?.['demo-erp-2']).toEqual({ ERP_DISPLAY_NAME: 'Brand B ERP' });
        expect(project.appBuilderComponents?.['erp-integration']?.systems).toEqual(['demo-erp', 'demo-erp-2']);
        expect(project.appBuilderComponents?.['demo-erp-2']?.usedBy).toBe('erp-integration');
        expect(mockSync).toHaveBeenCalledWith(project, 'erp-integration', AUTH);
        expect(mockFill).toHaveBeenCalledWith(project, 'erp-integration', expect.any(Object), 'demo-erp-2');
        expect(result).toEqual({
            success: true,
            data: {
                added: { id: 'demo-erp-2', name: 'Brand B ERP', kind: 'system' },
                integration: 'erp-integration',
                erpList: ['erp', 'demo-erp-2'],
            },
        });
    });

    it('refuses a name the project already has, before anything runs', async () => {
        const { mockContext } = setup();

        const result = await handleAddErp(mockContext, { id: 'erp-integration', name: 'acme erp' });

        expect(result).toMatchObject({ success: false, code: ErrorCode.CONFIG_INVALID });
        expect(mockAdd).not.toHaveBeenCalled();
    });

    it('refuses an integration that serves one system only', async () => {
        const { mockContext } = setup(erpProject({ 'starter-kit': { kind: 'integration', status: 'deployed', source: { owner: 'skukla', repo: 'x' } } }));

        const result = await handleAddErp(mockContext, { id: 'starter-kit', name: 'Brand B ERP' });

        expect(result).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
    });

    it('fails the add when the integration could not be told, and says how to finish it', async () => {
        mockSync.mockResolvedValue({ status: 'failed', detail: 'Adobe sign-in required.' });
        const { mockContext } = setup();

        const result = await handleAddErp(mockContext, { id: 'erp-integration', name: 'Brand B ERP' });

        expect(result).toEqual({
            success: false,
            error:
                'Brand B ERP is deployed, but the integration was not told about it: Adobe sign-in required. ' +
                'Add it again with the same name to finish.',
        });
        expect(mockFill).not.toHaveBeenCalled();
    });

    it('adding again with that name finishes it: no second deploy, the list and the fill run', async () => {
        const unfinished = erpProject({
            'demo-erp-2': { kind: 'system', status: 'deployed', catalogId: 'demo-erp', name: 'Brand B ERP', usedBy: 'erp-integration', source: { owner: 'skukla', repo: 'demo-erp' } },
        });
        unfinished.appBuilderComponents!['erp-integration'].systems = ['demo-erp', 'demo-erp-2'];
        const { mockContext } = setup(unfinished);

        const result = await handleAddErp(mockContext, { id: 'erp-integration', name: 'Brand B ERP' });

        expect(mockAdd).not.toHaveBeenCalled();
        expect(mockSync).toHaveBeenCalled();
        expect(mockFill).toHaveBeenCalledWith(expect.any(Object), 'erp-integration', expect.any(Object), 'demo-erp-2');
        expect(result).toMatchObject({ success: true, data: { added: { id: 'demo-erp-2' } } });
    });

    it('adding again finishes one that stopped between its deploy and its link: no second deploy, linked, listed, filled', async () => {
        // The record an add left on Bodea (2026-09-28) when it stopped after the deploy.
        const { mockContext } = setup(erpProject({
            'demo-erp-2': { kind: 'system', status: 'deployed', catalogId: 'demo-erp', name: 'Brand B ERP', source: { owner: 'skukla', repo: 'demo-erp' } },
        }));

        const result = await handleAddErp(mockContext, { id: 'erp-integration', name: 'Brand B ERP' });

        expect(mockAdd).not.toHaveBeenCalled();
        const [project] = mockSync.mock.calls[0] as [Project];
        expect(project.appBuilderComponents?.['erp-integration']?.systems).toEqual(['demo-erp', 'demo-erp-2']);
        expect(mockFill).toHaveBeenCalledWith(expect.any(Object), 'erp-integration', expect.any(Object), 'demo-erp-2');
        expect(result).toMatchObject({ success: true, data: { added: { id: 'demo-erp-2' } } });
    });

    it('a fill that did not finish still adds the ERP, and says so', async () => {
        mockFill.mockResolvedValue({ status: 'failed', detail: 'Commerce answered 401 for products' });
        const { mockContext } = setup();

        const result = await handleAddErp(mockContext, { id: 'erp-integration', name: 'Brand B ERP' });

        expect(result).toMatchObject({
            success: true,
            data: { warning: 'Demo data did not load: Commerce answered 401 for products. Use Load demo data on its card.' },
        });
    });

    it('runs nothing when the guards refuse', async () => {
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false, error: 'Sign in to Adobe first.' });
        const { mockContext } = setup();

        const result = await handleAddErp(mockContext, { id: 'erp-integration', name: 'Brand B ERP' });

        expect(result.success).toBe(false);
        expect(mockAdd).not.toHaveBeenCalled();
    });
});
