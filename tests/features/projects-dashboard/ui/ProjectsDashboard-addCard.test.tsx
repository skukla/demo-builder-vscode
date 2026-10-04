/**
 * Your Projects: adding a project is a card at the end of the grid (PL-62), and
 * the card opens the same New / Copy from existing / Import from file menu the
 * header's New button used to (owner, 2026-10-05). The menu's own entries and
 * callbacks are pinned in ProjectsDashboard-menuAndViews.test.tsx, which opens
 * it through this card unchanged.
 */

import '../../../helpers/webviewClientMock';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { ProjectsDashboard, type ProjectsDashboardProps } from '@/features/projects-dashboard/ui/ProjectsDashboard';
import { createMockProjects } from '../testUtils';

function renderDashboard(overrides: Partial<ProjectsDashboardProps> = {}) {
    return render(
        <Provider theme={defaultTheme} colorScheme="light">
            <ProjectsDashboard
                projects={createMockProjects(2)}
                onSelectProject={jest.fn()}
                onCreateProject={jest.fn()}
                {...overrides}
            />
        </Provider>,
    );
}

const addCard = () => screen.queryByTestId('projects-add-card');

describe('the New project card', () => {
    it('is the last cell of the card grid, and the header has no New button', () => {
        renderDashboard();

        const grid = screen.getByTestId('projects-grid');
        expect(grid.lastElementChild).toBe(addCard());
        expect(addCard()).toHaveClass('add-card', 'project-card-spectrum');
        expect(screen.getAllByRole('button', { name: /^new/i })).toHaveLength(1);
    });

    it('is the last row of the list view, shaped like a row', () => {
        renderDashboard({ initialViewMode: 'rows' });

        const list = document.querySelector('.project-row-list');
        expect(list?.lastElementChild).toBe(addCard());
        expect(addCard()).toHaveClass('project-row');
    });

    it('is not counted as a project', () => {
        renderDashboard();

        expect(screen.getByText(/2 projects/)).toBeInTheDocument();
    });

    it('steps aside while a filter is on, and comes back when it clears', () => {
        renderDashboard();
        const search = screen.getByRole('searchbox', { name: /filter projects/i });

        fireEvent.change(search, { target: { value: 'Project 1' } });
        expect(addCard()).toBeNull();

        fireEvent.change(search, { target: { value: '' } });
        expect(addCard()).not.toBeNull();
    });

    it('opens the menu, and New Project starts one', async () => {
        const onCreateProject = jest.fn();
        renderDashboard({ onCreateProject, onImportFromFile: jest.fn() });

        fireEvent.click(screen.getByRole('button', { name: 'New project' }));
        fireEvent.click(await screen.findByRole('menuitem', { name: /new project/i }));

        expect(onCreateProject).toHaveBeenCalledTimes(1);
    });
});
