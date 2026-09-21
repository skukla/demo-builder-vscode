/**
 * A destination is refused when the workspace arrives without its machine name.
 *
 * The name is not decoration. `buildAppData` sends it on every App Management
 * install and refuses without it, so a destination stored with an empty name
 * leaves the project unable to install such an integration at all — and the
 * refusal names an internal field, days after the move that caused it.
 *
 * Measured 2026-09-20 against a real manifest on disk: Kukla Bodea, moved on
 * 2026-09-18, carried `workspaceName: ""` and `buildAppData` answered
 * "The project's Adobe context is missing workspaceName."
 *
 * The agent surface made it possible — `set_project_destination` declared the
 * name optional and described only the id and the title — so the schema now
 * requires it and this refuses anything that still gets through.
 *
 * The mock wall and fixtures live in `destinationHandlers.testUtils`.
 */

// The shared mock wall FIRST — see the sibling suites.
import {
    NEW_DESTINATION,
    makeDestinationContext,
    resetDestinationMocks,
} from './destinationHandlers.testUtils';
import { handleSetProjectDestination } from '@/features/dashboard/handlers/destinationHandlers';
import { ErrorCode } from '@/types/errorCodes';

beforeEach(() => {
    resetDestinationMocks();
});

const REFUSAL =
    'That workspace was given without its name, so the destination was not changed. ' +
    'Choose the workspace again.';

it('refuses a workspace given without its machine name, and persists nothing', async () => {
    const { context, saveProject } = makeDestinationContext();

    const result = await handleSetProjectDestination(context, {
        project: NEW_DESTINATION.project,
        workspace: { id: NEW_DESTINATION.workspace.id, title: 'Stage' },
    });

    expect(result).toEqual({ success: false, error: REFUSAL, code: ErrorCode.CONFIG_INVALID });
    expect(saveProject).not.toHaveBeenCalled();
});

it('refuses an EMPTY name too — the shape a broken project already carries', async () => {
    const { context, saveProject } = makeDestinationContext();

    const result = await handleSetProjectDestination(context, {
        project: NEW_DESTINATION.project,
        workspace: { id: NEW_DESTINATION.workspace.id, name: '', title: 'Stage' },
    });

    expect(result).toEqual({ success: false, error: REFUSAL, code: ErrorCode.CONFIG_INVALID });
    expect(saveProject).not.toHaveBeenCalled();
});

it('CONTROL: the same move WITH a name is not refused for this reason', async () => {
    const { context } = makeDestinationContext();

    const result = await handleSetProjectDestination(context, NEW_DESTINATION);

    expect(result).not.toEqual(
        expect.objectContaining({ error: expect.stringContaining('without its name') }),
    );
});
