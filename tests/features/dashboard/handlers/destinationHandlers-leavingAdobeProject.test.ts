/**
 * A destination change that takes integrations out of their Adobe project is
 * confirmed first (AB-23 slice 7).
 *
 * A move had no confirmation, on purpose: it only ever deployed, and changing the
 * destination back undid it (owner, 2026-08-07). Moving into a DIFFERENT Adobe
 * project now removes each integration that has a workspace of its own from the old
 * one — uninstalled from Commerce, its workspace deleted — before adding it again
 * (owner, 2026-09-21). That deletes live resources, and those are confirmed before
 * they run. Every other move still asks nothing.
 *
 * The mock wall and fixtures live in `destinationHandlers.testUtils`.
 */

// The shared mock wall FIRST — see the sibling suites.
import {
    EXISTING_ADOBE,
    NEW_DESTINATION,
    makeContextWithComponents,
    mockMove,
    mockShowWarningMessage,
    resetDestinationMocks,
} from './destinationHandlers.testUtils';
import { handleSetProjectDestination } from '@/features/dashboard/handlers/destinationHandlers';

const ERP_WORKSPACE = { id: 'ws-erp', name: 'Northwind-ERP', title: 'Northwind ERP' };

function bodea() {
    return makeContextWithComponents({
        'eds-accs-mesh': { kind: 'mesh', status: 'deployed' },
        'erp-integration': { kind: 'integration', status: 'deployed', workspace: ERP_WORKSPACE },
        'demo-erp': { kind: 'system', status: 'deployed', workspace: ERP_WORKSPACE },
    });
}

beforeEach(() => {
    resetDestinationMocks();
    mockShowWarningMessage.mockResolvedValue('Move');
});

it('asks first, naming what leaves the old Adobe project and what happens to it', async () => {
    const { context } = bodea();

    await handleSetProjectDestination(context, NEW_DESTINATION);

    expect(mockShowWarningMessage).toHaveBeenCalledWith(
        'Move this project to New Project?',
        {
            modal: true,
            detail:
                'Northwind ERP will be removed from Old Project — uninstalled from Commerce ' +
                'and its workspace deleted — then added again in New Project.',
        },
        'Move',
    );
    expect(mockMove).toHaveBeenCalled();
});

it('changes nothing when the SC declines', async () => {
    mockShowWarningMessage.mockResolvedValue(undefined);
    const { context, project, saveProject } = bodea();

    const result = await handleSetProjectDestination(context, NEW_DESTINATION);

    expect(result).toEqual({ success: false, cancelled: true, error: 'The destination was not changed.' });
    expect(saveProject).not.toHaveBeenCalled();
    expect(mockMove).not.toHaveBeenCalled();
    expect(project.adobe).toEqual(EXISTING_ADOBE);
});

it('asks nothing for another workspace of the SAME Adobe project', async () => {
    const { context } = bodea();

    await handleSetProjectDestination(context, {
        project: { id: EXISTING_ADOBE.projectId, name: 'OldProject', title: 'Old Project' },
        workspace: NEW_DESTINATION.workspace,
    });

    expect(mockShowWarningMessage).not.toHaveBeenCalled();
    expect(mockMove).toHaveBeenCalled();
});

it('asks nothing when no integration has a workspace of its own', async () => {
    const { context } = makeContextWithComponents({ 'eds-accs-mesh': { kind: 'mesh', status: 'deployed' } });

    await handleSetProjectDestination(context, NEW_DESTINATION);

    expect(mockShowWarningMessage).not.toHaveBeenCalled();
});

// Once the old side is gone the project is NOT pointed back, so the message must
// not claim everything still runs at the previous destination.
it('says what did not finish without claiming nothing changed, once the old side is gone', async () => {
    mockMove.mockResolvedValue({
        success: false,
        moved: ['eds-accs-mesh', 'demo-erp'],
        failed: [{ id: 'erp-integration', error: 'boom' }],
        rolledBack: false,
    });
    const { context } = bodea();

    const result = await handleSetProjectDestination(context, NEW_DESTINATION);

    expect(result.success).toBe(false);
    expect(result.error).toBe(
        'Moved to New Project · Production, but erp-integration (boom) did not finish. ' +
            'Redeploy it to try again: it is already set up in the new Adobe project.',
    );
});
