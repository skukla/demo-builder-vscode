/**
 * setProjectDestination — persisting the Adobe deploy destination.
 *
 * The gap this closes (found live 2026-08-07): the Add Integration flow's
 * destination stage wrote its choice to `AddIntegrationFlowAdapter`'s local React
 * state and nowhere else. The add payload carried no destination and the deploy
 * read `project.adobe`, which nothing wrote — so creating a Console project
 * mid-flow really created it in Adobe while the integration deployed to the
 * PREVIOUS project's namespace, with the modal showing the new one.
 *
 * This handler is the missing writer.
 */

const mockWithProgress = jest.fn(async (_o: unknown, task: (p: unknown) => unknown) =>
    task({ report: mockProgressReport })
);
const mockProgressReport = jest.fn();
jest.mock(
    'vscode',
    () => ({
        window: {
            withProgress: (...a: unknown[]) =>
                (mockWithProgress as never as (...x: unknown[]) => unknown)(...a),
        },
        ProgressLocation: { Notification: 15 },
    }),
    { virtual: true }
);

const mockMove = jest.fn();
jest.mock('@/features/app-builder/services/appBuilderComponentMigration', () => ({
    moveAppBuilderComponentsToDestination: (...a: unknown[]) => mockMove(...a),
}));

const mockRunGuards = jest.fn();
const mockBuildDefaultRunnerDeps = jest.fn(() => ({ catalog: [] }));
const mockBuildRunnerDepsContext = jest.fn(async () => ({}));
const mockPostRowStatus = jest.fn(async () => undefined);
const mockPostComponentsSnapshot = jest.fn(async () => undefined);
const mockPostDestination = jest.fn(async () => undefined);
const mockPostMeshStatus = jest.fn(async () => undefined);
jest.mock('@/features/dashboard/handlers/appBuilderComponentHandlers', () => ({
    runGuards: (...a: unknown[]) => mockRunGuards(...a),
    postRowStatus: (...a: unknown[]) => mockPostRowStatus(...(a as [])),
    postComponentsSnapshot: (...a: unknown[]) => mockPostComponentsSnapshot(...(a as [])),
    postDestination: (...a: unknown[]) => mockPostDestination(...(a as [])),
    postMeshStatus: (...a: unknown[]) => mockPostMeshStatus(...(a as [])),
}));
jest.mock('@/features/project-creation/services/appBuilderComponentRunnerDeps', () => ({
    buildDefaultRunnerDeps: (...a: unknown[]) => mockBuildDefaultRunnerDeps(...(a as [])),
    buildRunnerDepsContext: (...a: unknown[]) => mockBuildRunnerDepsContext(...(a as [])),
}));

import { handleSetProjectDestination } from '@/features/dashboard/handlers/destinationHandlers';
import type { HandlerContext } from '@/types/handlers';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

const EXISTING_ADOBE = {
    organization: '285361',
    organizationName: 'Adobe Demo System',
    projectId: 'old-project-id',
    projectName: 'OldProject',
    projectTitle: 'Old Project',
    workspace: 'old-workspace-id',
    workspaceName: 'Stage',
    workspaceTitle: 'Stage',
};

const NEW_DESTINATION = {
    project: { id: 'new-project-id', name: 'NewProject', title: 'New Project' },
    workspace: { id: 'new-workspace-id', name: 'Production', title: 'Production' },
};

function makeContext(adobe: Record<string, unknown> | undefined = EXISTING_ADOBE) {
    const project = { name: 'demo', path: '/p/demo', adobe: adobe ? { ...adobe } : undefined };
    const saveProject = jest.fn().mockResolvedValue(undefined);
    const context = {
        logger: createMockLogger(),
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
            saveProject,
        }),
    } as unknown as HandlerContext;
    return { context, project, saveProject };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRunGuards.mockResolvedValue(undefined);
    mockMove.mockResolvedValue({ success: true, moved: [], failed: [] });
});






/**
 * ADR-015 (2026-08-28): this handler resolves the shared services from the REAL
 * registry when assembling runner deps (no module mock reaches this suite), and
 * the shared node setup empties it after every test — so seed per-test.
 */
beforeEach(() => {
    ServiceLocator.setAuthenticationService({
        getTokenManager: () => ({ inspectToken: jest.fn(async () => ({ valid: false })) }),
        getCachedOrganization: jest.fn(),
        getS2SDeployCredentials: jest.fn(),
    } as never);
    ServiceLocator.setCommandExecutor(createMockCommandExecutor());
});

describe('handleSetProjectDestination', () => {
    it('persists the new project and workspace onto project.adobe', async () => {
        const { context, saveProject } = makeContext();

        const result = await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(result.success).toBe(true);
        const saved = saveProject.mock.calls.at(-1)?.[0] as { adobe: Record<string, string> };
        expect(saved.adobe).toMatchObject({
            projectId: 'new-project-id',
            projectName: 'NewProject',
            projectTitle: 'New Project',
            workspace: 'new-workspace-id',
            workspaceName: 'Production',
            workspaceTitle: 'Production',
        });
    });

    it('keeps the org — sign-in owns org selection, this control never changes it', async () => {
        // `adobe-org-context`: IMS tokens are org-bound and there is no in-app org
        // picker. A destination change moves project/workspace WITHIN the org.
        const { context, saveProject } = makeContext();

        await handleSetProjectDestination(context, NEW_DESTINATION);

        const saved = saveProject.mock.calls.at(-1)?.[0] as { adobe: Record<string, string> };
        expect(saved.adobe.organization).toBe('285361');
        expect(saved.adobe.organizationName).toBe('Adobe Demo System');
    });

    it('returns the previous destination so a caller can address the OLD target', async () => {
        // An aborted move points the project back at the old destination. Once
        // `project.adobe` holds the new ref the old one is unrecoverable, so the
        // write has to hand it back. (It is NOT undeployed — a move only deploys.)
        const { context } = makeContext();

        const result = await handleSetProjectDestination(context, NEW_DESTINATION);

        expect((result.data as { previous: unknown })?.previous).toMatchObject({
            projectId: 'old-project-id',
            workspace: 'old-workspace-id',
        });
    });

    it('fails when there is no current project', async () => {
        const context = {
            logger: createMockLogger(),
            stateManager: createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(undefined) }),
        } as unknown as HandlerContext;

        const result = await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(result.success).toBe(false);
    });

    it('rejects an incomplete destination without writing', async () => {
        const { context, saveProject } = makeContext();

        const result = await handleSetProjectDestination(context, {
            project: { id: 'new-project-id', name: 'NewProject', title: 'New Project' },
        } as never);

        expect(result.success).toBe(false);
        expect(saveProject).not.toHaveBeenCalled();
    });
});

/**
 * A project with deployments cannot just re-point: its integrations live in the
 * OLD Console project's Runtime namespace. Changing the destination moves them
 * (user decision 2026-08-07).
 */
describe('handleSetProjectDestination — moving existing integrations', () => {
    function withComponents() {
        const project = {
            name: 'demo',
            path: '/p/demo',
            adobe: { ...EXISTING_ADOBE },
            appBuilderComponents: { 'erp-sync': { kind: 'integration', status: 'deployed' } },
        };
        const saveProject = jest.fn().mockResolvedValue(undefined);
        const context = {
            logger: createMockLogger(),
            stateManager: createMockStateManager({
                getCurrentProject: jest.fn().mockResolvedValue(project),
                saveProject,
            }),
        } as unknown as HandlerContext;
        return { context, saveProject };
    }

    it('moves the integrations, handing the migration the PREVIOUS destination', async () => {
        const { context } = withComponents();

        await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(mockMove).toHaveBeenCalled();
        expect(mockMove.mock.calls[0][1]).toMatchObject({
            projectId: 'old-project-id',
            workspace: 'old-workspace-id',
        });
    });

    it('hands the migration a card channel that reaches the grid', async () => {
        // Without this the move is invisible: the progress notification is
        // project-scoped and owns no card, so every row sat at DEPLOYED for the
        // whole run (found by inspection 2026-08-07). Assert the callback actually
        // reaches postRowStatus rather than merely being passed — a callback wired
        // to nothing looks identical at the call site.
        const { context } = withComponents();

        await handleSetProjectDestination(context, NEW_DESTINATION);

        const onRowStatus = mockMove.mock.calls[0][3] as (
            id: string,
            status: string,
            message?: string
        ) => void;
        expect(typeof onRowStatus).toBe('function');
        onRowStatus('erp-sync', 'deploying', 'Deploying Integration');
        expect(mockPostRowStatus).toHaveBeenCalledWith(
            'erp-sync',
            'deploying',
            'Deploying Integration'
        );
    });

    it('routes the MESH to its own status channel, not the row channel', async () => {
        // The mesh card is keyed 'mesh' and reads `meshStatusUpdate`; the row
        // channel is deliberately told to skip the mesh's component id so it does
        // not synthesize a duplicate card. So a row push for a mesh goes nowhere,
        // and the card sat at DEPLOYED while its deploy ran (reported live
        // 2026-08-07). Which channel a surface uses is the CALLER's job — the same
        // split `progressRegister` documents.
        const project = {
            name: 'demo',
            path: '/p/demo',
            adobe: { ...EXISTING_ADOBE },
            appBuilderComponents: { 'eds-accs-mesh': { kind: 'mesh', status: 'deployed' } },
        };
        const context = {
            logger: createMockLogger(),
            stateManager: createMockStateManager({
                getCurrentProject: jest.fn().mockResolvedValue(project),
                saveProject: jest.fn().mockResolvedValue(undefined),
            }),
        } as unknown as HandlerContext;

        await handleSetProjectDestination(context, NEW_DESTINATION);
        const onRowStatus = mockMove.mock.calls[0][3] as (
            id: string,
            status: string,
            message?: string
        ) => void;
        onRowStatus('eds-accs-mesh', 'deploying', 'Deploying Mesh');

        expect(mockPostMeshStatus).toHaveBeenCalledWith('deploying', 'Deploying Mesh');
        expect(mockPostRowStatus).not.toHaveBeenCalled();
    });

    it('refreshes the grid from the persisted map once the move ends', async () => {
        const { context } = withComponents();

        await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(mockPostComponentsSnapshot).toHaveBeenCalledWith(context);
    });

    it('refreshes the grid even when the move FAILED — rows must not stay spinning', async () => {
        mockMove.mockResolvedValue({
            success: false,
            moved: [],
            failed: [{ id: 'erp-sync', error: 'boom' }],
            rolledBack: true,
        });
        const { context } = withComponents();

        await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(mockPostComponentsSnapshot).toHaveBeenCalledWith(context);
    });

    it('asks nothing first — a move destroys nothing, so it just runs', async () => {
        // There WAS a modal here. It guarded an operation that removes nothing and
        // is undone by changing the destination back, so it cost a click and bought
        // no safety (user decision 2026-08-07). Pinned as behaviour because
        // re-adding a prompt is exactly the kind of change that looks like caution.
        const { context, saveProject } = withComponents();

        const result = await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(result.success).toBe(true);
        expect(saveProject).toHaveBeenCalled();
        expect(mockMove).toHaveBeenCalled();
    });

    it('does not move when there is nothing deployed', async () => {
        const { context } = makeContext();

        await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(mockMove).not.toHaveBeenCalled();
    });

    it('pushes the new destination to the header as soon as it is written', async () => {
        // Not after the move: `project.adobe` already names the new target and every
        // deploy goes there, so a header still showing the old one is wrong for the
        // whole run (reported live 2026-08-07).
        const { context } = withComponents();

        await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(mockPostDestination).toHaveBeenCalledWith(
            expect.objectContaining({ projectTitle: 'New Project', workspaceTitle: 'Production' })
        );
    });

    it('reports failure when a component did not move', async () => {
        mockMove.mockResolvedValue({
            success: false,
            moved: [],
            failed: [{ id: 'erp-sync', error: 'boom' }],
        });
        const { context } = withComponents();

        const result = await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/erp-sync/);
    });
});

/**
 * The standard telegraph (2026-08-07, live).
 *
 * Reported after the first working run: "I see no progress notification which is
 * the standard telegraph mechanism." Every other mutation on this surface narrates
 * itself through `withProgressRegister` — add, deploy, remove — and a destination
 * change redeploys every integration in the project, which can run for minutes, so
 * running it silently is the worst case for the affordance to be missing.
 *
 * The guards were missing too, which these tests also pin: the handler mocked
 * `runGuards` without ever calling it, so the mock made it look wired.
 */
describe('handleSetProjectDestination — telegraph and guards', () => {
    it('narrates through the standard progress notification', async () => {
        const { context } = makeContext();

        await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(mockWithProgress).toHaveBeenCalled();
        expect(mockProgressReport).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('Checking requirements') })
        );
    });

    it('reports the destination it is saving, as a step', async () => {
        const { context } = makeContext();

        await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(mockProgressReport).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('New Project') })
        );
    });

    it('runs the guards, and a guard failure writes NOTHING', async () => {
        mockRunGuards.mockResolvedValue({ error: 'Not signed in', code: 'AUTH' });
        const { context, saveProject } = makeContext();

        const result = await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(mockRunGuards).toHaveBeenCalled();
        expect(saveProject).not.toHaveBeenCalled();
        expect(result.success).toBe(false);
    });
});

describe('handleSetProjectDestination — selecting the destination already in use', () => {
    it('does not persist or move — there is nothing to change', async () => {
        const { context, saveProject } = makeContext();

        const result = await handleSetProjectDestination(context, {
            project: { id: 'old-project-id', name: 'OldProject', title: 'Old Project' },
            workspace: { id: 'old-workspace-id', name: 'Stage', title: 'Stage' },
        });

        expect(result.success).toBe(true);
        expect(saveProject).not.toHaveBeenCalled();
        expect(mockMove).not.toHaveBeenCalled();
    });
});
