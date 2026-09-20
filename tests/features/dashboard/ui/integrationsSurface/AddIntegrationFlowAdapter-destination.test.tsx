/**
 * Committing a destination must PERSIST it (2026-08-07, live).
 *
 * The handler, the Change control and the migration all existed and were each
 * tested alone — and picking a new project and workspace still did nothing,
 * because nothing connected them. `updateState` wrote the choice to local React
 * state and the modal closed on it.
 *
 * Continue off `dest-workspace` commits `adobeWorkspace`; that is the terminal
 * signal, and it is where the hand-off belongs. Every condition on it is pinned
 * here, because each one alone is enough to make the feature inert again: the
 * journey, the terminal write, and BOTH halves of the destination.
 *
 * The adapter no longer POSTS the change — it hands the chosen pair to the
 * screen, which owns the progress modal the move narrates into (PL-59 slice 5).
 * The condition under test is unchanged; only who sends it moved.
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

/** Every destination handed up to the screen so far. */
function destinationPosts(): unknown[][] {
    return onDestinationChosen.mock.calls;
}

const onDestinationChosen = jest.fn();

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
        renderAdapter({ mode: 'destination', onDestinationChosen });

        pickProject();
        pickWorkspace();

        expect(onDestinationChosen).toHaveBeenCalledWith({
            project: PROJECT_TWO,
            workspace: WORKSPACE_TWO,
        });
    });

    it('does NOT post on the project commit alone — the destination is incomplete', () => {
        renderAdapter({ mode: 'destination', onDestinationChosen });

        pickProject();

        expect(mockPostMessage).not.toHaveBeenCalled();
    });

    // The other half of the same rule. The adapter derives a project id from the
    // LIVE project, but the post carries what this SESSION picked — so a workspace
    // with no project behind it is still incomplete, derived id or not.
    it('does NOT post on the workspace commit alone', () => {
        renderAdapter({ mode: 'destination', onDestinationChosen });

        pickWorkspace();

        expect(destinationPosts()).toStrictEqual([]);
    });

    it('posts once — a later unrelated write does not re-send it', () => {
        renderAdapter({ mode: 'destination', onDestinationChosen });

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
        const view = renderAdapter({ onDestinationChosen });

        view.rerenderWith({ mode: 'destination', onDestinationChosen });
        pickProject();
        pickWorkspace();

        expect(onDestinationChosen).toHaveBeenCalledWith({
            project: PROJECT_TWO,
            workspace: WORKSPACE_TWO,
        });
    });
});
