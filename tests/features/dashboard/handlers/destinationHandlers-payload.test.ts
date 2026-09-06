/**
 * setProjectDestination — the payload, the "nothing changed" case, and the move
 *
 * The sibling suite covers the writer's happy path and its card channels. This
 * one covers the decisions around it: what the handler accepts as a destination
 * at all, what it treats as a CHANGE, what it names the destination in the
 * notification, and what it hands the migration and returns from it.
 *
 * The mock wall and fixtures live in `destinationHandlers.testUtils`.
 */

// The shared mock wall FIRST: importing it is what registers the module mocks,
// and an import of the handler above this line would load it unmocked.
import {
    NEW_DESTINATION,
    makeContext,
    makeContextWithComponents,
    mockBuildDefaultRunnerDeps,
    mockBuildRunnerDepsContext,
    mockMove,
    mockPostRowStatus,
    mockWithProgress,
    reportedSteps,
    resetDestinationMocks,
} from './destinationHandlers.testUtils';
import {
    destinationHandlers,
    handleSetProjectDestination,
    type SetProjectDestinationPayload,
} from '@/features/dashboard/handlers/destinationHandlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

beforeEach(() => {
    resetDestinationMocks();
});

describe('handleSetProjectDestination — a payload that is not a destination', () => {
    it('rejects a missing payload instead of throwing', async () => {
        const { context, saveProject } = makeContext();

        const result = await handleSetProjectDestination(context);

        expect(result.success).toBe(false);
        expect(result.code).toBe('CONFIG_INVALID');
        expect(saveProject).not.toHaveBeenCalled();
    });

    it.each([
        ['neither half', {}],
        ['only a workspace', { workspace: NEW_DESTINATION.workspace }],
        ['only a project', { project: NEW_DESTINATION.project }],
        ['a project with no id', { project: { name: 'X' }, workspace: NEW_DESTINATION.workspace }],
        ['a workspace with no id', { project: NEW_DESTINATION.project, workspace: { name: 'Y' } }],
    ])('rejects %s', async (_label, payload) => {
        const { context, saveProject } = makeContext();

        const result = await handleSetProjectDestination(
            context,
            payload as SetProjectDestinationPayload
        );

        expect(result.success).toBe(false);
        expect(saveProject).not.toHaveBeenCalled();
    });
});

describe('handleSetProjectDestination — what it names the destination', () => {
    it('titles the notification with both halves of the destination', async () => {
        const { context } = makeContext();

        await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(mockWithProgress).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Changing destination to New Project · Production' }),
            expect.any(Function)
        );
    });

    it('falls back to the NAME when a half carries no title', async () => {
        // The console API sends `title` for a workspace it has one for and only
        // `name` otherwise; a destination named "undefined" is what the ?? avoids.
        const { context } = makeContext();

        await handleSetProjectDestination(context, {
            project: { id: 'new-project-id', name: 'NewProject' },
            workspace: { id: 'new-workspace-id', name: 'Production' },
        });

        expect(mockWithProgress).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Changing destination to NewProject · Production' }),
            expect.any(Function)
        );
    });
});

describe('handleSetProjectDestination — what counts as unchanged', () => {
    it('is a change when only the workspace differs', async () => {
        const { context, saveProject } = makeContext();

        const result = await handleSetProjectDestination(context, {
            project: { id: 'old-project-id', name: 'OldProject', title: 'Old Project' },
            workspace: NEW_DESTINATION.workspace,
        });

        expect(result.success).toBe(true);
        expect(saveProject).toHaveBeenCalled();
    });

    it('is a change when only the Adobe project differs', async () => {
        const { context, saveProject } = makeContext();

        const result = await handleSetProjectDestination(context, {
            project: NEW_DESTINATION.project,
            workspace: { id: 'old-workspace-id', name: 'Stage', title: 'Stage' },
        });

        expect(result.success).toBe(true);
        expect(saveProject).toHaveBeenCalled();
    });

    it('says so in the response when nothing changed', async () => {
        // The caller needs to tell "saved" from "nothing to do" — step-02 skips
        // its follow-up entirely on an unchanged destination.
        const { context } = makeContext();

        const result = await handleSetProjectDestination(context, {
            project: { id: 'old-project-id', name: 'OldProject', title: 'Old Project' },
            workspace: { id: 'old-workspace-id', name: 'Stage', title: 'Stage' },
        });

        expect(result.data).toMatchObject({
            unchanged: true,
            destination: { projectId: 'old-project-id', workspace: 'old-workspace-id' },
        });
    });
});

describe('handleSetProjectDestination — a project with no Adobe binding yet', () => {
    /** A project carrying no `adobe` at all — makeContext's default fills one in. */
    function withNoAdobe() {
        const project = { name: 'demo', path: '/p/demo' };
        const saveProject = jest.fn().mockResolvedValue(undefined);
        const context = createMockHandlerContext({
            logger: createMockLogger(),
            stateManager: createMockStateManager({
                getCurrentProject: jest.fn().mockResolvedValue(project),
                saveProject,
            }),
        });
        return { context, saveProject };
    }

    it('writes the destination and seeds the org fields it cannot know', async () => {
        // Nothing wrote `project.adobe` before this handler existed, so a project
        // created by an older build reaches here with none at all.
        const { context, saveProject } = withNoAdobe();

        const result = await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(result.success).toBe(true);
        const saved = saveProject.mock.calls.at(-1)?.[0] as { adobe: Record<string, unknown> };
        expect(saved.adobe).toMatchObject({
            organization: '',
            organizationName: undefined,
            authenticated: true,
            projectId: 'new-project-id',
            workspace: 'new-workspace-id',
        });
    });

    it('reports no previous destination to move away from', async () => {
        const { context } = withNoAdobe();

        const result = await handleSetProjectDestination(context, NEW_DESTINATION);

        expect((result.data as { previous?: unknown }).previous).toBeUndefined();
    });
});

describe('handleSetProjectDestination — what the move is handed and what it says', () => {
    const withComponentIds = (ids: string[]) =>
        makeContextWithComponents(
            Object.fromEntries(ids.map((id) => [id, { kind: 'integration', status: 'deployed' }]))
        );

    const reported = reportedSteps;

    it('counts one integration in the singular', async () => {
        const { context } = withComponentIds(['erp-sync']);

        await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(reported()).toContain('Moving 1 integration…');
    });

    it('counts several in the plural', async () => {
        const { context } = withComponentIds(['erp-sync', 'firefly-shell']);

        await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(reported()).toContain('Moving 2 integrations…');
    });

    it('builds the runner deps against the project and the shared services', async () => {
        const { context, project } = withComponentIds(['erp-sync']);

        await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(mockBuildRunnerDepsContext).toHaveBeenCalledWith(
            context,
            project,
            expect.objectContaining({
                authManager: expect.anything(),
                commandManager: expect.anything(),
            })
        );
    });

    it('relays the deploy tails own steps into the notification', async () => {
        // A multi-minute move reads as a stalled notification without this: the
        // tails narrate themselves and nothing else reports while they run.
        const { context } = withComponentIds(['erp-sync']);

        await handleSetProjectDestination(context, NEW_DESTINATION);

        const relay = mockBuildDefaultRunnerDeps.mock.calls[0][1] as (
            message: string,
            subMessage?: string
        ) => void;
        relay('Deploying erp-sync', 'building');
        relay('Deploying erp-sync');

        expect(reported()).toContain('Deploying erp-sync building');
        expect(reported()).toContain('Deploying erp-sync');
    });

    it('pushes a row status for a component the map does not know', async () => {
        // The migration reports by id; an id the keyed map has lost is not a mesh,
        // and it must still reach the grid rather than throw inside the callback.
        const { context } = withComponentIds(['erp-sync']);

        await handleSetProjectDestination(context, NEW_DESTINATION);
        const onCardStatus = mockMove.mock.calls[0][3] as (
            id: string,
            status: string,
            message?: string
        ) => void;
        onCardStatus('gone-from-the-map', 'deploying');

        expect(mockPostRowStatus).toHaveBeenCalledWith('gone-from-the-map', 'deploying', undefined);
    });

    it('returns the move outcome and the previous destination on success', async () => {
        mockMove.mockResolvedValue({ success: true, moved: ['erp-sync'], failed: [] });
        const { context } = withComponentIds(['erp-sync']);

        const result = await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(result.data).toMatchObject({
            previous: { projectId: 'old-project-id' },
            move: { moved: ['erp-sync'] },
            destination: { projectId: 'new-project-id' },
        });
    });

    it('returns them on failure too, so the caller can point back', async () => {
        mockMove.mockResolvedValue({
            success: false,
            moved: ['firefly-shell'],
            failed: [{ id: 'erp-sync', error: 'boom' }],
        });
        const { context } = withComponentIds(['erp-sync', 'firefly-shell']);

        const result = await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(result.success).toBe(false);
        expect(result.data).toMatchObject({
            previous: { projectId: 'old-project-id' },
            move: { failed: [{ id: 'erp-sync', error: 'boom' }] },
        });
        // The ones that DID land are named — saying nothing implies the run left
        // no trace, and they are still deployed at the new destination.
        expect(result.error).toContain('firefly-shell did reach it');
    });

    it('names every component that failed, not just the first', async () => {
        mockMove.mockResolvedValue({
            success: false,
            moved: [],
            failed: [
                { id: 'erp-sync', error: 'boom' },
                { id: 'firefly-shell', error: 'nope' },
            ],
        });
        const { context } = withComponentIds(['erp-sync', 'firefly-shell']);

        const result = await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(result.error).toContain('erp-sync (boom), firefly-shell (nope)');
    });
});

describe('destinationHandlers map', () => {
    it('registers setProjectDestination', () => {
        expect(destinationHandlers.setProjectDestination).toBe(handleSetProjectDestination);
    });
});
