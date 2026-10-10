/**
 * useIntegrationsScreenActions — what the integrations screen's controls do.
 *
 * Moved out of IntegrationsScreen (EDS-8, 2026-10-08). The screen suites still
 * press the real buttons; this pins the arguments each handler sends, which a
 * stubbed grid or modal cannot see.
 */

import { mockPostMessage } from '../../../../helpers/webviewClientMock';
import { act, renderHook } from '@testing-library/react';
import {
    MESH_OPERATION,
    useIntegrationsScreenActions,
} from '@/features/dashboard/ui/integrationsSurface/useIntegrationsScreenActions';

function setup() {
    const start = jest.fn();
    const hook = renderHook(() => useIntegrationsScreenActions(start));
    return { start, ...hook };
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('useIntegrationsScreenActions', () => {
    it('asks for the update check once per visit, not per render', () => {
        const { rerender } = setup();
        rerender();

        const checks = mockPostMessage.mock.calls.filter(
            ([type]) => type === 'checkIntegrationUpdates',
        );
        expect(checks).toStrictEqual([['checkIntegrationUpdates']]);
    });

    it.each([
        ['handleBack', 'showProjectDashboard'],
        ['handleReAuthenticate', 'reAuthenticate'],
        ['handleRefresh', 'requestStatus'],
    ] as const)('%s sends %s', (handler, message) => {
        const { result } = setup();
        mockPostMessage.mockClear();

        act(() => result.current[handler]());

        expect(mockPostMessage.mock.calls).toStrictEqual([[message]]);
    });

    it('deploys the mesh through the progress modal', () => {
        const { result, start } = setup();

        act(() => result.current.handleDeployMesh());

        expect(start.mock.calls).toStrictEqual([[MESH_OPERATION]]);
    });

    // The id is the extension's MESH_OPERATION_ID, so pushes and the modal name
    // one operation; the titles are what the progress modal shows.
    it('describes the mesh deploy the way the progress modal shows it', () => {
        expect(MESH_OPERATION).toStrictEqual({
            id: 'mesh',
            name: 'API Mesh',
            message: 'deployMesh',
            title: 'Deploying API Mesh',
            failureTitle: "Couldn't deploy API Mesh",
            successTitle: 'API Mesh deployed',
        });
    });

    // A handler that kept the first `start` it saw would open the modal of a
    // runner the screen no longer holds.
    it('follows a new start function rather than keeping the first one', () => {
        const first = jest.fn();
        const second = jest.fn();
        const { result, rerender } = renderHook(
            ({ start }) => useIntegrationsScreenActions(start),
            { initialProps: { start: first } },
        );

        rerender({ start: second });
        act(() => result.current.handleDeployMesh());
        act(() =>
            result.current.handleDestinationChosen({
                project: { id: 'p1', title: 'P' },
                workspace: { id: 'w1', title: 'W' },
            }),
        );

        expect(first).not.toHaveBeenCalled();
        expect(second.mock.calls.map(([op]) => op.id)).toStrictEqual(['mesh', 'destination']);
    });

    it('opens and closes the add journey', () => {
        const { result } = setup();
        expect(result.current.addOpen).toBe(false);

        act(() => result.current.openAdd());
        expect(result.current.addOpen).toBe(true);

        act(() => result.current.closeAdd());
        expect(result.current.addOpen).toBe(false);
    });

    it('opens and closes the destination journey without touching the add one', () => {
        const { result } = setup();

        act(() => result.current.openDestination());
        expect(result.current.destOpen).toBe(true);
        expect(result.current.addOpen).toBe(false);

        act(() => result.current.closeDestination());
        expect(result.current.destOpen).toBe(false);
    });

    it('starts the move under the chosen titles, then closes the journey', () => {
        const { result, start } = setup();
        act(() => result.current.openDestination());
        const project = { id: 'p1', name: 'proj', title: 'Kukla Mesh' };
        const workspace = { id: 'w1', name: 'Stage' };

        act(() => result.current.handleDestinationChosen({ project, workspace }));

        expect(start.mock.calls).toStrictEqual([
            [
                {
                    id: 'destination',
                    name: 'Kukla Mesh · Stage',
                    message: 'setProjectDestination',
                    payload: { project, workspace },
                    title: 'Changing destination to Kukla Mesh · Stage',
                    failureTitle: "Couldn't change the destination",
                    successTitle: 'Destination changed',
                },
            ],
        ]);
        expect(result.current.destOpen).toBe(false);
    });

    it('drops a part with neither title nor name from the target', () => {
        const { result, start } = setup();

        act(() =>
            result.current.handleDestinationChosen({
                project: { id: 'p1', name: 'proj' },
                workspace: { id: 'w1' },
            }),
        );

        expect(start.mock.calls[0][0].name).toBe('proj');
    });

    it('keeps its handlers stable across renders', () => {
        const { result, rerender } = setup();
        const first = result.current;

        rerender();

        expect(result.current.openAdd).toBe(first.openAdd);
        expect(result.current.handleDeployMesh).toBe(first.handleDeployMesh);
        expect(result.current.handleDestinationChosen).toBe(first.handleDestinationChosen);
    });
});
