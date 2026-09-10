/**
 * Committing a destination must PERSIST it (2026-08-07, live).
 *
 * The handler, the Change control and the migration all existed and were each
 * tested alone — and picking a new project and workspace still did nothing,
 * because nothing connected them. `updateState` wrote the choice to local React
 * state and the modal closed on it.
 *
 * Continue off `dest-workspace` commits `adobeWorkspace`; that is the terminal
 * signal, and it is where the post belongs. Every condition on that post is
 * pinned here, because each one alone is enough to make the feature inert again:
 * the journey, the terminal write, and BOTH halves of the destination.
 */

import { act } from '@testing-library/react';
import { mockPostMessage } from '../../../../helpers/webviewClientMock';
import {
    PROJECT_TWO,
    WORKSPACE_TWO,
    modalProps,
    renderAdapter,
    resetCaptured,
} from './AddIntegrationFlowAdapter.testUtils';

beforeEach(() => {
    jest.clearAllMocks();
    resetCaptured();
});

/** Every `setProjectDestination` post so far. */
function destinationPosts(): unknown[][] {
    return mockPostMessage.mock.calls.filter(([type]) => type === 'setProjectDestination');
}

function pickProject(): void {
    act(() => {
        modalProps().updateState({ adobeProject: PROJECT_TWO });
    });
}

function pickWorkspace(): void {
    act(() => {
        modalProps().updateState({ adobeWorkspace: WORKSPACE_TWO });
    });
}

describe('AddIntegrationFlowAdapter — persisting a destination change', () => {
    it('posts setProjectDestination when the workspace commit lands', () => {
        renderAdapter({ mode: 'destination' });

        pickProject();
        pickWorkspace();

        expect(mockPostMessage).toHaveBeenCalledWith('setProjectDestination', {
            project: PROJECT_TWO,
            workspace: WORKSPACE_TWO,
        });
    });

    it('does NOT post on the project commit alone — the destination is incomplete', () => {
        renderAdapter({ mode: 'destination' });

        pickProject();

        expect(mockPostMessage).not.toHaveBeenCalled();
    });

    // The other half of the same rule. The adapter derives a project id from the
    // LIVE project, but the post carries what this SESSION picked — so a workspace
    // with no project behind it is still incomplete, derived id or not.
    it('does NOT post on the workspace commit alone', () => {
        renderAdapter({ mode: 'destination' });

        pickWorkspace();

        expect(destinationPosts()).toStrictEqual([]);
    });

    it('posts once — a later unrelated write does not re-send it', () => {
        renderAdapter({ mode: 'destination' });

        pickProject();
        pickWorkspace();
        act(() => modalProps().updateState({ projectsCache: [] }));

        expect(destinationPosts()).toHaveLength(1);
    });

    it('does NOT post in add mode — that journey deploys, it does not re-point', () => {
        renderAdapter();

        pickWorkspace();

        expect(destinationPosts()).toStrictEqual([]);
    });

    // Both halves picked, still add mode: the journey is what decides, not the
    // completeness of the pair.
    it('does NOT post in add mode even once BOTH halves are picked', () => {
        renderAdapter();

        pickProject();
        pickWorkspace();

        expect(destinationPosts()).toStrictEqual([]);
    });

    // The Integrations header can switch the surface from adding to re-pointing
    // without unmounting the adapter, so the commit callback has to be rebuilt on
    // the new mode rather than keeping the one it closed over first.
    it('honours a switch into destination mode after the first render', () => {
        const view = renderAdapter();

        view.rerenderWith({ mode: 'destination' });
        pickProject();
        pickWorkspace();

        expect(mockPostMessage).toHaveBeenCalledWith('setProjectDestination', {
            project: PROJECT_TWO,
            workspace: WORKSPACE_TWO,
        });
    });
});
