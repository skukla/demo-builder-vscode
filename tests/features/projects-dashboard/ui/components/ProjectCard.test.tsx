/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ProjectCard } from '@/features/projects-dashboard/ui/components/ProjectCard';
import { createMockProject, createRunningProject } from '../../testUtils';

// Wrap component with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme} colorScheme="light">
            {ui}
        </Provider>
    );
};

describe('ProjectCard', () => {
    describe('rendering', () => {
        it('should render project name', () => {
            const project = createMockProject({ name: 'My Demo Project' });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            expect(screen.getByText('My Demo Project')).toBeInTheDocument();
        });

        it('should show running status with green indicator', () => {
            const project = createRunningProject({ name: 'Running Demo' });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            // Find the status text specifically (not the project name)
            const statusElements = screen.getAllByText(/running/i);
            // Should have at least the status text
            expect(statusElements.length).toBeGreaterThanOrEqual(1);
            // Status dots should be present. Plural now: a mesh-supporting stack
            // always renders its mesh slot beside the project status.
            expect(screen.getAllByRole('presentation').length).toBeGreaterThanOrEqual(1);
        });

        it('should show stopped status with gray indicator', () => {
            const project = createMockProject({
                name: 'My Demo', // Avoid status word in name
                status: 'stopped',
            });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            expect(screen.getByText('Stopped')).toBeInTheDocument();
        });

        it('should show port number when running', () => {
            const project = createRunningProject({ name: 'Running Demo' });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            // Uses getStatusText which returns "Running on port 3000"
            expect(screen.getByText(/Running on port 3000/)).toBeInTheDocument();
        });

        it('should not show port when stopped', () => {
            const project = createMockProject({
                name: 'Stopped Demo',
                status: 'stopped',
            });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            // Stopped projects show "Stopped" (no port number)
            expect(screen.queryByText(/on port/)).not.toBeInTheDocument();
        });

        it('should display simplified card with name and status only (no component list)', () => {
            // The simplified card design shows only name and status (Standard info density)
            // Component names are intentionally NOT displayed to keep the card clean
            const project = createMockProject();
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            // Should show project name
            expect(screen.getByText('Test Project')).toBeInTheDocument();
            // Should show status
            expect(screen.getByText('Stopped')).toBeInTheDocument();
            // Should NOT show component names (simplified design)
            expect(screen.queryByText('CitiSignal')).not.toBeInTheDocument();
            expect(screen.queryByText('API Mesh')).not.toBeInTheDocument();
        });

        it('should handle project with no components gracefully', () => {
            const project = createMockProject({
                name: 'Empty Project',
                componentInstances: undefined,
            });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            expect(screen.getByText('Empty Project')).toBeInTheDocument();
        });
    });

    describe('mesh status', () => {
        it('should show mesh deployed status when meshStatusSummary is deployed', () => {
            const project = createMockProject({ meshStatusSummary: 'deployed' });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            expect(screen.getByText('Mesh Deployed')).toBeInTheDocument();
        });

        it('should show redeploy needed when meshStatusSummary is stale', () => {
            const project = createMockProject({ meshStatusSummary: 'stale' });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            expect(screen.getByText('Redeploy Mesh')).toBeInTheDocument();
        });

        it('should not show mesh status when meshStatusSummary is not set', () => {
            const project = createMockProject();
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            expect(screen.queryByText('Mesh Deployed')).not.toBeInTheDocument();
            expect(screen.queryByText('Redeploy Mesh')).not.toBeInTheDocument();
        });
    });

    describe('app status', () => {
        it('shows the app status dot from a keyed deployed integration (reloaded project)', () => {
            // Durable keyed entry only — no volatile appStatusSummary, as after a reload.
            const project = createMockProject({
                appBuilderComponents: {
                    'acme-widget': {
                        kind: 'integration',
                        status: 'deployed',
                        source: { owner: 'acme', repo: 'widget' },
                    },
                },
            });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);
            // Counts the integrations rather than naming an "app" the project
            // does not have — see projectStatusUtils.getAppStatusText.
            expect(screen.getByText('1 integration deployed')).toBeInTheDocument();
        });

        it('shows no app status when the project has no keyed integrations', () => {
            renderWithProvider(<ProjectCard project={createMockProject()} onSelect={jest.fn()} />);
            expect(screen.queryByText(/integration/i)).not.toBeInTheDocument();
        });

        it('should show "Mesh Incomplete" when config-incomplete', () => {
            const project = createMockProject({ meshStatusSummary: 'config-incomplete' });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            expect(screen.getByText('Mesh Incomplete')).toBeInTheDocument();
        });

        it('should show "Mesh Error" when error', () => {
            const project = createMockProject({ meshStatusSummary: 'error' });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            expect(screen.getByText('Mesh Error')).toBeInTheDocument();
        });

        // No placeholder line for a project without a mesh: cards are allowed to
        // differ in how many status lines they carry.
        it('shows no mesh line at all when the project has no mesh', () => {
            const project = createMockProject({
                meshStatusSummary: undefined,
                appBuilderComponents: {},
            });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            expect(screen.queryByText(/Mesh/)).not.toBeInTheDocument();
        });
    });

    describe('interactions', () => {
        it('should call onSelect when clicked', () => {
            const project = createMockProject({ name: 'Clickable Demo' });
            const onSelect = jest.fn();
            renderWithProvider(<ProjectCard project={project} onSelect={onSelect} />);

            fireEvent.click(screen.getByRole('button'));

            expect(onSelect).toHaveBeenCalledWith(project);
            expect(onSelect).toHaveBeenCalledTimes(1);
        });

        it('should call onSelect when Enter key is pressed', () => {
            const project = createMockProject({ name: 'Keyboard Demo' });
            const onSelect = jest.fn();
            renderWithProvider(<ProjectCard project={project} onSelect={onSelect} />);

            const card = screen.getByRole('button');
            fireEvent.keyDown(card, { key: 'Enter' });

            expect(onSelect).toHaveBeenCalledWith(project);
        });

        it('should call onSelect when Space key is pressed', () => {
            const project = createMockProject({ name: 'Keyboard Demo' });
            const onSelect = jest.fn();
            renderWithProvider(<ProjectCard project={project} onSelect={onSelect} />);

            const card = screen.getByRole('button');
            fireEvent.keyDown(card, { key: ' ' });

            expect(onSelect).toHaveBeenCalledWith(project);
        });

        it('passes forceNewWindow=true when shift-clicked', () => {
            const project = createMockProject({ name: 'Shift Click' });
            const onSelect = jest.fn();
            renderWithProvider(<ProjectCard project={project} onSelect={onSelect} />);

            fireEvent.click(screen.getByRole('button'), { shiftKey: true });

            expect(onSelect).toHaveBeenCalledWith(project, { forceNewWindow: true });
        });

        it('passes forceNewWindow=true when cmd-clicked (metaKey)', () => {
            const project = createMockProject({ name: 'Cmd Click' });
            const onSelect = jest.fn();
            renderWithProvider(<ProjectCard project={project} onSelect={onSelect} />);

            fireEvent.click(screen.getByRole('button'), { metaKey: true });

            expect(onSelect).toHaveBeenCalledWith(project, { forceNewWindow: true });
        });

        it('does NOT pass forceNewWindow on plain click', () => {
            const project = createMockProject({ name: 'Plain Click' });
            const onSelect = jest.fn();
            renderWithProvider(<ProjectCard project={project} onSelect={onSelect} />);

            fireEvent.click(screen.getByRole('button'));

            // Called with the project as the only positional arg (no opts)
            expect(onSelect).toHaveBeenCalledWith(project);
        });

        it('passes forceNewWindow=true when Shift+Enter is pressed', () => {
            const project = createMockProject({ name: 'Shift Enter' });
            const onSelect = jest.fn();
            renderWithProvider(<ProjectCard project={project} onSelect={onSelect} />);

            const card = screen.getByRole('button');
            fireEvent.keyDown(card, { key: 'Enter', shiftKey: true });

            expect(onSelect).toHaveBeenCalledWith(project, { forceNewWindow: true });
        });
    });

    describe('accessibility', () => {
        it('should have proper aria-label', () => {
            const project = createRunningProject({ name: 'Accessible Demo' });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            const card = screen.getByRole('button');
            expect(card).toHaveAttribute('aria-label', expect.stringContaining('Accessible Demo'));
        });

        it('should be focusable', () => {
            const project = createMockProject({ name: 'Focusable Demo' });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            const card = screen.getByRole('button');
            expect(card).toHaveAttribute('tabIndex', '0');
        });
    });

    describe('Open AI wiring', () => {
        it('should expose Open AI menu item when actions.onOpenAi is provided', () => {
            const project = createMockProject({ name: 'AI Wired Project' });
            const onOpenAi = jest.fn();
            renderWithProvider(
                <ProjectCard project={project} onSelect={jest.fn()} actions={{ onOpenAi }} />
            );

            // Open the kebab menu
            const menuButton = screen.getByLabelText('More actions');
            fireEvent.click(menuButton);

            expect(screen.getByText('Open AI')).toBeInTheDocument();
        });

        it('should invoke onOpenAi with the row project when item is selected', () => {
            const project = createMockProject({ name: 'AI Dispatch Project' });
            const onOpenAi = jest.fn();
            renderWithProvider(
                <ProjectCard project={project} onSelect={jest.fn()} actions={{ onOpenAi }} />
            );

            const menuButton = screen.getByLabelText('More actions');
            fireEvent.click(menuButton);

            const aiItem = screen.getByText('Open AI');
            fireEvent.click(aiItem);

            expect(onOpenAi).toHaveBeenCalledWith(project);
            expect(onOpenAi).toHaveBeenCalledTimes(1);
        });

        it('should NOT render Open AI when actions.onOpenAi is omitted', () => {
            const project = createMockProject({ name: 'No AI Wire Project' });
            renderWithProvider(
                <ProjectCard
                    project={project}
                    onSelect={jest.fn()}
                    actions={{ onCopyPath: jest.fn() }}
                />
            );

            const menuButton = screen.queryByLabelText('More actions');
            if (menuButton) {
                fireEvent.click(menuButton);
            }
            expect(screen.queryByText('Open AI')).not.toBeInTheDocument();
        });
    });

    describe('inline rename', () => {
        it('renders the rename pencil beside the name when onRenameSubmit is wired', () => {
            const project = createMockProject({ name: 'Renamable' });
            renderWithProvider(
                <ProjectCard
                    project={project}
                    onSelect={jest.fn()}
                    actions={{ onRenameSubmit: jest.fn() }}
                />
            );

            expect(screen.getByRole('button', { name: 'Rename Renamable' })).toBeInTheDocument();
        });

        it('hides the pencil while the demo is running (backend rejects renames)', () => {
            const project = createRunningProject({ name: 'Running Project' });
            renderWithProvider(
                <ProjectCard
                    project={project}
                    isRunning
                    onSelect={jest.fn()}
                    actions={{ onRenameSubmit: jest.fn() }}
                />
            );

            expect(
                screen.queryByRole('button', { name: 'Rename Running Project' })
            ).not.toBeInTheDocument();
        });

        it('commits a rename through actions.onRenameSubmit with the project + new name', async () => {
            const project = createMockProject({ name: 'Old Name' });
            const onRenameSubmit = jest.fn().mockResolvedValue(null);
            renderWithProvider(
                <ProjectCard project={project} onSelect={jest.fn()} actions={{ onRenameSubmit }} />
            );

            fireEvent.click(screen.getByRole('button', { name: 'Rename Old Name' }));
            const input = screen.getByRole('textbox');
            fireEvent.change(input, { target: { value: 'New Name' } });
            fireEvent.keyDown(input, { key: 'Enter' });

            await screen.findByText('Old Name'); // back to display mode
            // Card wires normalizeProjectName → spaces become hyphens, lowercased,
            // matching the create-flow project-name affordance.
            expect(onRenameSubmit).toHaveBeenCalledWith(project, 'new-name');
        });

        it('never opens the project while interacting with the rename editor', () => {
            const project = createMockProject({ name: 'Contained' });
            const onSelect = jest.fn();
            renderWithProvider(
                <ProjectCard
                    project={project}
                    onSelect={onSelect}
                    actions={{ onRenameSubmit: jest.fn().mockResolvedValue(null) }}
                />
            );

            fireEvent.click(screen.getByRole('button', { name: 'Rename Contained' }));
            const input = screen.getByRole('textbox');
            fireEvent.click(input);
            fireEvent.keyDown(input, { key: 'Enter' });
            expect(onSelect).not.toHaveBeenCalled();
        });
    });
});
