/**
 * A tile whose project is still being created (PL-82): it says so, and offers
 * nothing to do yet. There is nothing to open, and a delete or rename mid-run would
 * pull the folder out from under the creation.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ProjectCard } from '@/features/projects-dashboard/ui/components/ProjectCard';
import { ProjectRow } from '@/features/projects-dashboard/ui/components/ProjectRow';
import { createProjectsDashboardProject } from '../../testUtils';

const inProvider = (ui: React.ReactElement) =>
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            {ui}
        </Provider>,
    );

const ALL_ACTIONS = { onDelete: jest.fn(), onRenameSubmit: jest.fn(), onExport: jest.fn() };

describe('a project being created', () => {
    const creating = createProjectsDashboardProject({ name: 'canary', status: 'creating' });

    it('says Creating on its card', () => {
        inProvider(<ProjectCard project={creating} onSelect={jest.fn()} />);

        expect(screen.getByText('Creating')).toBeInTheDocument();
    });

    it('does not open on a click or a key press', () => {
        const onSelect = jest.fn();
        inProvider(<ProjectCard project={creating} onSelect={onSelect} />);
        const tile = screen.getByRole('button', { name: /^canary,/ });

        fireEvent.click(tile);
        fireEvent.click(tile, { shiftKey: true });
        fireEvent.keyDown(tile, { key: 'Enter' });

        expect(onSelect).not.toHaveBeenCalled();
    });

    it('offers no menu and no rename on the card, whatever actions are wired', () => {
        inProvider(<ProjectCard project={creating} onSelect={jest.fn()} actions={ALL_ACTIONS} />);

        expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Rename canary' })).not.toBeInTheDocument();
    });

    it('offers neither in the list view either', () => {
        inProvider(<ProjectRow project={creating} onSelect={jest.fn()} actions={ALL_ACTIONS} />);

        expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Rename canary' })).not.toBeInTheDocument();
    });

    it('CONTROL: the same project at rest opens and offers both', () => {
        const atRest = { ...creating, status: 'stopped' as const };
        const onSelect = jest.fn();
        inProvider(<ProjectCard project={atRest} onSelect={onSelect} actions={ALL_ACTIONS} />);

        fireEvent.click(screen.getByRole('button', { name: /^canary,/ }));

        expect(onSelect).toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Rename canary' })).toBeInTheDocument();
    });
});
