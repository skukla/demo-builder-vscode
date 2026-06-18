/**
 * Tests for handleSwitchOrg — forced Adobe account/org switch recovery.
 *
 * IMS tokens are org-bound and a non-forced login silently reuses the browser's
 * SSO session (which can loop back to the wrong org). So the org-switch recovery
 * MUST perform a FORCED sign-in, then re-run the proactive status check to
 * verify the landed org — if it's still wrong the banner persists (no silent
 * loop). The "verify" is the status refresh: handleSwitchOrg returns the fresh
 * status payload, which carries orgMismatch again when still mismatched.
 */

jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
    },
}));
jest.mock('@/features/mesh/services/stalenessDetector');
jest.mock('@/features/authentication');
jest.mock('@/features/mesh/services/meshVerifier', () => ({
    verifyMeshDeployment: jest.fn().mockResolvedValue(undefined),
    syncMeshStatus: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/core/validation', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
    validateURL: jest.fn(),
}));
jest.mock('vscode', () => ({
    window: {
        activeColorTheme: { kind: 1 },
        showWarningMessage: jest.fn().mockResolvedValue('Cancel'),
    },
    ColorThemeKind: { Dark: 2, Light: 1 },
    commands: { executeCommand: jest.fn() },
    env: { openExternal: jest.fn() },
    Uri: { parse: jest.fn((url: string) => ({ toString: () => url })) },
}), { virtual: true });

import { handleSwitchOrg, runOrgContextCheck } from '@/features/dashboard/handlers/dashboardHandlers';
import { setupMocks } from './dashboardHandlers.testUtils';

/** Flush pending microtasks so the async (awaited) org check completes. */
const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

describe('dashboardHandlers - handleSwitchOrg', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);
    });

    it('performs a FORCED login then refreshes status, triggering an org re-check', async () => {
        const { mockContext } = setupMocks({ meshStatusSummary: 'deployed' } as any);

        const loginAndRestoreProjectContext = jest.fn().mockResolvedValue(true);
        const { ServiceLocator } = require('@/core/di');
        ServiceLocator.getAuthenticationService.mockReturnValue({
            isAuthenticated: jest.fn().mockResolvedValue(true),
            loginAndRestoreProjectContext,
            getOrganizations: jest.fn().mockResolvedValue([
                { id: 'org123', code: 'ORG@AdobeOrg', name: 'Project Org' },
            ]),
            getCurrentOrganization: jest.fn().mockResolvedValue({ id: 'org123', name: 'Project Org' }),
        });

        const result = await handleSwitchOrg(mockContext);

        // Forced sign-in (force=true) targeting the project's context.
        expect(loginAndRestoreProjectContext).toHaveBeenCalledWith(
            {
                organization: 'org123',
                projectId: 'project123',
                workspace: 'workspace123',
            },
            true,
        );
        expect(result.success).toBe(true);
        // The org re-check is triggered (decoupled, async) — it telegraphs first.
        expect(mockContext.panel!.webview.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'orgContextResult', payload: { pending: true } }),
        );
    });

    it('returns failure when the forced sign-in is cancelled', async () => {
        const { mockContext } = setupMocks();

        const { ServiceLocator } = require('@/core/di');
        ServiceLocator.getAuthenticationService.mockReturnValue({
            loginAndRestoreProjectContext: jest.fn().mockResolvedValue(false),
        });

        const result = await handleSwitchOrg(mockContext);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/cancel/i);
    });

    it('returns PROJECT_NOT_FOUND when there is no current project', async () => {
        const { mockContext } = setupMocks();
        mockContext.stateManager.getCurrentProject = jest.fn().mockResolvedValue(null);

        const result = await handleSwitchOrg(mockContext);

        expect(result).toEqual({
            success: false,
            error: 'No project available',
            code: 'PROJECT_NOT_FOUND',
        });
    });
});

describe('dashboardHandlers - runOrgContextCheck (decoupled org check)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('posts pending, then the resolved mismatch naming both orgs', async () => {
        // Project has a persisted org name → the banner can name the expected org.
        const { mockContext, mockProject } = setupMocks({
            adobe: { organization: 'org123', organizationName: 'CitiSignal Org' },
        } as any);
        const { ServiceLocator } = require('@/core/di');
        ServiceLocator.getAuthenticationService.mockReturnValue({
            getOrganizations: jest.fn().mockResolvedValue([
                { id: 'org999', code: 'OTHER@AdobeOrg', name: 'Other Org' },
            ]),
        });

        await runOrgContextCheck(mockContext, mockProject);
        await flushAsync();

        expect(mockContext.panel!.webview.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'orgContextResult', payload: { pending: true } }),
        );
        expect(mockContext.panel!.webview.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'orgContextResult',
                payload: {
                    pending: false,
                    orgMismatch: { expectedOrg: 'org123', expectedOrgName: 'CitiSignal Org', currentOrg: 'Other Org' },
                    currentOrg: 'Other Org',
                },
            }),
        );
    });

    it('resolves with no mismatch and backfills the org name when reachable', async () => {
        // mockProject org is org123 with NO persisted name → backfill on reachable.
        const { mockContext, mockProject } = setupMocks();
        const { ServiceLocator } = require('@/core/di');
        ServiceLocator.getAuthenticationService.mockReturnValue({
            getOrganizations: jest.fn().mockResolvedValue([
                { id: 'org123', code: 'ORG@AdobeOrg', name: 'Project Org' },
            ]),
        });

        await runOrgContextCheck(mockContext, mockProject);
        await flushAsync();

        expect(mockContext.panel!.webview.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'orgContextResult',
                payload: { pending: false, orgMismatch: undefined, currentOrg: 'Project Org' },
            }),
        );
        // Backfilled the org name to the manifest (one-time, manifest-only write).
        expect(mockProject.adobe?.organizationName).toBe('Project Org');
        expect(mockContext.stateManager.saveProjectConfigOnly).toHaveBeenCalledWith(mockProject);
    });

    it('self-heals a legacy name-stored org to the canonical id when reachable', async () => {
        // Legacy project: organization holds the NAME, not the id.
        const { mockContext, mockProject } = setupMocks({
            adobe: { organization: 'Acme Org' },
        } as any);
        const { ServiceLocator } = require('@/core/di');
        ServiceLocator.getAuthenticationService.mockReturnValue({
            getOrganizations: jest.fn().mockResolvedValue([
                { id: 'org-real', code: 'ACME@AdobeOrg', name: 'Acme Org' },
            ]),
        });

        await runOrgContextCheck(mockContext, mockProject);
        await flushAsync();

        // Reachable (matched by name) → no mismatch surfaced.
        expect(mockContext.panel!.webview.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'orgContextResult',
                payload: { pending: false, orgMismatch: undefined, currentOrg: 'Acme Org' },
            }),
        );
        // Healed: organization migrated to the canonical id, name persisted.
        expect(mockProject.adobe?.organization).toBe('org-real');
        expect(mockProject.adobe?.organizationName).toBe('Acme Org');
        expect(mockContext.stateManager.saveProjectConfigOnly).toHaveBeenCalledWith(mockProject);
    });

    it('is a no-op for a project with no Adobe org', async () => {
        const { mockContext } = setupMocks();
        const projectNoAdobe = { name: 'p', path: '/p' } as any;

        await runOrgContextCheck(mockContext, projectNoAdobe);
        await flushAsync();

        expect(mockContext.panel!.webview.postMessage).not.toHaveBeenCalledWith(
            expect.objectContaining({ type: 'orgContextResult' }),
        );
    });
});
