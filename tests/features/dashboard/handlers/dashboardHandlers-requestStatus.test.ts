/**
 * Tests for handleRequestStatus handler (Pattern B - request-response)
 *
 * Tests verify that handleRequestStatus reads persisted meshStatusSummary
 * instead of re-checking, returning data directly via Pattern B.
 */

// IMPORTANT: Mocks must be declared before imports
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
        // The on-open org-context check self-heals via the state manager on the
        // reachable path; default to a no-op writer.
        getStateManager: jest.fn(() => ({
            saveProjectConfigOnly: jest.fn().mockResolvedValue(undefined),
        })),
    },
}));
jest.mock('@/features/mesh/services/stalenessDetector');
// The API-list warm-up has its own suite; here we only check that opening the
// dashboard starts it.
jest.mock('@/features/dashboard/handlers/warmOrgServicesCatalog', () => ({
    warmOrgServicesCatalog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/features/mesh/services/meshVerifier', () => ({
    verifyMeshDeployment: jest.fn().mockResolvedValue(undefined),
    syncMeshStatus: jest.fn().mockResolvedValue(undefined),
}));
jest.mock(
    'vscode',
    () => ({
        window: {
            activeColorTheme: { kind: 1 },
            showWarningMessage: jest.fn().mockResolvedValue('Cancel'), // Default: user cancels
            // ensureAdobeIOAuth wraps the browser login in withProgress; run the task.
            withProgress: jest.fn((_opts: unknown, task: (p: unknown) => unknown) =>
                task({ report: jest.fn() })
            ),
        },
        ColorThemeKind: { Dark: 2, Light: 1 },
        ProgressLocation: { Notification: 15, Window: 10, SourceControl: 1 },
        commands: { executeCommand: jest.fn() },
        env: { openExternal: jest.fn() },
        Uri: { parse: jest.fn((url: string) => ({ toString: () => url })) },
    }),
    { virtual: true }
);

import './dashboardValidatorMocks';
import { handleRequestStatus } from '@/features/dashboard/handlers/dashboardHandlers';
import { warmOrgServicesCatalog } from '@/features/dashboard/handlers/warmOrgServicesCatalog';
import { setupMocks } from './dashboardHandlers.testUtils';

describe('dashboardHandlers - handleRequestStatus', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);
    });

    it('should return persisted mesh status from meshStatusSummary (Pattern B)', async () => {
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);

        // Project has meshStatusSummary='deployed' (set by card grid)
        const { mockContext } = setupMocks({ meshStatusSummary: 'deployed' });

        const result = await handleRequestStatus(mockContext);

        expect(result).toMatchObject({
            success: true,
            data: {
                name: 'test-project',
                path: '/path/to/project',
                status: 'running',
                port: 3000,
                adobeOrg: 'org123',
                adobeProject: 'Test Project',
                frontendConfigChanged: false,
                mesh: {
                    status: 'deployed',
                },
            },
        });

        // CRITICAL: Verify sendMessage was NOT called (anti-pattern)
        expect(mockContext.sendMessage).not.toHaveBeenCalled();
    });

    it('should return "config-changed" when meshStatusSummary is stale', async () => {
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);

        const { mockContext } = setupMocks({ meshStatusSummary: 'stale' });

        const result = await handleRequestStatus(mockContext);

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            mesh: {
                status: 'config-changed',
            },
        });
    });

    // ADR-011 D3 Steps 07+09: a keyed-only project must report the same deployed
    // status + endpoint from the keyed entry.
    //
    // These cases used to pass `meshState: undefined` to say "the post-Step-07
    // shape". That field was REMOVED from the in-memory Project by PL-1 phase 2,
    // so setting it to undefined asserted nothing — keyed-only is now the only
    // shape there is. An `as any` on the override was hiding it.
    it('should report deployed status + endpoint for a keyed-only project (Steps 07+09)', async () => {
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);

        const { mockContext } = setupMocks({
            meshStatusSummary: 'deployed',
            appBuilderComponents: {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                    endpoint: 'https://keyed-mesh.adobe.io/graphql',
                    envVars: { MESH_ID: 'mesh123' },
                },
            },
        });

        const result = await handleRequestStatus(mockContext);

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            mesh: {
                status: 'deployed',
                endpoint: 'https://keyed-mesh.adobe.io/graphql',
            },
        });
    });

    it('should return mesh status as "not-deployed" when no mesh configured', async () => {
        const { mockContext } = setupMocks({
            componentInstances: {
                headless: {
                    id: 'headless',
                    name: 'CitiSignal Next.js',
                    status: 'ready',
                    path: '/path/to/frontend',
                    port: 3000,
                },
            },
        });

        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);

        const result = await handleRequestStatus(mockContext);

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            name: 'test-project',
            status: 'running',
            mesh: undefined, // No mesh component
        });
    });

    it('should return error when no project available', async () => {
        const { mockContext } = setupMocks();
        mockContext.stateManager.getCurrentProject = jest.fn().mockResolvedValue(null);

        const result = await handleRequestStatus(mockContext);

        expect(result).toEqual({
            success: false,
            error: 'No project available',
            code: 'PROJECT_NOT_FOUND',
        });

        expect(mockContext.sendMessage).not.toHaveBeenCalled();
    });

    it('should return error when panel not available', async () => {
        const { mockContext } = setupMocks();
        mockContext.panel = undefined;

        const result = await handleRequestStatus(mockContext);

        expect(result).toEqual({
            success: false,
            error: 'No panel available',
            code: 'PROJECT_NOT_FOUND',
        });
    });

    it('should return frontendConfigChanged=true when frontend config differs', async () => {
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(true);

        const { mockContext } = setupMocks({
            meshStatusSummary: 'deployed',
            frontendEnvState: {
                envVars: {
                    NEXT_PUBLIC_MESH_ENDPOINT: 'old-value',
                },
                capturedAt: '2025-01-26T12:00:00.000Z',
            },
        });

        const result = await handleRequestStatus(mockContext);

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            frontendConfigChanged: true,
        });
    });

    // Nobody started this: it runs when the dashboard opens. So it reports what it
    // found and asks nothing — the screen already renders `needs-auth` as "Session
    // expired" beside a sign-in affordance (owner, 2026-09-20).
    it('reports needs-auth without asking the SC anything', async () => {
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);

        const { mockContext } = setupMocks();

        // Override auth mock AFTER setupMocks (which sets isAuthenticated=true)
        const { ServiceLocator } = require('@/core/di/serviceLocator');
        const signIn = jest.fn().mockResolvedValue(false);
        ServiceLocator.getAuthenticationService.mockReturnValue({
            isAuthenticated: jest.fn().mockResolvedValue(false),
            loginAndRestoreProjectContext: signIn,
        });

        const result = await handleRequestStatus(mockContext);

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            mesh: {
                status: 'needs-auth',
            },
        });

        const vscode = require('vscode');
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        expect(signIn).not.toHaveBeenCalled();
    });

    it('should NOT carry orgMismatch in the status payload (delivered separately)', async () => {
        // The org check is decoupled — it's posted via the on-open orchestrator's
        // `checkResult` message, never bundled into the status payload (kept fast).
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);

        const { mockContext } = setupMocks({ meshStatusSummary: 'deployed' });
        const { ServiceLocator } = require('@/core/di/serviceLocator');
        ServiceLocator.getAuthenticationService.mockReturnValue({
            isAuthenticated: jest.fn().mockResolvedValue(true),
            // SDK-only read (the non-interactive on-open probe), never the CLI fallback.
            getOrganizationsSdkOnly: jest
                .fn()
                .mockResolvedValue([{ id: 'org999', code: 'OTHER@AdobeOrg', name: 'Other Org' }]),
        });

        const result = await handleRequestStatus(mockContext);

        expect(result.success).toBe(true);
        expect((result.data as { orgMismatch?: unknown }).orgMismatch).toBeUndefined();
    });

    // The counterpart: signed in, so the same silent read gives the real status.
    it('reports the deployed mesh when the session is still good', async () => {
        const { detectFrontendChanges } = require('@/features/mesh/services/stalenessDetector');
        detectFrontendChanges.mockReturnValue(false);

        const { mockContext } = setupMocks({ meshStatusSummary: 'deployed' });

        const { ServiceLocator } = require('@/core/di/serviceLocator');
        const signIn = jest.fn().mockResolvedValue(true);
        ServiceLocator.getAuthenticationService.mockReturnValue({
            isAuthenticated: jest.fn().mockResolvedValue(true),
            loginAndRestoreProjectContext: signIn,
        });

        const result = await handleRequestStatus(mockContext);

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
            mesh: {
                status: 'deployed',
            },
        });
        // A status read never signs anyone in, in either direction.
        expect(signIn).not.toHaveBeenCalled();
    });

    it('starts loading the Adobe API list when the dashboard opens', async () => {
        // Developer Console loads its API list the moment it opens, so the list is
        // ready before anyone looks; a cold load takes Adobe about a minute.
        const { mockContext } = setupMocks({ meshStatusSummary: 'deployed' });

        await handleRequestStatus(mockContext);

        expect(warmOrgServicesCatalog).toHaveBeenCalledWith(mockContext);
    });
});
