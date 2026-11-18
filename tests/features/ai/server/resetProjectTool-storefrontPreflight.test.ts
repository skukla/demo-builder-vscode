/**
 * reset_project on an Edge Delivery project runs the window's reset (PL-104 fix 1, F256): the same
 * pre-flight (the Adobe organization, the AEM Code Sync app), listed as resetting while it runs, and
 * the same block-library and CDN choices, decided by the reset rather than by the door. Where the
 * window would ask, the agent is refused with the reason, and nothing is reset.
 *
 * Faked: the reset's steps (`executeEdsReset`, whose arguments are asserted), the sign-in and org
 * reads behind the service locator, and the App check's answer from AEM.
 */

jest.mock('@/features/eds/services/reset/edsResetService', () => ({
    executeEdsReset: jest.fn(),
}));
jest.mock('@/features/eds/services/reset/edsResetParams', () => ({
    ...jest.requireActual('@/features/eds/services/reset/edsResetParams'),
    extractResetParams: jest.fn(),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(() => ({
        tokenService: { validateToken: jest.fn(async () => ({ valid: true })) },
    })),
    getDaLiveAuthService: jest.fn(() => ({ isAuthenticated: jest.fn(async () => true) })),
    tryCreateDaLiveTokenProvider: jest.fn(() => undefined),
    resolveByomOverlayConfig: jest.fn(() => undefined),
}));
jest.mock('@/features/eds/services/daLive/daLiveTokenProviders', () => ({
    createDaLiveServiceTokenProvider: jest.fn(() => ({})),
}));
const mockResolveApp = jest.fn();
jest.mock('@/features/eds/services/appInstallationResolver', () => ({
    ...jest.requireActual('@/features/eds/services/appInstallationResolver'),
    resolveAppInstallation: (...a: unknown[]) => mockResolveApp(...a),
}));
const mockInspectToken = jest.fn();
const mockGetOrganizations = jest.fn();
const mockGetOrganizationsSdkOnly = jest.fn();
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            getTokenManager: () => ({ inspectToken: mockInspectToken }),
            getOrganizations: mockGetOrganizations,
            getEntityServices: async () => ({
                orgReads: { getOrganizationsSdkOnly: mockGetOrganizationsSdkOnly },
            }),
        })),
        getCommandExecutor: jest.fn(() => ({ execute: jest.fn() })),
    },
}));
jest.mock('@/features/ai/server/adobeTargetStore', () => ({
    runWithAdobeTarget: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import { runningWork } from '@/core/state/projectWorkRunning';
import { extractResetParams } from '@/features/eds/services/reset/edsResetParams';
import { executeEdsReset } from '@/features/eds/services/reset/edsResetService';
import type { Project } from '@/types/base';
import { createMockProject, edsStorefrontInstance } from '../../../helpers/projectFake';
import { callResetProject, getCurrentProject } from './resetProjectTool.testUtils';

const mockedReset = executeEdsReset as jest.MockedFunction<typeof executeEdsReset>;
const mockedParams = extractResetParams as jest.MockedFunction<typeof extractResetParams>;

/** The org the project fake records (`createMockProject`'s `adobe.organization`). */
const ORG = { id: '285361', code: '285361@AdobeOrg', name: 'Acme Demo Org' };
const OTHER = { id: 'org-2@AdobeOrg', code: 'org-2@AdobeOrg', name: 'Someone Else' };

/** An Edge Delivery storefront, recording the Adobe org `ORG`. */
function storefront(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'acme',
        path: '/p/acme-preflight',
        status: 'ready',
        selectedStack: 'eds-paas',
        componentInstances: { 'eds-storefront': edsStorefrontInstance() },
        ...overrides,
    });
}

const confirmed = () => callResetProject({ confirm: true });

beforeEach(() => {
    jest.clearAllMocks();
    mockInspectToken.mockResolvedValue({ valid: true });
    mockGetOrganizations.mockResolvedValue([ORG]);
    mockGetOrganizationsSdkOnly.mockResolvedValue([ORG]);
    mockResolveApp.mockResolvedValue({ kind: 'installed' });
    mockedParams.mockReturnValue({
        success: true,
        params: {
            repoOwner: 'me',
            repoName: 'shop',
            daLiveOrg: 'me',
            daLiveSite: 'shop',
            templateOwner: 't',
            templateRepo: 'tpl',
            project: storefront(),
        },
    });
    mockedReset.mockResolvedValue({
        success: true,
        filesReset: 1,
        contentCopied: 1,
        meshRedeployed: false,
    });
});

describe('reset_project runs the window storefront reset', () => {
    it('restores the block library and checks the CDN, as the Reset button does', async () => {
        getCurrentProject.mockResolvedValue(storefront());

        await confirmed();

        expect(mockedReset.mock.calls[0][0]).toMatchObject({
            includeBlockLibrary: true,
            verifyCdn: true,
        });
    });

    it('is listed as resetting while the reset runs, and not after', async () => {
        const project = storefront();
        getCurrentProject.mockResolvedValue(project);
        let during: string | undefined;
        mockedReset.mockImplementation(async () => {
            during = runningWork(project.path);
            return { success: true };
        });

        await confirmed();

        expect(during).toBe('resetting');
        expect(runningWork(project.path)).toBeUndefined();
    });

    it("refuses, resetting nothing, when the sign-in reaches another org than the project's", async () => {
        getCurrentProject.mockResolvedValue(storefront());
        mockGetOrganizations.mockResolvedValue([OTHER]);

        const res = await confirmed();

        expect(res).toMatchObject({ error_type: 'ORG_MISMATCH', non_retryable: true });
        expect(mockedReset).not.toHaveBeenCalled();
    });

    it('CONTROL: resets when the sign-in reaches the project org', async () => {
        getCurrentProject.mockResolvedValue(storefront());

        expect(await confirmed()).toMatchObject({ reset: true });
    });

    it('asks for the Adobe sign-in on an ACCS storefront with no mesh, as the window does', async () => {
        getCurrentProject.mockResolvedValue(
            storefront({ componentSelections: { backend: 'adobe-commerce-accs' } })
        );
        mockInspectToken.mockResolvedValue({ valid: false });

        expect(await confirmed()).toMatchObject({ needsAuth: 'adobe' });
        expect(mockedReset).not.toHaveBeenCalled();
    });

    it('refuses with the install link, resetting nothing, when the AEM Code Sync app is missing', async () => {
        getCurrentProject.mockResolvedValue(storefront());
        mockResolveApp.mockResolvedValue({ kind: 'not-installed' });

        const res = await confirmed();

        expect(res).toMatchObject({
            reset: false,
            project: 'acme',
            errorType: 'APP_NOT_INSTALLED',
            installUrl: expect.stringContaining('github.com/apps/aem-code-sync'),
        });
        expect(res.error).toContain('me/shop');
        expect(mockedReset).not.toHaveBeenCalled();
    });

    it('carries on when AEM cannot say whether the app is there, as the window does', async () => {
        getCurrentProject.mockResolvedValue(storefront());
        mockResolveApp.mockResolvedValue({ kind: 'undetermined', httpStatus: 503 });

        expect(await confirmed()).toMatchObject({ reset: true });
    });
});
