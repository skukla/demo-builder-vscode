/**
 * reset_project on a HEADLESS project — the half the tool gained on 2026-10-03.
 *
 * Until then an agent could reset only an Edge Delivery project; the person's
 * Reset button covered both kinds. What is pinned here is HOW the shared core is
 * invoked (the project, the context, the two services), not just that it
 * answered: the core is mocked, and a mock answers the same whatever it is
 * handed.
 */

jest.mock('@/features/lifecycle/services/projectResetService', () => ({
    executeProjectReset: jest.fn(),
}));
jest.mock('@/features/eds/services/reset/edsResetService', () => ({
    executeEdsReset: jest.fn(),
    extractResetParams: jest.fn(),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(),
    getDaLiveAuthService: jest.fn(),
    resolveByomOverlayConfig: jest.fn(),
}));
jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    createDaLiveServiceTokenProvider: jest.fn(() => ({})),
}));

const mockInspectToken = jest.fn();
const commandExecutor = { execute: jest.fn() };
const authService = { getTokenManager: () => ({ inspectToken: mockInspectToken }) };
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => authService),
        getCommandExecutor: jest.fn(() => commandExecutor),
    },
}));
jest.mock('@/features/ai/server/adobeTargetStore', () => ({
    runWithAdobeTarget: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));
const mockReportPhase = jest.fn();
jest.mock('@/core/utils/agentPhaseChannel', () => ({
    reportPhase: (...a: unknown[]) => mockReportPhase(...a),
}));

import { runWithAdobeTarget } from '@/features/ai/server/adobeTargetStore';
import { registerResetProjectTool } from '@/features/ai/server/resetProjectTool';
import { executeEdsReset } from '@/features/eds/services/reset/edsResetService';
import { executeProjectReset } from '@/features/lifecycle/services/projectResetService';
import type { Project } from '@/types/base';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const executeProjectResetMock = executeProjectReset as jest.Mock;

type ToolHandler = (args: unknown) => Promise<{ content: Array<{ text: string }> }>;

function fakeServer() {
    const tools = new Map<string, ToolHandler>();
    return {
        registerTool(name: string, _def: unknown, handler: ToolHandler) {
            tools.set(name, handler);
        },
        async call(args?: unknown): Promise<Record<string, unknown>> {
            return JSON.parse((await tools.get('reset_project')!(args)).content[0].text);
        },
    };
}

const getCurrentProject = jest.fn();
const logger = createMockLogger();
const ctxFactory = () =>
    createMockHandlerContext({
        stateManager: createMockStateManager({ getCurrentProject }),
        context: createMockExtensionContext(),
        logger,
    });

/** A headless project as the manifest holds one: a stack, a frontend instance, no storefront repo. */
function headlessProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'headless-demo',
        path: '/p/headless-demo',
        status: 'ready',
        selectedStack: 'headless-paas',
        componentInstances: {},
        ...overrides,
    });
}

const MESH_INSTANCE = {
    id: 'commerce-mesh',
    name: 'API Mesh',
    type: 'dependency' as const,
    subType: 'mesh' as const,
    status: 'deployed' as const,
    path: '/p/headless-demo/components/commerce-mesh',
};

function call(args?: unknown) {
    const s = fakeServer();
    registerResetProjectTool(s, ctxFactory);
    return s.call(args);
}

describe('reset_project on a headless project', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentProject.mockResolvedValue(headlessProject());
        mockInspectToken.mockResolvedValue({ valid: true });
        executeProjectResetMock.mockImplementation(
            async (
                _deps: unknown,
                report: (stage: string, step?: string, at?: { index: number; total: number }) => void,
            ) => {
                report('Reading what this project has', undefined, { index: 1, total: 6 });
                report('Downloading the components', undefined, { index: 3, total: 6 });
                report('Downloading the components', 'Cloning citisignal', { index: 3, total: 6 });
                return { success: true, meshRedeployed: false };
            },
        );
    });

    it('refuses without confirm:true, naming the project and what a reset removes', async () => {
        const res = await call({});

        expect(res).toMatchObject({ destructive: true, project: 'headless-demo', kind: 'headless' });
        expect(res.error).toContain('"headless-demo" (/p/headless-demo)');
        expect(res.error).toContain('deletes the components');
        expect(res.error).toContain('confirm:true');
        expect(executeProjectResetMock).not.toHaveBeenCalled();
    });

    it('hands the shared core THIS project, the call context and the two services', async () => {
        const project = headlessProject();
        getCurrentProject.mockResolvedValue(project);

        await call({ confirm: true });

        const [deps, report] = executeProjectResetMock.mock.calls[0];
        expect(deps.project).toBe(project);
        expect(deps.context.logger).toBe(logger);
        expect(deps.commandManager).toBe(commandExecutor);
        expect(deps.authManager).toBe(authService);
        expect(Object.keys(deps).sort()).toEqual([
            'authManager',
            'commandManager',
            'context',
            'logPrefix',
            'project',
        ]);
        expect(report).toEqual(expect.any(Function));
        expect(executeEdsReset).not.toHaveBeenCalled();
    });

    it('runs under the stored session org context, so a mesh redeploy targets it', async () => {
        await call({ confirm: true });

        expect(runWithAdobeTarget).toHaveBeenCalledTimes(1);
    });

    it('answers with the project, one timeline row per stage, and what the mesh did', async () => {
        const res = await call({ confirm: true });

        expect(res).toEqual({
            reset: true,
            project: 'headless-demo',
            kind: 'headless',
            meshRedeployed: false,
            phases: [
                { step: 1, totalSteps: 6, message: 'Reading what this project has' },
                { step: 3, totalSteps: 6, message: 'Downloading the components' },
            ],
        });
        // Live, in the words the button's notification uses.
        expect(mockReportPhase).toHaveBeenCalledWith('Reading what this project has (1 of 6)');
        expect(mockReportPhase).toHaveBeenCalledWith('Downloading the components (3 of 6)');
    });

    it.each(['running', 'starting'] as const)(
        'refuses a %s demo and names stop_demo, rather than stopping it unasked',
        async (status) => {
            getCurrentProject.mockResolvedValue(headlessProject({ status }));

            const res = await call({ confirm: true });

            expect(res.error).toContain('stop_demo');
            expect(res).toMatchObject({ project: 'headless-demo' });
            expect(executeProjectResetMock).not.toHaveBeenCalled();
        },
    );

    it('hands off to Adobe sign-in when the project has a mesh and Adobe is not signed in', async () => {
        getCurrentProject.mockResolvedValue(
            headlessProject({ componentInstances: { 'commerce-mesh': MESH_INSTANCE } }),
        );
        mockInspectToken.mockResolvedValue({ valid: false });

        expect(await call({ confirm: true })).toMatchObject({ needsAuth: 'adobe' });
        expect(executeProjectResetMock).not.toHaveBeenCalled();
    });

    it('needs no Adobe sign-in for a project with no mesh', async () => {
        mockInspectToken.mockResolvedValue({ valid: false });

        expect(await call({ confirm: true })).toMatchObject({ reset: true });
    });

    it('says the mesh was redeployed, and carries the warning when it was not', async () => {
        getCurrentProject.mockResolvedValue(
            headlessProject({ componentInstances: { 'commerce-mesh': MESH_INSTANCE } }),
        );
        executeProjectResetMock.mockResolvedValueOnce({ success: true, meshRedeployed: true });
        expect(await call({ confirm: true })).toMatchObject({ reset: true, meshRedeployed: true });

        executeProjectResetMock.mockResolvedValueOnce({
            success: true,
            error: 'Reset completed but mesh redeployment failed: aio exploded',
            meshRedeployed: false,
        });
        expect(await call({ confirm: true })).toMatchObject({
            reset: true,
            meshRedeployed: false,
            warning: 'Reset completed but mesh redeployment failed: aio exploded',
        });
    });

    it('answers a reset the core refused as not reset, with its reason', async () => {
        executeProjectResetMock.mockResolvedValueOnce({
            success: false,
            error: 'No components found for this project stack',
        });

        expect(await call({ confirm: true })).toMatchObject({
            reset: false,
            project: 'headless-demo',
            error: 'No components found for this project stack',
        });
    });

    it('answers a thrown failure as re-runnable and never passes the raw text on', async () => {
        const cause = new Error('fatal: could not read Username for github.com');
        executeProjectResetMock.mockRejectedValueOnce(cause);

        const res = await call({ confirm: true });

        expect(res).toMatchObject({
            reset: false,
            project: 'headless-demo',
            stage: 'project-reset',
            rerunSafe: true,
        });
        expect(String(res.error)).not.toContain('could not read Username');
        expect(String(res.error)).toContain('Debug Logs');
    });
});
