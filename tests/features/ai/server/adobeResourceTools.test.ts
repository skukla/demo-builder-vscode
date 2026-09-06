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

import { z } from 'zod';
import { registerAdobeResourceTools } from '@/features/ai/server/adobeResourceTools';
import { withPhaseSinks } from '@/core/utils/agentPhaseChannel';
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
    return async (name: string, args: unknown) =>
        JSON.parse((await tools.get(name)!(args)).content[0].text);
}

/**
 * The descriptor the SDK is handed — dropped by the fake server above, and by
 * every fake like it. That is exactly how `get_component_requirements` shipped a
 * schema the SDK refuses (see realSdkRegistration.test.ts): the argument nothing
 * looked at. `needsAuth` gates the call, `annotations.destructiveHint` is what a
 * client gates a confirmation prompt on, and `inputSchema` is the contract.
 */
type ToolDescriptor = {
    needsAuth: string[];
    annotations: { readOnlyHint: boolean; destructiveHint: boolean };
    description: string;
    inputSchema: Record<string, z.ZodTypeAny>;
};

function descriptorFor(name: string): ToolDescriptor {
    const seen = new Map<string, ToolDescriptor>();
    registerAdobeResourceTools(
        { registerTool: (n: string, d: unknown) => seen.set(n, d as ToolDescriptor) },
        () => createMockHandlerContext({ logger: createMockLogger() })
    );
    return seen.get(name)!;
}

describe('tool descriptors', () => {
    it('gates create_adobe_project behind Adobe sign-in, non-destructively', () => {
        const d = descriptorFor('create_adobe_project');

        expect(d.needsAuth).toEqual(['adobe']);
        expect(d.annotations).toEqual({ readOnlyHint: false, destructiveHint: false });
    });

    it('requires a project name and leaves the description optional', () => {
        const schema = z.object(descriptorFor('create_adobe_project').inputSchema);

        expect(schema.safeParse({}).success).toBe(false);
        expect(schema.safeParse({ name: 'New Project' }).success).toBe(true);
    });

    it('gates create_adobe_workspace behind Adobe sign-in, non-destructively', () => {
        const d = descriptorFor('create_adobe_workspace');

        expect(d.needsAuth).toEqual(['adobe']);
        expect(d.annotations).toEqual({ readOnlyHint: false, destructiveHint: false });
    });

    it('requires a workspace name and leaves the description optional', () => {
        const schema = z.object(descriptorFor('create_adobe_workspace').inputSchema);

        expect(schema.safeParse({}).success).toBe(false);
        expect(schema.safeParse({ name: 'dev' }).success).toBe(true);
    });

    // The one annotation in this file that differs, and the one a client reads
    // before deciding whether to ask the user first.
    it('declares delete_adobe_project DESTRUCTIVE', () => {
        const d = descriptorFor('delete_adobe_project');

        expect(d.needsAuth).toEqual(['adobe']);
        expect(d.annotations).toEqual({ readOnlyHint: false, destructiveHint: true });
    });

    it('takes the id and the name, with both confirmations optional in the schema', () => {
        const schema = z.object(descriptorFor('delete_adobe_project').inputSchema);

        // confirm/confirmName are optional HERE and enforced by the handler, so a
        // caller that omits them gets the refusal text rather than a schema error.
        expect(schema.safeParse({}).success).toBe(false);
        expect(schema.safeParse({ projectId: 'p', projectName: 'Doomed' }).success).toBe(true);
    });
});

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

    // The `args?.` guards are not decoration: the handler is called by the SDK
    // with whatever the agent sent, and a tool that throws on absent arguments
    // fails the whole call instead of answering.
    it('sends empty strings, not a crash, when called with no arguments at all', async () => {
        await serve()('create_adobe_project', undefined);
        expect(createProject).toHaveBeenCalledWith('', '', { orgId: 'org-1' });
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

    // Nothing selected at all — the org guard runs before the project one, and
    // must answer rather than read `projectId` off an absent target.
    it('refuses when no org is selected either', async () => {
        mockGetAdobeTarget.mockReturnValue(undefined);
        const out = await serve()('create_adobe_workspace', { name: 'dev' });

        expect(out.error).toMatch(/select_org/);
        expect(createWorkspace).not.toHaveBeenCalled();
    });

    it('hands off when not signed in, without calling Console', async () => {
        const out = await serve({ authed: false })('create_adobe_workspace', { name: 'dev' });

        expect(out).toMatchObject({ needsAuth: 'adobe' });
        expect(createWorkspace).not.toHaveBeenCalled();
    });

    it('surfaces the service failure REASON verbatim when Console rejects it', async () => {
        createWorkspace.mockResolvedValue({
            error: '400 - Bad Request ("Workspace name already in use")',
        });
        const out = await serve()('create_adobe_workspace', { name: 'dev' });

        expect(out.created).toBe(false);
        expect(out.error).toContain('already in use');
    });

    it('sends empty strings, not a crash, when called with no arguments at all', async () => {
        await serve()('create_adobe_workspace', undefined);
        expect(createWorkspace).toHaveBeenCalledWith('', '', {
            orgId: 'org-1',
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

    it('handles being called with no arguments at all', async () => {
        expect(await serve()('delete_adobe_project', undefined)).toMatchObject({
            error: expect.stringMatching(/projectId and projectName are required/),
        });
    });

    // Both identifiers are trimmed before the emptiness check, so a value that
    // is only whitespace is missing rather than present-and-blank.
    it('treats a whitespace-only projectId as missing', async () => {
        expect(
            await serve()('delete_adobe_project', { projectId: '   ', projectName: 'Doomed' })
        ).toMatchObject({ error: expect.stringMatching(/projectId and projectName are required/) });
    });

    it('treats a whitespace-only projectName as missing', async () => {
        expect(
            await serve()('delete_adobe_project', { projectId: 'proj-1', projectName: '  ' })
        ).toMatchObject({ error: expect.stringMatching(/projectId and projectName are required/) });
    });

    // The gate is confirm AND the echo — an exact echo on its own is not consent.
    it('still refuses when confirmName matches but confirm is absent', async () => {
        const out = await serve()('delete_adobe_project', { ...ARGS, confirmName: 'Doomed' });

        expect(out.irreversible).toBe(true);
        expect(mockTeardown).not.toHaveBeenCalled();
    });

    it('refuses a fully confirmed delete when no org is selected', async () => {
        mockGetAdobeTarget.mockReturnValue(undefined);
        const out = await serve()('delete_adobe_project', {
            ...ARGS,
            confirm: true,
            confirmName: 'Doomed',
        });

        expect(out.error).toMatch(/select_org/);
        expect(mockTeardown).not.toHaveBeenCalled();
    });

    it('hands off a fully confirmed delete when not signed in', async () => {
        const out = await serve({ authed: false })('delete_adobe_project', {
            ...ARGS,
            confirm: true,
            confirmName: 'Doomed',
        });

        expect(out).toMatchObject({ needsAuth: 'adobe' });
        expect(mockTeardown).not.toHaveBeenCalled();
    });

    // Teardown runs long enough that a silent wait reads as a hang, so the
    // reporter it is handed must actually reach the phase channel — and carry
    // the step count, which is how the agent knows it is progressing.
    it('narrates teardown progress onto the phase channel, step count included', async () => {
        mockTeardown.mockImplementation(async (...a: unknown[]) => {
            (a[2] as (p: { message: string; step: number; totalSteps: number }) => void)({
                message: 'Removing event providers',
                step: 2,
                totalSteps: 5,
            });
            return { success: true, projectDeleted: true, items: [], shouldClearConsoleSelection: true };
        });
        const seen: string[] = [];

        await withPhaseSinks([(m) => seen.push(m)], () =>
            serve()('delete_adobe_project', { ...ARGS, confirm: true, confirmName: 'Doomed' })
        );

        expect(seen).toEqual(['Removing event providers (2/5)']);
    });
});
