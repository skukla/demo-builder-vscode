/**
 * Delete Adobe Project Handler Tests
 *
 * Tests for handleDeleteAdobeProject (delete-adobe-project message):
 * - payload validation (no modal, no teardown on bad input)
 * - org gate via resolveOrgContext (structured ORG_MISMATCH, no modal)
 * - native confirmation modal (dismissed → cancelled, no teardown)
 * - project-delete-started signal (sent after confirm, before teardown;
 *   never on cancel / ownership reject / org mismatch / invalid payload)
 * - happy path (teardown deps/target, progress, toast, refresh, conditional clear)
 * - partial failure (warning names failed items, NOT deleted, no clear)
 * - best-effort refresh/clear (failures never flip the result)
 * - createTeardownDeps adapter (BASELINE_API serviceInfo, token guard, mapping)
 */

import * as vscode from 'vscode';
import type { TokenManager } from '@/features/authentication/services/tokenManager';
import { validateProjectId } from '@/core/validation/validators/AdobeResourceValidator';
import {
    handleDeleteAdobeProject,
    createTeardownDeps,
} from '@/features/authentication/handlers/deleteAdobeProjectHandler';
import { teardownConsoleProject } from '@/features/authentication/services/consoleProjectTeardown';
import type { ConsoleProjectTeardownResult } from '@/features/authentication/services/consoleProjectTeardown';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { ErrorCode } from '@/types/errorCodes';
import {
    makeJwt,
    TEST_OTHER_USER_ID as OTHER_USER_ID,
    TEST_USER_ID as USER_ID,
} from '../imsTestTokens';
import { createMockContext } from './projectHandlers.testUtils';

jest.mock('@/core/di/serviceLocator');
jest.mock('@/core/validation/validators/AdobeResourceValidator');
jest.mock('@/types/typeGuards', () => ({
    toError: jest.fn((error: any) => (error instanceof Error ? error : new Error(String(error)))),
    parseJSON: jest.fn((str: string) => JSON.parse(str)),
}));
jest.mock('@/core/utils/timeoutConfig', () => ({ TIMEOUTS: { NORMAL: 30000 } }));
jest.mock('@/core/utils/promiseUtils', () => ({ withTimeout: jest.fn((promise) => promise) }));
jest.mock('@/features/authentication/services/consoleProjectTeardown', () => ({
    teardownConsoleProject: jest.fn(),
}));

const PAYLOAD = { projectId: 'proj-1', projectTitle: 'My Project', orgId: 'org-123' };

/** The current user's IMS user id (token user_id === who_created for own projects). */
const USER_TOKEN = makeJwt({ user_id: USER_ID });

/** The target project as returned by getProjects — created by the current user. */
const OWNED_PROJECT = {
    id: 'proj-1',
    name: 'My Project',
    title: 'My Project',
    who_created: USER_ID,
};

const DELETED_RESULT: ConsoleProjectTeardownResult = {
    success: true,
    projectDeleted: true,
    shouldClearConsoleSelection: true,
    items: [
        { kind: 'registration', id: 'reg-1', outcome: 'deleted' },
        { kind: 'registration', id: 'reg-2', outcome: 'deleted' },
        { kind: 'provider', id: 'prov-1', outcome: 'deleted' },
        { kind: 'project', id: 'proj-1', outcome: 'deleted' },
    ],
};

const FAILED_RESULT: ConsoleProjectTeardownResult = {
    success: false,
    projectDeleted: false,
    shouldClearConsoleSelection: false,
    items: [
        { kind: 'registration', id: 'reg-1', outcome: 'deleted' },
        {
            kind: 'provider',
            id: 'prov-1',
            label: 'My Provider',
            outcome: 'failed',
            error: 'HTTP 500',
        },
    ],
};

const mockTeardown = teardownConsoleProject as jest.Mock;
const mockShowWarning = vscode.window.showWarningMessage as jest.Mock;
const mockShowInfo = vscode.window.showInformationMessage as jest.Mock;
const mockWithProgress = vscode.window.withProgress as jest.Mock;

/** Extend the shared harness context with the auth methods this handler uses. */
function createDeleteContext() {
    const context = createMockContext();
    context.authManager.getOrganizations.mockResolvedValue([
        { id: 'org-123', code: 'C', name: 'Test Org' },
    ]);
    // The target project is present and owned by the current user by default,
    // so the ownership gate passes unless a test overrides it.
    context.authManager.getProjects.mockResolvedValue([OWNED_PROJECT]);
    context.authManager.getCachedProject = jest.fn().mockReturnValue(undefined);
    context.authManager.clearConsoleContext = jest.fn().mockResolvedValue(undefined);
    context.authManager.getWorkspaces = jest.fn().mockResolvedValue([]);
    context.authManager.getWorkspaceS2SCredential = jest.fn();
    context.authManager.createWorkspaceS2SCredentialFor = jest.fn();
    context.authManager.deleteConsoleProject = jest.fn();
    context.authManager.subscribeOAuthServerToServerIntegrationToServices = jest.fn();
    context.authManager.getTokenManager = jest.fn().mockReturnValue({
        inspectToken: jest
            .fn()
            .mockResolvedValue({ valid: true, expiresIn: 60, token: USER_TOKEN }),
    });
    return context;
}

describe('handleDeleteAdobeProject', () => {
    let mockContext: ReturnType<typeof createDeleteContext>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createDeleteContext();
        mockTeardown.mockResolvedValue(DELETED_RESULT);
        mockShowWarning.mockResolvedValue('Delete Project');
        mockWithProgress.mockImplementation(async (_options: any, task: any) =>
            task({ report: jest.fn() })
        );
    });

    describe('payload validation', () => {
        it.each([
            ['missing projectId', { ...PAYLOAD, projectId: '' }],
            ['missing orgId', { ...PAYLOAD, orgId: '' }],
        ])('returns a shaped error and shows no modal when %s', async (_label, payload) => {
            const result = await handleDeleteAdobeProject(mockContext, payload);

            expect(result.success).toBe(false);
            expect(result.error).toBeTruthy();
            expect(result.code).toBeTruthy();
            expect(mockShowWarning).not.toHaveBeenCalled();
            expect(mockTeardown).not.toHaveBeenCalled();
        });

        it('returns a shaped error when the payload is missing entirely', async () => {
            const result = await handleDeleteAdobeProject(mockContext, undefined as any);

            expect(result.success).toBe(false);
            expect(mockShowWarning).not.toHaveBeenCalled();
            expect(mockTeardown).not.toHaveBeenCalled();
        });

        it('returns a shaped error when an id validator rejects', async () => {
            // Once-scoped: clearAllMocks() does not remove leaked implementations.
            (validateProjectId as jest.Mock).mockImplementationOnce(() => {
                throw new Error('bad id');
            });

            const result = await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid Adobe resource ID');
            expect(result.code).toBe(ErrorCode.PROJECT_INVALID);
            expect(mockTeardown).not.toHaveBeenCalled();
        });

        it('returns an error when authManager is missing', async () => {
            const ctx = { ...mockContext, authManager: undefined };

            const result = await handleDeleteAdobeProject(ctx, PAYLOAD);

            expect(result.success).toBe(false);
            expect(result.error).toBeTruthy();
            expect(mockTeardown).not.toHaveBeenCalled();
        });
    });

    describe('org gate', () => {
        it('returns a structured ORG_MISMATCH result and shows NO modal on mismatch', async () => {
            // Target org absent from the selectable list → needs_relogin.
            mockContext.authManager.getOrganizations.mockResolvedValue([
                { id: 'other-org', code: 'O', name: 'Other' },
            ]);

            const result = await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(result.success).toBe(false);
            expect(result.code).toBe(ErrorCode.ORG_MISMATCH);
            expect(mockShowWarning).not.toHaveBeenCalled();
            expect(mockTeardown).not.toHaveBeenCalled();
        });

        it('sends the mismatch payload (code + targetOrg) on the delete channel', async () => {
            mockContext.authManager.getOrganizations.mockResolvedValue([
                { id: 'other-org', code: 'O', name: 'Other' },
            ]);

            await handleDeleteAdobeProject(mockContext, PAYLOAD);

            const call = mockContext.sendMessage.mock.calls.find(
                (c: unknown[]) => c[0] === 'delete-adobe-project'
            );
            expect(call).toBeDefined();
            const payload = call![1] as { error: string; code: string; targetOrg?: { id: string } };
            expect(payload.code).toBe('ORG_MISMATCH');
            expect(payload.targetOrg).toEqual({ id: 'org-123' });
        });
    });

    describe('ownership gate', () => {
        const NOT_OWNER_ERROR = 'You can only delete Adobe projects you created.';

        it('rejects with NOT_PROJECT_OWNER when the project was created by another user', async () => {
            mockContext.authManager.getProjects.mockResolvedValue([
                { ...OWNED_PROJECT, who_created: OTHER_USER_ID },
            ]);

            const result = await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(result.success).toBe(false);
            expect(result.error).toBe(NOT_OWNER_ERROR);
            expect(result.code).toBe('NOT_PROJECT_OWNER');
            expect(mockShowWarning).not.toHaveBeenCalled();
            expect(mockTeardown).not.toHaveBeenCalled();
        });

        it('rejects when who_created is missing on the fetched project (fail closed)', async () => {
            mockContext.authManager.getProjects.mockResolvedValue([
                { id: 'proj-1', name: 'My Project', title: 'My Project' },
            ]);

            const result = await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(result.success).toBe(false);
            expect(result.code).toBe('NOT_PROJECT_OWNER');
            expect(mockShowWarning).not.toHaveBeenCalled();
            expect(mockTeardown).not.toHaveBeenCalled();
        });

        it('rejects when the project is not in the org list (fail closed)', async () => {
            mockContext.authManager.getProjects.mockResolvedValue([
                { id: 'proj-other', name: 'Other', title: 'Other', who_created: USER_ID },
            ]);

            const result = await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(result.success).toBe(false);
            expect(result.code).toBe('NOT_PROJECT_OWNER');
            expect(mockTeardown).not.toHaveBeenCalled();
        });

        it('rejects when no valid access token is available', async () => {
            mockContext.authManager.getTokenManager.mockReturnValue({
                inspectToken: jest.fn().mockResolvedValue({ valid: false, expiresIn: 0 }),
                // `TokenManager` is a CLASS with private fields, so no object
                // literal can satisfy it and no builder is warranted for the three
                // sites that stub it (PL-34). `as unknown as` is the allowed form:
                // it NAMES what this is pretending to be, so every read below is
                // still checked against the real class.
            } as unknown as TokenManager);

            const result = await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(result.success).toBe(false);
            expect(result.code).toBe('NOT_PROJECT_OWNER');
            expect(mockShowWarning).not.toHaveBeenCalled();
            expect(mockTeardown).not.toHaveBeenCalled();
        });

        it('verifies ownership from the fetched list, NOT the webview payload', async () => {
            await handleDeleteAdobeProject(mockContext, PAYLOAD);

            // The ownership fetch targets the payload org and runs before the modal.
            expect(mockContext.authManager.getProjects).toHaveBeenCalledWith({ orgId: 'org-123' });
            expect(mockContext.authManager.getProjects.mock.invocationCallOrder[0]).toBeLessThan(
                mockShowWarning.mock.invocationCallOrder[0]
            );
        });

        it('matches who_created case-insensitively (owned → proceeds to the modal)', async () => {
            mockContext.authManager.getProjects.mockResolvedValue([
                { ...OWNED_PROJECT, who_created: USER_ID.toLowerCase() },
            ]);

            await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(mockShowWarning).toHaveBeenCalled();
            expect(mockTeardown).toHaveBeenCalled();
        });

        it('proceeds to the modal when the current user created the project', async () => {
            const result = await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(mockShowWarning).toHaveBeenCalled();
            expect(result.success).toBe(true);
        });
    });

    describe('confirmation modal', () => {
        it('shows a native modal naming the project with a Delete Project action', async () => {
            await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(mockShowWarning).toHaveBeenCalledWith(
                'Delete "My Project"?',
                expect.objectContaining({
                    modal: true,
                    detail: expect.stringContaining('cannot be undone'),
                }),
                'Delete Project'
            );
        });

        it('always includes the immutable project id in the modal detail', async () => {
            await handleDeleteAdobeProject(mockContext, PAYLOAD);

            const options = mockShowWarning.mock.calls[0][1] as { detail: string };
            expect(options.detail).toContain('Project ID: proj-1');
        });

        it('truncates an over-long webview-supplied title to 100 characters', async () => {
            const longTitle = 'x'.repeat(250);

            await handleDeleteAdobeProject(mockContext, { ...PAYLOAD, projectTitle: longTitle });

            const message = mockShowWarning.mock.calls[0][0] as string;
            expect(message).toBe(`Delete "${'x'.repeat(100)}"?`);
            expect(message).not.toContain('x'.repeat(101));
        });

        it('returns a cancelled result and does NOT run teardown when dismissed', async () => {
            mockShowWarning.mockResolvedValue(undefined);

            const result = await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(result.success).toBe(false);
            expect(result.cancelled).toBe(true);
            expect(mockTeardown).not.toHaveBeenCalled();
        });
    });

    describe('project-delete-started signal', () => {
        const NO_SIGNAL = ['project-delete-started', expect.anything()] as const;

        it('signals the webview with the projectId once the user confirms', async () => {
            await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(mockContext.sendMessage).toHaveBeenCalledWith('project-delete-started', {
                projectId: 'proj-1',
            });
        });

        it('sends the signal AFTER the confirm modal and BEFORE the teardown', async () => {
            await handleDeleteAdobeProject(mockContext, PAYLOAD);

            const index = mockContext.sendMessage.mock.calls.findIndex(
                (c: unknown[]) => c[0] === 'project-delete-started'
            );
            const signalOrder = mockContext.sendMessage.mock.invocationCallOrder[index];
            expect(signalOrder).toBeGreaterThan(mockShowWarning.mock.invocationCallOrder[0]);
            expect(signalOrder).toBeLessThan(mockTeardown.mock.invocationCallOrder[0]);
        });

        it('does NOT signal when the confirm modal is dismissed', async () => {
            mockShowWarning.mockResolvedValue(undefined);

            await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(mockContext.sendMessage).not.toHaveBeenCalledWith(...NO_SIGNAL);
        });

        it('does NOT signal when ownership is rejected', async () => {
            mockContext.authManager.getProjects.mockResolvedValue([
                { ...OWNED_PROJECT, who_created: OTHER_USER_ID },
            ]);

            await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(mockContext.sendMessage).not.toHaveBeenCalledWith(...NO_SIGNAL);
        });

        it('does NOT signal on an org mismatch', async () => {
            mockContext.authManager.getOrganizations.mockResolvedValue([
                { id: 'other-org', code: 'O', name: 'Other' },
            ]);

            await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(mockContext.sendMessage).not.toHaveBeenCalledWith(...NO_SIGNAL);
        });

        it('does NOT signal on an invalid payload', async () => {
            await handleDeleteAdobeProject(mockContext, { ...PAYLOAD, projectId: '' });

            expect(mockContext.sendMessage).not.toHaveBeenCalledWith(...NO_SIGNAL);
        });
    });

    describe('happy path', () => {
        it('runs teardown with built deps and the exact target', async () => {
            await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(mockTeardown).toHaveBeenCalledTimes(1);
            const [deps, target] = mockTeardown.mock.calls[0];
            expect(typeof deps.getWorkspaces).toBe('function');
            expect(typeof deps.subscribeManagementApi).toBe('function');
            expect(typeof deps.deleteConsoleProject).toBe('function');
            expect(typeof deps.getAccessToken).toBe('function');
            expect(typeof deps.createEventsClient).toBe('function');
            expect(target).toEqual({
                orgId: 'org-123',
                projectId: 'proj-1',
                projectTitle: 'My Project',
            });
        });

        it('returns the teardown result as data', async () => {
            const result = await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(result.success).toBe(true);
            expect(result.data).toBe(DELETED_RESULT);
        });

        it('wraps teardown in a non-cancellable progress notification', async () => {
            await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(mockWithProgress).toHaveBeenCalledWith(
                expect.objectContaining({
                    location: vscode.ProgressLocation.Notification,
                    title: expect.stringContaining('Deleting Adobe project'),
                    cancellable: false,
                }),
                expect.any(Function)
            );
        });

        it('reports teardown progress as "Step N/M: message"', async () => {
            const report = jest.fn();
            mockWithProgress.mockImplementation(async (_options: any, task: any) =>
                task({ report })
            );
            mockTeardown.mockImplementation(async (_deps, _target, onProgress) => {
                onProgress?.({ step: 1, totalSteps: 4, message: 'Finding workspaces…' });
                return DELETED_RESULT;
            });

            await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(report).toHaveBeenCalledWith({ message: 'Step 1/4: Finding workspaces…' });
        });

        it('shows an info toast with deleted registration/provider counts', async () => {
            await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(mockShowInfo).toHaveBeenCalledTimes(1);
            const message = mockShowInfo.mock.calls[0][0] as string;
            expect(message).toContain('My Project');
            expect(message).toContain('2 event registration');
            expect(message).toContain('1 event provider');
        });

        it('refreshes the project list for the target org (mirrors create)', async () => {
            mockContext.authManager.getProjects.mockResolvedValue([
                OWNED_PROJECT,
                { id: 'proj-2', name: 'Other', title: 'Other', who_created: OTHER_USER_ID },
            ]);

            await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(mockContext.authManager.getProjects).toHaveBeenCalledWith({ orgId: 'org-123' });
            // The refresh push goes through the same deletable stamping as get-projects.
            expect(mockContext.sendMessage).toHaveBeenCalledWith('get-projects', [
                { ...OWNED_PROJECT, deletable: true },
                {
                    id: 'proj-2',
                    name: 'Other',
                    title: 'Other',
                    who_created: OTHER_USER_ID,
                    deletable: false,
                },
            ]);
        });

        it('clears the console selection when the cached project IS the deleted one', async () => {
            mockContext.authManager.getCachedProject.mockReturnValue({
                id: 'proj-1',
                name: 'My Project',
            });

            await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(mockContext.authManager.clearConsoleContext).toHaveBeenCalledTimes(1);
        });

        it('does NOT clear the console selection when the cached project differs', async () => {
            mockContext.authManager.getCachedProject.mockReturnValue({
                id: 'proj-other',
                name: 'Other',
            });

            await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(mockContext.authManager.clearConsoleContext).not.toHaveBeenCalled();
        });

        it('does NOT clear the console selection when nothing is cached', async () => {
            await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(mockContext.authManager.clearConsoleContext).not.toHaveBeenCalled();
        });

        it('still succeeds when the selection clear fails (best-effort)', async () => {
            mockContext.authManager.getCachedProject.mockReturnValue({
                id: 'proj-1',
                name: 'My Project',
            });
            mockContext.authManager.clearConsoleContext.mockRejectedValue(
                new Error('clear failed')
            );

            const result = await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(result.success).toBe(true);
        });

        it('still succeeds when the refresh fetch fails (best-effort)', async () => {
            // First call feeds the ownership gate; the post-delete refresh fails.
            mockContext.authManager.getProjects
                .mockResolvedValueOnce([OWNED_PROJECT])
                .mockRejectedValue(new Error('fetch failed'));

            const result = await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(result.success).toBe(true);
            expect(result.data).toBe(DELETED_RESULT);
        });
    });

    describe('partial failure (project NOT deleted)', () => {
        beforeEach(() => {
            mockTeardown.mockResolvedValue(FAILED_RESULT);
        });

        it('returns success:false with the teardown result as data', async () => {
            const result = await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(result.success).toBe(false);
            expect(result.data).toBe(FAILED_RESULT);
        });

        it('shows a warning naming the failed items and stating the project was NOT deleted', async () => {
            await handleDeleteAdobeProject(mockContext, PAYLOAD);

            // First call is the confirm modal; the outcome warning follows it.
            const warning = mockShowWarning.mock.calls[1][0] as string;
            expect(warning).toContain('My Provider');
            expect(warning).toContain('NOT deleted');
            expect(warning).toContain('run Delete again');
            expect(mockShowInfo).not.toHaveBeenCalled();
        });

        it('neither clears the selection nor refreshes the project list', async () => {
            mockContext.authManager.getCachedProject.mockReturnValue({
                id: 'proj-1',
                name: 'My Project',
            });

            await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(mockContext.authManager.clearConsoleContext).not.toHaveBeenCalled();
            // Exactly ONE getProjects call — the ownership gate; no refresh fetch or push.
            expect(mockContext.authManager.getProjects).toHaveBeenCalledTimes(1);
            expect(mockContext.sendMessage).not.toHaveBeenCalledWith(
                'get-projects',
                expect.anything()
            );
        });
    });

    describe('unexpected errors', () => {
        it('logs the full error and returns a sanitized shaped failure', async () => {
            mockTeardown.mockRejectedValue(new Error('kaboom internals'));

            const result = await handleDeleteAdobeProject(mockContext, PAYLOAD);

            expect(result.success).toBe(false);
            expect(result.error).toBeTruthy();
            expect(result.error).not.toContain('kaboom');
            expect(result.code).toBe(ErrorCode.UNKNOWN);
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ message: 'kaboom internals' })
            );
        });
    });
});

describe('createTeardownDeps', () => {
    const inspectToken = jest.fn();

    const createAuthService = () =>
        ({
            getWorkspaces: jest.fn().mockResolvedValue([
                { id: 'ws-1', name: 'Stage', title: 'Stage' },
                { id: 'ws-2', name: 'Production', title: 'Production' },
            ]),
            getWorkspaceS2SCredential: jest
                .fn()
                .mockResolvedValue({ clientId: 'cid', idIntegration: 'iid' }),
            createWorkspaceS2SCredentialFor: jest
                .fn()
                .mockResolvedValue({ clientId: 'cid2', idIntegration: 'iid2' }),
            subscribeOAuthServerToServerIntegrationToServices: jest
                .fn()
                .mockResolvedValue(undefined),
            deleteConsoleProject: jest.fn().mockResolvedValue(undefined),
            getTokenManager: jest.fn().mockReturnValue({ inspectToken }),
        }) as unknown as AuthenticationService;

    beforeEach(() => {
        jest.clearAllMocks();
        inspectToken.mockResolvedValue({ valid: true, expiresIn: 60, token: 'tok' });
    });

    it('subscribeManagementApi subscribes exactly the BASELINE_API serviceInfo array', async () => {
        const authService = createAuthService();
        const deps = createTeardownDeps(authService);

        await deps.subscribeManagementApi('org-1', 'integ-1');

        expect(authService.subscribeOAuthServerToServerIntegrationToServices).toHaveBeenCalledWith(
            'org-1',
            'integ-1',
            [{ sdkCode: 'AdobeIOManagementAPISDK', licenseConfigs: null, roles: null }]
        );
    });

    it('getAccessToken returns the token when the inspection is valid', async () => {
        const deps = createTeardownDeps(createAuthService());

        await expect(deps.getAccessToken()).resolves.toBe('tok');
    });

    it('getAccessToken throws when the token is invalid', async () => {
        inspectToken.mockResolvedValue({ valid: false, expiresIn: -5, token: 'stale' });
        const deps = createTeardownDeps(createAuthService());

        await expect(deps.getAccessToken()).rejects.toThrow();
    });

    it('getAccessToken throws when the inspection carries no token', async () => {
        inspectToken.mockResolvedValue({ valid: true, expiresIn: 60 });
        const deps = createTeardownDeps(createAuthService());

        await expect(deps.getAccessToken()).rejects.toThrow();
    });

    it('getWorkspaces threads the target and maps to { id, name }', async () => {
        const authService = createAuthService();
        const deps = createTeardownDeps(authService);

        const workspaces = await deps.getWorkspaces({ orgId: 'org-1', projectId: 'proj-1' });

        expect(authService.getWorkspaces).toHaveBeenCalledWith({
            orgId: 'org-1',
            projectId: 'proj-1',
        });
        expect(workspaces).toEqual([
            { id: 'ws-1', name: 'Stage' },
            { id: 'ws-2', name: 'Production' },
        ]);
    });

    it('forwards credential lookups, creation, and project delete to the service', async () => {
        const authService = createAuthService();
        const deps = createTeardownDeps(authService);

        await expect(deps.getWorkspaceS2SCredential('o', 'p', 'w')).resolves.toEqual({
            clientId: 'cid',
            idIntegration: 'iid',
        });
        await expect(deps.createWorkspaceS2SCredentialFor('o', 'p', 'w')).resolves.toEqual({
            clientId: 'cid2',
            idIntegration: 'iid2',
        });
        await deps.deleteConsoleProject('o', 'p');

        expect(authService.getWorkspaceS2SCredential).toHaveBeenCalledWith('o', 'p', 'w');
        expect(authService.createWorkspaceS2SCredentialFor).toHaveBeenCalledWith('o', 'p', 'w');
        expect(authService.deleteConsoleProject).toHaveBeenCalledWith('o', 'p');
    });

    it('createEventsClient mints a client exposing the teardown surface', () => {
        const deps = createTeardownDeps(createAuthService());

        const client = deps.createEventsClient({ accessToken: 'tok', apiKey: 'cid' });

        expect(typeof client.listProviders).toBe('function');
        expect(typeof client.listRegistrations).toBe('function');
        expect(typeof client.deleteRegistration).toBe('function');
        expect(typeof client.deleteProvider).toBe('function');
    });
});
