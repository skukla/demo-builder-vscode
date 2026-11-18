/**
 * delete_adobe_project through the REAL Console teardown and its real deps adapter
 * (PL-104 fix 8).
 *
 * The agent's door neither validated the ids nor cleared the aio Console selection,
 * which the button did itself and the spine left to "the handler". Both now live in
 * the teardown, so this drives the tool against it, with only Adobe's services faked,
 * and asserts what reached them. So does the "only the creator may delete" check the
 * button made and the agent skipped (walk F270).
 */

const mockGetAdobeTarget = jest.fn();
jest.mock('@/features/ai/server/adobeTargetStore', () => ({
    getAdobeTarget: () => mockGetAdobeTarget(),
    setAdobeTarget: jest.fn(),
}));

let mockAuthService: unknown;
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getAuthenticationService: () => mockAuthService },
}));

import { registerAdobeResourceTools } from '@/features/ai/server/adobeResourceTools';
import {
    createMockAuthenticationService,
    entityServicesOf,
} from '../../../helpers/authenticationServiceFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { fakeJwt } from '../../../helpers/jwtFake';
import { NOT_PROJECT_OWNER_MESSAGE } from '@/features/authentication/services/projectOwnership';

/** IMS user ids in the real `<GUID>@<authsrc>.e` form a project's `who_created` uses. */
const TEST_USER_ID = '5DA1B2C3D4E5F607080910A1@abcdef1234567890.e';
const TEST_OTHER_USER_ID = 'FFFF0000AAAA1111BBBB2222@abcdef1234567890.e';

type Handler = (a: unknown) => Promise<{ content: Array<{ text: string }> }>;

/**
 * An auth service whose project has no workspaces, so the teardown goes straight to the
 * delete. The signed-in person created the project unless `createdBy` says otherwise.
 */
function authService(cachedProjectId?: string, createdBy = TEST_USER_ID) {
    const deleteConsoleProject = jest.fn().mockResolvedValue(undefined);
    const clearConsoleContext = jest.fn().mockResolvedValue(undefined);
    const auth = createMockAuthenticationService(
        {
            getTokenManager: jest.fn().mockReturnValue({
                inspectToken: jest
                    .fn()
                    .mockResolvedValue({
                        valid: true,
                        expiresIn: 60,
                        token: fakeJwt({ user_id: TEST_USER_ID }),
                    }),
            }),
            getProject: jest
                .fn()
                .mockResolvedValue({ id: 'proj1', name: 'Doomed', who_created: createdBy }),
        },
        {
            entities: {
                projectOps: { deleteConsoleProject },
                workspaceReads: { getWorkspaces: jest.fn().mockResolvedValue([]) },
            },
        }
    );
    entityServicesOf(auth).selector.clearConsoleContext = clearConsoleContext;
    jest.mocked(auth.getCacheManager().getCachedProject).mockReturnValue(
        cachedProjectId ? { id: cachedProjectId, name: 'Doomed' } : undefined
    );
    return { auth, deleteConsoleProject, clearConsoleContext };
}

function deleteTool(auth: ReturnType<typeof authService>['auth']): Handler {
    mockAuthService = auth;
    const tools = new Map<string, Handler>();
    registerAdobeResourceTools(
        { registerTool: (n: string, _d: unknown, h: never) => tools.set(n, h) },
        () => createMockHandlerContext({ authManager: auth, logger: createMockLogger() })
    );
    return tools.get('delete_adobe_project')!;
}

async function call(auth: ReturnType<typeof authService>['auth'], projectId: string) {
    const out = await deleteTool(auth)({
        projectId,
        projectName: 'Doomed',
        confirm: true,
        confirmName: 'Doomed',
    });
    return JSON.parse(out.content[0].text);
}

beforeEach(() => {
    mockGetAdobeTarget.mockReturnValue({ orgId: 'org1' });
});

it('clears the Console selection when it pointed at the deleted project', async () => {
    const { auth, deleteConsoleProject, clearConsoleContext } = authService('proj1');

    const answer = await call(auth, 'proj1');

    expect(answer).toMatchObject({ deleted: true });
    expect(deleteConsoleProject).toHaveBeenCalledWith('org1', 'proj1');
    expect(clearConsoleContext).toHaveBeenCalledTimes(1);
});

it('leaves a selection on another project alone', async () => {
    const { auth, clearConsoleContext } = authService('proj-other');

    await call(auth, 'proj1');

    expect(clearConsoleContext).not.toHaveBeenCalled();
});

it('refuses a project id that is not an Adobe resource id, deleting nothing', async () => {
    const { auth, deleteConsoleProject } = authService();

    const answer = await call(auth, '../other-org/proj');

    expect(answer.deleted).toBe(false);
    expect(answer.failedSteps).toEqual([
        expect.objectContaining({
            kind: 'project',
            error: expect.stringMatching(/^Invalid Adobe resource ID/),
        }),
    ]);
    expect(deleteConsoleProject).not.toHaveBeenCalled();
});

it('refuses a project the signed-in person did not create, with the reason', async () => {
    const { auth, deleteConsoleProject } = authService(undefined, TEST_OTHER_USER_ID);

    const answer = await call(auth, 'proj1');

    expect(answer.deleted).toBe(false);
    expect(answer.failedSteps).toEqual([
        expect.objectContaining({ kind: 'project', error: NOT_PROJECT_OWNER_MESSAGE }),
    ]);
    expect(auth.getProject).toHaveBeenCalledWith({ orgId: 'org1', projectId: 'proj1' });
    expect(deleteConsoleProject).not.toHaveBeenCalled();
});
