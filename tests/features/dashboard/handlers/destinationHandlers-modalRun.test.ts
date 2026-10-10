/**
 * setProjectDestination — a change started from a screen's button (PL-70).
 *
 * Run in the screen's progress modal, the handler has three more things to get
 * right: the operation id the screen named is the one every push carries, the
 * move says WHICH integration is in flight, and a failure hands back what the
 * caller needs to point the project somewhere. Plus two decisions the sibling
 * suites ran past: a context with no auth manager, and the confirm's plural.
 *
 * The mock wall and fixtures live in `destinationHandlers.testUtils`.
 */

// The shared mock wall FIRST — see the sibling suites.
import {
    EXISTING_ADOBE,
    NEW_DESTINATION,
    makeContextWithComponents,
    makeDestinationContext,
    mockBuildDefaultRunnerDeps,
    mockMove,
    mockShowWarningMessage,
    resetDestinationMocks,
} from './destinationHandlers.testUtils';
import { handleSetProjectDestination } from '@/features/dashboard/handlers/destinationHandlers';
import type { OperationProgressPayload } from '@/types/webviewPayloads';

type Context = ReturnType<typeof makeContextWithComponents>['context'];

/** Run the change as a screen's button does, and answer every progress push it sent. */
async function runFromScreen(context: Context, id: string) {
    const screen = jest.fn(async (_type: string, _payload?: unknown): Promise<void> => undefined);
    context.sendMessage = screen;
    const result = await handleSetProjectDestination(context, {
        ...NEW_DESTINATION,
        id,
        progress: 'modal',
    });
    const pushes = screen.mock.calls
        .filter(([type]) => type === 'operationProgress')
        .map(([, payload]) => payload as OperationProgressPayload);
    return { result, pushes };
}

const twoIntegrations = () =>
    makeContextWithComponents({
        'erp-sync': { kind: 'integration', status: 'deployed' },
        'firefly-shell': { kind: 'integration', status: 'deployed' },
    });

/** Make the move report `id` as in flight, then have a deploy tail narrate a step. */
function moveReporting(id: string): void {
    mockMove.mockImplementation(async (_project, _previous, _deps, onCardStatus) => {
        onCardStatus(id, 'deploying');
        const relay = mockBuildDefaultRunnerDeps.mock.calls[0][1] as (message: string) => void;
        relay('Deploying');
        return { success: true, moved: [], failed: [] };
    });
}

beforeEach(() => {
    resetDestinationMocks();
    mockShowWarningMessage.mockResolvedValue('Move');
});

describe('a destination change run in the screen\'s modal', () => {
    it('carries the id the screen named from its first push to its last', async () => {
        const { context } = makeDestinationContext();

        const { pushes } = await runFromScreen(context, 'screen-op-7');

        expect(pushes[0]).toStrictEqual({ id: 'screen-op-7', state: 'running' });
        expect(pushes.at(-1)).toMatchObject({ id: 'screen-op-7', state: 'succeeded' });
        expect(pushes).toContainEqual(
            expect.objectContaining({ id: 'screen-op-7', stage: 'Saving the new destination' }),
        );
    });
});

describe('which integration the move says is in flight', () => {
    it('starts on the first of them', async () => {
        const { context } = twoIntegrations();

        const { pushes } = await runFromScreen(context, 'op');

        expect(pushes).toContainEqual(
            expect.objectContaining({
                stage: 'Moving the integrations',
                position: { index: 1, total: 2, name: 'erp-sync' },
            }),
        );
    });

    it('follows the migration to the second', async () => {
        moveReporting('firefly-shell');
        const { context } = twoIntegrations();

        const { pushes } = await runFromScreen(context, 'op');

        expect(pushes).toContainEqual(
            expect.objectContaining({
                step: 'Deploying',
                position: { index: 2, total: 2, name: 'firefly-shell' },
            }),
        );
    });

    // The migration reports by id. One the keyed map has lost is named by that id
    // and counted as the first, rather than throwing inside the progress relay.
    it('names a component the map has lost by its id', async () => {
        moveReporting('gone-from-the-map');
        const { context } = twoIntegrations();

        const { pushes } = await runFromScreen(context, 'op');

        expect(pushes).toContainEqual(
            expect.objectContaining({
                step: 'Deploying',
                position: { index: 1, total: 2, name: 'gone-from-the-map' },
            }),
        );
    });
});

describe('a move that stopped after the old side was gone', () => {
    it('hands back the destination, the previous one and the move, to act on', async () => {
        const move = {
            success: false,
            moved: ['erp-sync'],
            failed: [{ id: 'firefly-shell', error: 'boom' }],
            rolledBack: false,
        };
        mockMove.mockResolvedValue(move);
        const { context, project } = twoIntegrations();

        const result = await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(result.data).toStrictEqual({
            destination: project.adobe,
            previous: EXISTING_ADOBE,
            move,
        });
    });
});

describe('a project with no org, in a context with no auth manager', () => {
    it('writes the destination with an empty org instead of throwing', async () => {
        const { organization: _o, organizationName: _n, ...noOrg } = EXISTING_ADOBE;
        const { context, saveProject } = makeDestinationContext(noOrg);
        (context as { authManager?: unknown }).authManager = undefined;

        const result = await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(result.success).toBe(true);
        const saved = saveProject.mock.calls.at(-1)?.[0] as { adobe: Record<string, unknown> };
        expect(saved.adobe).toMatchObject({ organization: '', projectId: 'new-project-id' });
    });
});

describe('the confirm before leaving an Adobe project', () => {
    it('speaks of "their workspaces" when more than one will be deleted', async () => {
        const { context } = makeContextWithComponents({
            'erp-integration': {
                kind: 'integration',
                status: 'deployed',
                workspace: { id: 'ws-a', name: 'Northwind-ERP', title: 'Northwind ERP' },
            },
            'erp-integration-2': {
                kind: 'integration',
                status: 'deployed',
                workspace: { id: 'ws-b', name: 'Brand-B-ERP', title: 'Brand B ERP' },
            },
        });

        await handleSetProjectDestination(context, NEW_DESTINATION);

        expect(mockShowWarningMessage).toHaveBeenCalledWith(
            'Move this project to New Project?',
            {
                modal: true,
                detail:
                    'Northwind ERP, Brand B ERP will be removed from Old Project — uninstalled ' +
                    'from Commerce and their workspaces deleted — then added again in New Project.',
            },
            'Move',
        );
    });
});
