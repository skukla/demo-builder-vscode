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

import { handleSwitchOrg } from '@/features/dashboard/handlers/dashboardHandlers';
import { setupMocks } from './dashboardHandlers.testUtils';

describe('dashboardHandlers - handleSwitchOrg', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);
    });

    it('performs a FORCED login then refreshes status (verify) on success', async () => {
        const { mockContext } = setupMocks({ meshStatusSummary: 'deployed' } as any);

        const loginAndRestoreProjectContext = jest.fn().mockResolvedValue(true);
        const { ServiceLocator } = require('@/core/di');
        ServiceLocator.getAuthenticationService.mockReturnValue({
            isAuthenticated: jest.fn().mockResolvedValue(true),
            loginAndRestoreProjectContext,
            // After the switch the token now reaches the project org → no mismatch.
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
        // Verified clean — status refreshed, no mismatch surfaced.
        expect(result.success).toBe(true);
        expect((result.data as { orgMismatch?: unknown }).orgMismatch).toBeUndefined();
    });

    it('persists the mismatch (no silent loop) when still in the wrong org after switch', async () => {
        const { mockContext } = setupMocks({ meshStatusSummary: 'deployed' } as any);

        const { ServiceLocator } = require('@/core/di');
        ServiceLocator.getAuthenticationService.mockReturnValue({
            isAuthenticated: jest.fn().mockResolvedValue(true),
            loginAndRestoreProjectContext: jest.fn().mockResolvedValue(true),
            // Still in the wrong org (e.g. another browser tab reasserted it).
            getOrganizations: jest.fn().mockResolvedValue([
                { id: 'org999', code: 'OTHER@AdobeOrg', name: 'Other Org' },
            ]),
            getCurrentOrganization: jest.fn().mockResolvedValue({ id: 'org999', name: 'Other Org' }),
        });

        const result = await handleSwitchOrg(mockContext);

        expect(result.success).toBe(true);
        expect((result.data as { orgMismatch?: unknown }).orgMismatch).toEqual({
            expectedOrg: 'org123',
            currentOrg: 'Other Org',
        });
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
