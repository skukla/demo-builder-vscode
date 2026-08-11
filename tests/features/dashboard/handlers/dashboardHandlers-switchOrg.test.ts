/**
 * Tests for the DASHBOARD's handleSwitchOrg — its COMPOSITION, not the sign-in.
 *
 * The forced sign-in itself moved to `features/authentication` (three panels need
 * it) and is covered by `authentication/handlers/orgSwitchHandler.test.ts`. What
 * is dashboard-specific, and what this suite pins, is the pair around it: a
 * project guard in front, and a status re-check behind. That re-check IS the
 * verification — it re-runs the proactive org-mismatch detection, so if the user
 * lands in the wrong org again the banner persists instead of silently looping.
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
        // The forced sign-in runs behind the browser-opening notification
        // (withBrowserSignInNotice) — run the task straight through.
        withProgress: jest.fn(async (_options: unknown, task: () => unknown) => task()),
    },
    ProgressLocation: { Notification: 15, Window: 10, SourceControl: 1 },
    ColorThemeKind: { Dark: 2, Light: 1 },
    commands: { executeCommand: jest.fn() },
    env: { openExternal: jest.fn() },
    Uri: { parse: jest.fn((url: string) => ({ toString: () => url })) },
}), { virtual: true });

import { handleSwitchOrg } from '@/features/dashboard/handlers/dashboardHandlers';
import { CHECK_RESULT_MESSAGE } from '@/types/messages';
import { setupMocks } from './dashboardHandlers.testUtils';

describe('dashboardHandlers - handleSwitchOrg', () => {
    /** The authentication-owned forced sign-in this handler composes around. */
    function forcedSwitch(): jest.Mock {
        const { handleForcedOrgSwitch } = require('@/features/authentication');
        return handleForcedOrgSwitch as jest.Mock;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);
        forcedSwitch().mockResolvedValue({ success: true });
    });

    it('delegates the forced sign-in, then refreshes status to trigger an org re-check', async () => {
        const { mockContext } = setupMocks({ meshStatusSummary: 'deployed' } as any);
        const { ServiceLocator } = require('@/core/di');
        ServiceLocator.getAuthenticationService.mockReturnValue({
            isAuthenticated: jest.fn().mockResolvedValue(true),
            // SDK-only read (the non-interactive on-open probe).
            getOrganizationsSdkOnly: jest
                .fn()
                .mockResolvedValue([{ id: 'org123', code: 'ORG@AdobeOrg', name: 'Project Org' }]),
        });

        const result = await handleSwitchOrg(mockContext);

        expect(forcedSwitch()).toHaveBeenCalledWith(mockContext);
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

    it('returns the sign-in failure and does NOT refresh status', async () => {
        const { mockContext } = setupMocks();
        forcedSwitch().mockResolvedValue({ success: false, error: 'Sign-in failed or cancelled' });

        const result = await handleSwitchOrg(mockContext);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/cancel/i);
        // A failed switch must not present a "refreshed" status implying it worked.
        expect(mockContext.panel!.webview.postMessage).not.toHaveBeenCalledWith(
            expect.objectContaining({
                payload: expect.objectContaining({ checkId: 'org-context' }),
            }),
        );
    });

    // The dashboard's own guard: switching org here is meaningless without a
    // project. The shared handler deliberately allows it (the wizard switches org
    // before any project exists), so this guard has to live at THIS layer.
    it('returns PROJECT_NOT_FOUND when there is no current project, without signing in', async () => {
        const { mockContext } = setupMocks();
        mockContext.stateManager.getCurrentProject = jest.fn().mockResolvedValue(null);

        const result = await handleSwitchOrg(mockContext);

        expect(result).toEqual({
            success: false,
            error: 'No project available',
            code: 'PROJECT_NOT_FOUND',
        });
        expect(forcedSwitch()).not.toHaveBeenCalled();
    });
});

// The forced sign-in (force=true, the browser telegraph, the no-project case) is
// covered in authentication/handlers/orgSwitchHandler.test.ts. The org-context
// check itself (pending → ok/warning/unknown, self-heal, non-interactive P1
// contract) is owned by the orchestrator and covered in
// onOpenChecks/orgContextCheck.test.ts + onOpenChecks/orchestrator.test.ts.
