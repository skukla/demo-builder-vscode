/**
 * Tests for handleForcedOrgSwitch — the FORCED sign-in that lands the token in a
 * different IMS org.
 *
 * A token reaches exactly one org, and a NON-forced login silently reuses the
 * browser's SSO session — which can loop straight back to the org the user is
 * trying to leave. So `force` is the whole point of this handler.
 *
 * These assertions moved here from `dashboardHandlers-switchOrg.test.ts` when the
 * sign-in moved out of the dashboard: three panels need it, and the dashboard's
 * verification (a status re-check) is only one of the ways to confirm where the
 * token landed. That suite now covers the dashboard's composition; this one covers
 * the sign-in itself.
 */

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getAuthenticationService: jest.fn() },
}));
jest.mock(
    'vscode',
    () => ({
        window: {
            // The forced sign-in runs behind the browser-opening notification
            // (withBrowserSignInNotice) — run the task straight through.
            withProgress: jest.fn(async (_options: unknown, task: () => unknown) => task()),
        },
        ProgressLocation: { Notification: 15, Window: 10 },
    }),
    { virtual: true }
);

import { handleForcedOrgSwitch } from '@/features/authentication/handlers/orgSwitchHandler';
import type { HandlerContext } from '@/types/handlers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

const PROJECT_ADOBE = {
    organization: 'org123',
    projectId: 'project123',
    workspace: 'workspace123',
};

function makeContext(project: unknown = { adobe: PROJECT_ADOBE }): HandlerContext {
    return createMockHandlerContext({
        stateManager: createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(project) }),
        debugLogger: createMockLogger(),
    });
}

function mockLogin(result: boolean): jest.Mock {
    const loginAndRestoreProjectContext = jest.fn().mockResolvedValue(result);
    const { ServiceLocator } = require('@/core/di/serviceLocator');
    ServiceLocator.getAuthenticationService.mockReturnValue({ loginAndRestoreProjectContext });
    return loginAndRestoreProjectContext;
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('handleForcedOrgSwitch', () => {
    it('forces the login and targets the project context', async () => {
        const login = mockLogin(true);

        const result = await handleForcedOrgSwitch(makeContext());

        expect(login).toHaveBeenCalledWith(PROJECT_ADOBE, true);
        expect(result.success).toBe(true);
    });

    // REGRESSION: this handler used to live in dashboardHandlers behind a
    // `getCurrentProject` guard that returned PROJECT_NOT_FOUND. In the WIZARD no
    // current project exists yet, so the project picker's "Switch IMS Org" button
    // could never have worked there — it resolved to a failure the picker ignores.
    // The context is a targeting HINT; its absence does not invalidate the switch.
    it('still switches org when there is no current project (the wizard case)', async () => {
        const login = mockLogin(true);

        const result = await handleForcedOrgSwitch(makeContext(null));

        expect(login).toHaveBeenCalledWith(
            { organization: undefined, projectId: undefined, workspace: undefined },
            true
        );
        expect(result.success).toBe(true);
    });

    it('reports failure when the sign-in is cancelled', async () => {
        mockLogin(false);

        const result = await handleForcedOrgSwitch(makeContext());

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/cancel/i);
    });

    // The browser opens on the other side of the login call. Both user-initiated
    // sign-in handlers shipped WITHOUT this, so the click looked inert until a
    // browser window appeared unannounced (2026-07-31).
    it('telegraphs the browser hand-off with a progress notification', async () => {
        mockLogin(true);
        const vscodeMock = jest.requireMock('vscode');

        await handleForcedOrgSwitch(makeContext());

        expect(vscodeMock.window.withProgress).toHaveBeenCalledWith(
            expect.objectContaining({
                location: vscodeMock.ProgressLocation.Notification,
                title: expect.stringMatching(/browser/i),
            }),
            expect.any(Function)
        );
    });
});
