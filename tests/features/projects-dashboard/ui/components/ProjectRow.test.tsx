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
