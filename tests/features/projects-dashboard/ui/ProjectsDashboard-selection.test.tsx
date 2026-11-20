/**
 * The projects list's selection mode (owner, 2026-11-04): Select puts a box on every tile and swaps
 * the count for Select All and "N of M selected"; a click ticks a tile instead of opening it; the
 * menu, the pin and rename hide; Select All covers what the filter shows; Reset Selected and
 * Delete Selected hand over the ticked projects; Done or Escape leaves and forgets the ticks.
 */

import '../../../helpers/webviewClientMock';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { ProjectsDashboard, type ProjectsDashboardProps } from '@/features/projects-dashboard/ui/ProjectsDashboard';
import type { ListBatch } from '@/features/projects-dashboard/ui/components/SelectionActions';
import { createMockProjects, createProjectsDashboardProject } from '../testUtils';
import { ruleFor } from '../../../helpers/cssRules';

const PROJECTS = [
    ...createMockProjects(3),
    createProjectsDashboardProject({ name: 'Making', path: '/p/making', status: 'creating' }),
];

function renderDashboard(overrides: Partial<ProjectsDashboardProps> = {}) {
    const batch: ListBatch = { start: jest.fn(), isOpen: false, runs: 0 };
    const props: ProjectsDashboardProps = {
        projects: PROJECTS,
        onSelectProject: jest.fn(),
        onCreateProject: jest.fn(),
        actions: { onRenameSubmit: jest.fn(), onDelete: jest.fn(), onPinToggle: jest.fn() },
        batch,
        ...overrides,
    };
    const ui = (next: Partial<ProjectsDashboardProps>) => (
        <Provider theme={defaultTheme} colorScheme="light">
            <ProjectsDashboard {...props} {...next} />
        </Provider>
    );
    const result = render(ui({}));
    return { ...result, props, batch, rerenderWith: (next: Partial<ProjectsDashboardProps>) => result.rerender(ui(next)) };
}

const tile = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name},`) });
const enterSelection = () => fireEvent.click(screen.getByRole('button', { name: 'Select Projects' }));
const selectAll = () => screen.getByRole('checkbox', { name: 'Select All' });

describe('ProjectsDashboard: selection mode', () => {
    it('offers Select only with a batch window to open', () => {
        renderDashboard({ batch: undefined });

        expect(screen.queryByRole('button', { name: 'Select Projects' })).toBeNull();
    });

    it('Select swaps the count for Select All and the selected count, with the actions', () => {
        renderDashboard();

        expect(screen.getByText('4 projects')).toBeInTheDocument();
        enterSelection();

        expect(screen.queryByText('4 projects')).toBeNull();
        expect(selectAll()).not.toBeChecked();
        expect(screen.getByText('0 of 4 selected')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Reset Selected' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Delete Selected' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    });

    it('a click ticks a tile instead of opening it, and hides the menu, the pin and the add card', () => {
        const { props } = renderDashboard();
        // Control: the tile has its menu and pin before selecting.
        expect(within(tile('Project 2')).getByRole('button', { name: 'More actions' })).toBeInTheDocument();
        expect(within(tile('Project 2')).getByRole('button', { name: 'Pin project' })).toBeInTheDocument();
        enterSelection();

        fireEvent.click(tile('Project 2'));

        expect(props.onSelectProject).not.toHaveBeenCalled();
        expect(tile('Project 2')).toHaveAttribute('aria-pressed', 'true');
        expect(within(tile('Project 2')).getByRole('checkbox')).toBeChecked();
        expect(screen.getByText('1 of 4 selected')).toBeInTheDocument();
        expect(within(tile('Project 2')).queryByRole('button', { name: 'More actions' })).toBeNull();
        expect(within(tile('Project 2')).queryByRole('button', { name: 'Pin project' })).toBeNull();
        expect(screen.queryByTestId('projects-add-card')).toBeNull();
    });

    it('the rows view ticks a row the same way, without its menu', () => {
        const { props } = renderDashboard({ initialViewMode: 'rows' });
        enterSelection();

        fireEvent.click(tile('Project 3'));

        expect(props.onSelectProject).not.toHaveBeenCalled();
        expect(within(tile('Project 3')).getByRole('checkbox')).toBeChecked();
        expect(within(tile('Project 3')).queryByRole('button', { name: 'More actions' })).toBeNull();
    });

    it("ticking the box itself ticks once, and a project being created can't be ticked", () => {
        renderDashboard();
        enterSelection();

        fireEvent.click(within(tile('Project 1')).getByRole('checkbox'));
        fireEvent.click(tile('Making'));

        expect(within(tile('Project 1')).getByRole('checkbox')).toBeChecked();
        expect(within(tile('Making')).getByRole('checkbox')).toBeDisabled();
        expect(screen.getByText('1 of 4 selected')).toBeInTheDocument();
    });

    it('Select All covers the projects the filter shows, and shows some with the dash', () => {
        renderDashboard();
        enterSelection();
        fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Project' } });

        fireEvent.click(tile('Project 1'));
        expect(selectAll()).toHaveAttribute('aria-checked', 'mixed');

        fireEvent.click(selectAll());
        expect(screen.getByText('3 of 3 selected')).toBeInTheDocument();
        expect(selectAll()).toBeChecked();

        fireEvent.click(selectAll());
        expect(screen.getByText('0 of 3 selected')).toBeInTheDocument();
    });

    it('Reset Selected and Delete Selected hand over the ticked projects, in the list order', () => {
        const { batch } = renderDashboard();
        enterSelection();
        fireEvent.click(tile('Project 3'));
        fireEvent.click(tile('Project 1'));

        fireEvent.click(screen.getByRole('button', { name: 'Delete Selected' }));
        fireEvent.click(screen.getByRole('button', { name: 'Reset Selected' }));

        const names = (call: unknown[]) => (call[1] as Array<{ name: string }>).map((p) => p.name);
        expect((batch.start as jest.Mock).mock.calls.map((call) => [call[0], names(call)])).toEqual([
            ['delete', ['Project 1', 'Project 3']],
            ['reset', ['Project 1', 'Project 3']],
        ]);
    });

    it('Done leaves selection mode and forgets the ticks', () => {
        renderDashboard();
        enterSelection();
        fireEvent.click(tile('Project 1'));

        fireEvent.click(screen.getByRole('button', { name: 'Done' }));

        expect(screen.getByText('4 projects')).toBeInTheDocument();
        expect(within(tile('Project 1')).queryByRole('checkbox')).toBeNull();
        enterSelection();
        expect(screen.getByText('0 of 4 selected')).toBeInTheDocument();
    });

    it('Escape leaves selection mode, unless the batch window is open over the list', () => {
        const { rerenderWith, batch } = renderDashboard();
        enterSelection();

        rerenderWith({ batch: { ...batch, isOpen: true } });
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.getByText('0 of 4 selected')).toBeInTheDocument();

        rerenderWith({ batch: { ...batch, isOpen: false } });
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByText('0 of 4 selected')).toBeNull();
    });

    it('a run that starts takes the ticked projects, and the list leaves selection mode', () => {
        const { rerenderWith, batch } = renderDashboard();
        enterSelection();
        fireEvent.click(tile('Project 1'));

        rerenderWith({ batch: { ...batch, runs: 1 } });

        expect(screen.getByRole('button', { name: 'Select Projects' })).toBeInTheDocument();
    });
});

// Entering selection mode made the count row taller and dropped every card (owner, 2026-11-04):
// Select All brought its list row's padding. Asserted against the stylesheet: jsdom has no layout.
describe('the count row in selection mode', () => {
    it('takes no padding from Select All, so the row keeps a button height', () => {
        expect(ruleFor('.projects-select-bar .select-all-row .checkbox-row')).toMatch(/padding:\s*0;/);
    });
});
