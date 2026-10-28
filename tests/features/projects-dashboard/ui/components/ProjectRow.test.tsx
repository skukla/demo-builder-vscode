/**
 * ProjectRow — inline rename tests (rows-view parity with ProjectCard).
 *
 * The rows view must offer the same rename-in-place affordance as the card
 * grid: a hover pencil beside the name (hidden while running), committing
 * through actions.onRenameSubmit, contained so the click-to-open row neither
 * opens during rename nor loses its name-click open.
 *
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ProjectRow } from '@/features/projects-dashboard/ui/components/ProjectRow';
import { createProjectsDashboardProject, createRunningProject } from '../../testUtils';

const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme} colorScheme="light">
            {ui}
        </Provider>
    );
};

describe('ProjectRow — inline rename', () => {
    it('renders the rename pencil beside the name when onRenameSubmit is wired', () => {
        const project = createProjectsDashboardProject({ name: 'Row Project' });
        renderWithProvider(
            <ProjectRow
                project={project}
                onSelect={jest.fn()}
                actions={{ onRenameSubmit: jest.fn() }}
            />
        );

        expect(screen.getByRole('button', { name: 'Rename Row Project' })).toBeInTheDocument();
    });

    it('hides the pencil while the demo is running', () => {
        const project = createRunningProject({ name: 'Running Row' });
        renderWithProvider(
            <ProjectRow
                project={project}
                isRunning
                onSelect={jest.fn()}
                actions={{ onRenameSubmit: jest.fn() }}
            />
        );

        expect(
            screen.queryByRole('button', { name: 'Rename Running Row' })
        ).not.toBeInTheDocument();
    });

    it('commits a rename through actions.onRenameSubmit with the project + new name', async () => {
        const project = createProjectsDashboardProject({ name: 'Old Row' });
        const onRenameSubmit = jest.fn().mockResolvedValue(null);
        renderWithProvider(
            <ProjectRow project={project} onSelect={jest.fn()} actions={{ onRenameSubmit }} />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Rename Old Row' }));
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'New Row' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await screen.findByText('Old Row'); // back to display mode
        // The TITLE as typed. The row used to wire `normalizeProjectName`, so a
        // rename rewrote itself to "new-row" under the cursor. The slug is derived
        // in `renameProjectCore` now, which also moves the folder to match.
        expect(onRenameSubmit).toHaveBeenCalledWith(project, 'New Row');
    });

    it('never opens the project while interacting with the rename editor', () => {
        const project = createProjectsDashboardProject({ name: 'Contained Row' });
        const onSelect = jest.fn();
        renderWithProvider(
            <ProjectRow
                project={project}
                onSelect={onSelect}
                actions={{ onRenameSubmit: jest.fn().mockResolvedValue(null) }}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Rename Contained Row' }));
        const input = screen.getByRole('textbox');
        fireEvent.click(input);
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('keeps the name click-transparent: clicking the name still opens the project', () => {
        const project = createProjectsDashboardProject({ name: 'Openable Row' });
        const onSelect = jest.fn();
        renderWithProvider(
            <ProjectRow
                project={project}
                onSelect={onSelect}
                actions={{ onRenameSubmit: jest.fn() }}
            />
        );

        fireEvent.click(screen.getByText('Openable Row'));
        expect(onSelect).toHaveBeenCalledWith(project);
    });
});

/**
 * The parts of the row that are not the rename field.
 *
 * Every one of these is a conditional that renders SOMETHING either way —
 * a pin that is always there, a summary that renders unwrapped, a memo
 * that never recomputes — so a test that only asked "is the text on
 * screen" passed with the condition inverted.
 */
describe('ProjectRow — pin, summary and aria-label', () => {
    /** The slot the summary must land in; the class is what styles it. */
    const summarySlot = (container: HTMLElement) =>
        container.querySelector('.project-row-components');

    // The pin is a button beside the row's menu (owner, 2026-10-28), as on the card.
    it('pins a project from its row, without opening it', () => {
        const project = createProjectsDashboardProject({ name: 'Plain Row' });
        const onPinToggle = jest.fn();
        const onSelect = jest.fn();
        renderWithProvider(<ProjectRow project={project} onSelect={onSelect} actions={{ onPinToggle }} />);

        fireEvent.click(screen.getByRole('button', { name: 'Pin project' }));

        expect(onPinToggle).toHaveBeenCalledWith(project);
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('marks a pinned project when nothing can toggle it, and an unpinned one not at all', () => {
        const { unmount } = renderWithProvider(
            <ProjectRow project={createProjectsDashboardProject({ name: 'Pinned Row', pinned: true })} onSelect={jest.fn()} />,
        );
        expect(screen.getByLabelText('Pinned')).toHaveClass('pin-indicator');
        unmount();

        renderWithProvider(<ProjectRow project={createProjectsDashboardProject({ name: 'Plain Row' })} onSelect={jest.fn()} />);
        expect(screen.queryByLabelText('Pinned')).not.toBeInTheDocument();
    });

    it('renders the component summary inside its own slot, and in the aria-label', () => {
        const project = createProjectsDashboardProject({ name: 'Summarised Row' });
        const { container } = renderWithProvider(
            <ProjectRow project={project} onSelect={jest.fn()} />
        );

        // The slot, not merely the text: rendered unwrapped the words are
        // still on screen and the row loses the class that styles them.
        expect(summarySlot(container)).toHaveTextContent('Headless · API Mesh');
        expect(screen.getByRole('button', { name: /^Summarised Row, / })).toHaveAttribute(
            'aria-label',
            'Summarised Row, Stopped, Headless · API Mesh'
        );
    });

    it('renders no summary slot at all for a project with no components', () => {
        const project = createProjectsDashboardProject({
            name: 'Bare Row',
            componentInstances: {},
        });
        const { container } = renderWithProvider(
            <ProjectRow project={project} onSelect={jest.fn()} />
        );

        expect(summarySlot(container)).toBeNull();
        expect(screen.getByRole('button', { name: 'Bare Row, Stopped' })).toBeInTheDocument();
    });

    it('re-derives the summary when the row is handed a different project', () => {
        // The grid reuses rows across renders. A summary memoised against
        // nothing keeps the first project's components under the second
        // project's name, and nothing else on the row would disagree.
        const first = createProjectsDashboardProject({ name: 'First Row' });
        const second = createProjectsDashboardProject({
            name: 'Second Row',
            componentInstances: {},
        });

        const { container, rerender } = renderWithProvider(
            <ProjectRow project={first} onSelect={jest.fn()} />
        );
        expect(summarySlot(container)).toHaveTextContent('Headless · API Mesh');

        rerender(
            <Provider theme={defaultTheme} colorScheme="light">
                <ProjectRow project={second} onSelect={jest.fn()} />
            </Provider>
        );

        expect(summarySlot(container)).toBeNull();
    });
});
