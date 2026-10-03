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

// The reader of an added ERP's own credential (AB-16a): what it is built from is asserted,
// and the reader it answers is a sentinel whose hand-off to the list sync is asserted.
const mockReader = jest.fn();
const readCredential = jest.fn();
jest.mock('@/features/app-builder/services/erpCredential', () => ({
    erpCredentialReader: (...a: unknown[]) => mockReader(...a),
}));

const mockFill = jest.fn();
jest.mock('@/features/project-creation/services/erpFillForProject', () => ({
    fillErpForProject: (...a: unknown[]) => mockFill(...a),
}));

// Which products the new ERP owns (AB-64): the options read when the caller gave no rule, and
// the save of each ERP's rule, asserted on what it is HANDED and on its order against the fill.
const mockReadOptions = jest.fn();
const mockSaveOwnership = jest.fn();
jest.mock('@/features/project-creation/services/erpOwnershipSync', () => ({
    readErpOwnershipOptionsForProject: (...a: unknown[]) => mockReadOptions(...a),
    saveErpOwnership: (...a: unknown[]) => mockSaveOwnership(...a),
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
import type { ErpOwnershipOptions, ErpOwnsRule } from '@/types/erpOwnership';
import { ErrorCode } from '@/types/errorCodes';

const CACHED_ORG = { id: 'org-1', code: 'ABC@AdobeOrg', name: 'Fake Org' };
const EXECUTOR = { execute: jest.fn() };

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
    ServiceLocator.getAuthenticationService().getCachedOrganization = jest.fn(() => CACHED_ORG);
    ServiceLocator.getCommandExecutor.mockReturnValue(EXECUTOR);
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
    mockReader.mockReturnValue(readCredential);
    mockSync.mockResolvedValue({ status: 'registered', ids: ['erp', 'demo-erp-2'], warnings: [] });
    mockFill.mockResolvedValue({ status: 'filled', result: { partners: 2, products: 10, skipped: 0 }, erpId: 'demo-erp-2' });
    mockReadOptions.mockResolvedValue(OPTIONS);
    mockSaveOwnership.mockResolvedValue(undefined);
});

/** The store as the options read answers it: two websites, the first ERP still owning everything. */
const OPTIONS: ErpOwnershipOptions = {
    websites: [{ code: 'base', name: 'Main Website' }, { code: 'justrite', name: 'Justrite' }],
    sources: [{ code: 'default', name: 'Default Source' }],
    products: [],
    erps: [{ erp: 'acme', name: 'Acme ERP', owns: { mode: 'all' } }],
    takenListIds: ['acme'],
};

/** A rule given outright, so the notes are only the fill's and the list's (AB-64 has its own cases). */
const OWN_ATTRIBUTE: ErpOwnsRule = { mode: 'attribute', attribute: 'erp_owner=brand-b' };

/** The order the list, the ownership save and the fill ran in. */
function ranInOrder(): string[] {
    const calls = [
        ...mockSync.mock.invocationCallOrder.map((n) => [n, 'list'] as const),
        ...mockSaveOwnership.mock.invocationCallOrder.map((n) => [n, 'owns'] as const),
        ...mockFill.mock.invocationCallOrder.map((n) => [n, 'fill'] as const),
    ];
    return calls.sort((a, b) => a[0] - b[0]).map(([, name]) => name);
}

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
        expect(mockReader).toHaveBeenCalledWith(EXECUTOR, project, CACHED_ORG);
        expect(mockSync).toHaveBeenCalledWith(project, 'erp-integration', AUTH, { readCredential });
        expect(mockFill).toHaveBeenCalledWith(project, 'erp-integration', expect.any(Object), 'demo-erp-2');
        expect(result).toEqual({
            success: true,
            data: {
                added: { id: 'demo-erp-2', name: 'Brand B ERP', kind: 'system' },
                integration: 'erp-integration',
                erpList: ['erp', 'demo-erp-2'],
                owns: { erp: 'brand-b', rule: { mode: 'websites', websites: ['base'] }, describe: 'products sold on base' },
                existingOwns: [{ erp: 'acme', rule: { mode: 'websites', websites: ['justrite'] }, describe: 'products sold on justrite' }],
                warning: "Acme ERP's products change at its next Reset ERPs or Load demo data.",
            },
        });
    });

    describe('which products the new ERP owns (AB-64)', () => {
        it('saves the rule the SC chose, and the existing ERPs\' rules sent with it, after the list and before the fill', async () => {
            const { mockContext } = setup();

            const result = await handleAddErp(mockContext, {
                id: 'erp-integration',
                name: 'Brand B ERP',
                owns: { mode: 'websites', websites: ['justrite'] },
                existingOwns: [{ erp: 'acme', owns: { mode: 'attribute', attribute: 'erp_owner=acme' } }],
            });

            // The new ERP's list id is derived from its name (AB-51), never guessed by the dialog.
            expect(mockSaveOwnership).toHaveBeenCalledWith(expect.any(Object), [
                { erp: 'brand-b', owns: { mode: 'websites', websites: ['justrite'] } },
                { erp: 'acme', owns: { mode: 'attribute', attribute: 'erp_owner=acme' } },
            ]);
            expect(ranInOrder()).toEqual(['list', 'owns', 'fill']);
            // A rule given is not read for: the dialog already read the options.
            expect(mockReadOptions).not.toHaveBeenCalled();
            expect(result).toMatchObject({
                success: true,
                data: {
                    owns: { erp: 'brand-b', rule: { mode: 'websites', websites: ['justrite'] }, describe: 'products sold on justrite' },
                    existingOwns: [{ erp: 'acme', describe: 'products whose erp_owner is acme' }],
                },
            });
        });

        it('with no rule given (the agent surface), reads the store and applies the default: the first unowned website, the first ERP given the rest', async () => {
            const { mockContext } = setup();

            await handleAddErp(mockContext, { id: 'erp-integration', name: 'Brand B ERP' });

            expect(mockReadOptions).toHaveBeenCalledWith(expect.any(Object), 'erp-integration', AUTH, expect.any(Object));
            expect(mockSaveOwnership).toHaveBeenCalledWith(expect.any(Object), [
                { erp: 'brand-b', owns: { mode: 'websites', websites: ['base'] } },
                { erp: 'acme', owns: { mode: 'websites', websites: ['justrite'] } },
            ]);
        });

        it('with one website, the default is the attribute for both ERPs', async () => {
            mockReadOptions.mockResolvedValue({ ...OPTIONS, websites: [OPTIONS.websites[0]] });
            const { mockContext } = setup();

            const result = await handleAddErp(mockContext, { id: 'erp-integration', name: 'Brand B ERP' });

            expect(mockSaveOwnership).toHaveBeenCalledWith(expect.any(Object), [
                { erp: 'brand-b', owns: { mode: 'attribute', attribute: 'erp_owner=brand-b' } },
                { erp: 'acme', owns: { mode: 'attribute', attribute: 'erp_owner=acme' } },
            ]);
            expect(result).toMatchObject({ success: true, data: { owns: { describe: 'products whose erp_owner is brand-b' } } });
        });

        it('an existing ERP with a rule of its own is left alone, and no warning says its products change', async () => {
            mockReadOptions.mockResolvedValue({ ...OPTIONS, erps: [{ erp: 'acme', name: 'Acme ERP', owns: { mode: 'websites', websites: ['base'] } }] });
            const { mockContext } = setup();

            const result = await handleAddErp(mockContext, { id: 'erp-integration', name: 'Brand B ERP' });

            expect(mockSaveOwnership).toHaveBeenCalledWith(expect.any(Object), [
                { erp: 'brand-b', owns: { mode: 'websites', websites: ['justrite'] } },
            ]);
            expect(result).toMatchObject({ success: true, data: { existingOwns: [] } });
            expect((result.data as { warning?: string }).warning).toBeUndefined();
        });

        it('a rule that cannot be saved is refused before anything runs', async () => {
            const { mockContext } = setup();

            const result = await handleAddErp(mockContext, { id: 'erp-integration', name: 'Brand B ERP', owns: { mode: 'websites', websites: [] } });

            expect(result).toMatchObject({ success: false, code: ErrorCode.CONFIG_INVALID, error: 'Tick at least one website.' });
            expect(mockAdd).not.toHaveBeenCalled();
        });

        it('a save the integration refused fails the add before the fill, and says how to finish it', async () => {
            mockSaveOwnership.mockRejectedValue(new Error("brand-b's ownership was not saved: ERP erps answered 500: boom"));
            const { mockContext } = setup();

            const result = await handleAddErp(mockContext, { id: 'erp-integration', name: 'Brand B ERP', owns: { mode: 'all' } });

            expect(result).toEqual({
                success: false,
                error:
                    "Brand B ERP is deployed and listed, but brand-b's ownership was not saved: ERP erps answered 500: boom. " +
                    'Add it again with the same name to finish.',
            });
            expect(mockFill).not.toHaveBeenCalled();
        });

        it('a store the options could not be read from (no rule given) fails the add the same way', async () => {
            mockReadOptions.mockResolvedValue({ refusal: 'No Commerce credential on this project.' });
            const { mockContext } = setup();

            const result = await handleAddErp(mockContext, { id: 'erp-integration', name: 'Brand B ERP' });

            expect(result).toMatchObject({ success: false, error: expect.stringContaining('No Commerce credential on this project.') });
            expect(mockFill).not.toHaveBeenCalled();
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
        // The repair for an ERP added before AB-16a: the list goes again, WITH its credential.
        expect(mockSync).toHaveBeenCalledWith(expect.any(Object), 'erp-integration', AUTH, { readCredential });
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

        const result = await handleAddErp(mockContext, { id: 'erp-integration', name: 'Brand B ERP', owns: OWN_ATTRIBUTE });

        expect(result).toMatchObject({
            success: true,
            data: { warning: 'Demo data did not load: Commerce answered 401 for products. Use Load demo data on its card.' },
        });
    });

    it("a fill whose prices were not published still adds the ERP, and says so (AB-26z)", async () => {
        const note = 'Demo data loaded; prices were not published: ERP prices answered 500: boom. Load demo data again to retry.';
        mockFill.mockResolvedValue({ status: 'filled', result: { partners: 2, products: 10, skipped: 0 }, erpId: 'demo-erp-2', note });
        const { mockContext } = setup();

        const result = await handleAddErp(mockContext, { id: 'erp-integration', name: 'Brand B ERP', owns: OWN_ATTRIBUTE });

        expect(result).toMatchObject({ success: true, data: { added: { id: 'demo-erp-2' }, warning: note } });
    });

    it("a credential the list could not carry still adds the ERP, and says so beside the fill's note", async () => {
        const warning = "Brand B ERP's credential could not be read; the integration cannot reach it: boom.";
        mockSync.mockResolvedValue({ status: 'registered', ids: ['erp', 'demo-erp-2'], warnings: [warning] });
        mockFill.mockResolvedValue({ status: 'failed', detail: 'Commerce answered 401 for products' });
        const { mockContext } = setup();

        const result = await handleAddErp(mockContext, { id: 'erp-integration', name: 'Brand B ERP', owns: OWN_ATTRIBUTE });

        expect(result).toMatchObject({
            success: true,
            data: { warning: `${warning} Demo data did not load: Commerce answered 401 for products. Use Load demo data on its card.` },
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
