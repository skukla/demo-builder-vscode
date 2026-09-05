/**
 * The dashboard's own decisions: which menu entries exist and what each one
 * does, which list renders, when the no-results line appears, and the focus
 * trap it configures.
 *
 * WHY THIS EXISTS. `ProjectsDashboard.test.tsx` covers the three top-level
 * states — loading, empty, populated — and the layout components each one uses.
 * Everything BELOW that was unmeasured: the New menu had one test (the "New
 * Project" entry), the two view modes had none, and the "No projects match"
 * line had none, so the condition that gates it could be inverted, widened or
 * deleted with the suite green.
 *
 * The menu is the part worth naming. Its entries are built conditionally from
 * which callbacks the parent supplied, and `onAction` then re-checks the same
 * callbacks by key. Three near-identical branches side by side is exactly the
 * shape where one gets copied wrong and calls its neighbour.
 */

import '../../../helpers/webviewClientMock';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { ProjectsDashboard, type ProjectsDashboardProps } from '@/features/projects-dashboard/ui/ProjectsDashboard';
import { createMockProjects } from '../testUtils';

function renderDashboard(overrides: Partial<ProjectsDashboardProps> = {}) {
    const props: ProjectsDashboardProps = {
        projects: createMockProjects(3),
        onSelectProject: jest.fn(),
        onCreateProject: jest.fn(),
        ...overrides,
    };
    const result = render(
        <Provider theme={defaultTheme} colorScheme="light">
            <ProjectsDashboard {...props} />
        </Provider>,
    );
    const rerenderWith = (next: Partial<ProjectsDashboardProps>) =>
        result.rerender(
            <Provider theme={defaultTheme} colorScheme="light">
                <ProjectsDashboard {...props} {...next} />
            </Provider>,
        );
    return { ...result, props, rerenderWith };
}

/** Open the New dropdown and return its entries in order. */
async function openNewMenu(): Promise<HTMLElement[]> {
    fireEvent.click(screen.getByRole('button', { name: /^new/i }));
    return screen.findAllByRole('menuitem');
}

/**
 * An entry's LABEL, read off its Text node rather than its textContent — the
 * stubbed icon beside it contributes a <title> to the element's text.
 */
const labelOf = (el: HTMLElement) =>
    el.querySelector('[data-testid="spectrum-text"]')?.textContent ?? '';

/** The row list has no test id of its own; its container class is the hook. */
const rowList = () => document.querySelector('.project-row-list');

const typeSearch = (value: string) =>
    fireEvent.change(screen.getByRole('searchbox', { name: /filter projects/i }), {
        target: { value },
    });

describe('the New menu', () => {
    it('offers only New Project when the parent supplies no other callbacks', async () => {
        renderDashboard();
        const items = await openNewMenu();

        expect(items.map(labelOf)).toEqual(['New Project']);
    });

    it('adds Copy and Import entries, in that order, when both are available', async () => {
        renderDashboard({ onCopyFromExisting: jest.fn(), onImportFromFile: jest.fn() });
        const items = await openNewMenu();

        expect(items.map(labelOf)).toEqual([
            'New Project',
            'Copy from Existing...',
            'Import from File...',
        ]);
    });

    it('adds only the entry whose callback was supplied', async () => {
        renderDashboard({ onImportFromFile: jest.fn() });
        const items = await openNewMenu();

        expect(items.map(labelOf)).toEqual(['New Project', 'Import from File...']);
    });

    // Each entry must call ITS callback and no other. All three callbacks are
    // supplied every time so that a branch reaching past its own key is visible
    // as a call to the wrong one, rather than as silence.
    describe('each entry calls its own callback and no other', () => {
        const cases = [
            ['New Project', 'onCreateProject'],
            ['Copy from Existing...', 'onCopyFromExisting'],
            ['Import from File...', 'onImportFromFile'],
        ] as const;

        it.each(cases)('%s calls %s alone', async (label, expected) => {
            const callbacks = {
                onCreateProject: jest.fn(),
                onCopyFromExisting: jest.fn(),
                onImportFromFile: jest.fn(),
            };
            renderDashboard(callbacks);
            const items = await openNewMenu();

            fireEvent.click(items.find((el) => labelOf(el) === label)!);

            for (const [name, fn] of Object.entries(callbacks)) {
                expect([name, fn.mock.calls.length]).toEqual([name, name === expected ? 1 : 0]);
            }
        });
    });

    // Every entry carries exactly one icon, and it is the one its row asked for.
    // The three conditions are written out per icon, so a wrong one shows up
    // either as a row with two icons or as a row with none.
    it('gives every entry exactly one icon', async () => {
        renderDashboard({ onCopyFromExisting: jest.fn(), onImportFromFile: jest.fn() });
        const items = await openNewMenu();

        expect(items.map((el) => el.querySelectorAll('svg').length)).toEqual([1, 1, 1]);
    });
});

describe('view modes', () => {
    // The grid and the row list are two different components. Rendering both, or
    // neither, is what the two conditions here can be mutated into.
    it('renders the card grid and not the row list by default', () => {
        renderDashboard();

        expect(screen.getByTestId('projects-grid')).toBeInTheDocument();
        expect(rowList()).toBeNull();
    });

    it('renders the row list and not the grid when asked for rows', () => {
        renderDashboard({ initialViewMode: 'rows' });

        expect(rowList()).not.toBeNull();
        expect(screen.queryByTestId('projects-grid')).not.toBeInTheDocument();
    });

    it('switches view and tells the parent when the toggle is used', () => {
        const onViewModeOverride = jest.fn();
        renderDashboard({ onViewModeOverride });

        fireEvent.click(screen.getByRole('button', { name: /list view/i }));

        expect(onViewModeOverride).toHaveBeenCalledWith('rows');
        expect(rowList()).not.toBeNull();
    });

    // The parent is not required to want the notification.
    it('switches view without a parent callback and does not throw', () => {
        renderDashboard();

        expect(() =>
            fireEvent.click(screen.getByRole('button', { name: /list view/i })),
        ).not.toThrow();
        expect(rowList()).not.toBeNull();
    });

    // The effect exists so a setting changed elsewhere reaches a dashboard that
    // is already mounted. Without it — or with the wrong dependency — the view
    // is fixed at whatever it was on first render.
    it('follows initialViewMode when the parent changes it after mount', () => {
        const { rerenderWith } = renderDashboard({ initialViewMode: 'cards' });
        expect(screen.getByTestId('projects-grid')).toBeInTheDocument();

        act(() => rerenderWith({ initialViewMode: 'rows' }));

        expect(rowList()).not.toBeNull();
        expect(screen.queryByTestId('projects-grid')).not.toBeInTheDocument();
    });
});

describe('the no-results line', () => {
    it('appears only when a search is active and matches nothing', () => {
        renderDashboard();
        typeSearch('nothing-matches-this');

        expect(screen.getByText(/No projects match/)).toBeInTheDocument();
    });

    it('stays away when the search matches something', () => {
        renderDashboard();
        typeSearch('Project 1');

        expect(screen.queryByText(/No projects match/)).not.toBeInTheDocument();
    });

    it('stays away when there is no search at all', () => {
        renderDashboard();

        expect(screen.queryByText(/No projects match/)).not.toBeInTheDocument();
    });

    // Whitespace is not a search. Without the trim, spaces would count as a
    // query, match no project, and put "No projects match" on screen for what
    // the user sees as an empty box.
    it('treats a whitespace-only query as no search', () => {
        renderDashboard();
        typeSearch('   ');

        expect(screen.queryByText(/No projects match/)).not.toBeInTheDocument();
    });
});

describe('the refresh control', () => {
    // isRefreshing defaults to false. Defaulting it to true would disable the
    // refresh button on every dashboard that never passes the prop.
    it('is available when the parent says nothing about refreshing', () => {
        renderDashboard({ onRefresh: jest.fn() });

        expect(screen.getByRole('button', { name: /refresh projects/i })).toBeEnabled();
    });

    it('is disabled while a refresh is in flight', () => {
        renderDashboard({ onRefresh: jest.fn(), isRefreshing: true });

        expect(screen.getByRole('button', { name: /refresh projects/i })).toBeDisabled();
    });
});

describe('the focus trap it configures', () => {
    // autoFocus. The dashboard is the first thing a webview shows, and Tab has
    // to work without a click first — so something inside the container must
    // already hold focus when it mounts.
    it('puts focus inside itself on mount', () => {
        const { container } = renderDashboard();

        expect(document.activeElement).not.toBe(document.body);
        expect(container.contains(document.activeElement)).toBe(true);
    });

    // containFocus. Focus landing outside is pulled back, which is what keeps
    // keyboard navigation from escaping the webview into the host chrome.
    //
    // The element has to be FOCUSED, not merely sent a synthetic focusin: with
    // containment off, nothing moves focus and the assertion would pass on the
    // auto-focused element still holding it.
    it('pulls focus back when it lands outside', () => {
        const { container } = renderDashboard();
        const outside = document.createElement('button');
        document.body.appendChild(outside);

        try {
            outside.focus();
            expect(document.activeElement).not.toBe(outside);
            expect(container.contains(document.activeElement)).toBe(true);
        } finally {
            outside.remove();
        }
    });
});
