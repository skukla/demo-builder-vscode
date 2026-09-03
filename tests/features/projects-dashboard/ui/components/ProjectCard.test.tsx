import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ProjectCard } from '@/features/projects-dashboard/ui/components/ProjectCard';
import { createProjectsDashboardProject, createRunningProject } from '../../testUtils';

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
            const project = createProjectsDashboardProject({ name: 'My Demo Project' });
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
            const project = createProjectsDashboardProject({
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
            const project = createProjectsDashboardProject({
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
            const project = createProjectsDashboardProject();
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
            const project = createProjectsDashboardProject({
                name: 'Empty Project',
                componentInstances: undefined,
            });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            expect(screen.getByText('Empty Project')).toBeInTheDocument();
        });
    });

    /**
     * ONE deployment line, not three.
     *
     * The card used to name the mesh ("Mesh · Update needed") and count
     * integrations, while saying nothing about the storefront — whose status
     * function existed, was tested, and was rendered by nobody. Naming one
     * component on the PROJECT card is a leftover from when the mesh was the
     * whole integration story; it is now the first peer card in a dedicated
     * integrations dashboard, and per-component detail belongs there.
     *
     * Wording and worst-of precedence are covered in deploymentSummary.test.ts;
     * these assert what the CARD renders.
     */
    describe('deployment status', () => {
        it('shows one consolidated line, not a per-component one', () => {
            const project = createProjectsDashboardProject({ meshStatusSummary: 'stale' });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            expect(screen.getByText('Attention needed')).toBeInTheDocument();
            expect(screen.queryByText(/^Mesh ·/)).not.toBeInTheDocument();
        });

        it('says Deployed when everything is current', () => {
            const project = createProjectsDashboardProject({ meshStatusSummary: 'deployed' });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            expect(screen.getByText('Deployed')).toBeInTheDocument();
        });

        it('reports a drifted STOREFRONT, which the card could not do before', () => {
            const project = createProjectsDashboardProject({ edsStorefrontStatusSummary: 'stale' });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            expect(screen.getByText('Attention needed')).toBeInTheDocument();
        });

        it('folds integrations into the same line rather than counting them', () => {
            const project = createProjectsDashboardProject({
                appBuilderComponents: {
                    'acme-widget': {
                        kind: 'integration',
                        status: 'deployed',
                        source: { owner: 'acme', repo: 'widget' },
                    },
                },
            });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            expect(screen.getByText('Deployed')).toBeInTheDocument();
            expect(screen.queryByText(/integration/i)).not.toBeInTheDocument();
        });

        it('renders NO deployment line when the project has nothing deployable', () => {
            const project = createProjectsDashboardProject({
                meshStatusSummary: undefined,
                appBuilderComponents: {},
            });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            expect(screen.queryByText('Deployed')).not.toBeInTheDocument();
            expect(screen.queryByText('Attention needed')).not.toBeInTheDocument();
            expect(screen.queryByText(/Mesh/)).not.toBeInTheDocument();
        });

        it('does not make an EDS card say the same thing twice', () => {
            // EDS projects have no running state, so their primary line carried
            // STOREFRONT status. With the storefront now inside the deployment
            // summary, keeping it would render "Republish needed" directly above
            // "Attention needed" — two warning dots for one problem.
            const project = createProjectsDashboardProject({
                selectedStack: 'eds-dalive',
                edsStorefrontStatusSummary: 'stale',
            });
            const { container } = renderWithProvider(
                <ProjectCard project={project} onSelect={jest.fn()} />
            );

            expect(container.querySelectorAll('.project-card-spectrum-status')).toHaveLength(1);
            expect(screen.getByText('Attention needed')).toBeInTheDocument();
            expect(screen.queryByText('Republish needed')).not.toBeInTheDocument();
        });

        it('still shows an EDS republish WHILE it is in flight', () => {
            // Transient and local — the summary has no way to express it.
            const project = createProjectsDashboardProject({
                selectedStack: 'eds-dalive',
                status: 'republishing',
                edsStorefrontStatusSummary: 'published',
            });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            expect(screen.getByText('Republishing...')).toBeInTheDocument();
            expect(screen.getByText('Deployed')).toBeInTheDocument();
        });

        it('keeps the RUNTIME line separate — a different axis', () => {
            // Running locally and "what is deployed is current" are independent;
            // collapsing them would make stopped-but-healthy read as drifted.
            const project = createRunningProject({ meshStatusSummary: 'stale' });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            expect(screen.getByText('Attention needed')).toBeInTheDocument();
            expect(screen.getByText(/Running/)).toBeInTheDocument();
        });
    });

    // NOTE: only the ORDER is verifiable here. The block's vertical ANCHORING is
    // pure flex layout — jsdom resolves no Spectrum tokens (gap renders as the
    // literal "size-100") and `marginTop="auto"` never reaches the DOM — so a test
    // asserting it would pass whether or not the bug is present. That half needs
    // eyes on the running card.
    //
    // The statuses read TOP-DOWN from just beneath the stack description:
    // runtime first, then deployment. The list used to be variable-length — one to
    // three lines — so anchoring it to the card's BOTTOM (margin-top:auto on the
    // first row, in a flex column) made the first line's position depend on how
    // many followed it. Consolidating the deployment lines into one caps it at two,
    // which narrows that problem but does not remove it: a project with nothing
    // deployable still renders one line. Keep the top anchor.
    describe('status order', () => {
        function statusLines(container: HTMLElement): string[] {
            return Array.from(container.querySelectorAll('.project-card-spectrum-status')).map(
                (n) => n.textContent ?? ''
            );
        }

        // The stack summary must NOT absorb the card's leftover height. `flex: 1`
        // on it made it grow to fill, pushing every status row to the card's
        // bottom edge — so on a card with one status line "Published" sat lower
        // than on a card with three. This is the second anchor: removing
        // `marginTop="auto"` from the first status row changed nothing, because
        // the summary was doing the same job one element earlier. Unlike the
        // margin, THIS one is a stylesheet rule, so it is observable here.
        it('does not let the stack summary absorb the card height', () => {
            const css = require('fs').readFileSync(
                'src/core/ui/styles/custom-spectrum.css',
                'utf8'
            ) as string;
            const start = css.indexOf('.project-card-spectrum-components {');
            // Comments stripped first: the rule's own comment explains why there is
            // no flex-grow, and matching that text would make this pass on prose.
            const rule = css.slice(start, css.indexOf('}', start)).replace(/\/\*[\s\S]*?\*\//g, '');

            expect(rule).not.toMatch(/flex:\s*1/);
            expect(rule).not.toMatch(/flex-grow/);
        });

        it('lists runtime first, then deployment', () => {
            const project = createProjectsDashboardProject({
                edsStorefrontStatusSummary: 'published',
                meshStatusSummary: 'deployed',
                appBuilderComponents: {
                    'acme-widget': {
                        kind: 'integration',
                        status: 'deployed',
                        source: { owner: 'acme', repo: 'widget' },
                    },
                },
            });
            const { container } = renderWithProvider(
                <ProjectCard project={project} onSelect={jest.fn()} />
            );

            // Two lines for a project with a storefront, a mesh AND an integration —
            // the case that used to render three.
            const lines = statusLines(container);
            expect(lines).toHaveLength(2);
            // Line 0 is the runtime status; its wording depends on whether the demo
            // is running, which is not what this pins.
            expect(lines[1]).toBe('Deployed');
        });
    });

    describe('interactions', () => {
        it('should call onSelect when clicked', () => {
            const project = createProjectsDashboardProject({ name: 'Clickable Demo' });
            const onSelect = jest.fn();
            renderWithProvider(<ProjectCard project={project} onSelect={onSelect} />);

            fireEvent.click(screen.getByRole('button'));

            expect(onSelect).toHaveBeenCalledWith(project);
            expect(onSelect).toHaveBeenCalledTimes(1);
        });

        it('should call onSelect when Enter key is pressed', () => {
            const project = createProjectsDashboardProject({ name: 'Keyboard Demo' });
            const onSelect = jest.fn();
            renderWithProvider(<ProjectCard project={project} onSelect={onSelect} />);

            const card = screen.getByRole('button');
            fireEvent.keyDown(card, { key: 'Enter' });

            expect(onSelect).toHaveBeenCalledWith(project);
        });

        it('should call onSelect when Space key is pressed', () => {
            const project = createProjectsDashboardProject({ name: 'Keyboard Demo' });
            const onSelect = jest.fn();
            renderWithProvider(<ProjectCard project={project} onSelect={onSelect} />);

            const card = screen.getByRole('button');
            fireEvent.keyDown(card, { key: ' ' });

            expect(onSelect).toHaveBeenCalledWith(project);
        });

        it('passes forceNewWindow=true when shift-clicked', () => {
            const project = createProjectsDashboardProject({ name: 'Shift Click' });
            const onSelect = jest.fn();
            renderWithProvider(<ProjectCard project={project} onSelect={onSelect} />);

            fireEvent.click(screen.getByRole('button'), { shiftKey: true });

            expect(onSelect).toHaveBeenCalledWith(project, { forceNewWindow: true });
        });

        it('passes forceNewWindow=true when cmd-clicked (metaKey)', () => {
            const project = createProjectsDashboardProject({ name: 'Cmd Click' });
            const onSelect = jest.fn();
            renderWithProvider(<ProjectCard project={project} onSelect={onSelect} />);

            fireEvent.click(screen.getByRole('button'), { metaKey: true });

            expect(onSelect).toHaveBeenCalledWith(project, { forceNewWindow: true });
        });

        it('does NOT pass forceNewWindow on plain click', () => {
            const project = createProjectsDashboardProject({ name: 'Plain Click' });
            const onSelect = jest.fn();
            renderWithProvider(<ProjectCard project={project} onSelect={onSelect} />);

            fireEvent.click(screen.getByRole('button'));

            // Called with the project as the only positional arg (no opts)
            expect(onSelect).toHaveBeenCalledWith(project);
        });

        it('passes forceNewWindow=true when Shift+Enter is pressed', () => {
            const project = createProjectsDashboardProject({ name: 'Shift Enter' });
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
            const project = createProjectsDashboardProject({ name: 'Focusable Demo' });
            renderWithProvider(<ProjectCard project={project} onSelect={jest.fn()} />);

            const card = screen.getByRole('button');
            expect(card).toHaveAttribute('tabIndex', '0');
        });
    });

    describe('Open AI wiring', () => {
        it('should expose Open AI menu item when actions.onOpenAi is provided', () => {
            const project = createProjectsDashboardProject({ name: 'AI Wired Project' });
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
            const project = createProjectsDashboardProject({ name: 'AI Dispatch Project' });
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
            const project = createProjectsDashboardProject({ name: 'No AI Wire Project' });
            renderWithProvider(
                <ProjectCard
                    project={project}
                    onSelect={jest.fn()}
                    actions={{ onResetProject: jest.fn() }}
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
            const project = createProjectsDashboardProject({ name: 'Renamable' });
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
            const project = createProjectsDashboardProject({ name: 'Old Name' });
            const onRenameSubmit = jest.fn().mockResolvedValue(null);
            renderWithProvider(
                <ProjectCard project={project} onSelect={jest.fn()} actions={{ onRenameSubmit }} />
            );

            fireEvent.click(screen.getByRole('button', { name: 'Rename Old Name' }));
            const input = screen.getByRole('textbox');
            fireEvent.change(input, { target: { value: 'New Name' } });
            fireEvent.keyDown(input, { key: 'Enter' });

            await screen.findByText('Old Name'); // back to display mode
            // The TITLE as typed, capitals and spaces intact. The card used to
            // wire `normalizeProjectName`, so a rename rewrote itself to
            // "new-name" under the cursor. `renameProjectCore` derives the slug
            // now and moves the folder to match, so the enforcement is unchanged
            // -- it just stopped happening where the user has to watch it.
            expect(onRenameSubmit).toHaveBeenCalledWith(project, 'New Name');
        });

        it('never opens the project while interacting with the rename editor', () => {
            const project = createProjectsDashboardProject({ name: 'Contained' });
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
