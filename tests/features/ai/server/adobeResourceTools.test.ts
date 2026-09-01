/**
 * Adobe Console create/delete tools.
 *
 * The assertions that matter are about TARGETING. These tools exist on top of a
 * fixed defect: the fetcher used to resolve org/project from the extension UI's
 * cache, while the agent's selection lives in `adobeTargetStore`, so a workspace
 * could be created in a project the agent never chose. Every creation path here
 * must pass its target explicitly and must refuse rather than guess.
 */

const mockGetAdobeTarget = jest.fn();
jest.mock('@/features/ai/server/adobeTargetStore', () => ({
    getAdobeTarget: () => mockGetAdobeTarget(),
}));

const mockTeardown = jest.fn();
jest.mock('@/features/authentication/services/consoleProjectTeardown', () => ({
    teardownConsoleProject: (...a: unknown[]) => mockTeardown(...a),
}));
jest.mock('@/features/authentication/handlers/deleteAdobeProjectHandler', () => ({
    createTeardownDeps: jest.fn(() => ({})),
}));
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getAuthenticationService: jest.fn(() => ({})) },
}));

import { registerAdobeResourceTools } from '@/features/ai/server/adobeResourceTools';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';

const createProject = jest.fn();
const createWorkspace = jest.fn();
const isAuthenticated = jest.fn();

function serve(opts: { authed?: boolean; noManager?: boolean } = {}) {
    const tools = new Map<string, (a: unknown) => Promise<{ content: Array<{ text: string }> }>>();
    isAuthenticated.mockResolvedValue(opts.authed ?? true);
    const ctxFactory = () =>
        createMockHandlerContext({
            authManager: opts.noManager
                ? undefined
                : createMockAuthenticationService({
                      isAuthenticated,
                      createProject,
                      createWorkspace,
                  }),
            logger: createMockLogger(),
        });

    registerAdobeResourceTools(
        { registerTool: (n: string, _d: unknown, h: never) => tools.set(n, h) },
        ctxFactory
    );
    return async (name: string, args: unknown = {}) =>
        JSON.parse((await tools.get(name)!(args)).content[0].text);
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGetAdobeTarget.mockReturnValue({ orgId: 'org-1', projectId: 'proj-1' });
    createProject.mockResolvedValue({ id: 'p9', name: 'New Project' });
    createWorkspace.mockResolvedValue({ id: 'w9', name: 'dev' });
    mockTeardown.mockResolvedValue({
        success: true,
        projectDeleted: true,
        items: [],
        shouldClearConsoleSelection: true,
    });
});

describe('create_adobe_project', () => {
    // THE REGRESSION. Without the explicit target the fetcher falls back to the
    // UI's cached org, which select_org never writes.
    it('passes the AGENT-selected org explicitly', async () => {
        await serve()('create_adobe_project', { name: 'New Project' });
        expect(createProject).toHaveBeenCalledWith('New Project', '', { orgId: 'org-1' });
    });

    it('refuses instead of guessing when no org is selected', async () => {
        mockGetAdobeTarget.mockReturnValue(undefined);
        const out = await serve()('create_adobe_project', { name: 'x' });

        expect(out.error).toMatch(/select_org/);
        expect(createProject).not.toHaveBeenCalled();
    });

    it('hands off when not signed in, without calling Console', async () => {
        const out = await serve({ authed: false })('create_adobe_project', { name: 'x' });
        expect(out).toMatchObject({ needsAuth: 'adobe' });
        expect(createProject).not.toHaveBeenCalled();
    });

    it('hands off when there is no auth manager at all', async () => {
        expect(
            await serve({ noManager: true })('create_adobe_project', { name: 'x' })
        ).toMatchObject({ needsAuth: 'adobe' });
    });

    // The service collapses quota, naming and permission failures into
    // `undefined`, so the tool says what it cannot distinguish.
    it('surfaces the service failure REASON verbatim when Console rejects it', async () => {
        // The service carries the SDK's own message now (ConsoleOpFailure) —
        // the old guessing-list here named three causes and the measured live
        // failure (a 19-char name limit) was none of them.
        createProject.mockResolvedValue({
            error: '400 - Bad Request ("Project name length must be less than 20")',
        });
        const out = await serve()('create_adobe_project', { name: 'dupe' });

        expect(out.created).toBe(false);
        expect(out.error).toContain('less than 20');
    });

    it('returns the created project', async () => {
        expect(await serve()('create_adobe_project', { name: 'New Project' })).toEqual({
            created: true,
            project: { id: 'p9', name: 'New Project' },
        });
    });
});

describe('create_adobe_workspace', () => {
    it('passes BOTH the agent-selected org and project explicitly', async () => {
        await serve()('create_adobe_workspace', { name: 'dev' });
        expect(createWorkspace).toHaveBeenCalledWith('dev', '', {
            orgId: 'org-1',
            projectId: 'proj-1',
        });
    });

    // An org alone is not enough, and falling back to a cached project is the
    // exact failure this tool was written to prevent.
    it('refuses when an org is selected but no project is', async () => {
        mockGetAdobeTarget.mockReturnValue({ orgId: 'org-1' });
        const out = await serve()('create_adobe_workspace', { name: 'dev' });

        expect(out.error).toMatch(/select_project/);
        expect(createWorkspace).not.toHaveBeenCalled();
    });

    it('echoes the project it created in, so the agent can verify', async () => {
        expect(await serve()('create_adobe_workspace', { name: 'dev' })).toEqual({
            created: true,
            workspace: { id: 'w9', name: 'dev' },
            projectId: 'proj-1',
        });
    });
});

describe('delete_adobe_project', () => {
    const ARGS = { projectId: 'proj-1', projectName: 'Doomed' };

    it('refuses without confirm AND an exact name echo', async () => {
        const out = await serve()('delete_adobe_project', ARGS);
        expect(out.irreversible).toBe(true);
        expect(mockTeardown).not.toHaveBeenCalled();
    });

    it('refuses when confirmName does not match exactly', async () => {
        await serve()('delete_adobe_project', { ...ARGS, confirm: true, confirmName: 'doomed' });
        expect(mockTeardown).not.toHaveBeenCalled();
    });

    it('tears down with the agent-selected org when fully confirmed', async () => {
        const out = await serve()('delete_adobe_project', {
            ...ARGS,
            confirm: true,
            confirmName: 'Doomed',
        });

        // Third argument is the phase reporter: teardown runs long enough that a
        // silent wait reads as a hang, so its steps are narrated to the chat.
        expect(mockTeardown).toHaveBeenCalledWith(
            expect.anything(),
            { orgId: 'org-1', projectId: 'proj-1', projectTitle: 'Doomed' },
            expect.any(Function)
        );
        expect(out).toEqual({ deleted: true, project: 'Doomed' });
    });

    // 'skipped' is a normal outcome for a step with nothing to do; only 'failed'
    // is a problem, and the log rides along only when there is one.
    it('reports only the FAILED steps, and only on failure', async () => {
        mockTeardown.mockResolvedValue({
            success: false,
            projectDeleted: false,
            items: [
                { kind: 'workspace', id: 'w1', outcome: 'skipped' },
                { kind: 'project', id: 'p1', label: 'Doomed', outcome: 'failed', error: 'in use' },
            ],
            shouldClearConsoleSelection: false,
        });
        const out = await serve()('delete_adobe_project', {
            ...ARGS,
            confirm: true,
            confirmName: 'Doomed',
        });

        expect(out.deleted).toBe(false);
        expect(out.failedSteps).toEqual([{ kind: 'project', label: 'Doomed', error: 'in use' }]);
    });

    it('requires both identifiers', async () => {
        expect(await serve()('delete_adobe_project', { projectId: 'p' })).toMatchObject({
            error: expect.stringMatching(/projectId and projectName are required/),
        });
    });
});
