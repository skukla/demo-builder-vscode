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
        getStateManager: jest.fn(() => ({ saveProjectConfigOnly: jest.fn().mockResolvedValue(undefined) })),
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
import { CHECK_RESULT_MESSAGE } from '@/types/messages';
import { setupMocks } from './dashboardHandlers.testUtils';

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
            // SDK-only read (the non-interactive on-open probe).
            getOrganizationsSdkOnly: jest.fn().mockResolvedValue([
                { id: 'org123', code: 'ORG@AdobeOrg', name: 'Project Org' },
            ]),
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
        // The org re-check is triggered (decoupled, async) — it telegraphs first
        // on the unified checkResult channel. reRunnable lets it re-run after the
        // forced switch (the per-session guard would otherwise block it).
        expect(mockContext.panel!.webview.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: CHECK_RESULT_MESSAGE,
                payload: expect.objectContaining({ checkId: 'org-context', status: 'pending' }),
            }),
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

// The org-context check itself (pending → ok/warning/unknown, self-heal,
// non-interactive P1 contract) is owned by the orchestrator and is covered in
// onOpenChecks/orgContextCheck.test.ts + onOpenChecks/orchestrator.test.ts. This
// file only asserts that handleSwitchOrg re-triggers it via the status refresh.
