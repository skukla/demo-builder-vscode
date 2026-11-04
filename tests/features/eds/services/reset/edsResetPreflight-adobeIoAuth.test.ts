/**
 * RENAMED from `edsResetUI-adobeIoAuth.test.ts` on 2026-10-08 (EDS-8 split by job):
 * the Adobe sign-in check moved to `edsResetPreflight.ts`.
 * A suite is paired with the module it is named for. Still driven through the
 * public entry point; no assertion changed in the rename.
 *
 * RENAMED from `edsResetService-auth.test.ts` on 2026-09-07 (PL-45). Every test
 * here drives `resetEdsProjectWithUI`, which is declared in `edsResetUI.ts`; the
 * old name paired the suite with `edsResetService.ts`, so all three were scored
 * against a module they never constrain.
 *
 * Named `-adobeIoAuth` rather than `-auth` because `edsResetPreflight-auth.test.ts`
 * already exists and covers the same function from a different setup; merging the
 * two would mean harmonising two fixture styles for no gain.
 */

import type { Project } from '@/types/base';

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports
// =============================================================================


// Mock ensureAdobeIOAuth (used by refactored checkAdobeAuth)
const mockEnsureAdobeIOAuth = jest.fn();
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: (...args: unknown[]) => mockEnsureAdobeIOAuth(...args),
}));

jest.mock('@/core/validation/PathSafetyValidator', () => ({
    validateProjectPath: jest.fn(),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        QUICK: 5000,
        UI: { MIN_LOADING: 500, NOTIFICATION: 2000 },
    },
}));



// DA.live auth — always authenticated (we're testing Adobe I/O path)

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn().mockReturnValue({ tokenService: {} }),
    getDaLiveAuthService: jest.fn().mockReturnValue({
        getAccessToken: jest.fn().mockResolvedValue('mock-dalive-token'),
    }),
    showDaLiveAuthQuickPick: jest.fn(),
    ensureDaLiveAuth: jest.fn().mockResolvedValue({ authenticated: true }),
}));

// NOT mocked, and it does not need to be: the collaborator is constructed on this
// path and never touched, so the mock silenced nothing. Measured 2026-08-31 by
// stripping it and re-running this suite.

// =============================================================================
// Imports (after mocks)
// =============================================================================

import * as vscode from 'vscode';
import { resetEdsProjectWithUI } from '@/features/eds/services/reset/edsResetUI';
import {
    createResetContext,
    meshDeps,
} from './edsResetService.testUtils';
import { makeDemoPackage, makeStorefront } from '../../../../helpers/demoPackageFixtures';
import { createMockProject } from '../../../../helpers/projectFake';
import { createMockAuthenticationService } from '../../../../helpers/authenticationServiceFake';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { recordSignedInOrg } from '@/features/eds/services/reset/edsResetPreflight';
import type { HandlerContext } from '@/types/handlers';



// Injected demo-packages fixture for extractResetParams (replaces config leaf mock)
const testPackages = [
    makeDemoPackage({
        id: 'citisignal',
        storefronts: {
            'eds-paas': makeStorefront({
                templateOwner: 'test-owner',
                templateRepo: 'test-template',
                contentSource: { org: 'content-org', site: 'content-site', indexPath: 'index.json' },
            }),
        },
    }),
];

// =============================================================================
// Helpers
// =============================================================================

function createProjectWithMesh(adobeContext?: {
    organization?: string;
    projectId?: string;
    workspace?: string;
}): Project {
    return createMockProject({
        name: 'test-project',
        path: '/test/project',
        status: 'running',
        created: new Date(),
        lastModified: new Date(),
        selectedPackage: 'citisignal',
        selectedStack: 'eds-paas',
        adobe: adobeContext,
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: {
                    githubRepo: 'test-org/test-repo',
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-repo',
                },
            },
            'commerce-mesh': {
                id: 'commerce-mesh',
                name: 'API Mesh',
                subType: 'mesh',
                path: '/test/mesh',
                status: 'deployed',
            },
        },
    });
}

// =============================================================================
// Tests
// =============================================================================

describe('resetEdsProjectWithUI - Adobe I/O Auth', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // withProgress executes the callback immediately
        (vscode.window.withProgress as jest.Mock).mockImplementation(async (_options, callback) => {
            return callback({ report: jest.fn() });
        });
    });

    it('should call ensureAdobeIOAuth with project adobe context when mesh project resets', async () => {
        // Given: Project with mesh and Adobe context
        const project = createProjectWithMesh({
            organization: 'org-123',
            projectId: 'proj-456',
            workspace: 'workspace-789',
        });
        const context = createResetContext(project);

        // And: ensureAdobeIOAuth returns failed (causes early return)
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });

        // And: User confirms reset
        (vscode.window.showWarningMessage as jest.Mock)
            .mockResolvedValueOnce('Reset Project');

        // When
        const result = await resetEdsProjectWithUI({ meshDeps, project, context, packages: testPackages });

        // Then: Should call ensureAdobeIOAuth with project context
        expect(mockEnsureAdobeIOAuth).toHaveBeenCalledWith(
            expect.objectContaining({
                projectContext: expect.objectContaining({
                    organization: 'org-123',
                    projectId: 'proj-456',
                    workspace: 'workspace-789',
                }),
            }),
        );

        // And: Should return auth error since auth failed
        expect(result.success).toBe(false);
        expect(result.errorType).toBe('ADOBE_AUTH_REQUIRED');
    });

    it('should pass partial adobe fields gracefully (org set, ids undefined)', async () => {
        // Given: an Adobe-context project (a mesh IS an Adobe I/O project) whose
        // projectId/workspace happen to be undefined. The org alone arms the gate.
        const project = createProjectWithMesh({ organization: 'org-123' });
        const context = createResetContext(project);

        // And: ensureAdobeIOAuth returns failed (early return, before any reset work)
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });

        (vscode.window.showWarningMessage as jest.Mock)
            .mockResolvedValueOnce('Reset Project');

        // When
        await resetEdsProjectWithUI({ meshDeps, project, context, packages: testPackages });

        // Then: ensureAdobeIOAuth is called with the org set and the ids undefined
        expect(mockEnsureAdobeIOAuth).toHaveBeenCalledWith(
            expect.objectContaining({
                projectContext: expect.objectContaining({
                    organization: 'org-123',
                    projectId: undefined,
                    workspace: undefined,
                }),
            }),
        );
    });

    // An ACCS project with no recorded org signs in too (owner, 2026-11-04, F11): its backend
    // needs the org's IMS permission, and the reset records the org the sign-in lands in.
    it('asks an ACCS project with no recorded org to sign in', async () => {
        const project = createMockProject({
            ...createProjectWithMesh(),
            adobe: {},
            componentSelections: { backend: 'adobe-commerce-accs' },
        });
        const context = createResetContext(project);
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValueOnce('Reset Project');

        const result = await resetEdsProjectWithUI({ meshDeps, project, context, packages: testPackages });

        expect(mockEnsureAdobeIOAuth).toHaveBeenCalled();
        expect(result.errorType).toBe('ADOBE_AUTH_REQUIRED');
    });

    it('asks a PaaS project with no recorded org nothing (control)', async () => {
        const project = createMockProject({
            ...createProjectWithMesh(),
            adobe: {},
            componentSelections: { backend: 'adobe-commerce-paas' },
        });
        const context = createResetContext(project);
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValueOnce('Reset Project');

        // The run goes on past the Adobe step to the GitHub app check, which this suite does not
        // set up; it is the Adobe step that is in question, and it comes first.
        await resetEdsProjectWithUI({ meshDeps, project, context, packages: testPackages }).catch(() => undefined);

        expect(mockEnsureAdobeIOAuth).not.toHaveBeenCalled();
    });
});

/**
 * A reset gives an ACCS project with no recorded Adobe organization the org its sign-in lands in
 * (owner, 2026-11-04, F11). The org is the TOKEN's (`getOrganizationsSdkOnly()[0]`), never the
 * CLI's stale selection: the token is org-bound (the `adobe-org-context` model).
 */
describe('recordSignedInOrg', () => {
    const contextFor = (): HandlerContext => createMockHandlerContext({ logger: createMockLogger() });
    const authLandingIn = (orgs: Array<{ id: string; code: string; name: string }> | undefined) =>
        createMockAuthenticationService({}, {
            entities: { orgReads: { getOrganizationsSdkOnly: jest.fn().mockResolvedValue(orgs) } },
        });

    it('records the org the sign-in reaches, by id and name, and saves the project', async () => {
        const project = createMockProject({ adobe: {} });
        const context = contextFor();

        await recordSignedInOrg(project, context, authLandingIn([{ id: 'ORG1@AdobeOrg', code: 'C1', name: 'Adobe Demo System' }]), '[Reset]');

        expect(project.adobe).toMatchObject({ organization: 'ORG1@AdobeOrg', organizationName: 'Adobe Demo System' });
        expect(context.stateManager.saveProject).toHaveBeenCalledWith(project);
    });

    it('records nothing when the SDK cannot say which org, and the reset goes on', async () => {
        const project = createMockProject({ adobe: {} });
        const context = contextFor();

        await recordSignedInOrg(project, context, authLandingIn(undefined), '[Reset]');

        expect(project.adobe?.organization).toBeUndefined();
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('leaves an org already recorded alone', async () => {
        const project = createMockProject({ adobe: { organization: 'ORG-KEPT' } });
        const context = contextFor();

        await recordSignedInOrg(project, context, authLandingIn([{ id: 'ORG-OTHER', code: 'C2', name: 'Other' }]), '[Reset]');

        expect(project.adobe?.organization).toBe('ORG-KEPT');
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    });
});
