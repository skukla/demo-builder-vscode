/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ProjectActionsMenu } from '@/features/projects-dashboard/ui/components/ProjectActionsMenu';
import type { ProjectActions } from '@/features/projects-dashboard/ui/components/ProjectActionsMenu';
import { createMockProject } from '../../testUtils';

// Wrap component with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme} colorScheme="light">
            {ui}
        </Provider>,
    );
};

/** Open the kebab and return the rendered menu (mock renders content eagerly). */
const openMenu = (): void => {
    screen.getByLabelText('More actions').click();
};

/** The "More…" submenu container, present only when low-frequency actions exist. */
const submenu = (): HTMLElement => screen.getByTestId('spectrum-submenu');

/** Labels of all menuitems in document order (includes the submenu's items). */
const menuItemLabels = (): string[] =>
    screen.getAllByRole('menuitem').map((item) => item.textContent ?? '');

/** An EDS project — isEdsProject keys off an `eds-` selectedStack. */
const edsProject = (name = 'EDS Project') =>
    createMockProject({ name, selectedStack: 'eds-dalive' } as any);

/**
 * An EDS project carrying a resolved authoring experience in its view model.
 * The backend stamps `resolvedAuthoringExperience` so the UI stays presentational
 * (no resolver / vscode in the webview).
 */
const edsProjectWithExperience = (
    experience: 'universal-editor' | 'experience-workspace',
    name = 'EDS Project',
) =>
    createMockProject({
        name,
        selectedStack: 'eds-dalive',
        resolvedAuthoringExperience: experience,
    } as any);

describe('ProjectActionsMenu', () => {
    describe('rendering and gating', () => {
        it('renders the kebab trigger when at least one action is wired', () => {
            renderWithProvider(
                <ProjectActionsMenu project={createMockProject({ name: 'Test' })} actions={{ onDelete: jest.fn() }} />,
            );
            expect(screen.getByLabelText('More actions')).toBeInTheDocument();
        });

        it('renders no items for callbacks that are absent', () => {
            renderWithProvider(
                <ProjectActionsMenu project={createMockProject({ name: 'Test' })} actions={{ onDelete: jest.fn() }} />,
            );
            openMenu();

            expect(screen.queryByText('Copy Path')).not.toBeInTheDocument();
            expect(screen.queryByText('Edit')).not.toBeInTheDocument();
            // With only Delete wired, there are no groups to head and no submenu.
            expect(screen.queryByTestId('spectrum-submenu-trigger')).not.toBeInTheDocument();
            expect(screen.queryByText('Use')).not.toBeInTheDocument();
            expect(screen.queryByText('Manage')).not.toBeInTheDocument();
        });

        it('invokes the matching callback with the project when an item is selected', () => {
            const project = createMockProject({ name: 'Test' });
            const onDelete = jest.fn();
            renderWithProvider(<ProjectActionsMenu project={project} actions={{ onDelete }} />);
            openMenu();

            screen.getByText('Delete').click();

            expect(onDelete).toHaveBeenCalledWith(project);
        });
    });

    describe('USE group', () => {
        it('heads a "Use" section holding Start Demo and Open AI (non-EDS, stopped)', () => {
            const actions: ProjectActions = { onStartDemo: jest.fn(), onOpenAi: jest.fn() };
            renderWithProvider(
                <ProjectActionsMenu project={createMockProject({ name: 'Test' })} isRunning={false} actions={actions} />,
            );
            openMenu();

            expect(screen.getByText('Use')).toBeInTheDocument();
            expect(screen.getByText('Start Demo')).toBeInTheDocument();
            expect(screen.getByText('Open AI')).toBeInTheDocument();
        });

        it('shows Stop Demo and Open in Browser when the non-EDS demo is running', () => {
            const actions: ProjectActions = {
                onStartDemo: jest.fn(),
                onStopDemo: jest.fn(),
                onOpenBrowser: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu project={createMockProject({ name: 'Test' })} isRunning actions={actions} />,
            );
            openMenu();

            expect(screen.getByText('Stop Demo')).toBeInTheDocument();
            expect(screen.getByText('Open in Browser')).toBeInTheDocument();
            expect(screen.queryByText('Start Demo')).not.toBeInTheDocument();
        });
    });

    describe('MANAGE group', () => {
        it('heads a "Manage" section with Edit, Rename, Pin, Reset in order', () => {
            const actions: ProjectActions = {
                onEdit: jest.fn(),
                onRename: jest.fn(),
                onPinToggle: jest.fn(),
                onResetProject: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu project={createMockProject({ name: 'Test' })} actions={actions} />,
            );
            openMenu();

            expect(screen.getByText('Manage')).toBeInTheDocument();
            const labels = menuItemLabels();
            const renameIdx = labels.findIndex((l) => l.includes('Rename'));
            const resetIdx = labels.findIndex((l) => l.includes('Reset'));
            expect(renameIdx).toBeGreaterThanOrEqual(0);
            expect(renameIdx).toBeLessThan(resetIdx);
        });

        it('keeps Reset a normal Manage action, not in the submenu', () => {
            renderWithProvider(
                <ProjectActionsMenu
                    project={createMockProject({ name: 'Test' })}
                    actions={{ onResetProject: jest.fn(), onCopyPath: jest.fn() }}
                />,
            );
            openMenu();

            // Reset is a top-level menuitem; Copy Path lives in the submenu.
            expect(within(submenu()).queryByText('Reset')).not.toBeInTheDocument();
            expect(within(submenu()).getByText('Copy Path')).toBeInTheDocument();
        });

        it('flips the pin label to Unpin when the project is pinned', () => {
            const project = createMockProject({ name: 'Test', pinned: true } as any);
            renderWithProvider(<ProjectActionsMenu project={project} actions={{ onPinToggle: jest.fn() }} />);
            openMenu();

            expect(screen.getByText('Unpin')).toBeInTheDocument();
            expect(screen.queryByText('Pin')).not.toBeInTheDocument();
        });
    });

    describe('More… submenu', () => {
        it('tucks Copy Path and Export into the submenu', () => {
            const actions: ProjectActions = {
                onCopyPath: jest.fn(),
                onExport: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu project={createMockProject({ name: 'Test' })} actions={actions} />,
            );
            openMenu();

            expect(screen.getByTestId('spectrum-submenu-trigger')).toBeInTheDocument();
            const inSubmenu = within(submenu());
            expect(inSubmenu.getByText('Copy Path')).toBeInTheDocument();
            expect(inSubmenu.getByText('Export')).toBeInTheDocument();
        });

        it('invokes a submenu action with the project when selected', () => {
            const project = createMockProject({ name: 'Test' });
            const onCopyPath = jest.fn();
            renderWithProvider(<ProjectActionsMenu project={project} actions={{ onCopyPath }} />);
            openMenu();

            within(submenu()).getByText('Copy Path').click();

            expect(onCopyPath).toHaveBeenCalledWith(project);
            expect(onCopyPath).toHaveBeenCalledTimes(1);
        });

        it('includes Republish Content in the submenu for EDS projects', () => {
            const actions: ProjectActions = { onRepublishContent: jest.fn(), onCopyPath: jest.fn() };
            renderWithProvider(<ProjectActionsMenu project={edsProject()} actions={actions} />);
            openMenu();

            expect(within(submenu()).getByText('Republish Content')).toBeInTheDocument();
        });

        it('omits Republish Content for non-EDS projects even when wired', () => {
            const actions: ProjectActions = { onRepublishContent: jest.fn(), onCopyPath: jest.fn() };
            renderWithProvider(
                <ProjectActionsMenu project={createMockProject({ name: 'Test' })} actions={actions} />,
            );
            openMenu();

            expect(screen.queryByText('Republish Content')).not.toBeInTheDocument();
        });
    });

    describe('Delete isolation', () => {
        it('renders Delete as the last menuitem', () => {
            const actions: ProjectActions = {
                onStartDemo: jest.fn(),
                onOpenAi: jest.fn(),
                onEdit: jest.fn(),
                onRename: jest.fn(),
                onPinToggle: jest.fn(),
                onResetProject: jest.fn(),
                onCopyPath: jest.fn(),
                onExport: jest.fn(),
                onDelete: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu project={createMockProject({ name: 'Test' })} actions={actions} />,
            );
            openMenu();

            const labels = menuItemLabels();
            expect(labels[labels.length - 1]).toContain('Delete');
        });

        it('keeps Delete out of the More… submenu', () => {
            const actions: ProjectActions = { onCopyPath: jest.fn(), onDelete: jest.fn() };
            renderWithProvider(
                <ProjectActionsMenu project={createMockProject({ name: 'Test' })} actions={actions} />,
            );
            openMenu();

            expect(within(submenu()).queryByText('Delete')).not.toBeInTheDocument();
            expect(screen.getByText('Delete')).toBeInTheDocument();
        });
    });

    describe('EDS vs non-EDS placement', () => {
        it('hides Start/Stop and puts Open in Browser + Author in USE for EDS', () => {
            const actions: ProjectActions = {
                onStartDemo: jest.fn(),
                onStopDemo: jest.fn(),
                onOpenLiveSite: jest.fn(),
                onOpenDaLive: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu project={edsProjectWithExperience('universal-editor')} actions={actions} />,
            );
            openMenu();

            expect(screen.queryByText('Start Demo')).not.toBeInTheDocument();
            expect(screen.queryByText('Stop Demo')).not.toBeInTheDocument();
            expect(screen.getByText('Open in Browser')).toBeInTheDocument();
            expect(screen.getByText('Author in DA.live Classic')).toBeInTheDocument();
        });
    });

    describe('Authoring experience label', () => {
        // The authoring-experience FLIP control was relocated to the Configure
        // webview (setup-time preference with an explicit Save). The dynamic
        // "Author in X" label STAYS here — it reflects the resolved experience.
        it('labels Author with DA.live Classic when the resolved experience is UE', () => {
            renderWithProvider(
                <ProjectActionsMenu
                    project={edsProjectWithExperience('universal-editor')}
                    actions={{ onOpenDaLive: jest.fn() }}
                />,
            );
            openMenu();

            expect(screen.getByText('Author in DA.live Classic')).toBeInTheDocument();
            expect(screen.queryByText('Author in Experience Workspace')).not.toBeInTheDocument();
        });

        it('labels Author with Experience Workspace when the resolved experience is EW', () => {
            renderWithProvider(
                <ProjectActionsMenu
                    project={edsProjectWithExperience('experience-workspace')}
                    actions={{ onOpenDaLive: jest.fn() }}
                />,
            );
            openMenu();

            expect(screen.getByText('Author in Experience Workspace')).toBeInTheDocument();
            expect(screen.queryByText('Author in DA.live Classic')).not.toBeInTheDocument();
        });

        it('shows no Author item for non-EDS projects', () => {
            // Author is EDS-only. With a non-EDS project and another action wired
            // (so the kebab still renders), it does not appear.
            const actions: ProjectActions = {
                onOpenDaLive: jest.fn(),
                onRename: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu project={createMockProject({ name: 'Test' })} actions={actions} />,
            );
            openMenu();

            expect(screen.queryByText('Author in DA.live Classic')).not.toBeInTheDocument();
            expect(screen.queryByText('Author in Experience Workspace')).not.toBeInTheDocument();
        });

        it('renders no flip/switch control (relocated to Configure)', () => {
            renderWithProvider(
                <ProjectActionsMenu
                    project={edsProjectWithExperience('universal-editor')}
                    actions={{ onOpenDaLive: jest.fn() }}
                />,
            );
            openMenu();

            expect(screen.queryByText('Switch to Experience Workspace')).not.toBeInTheDocument();
            expect(screen.queryByText('Switch to DA.live Classic')).not.toBeInTheDocument();
        });
    });

    describe('Open AI action', () => {
        it('renders Open AI in the USE group when wired', () => {
            renderWithProvider(
                <ProjectActionsMenu project={createMockProject({ name: 'Test' })} actions={{ onOpenAi: jest.fn() }} />,
            );
            openMenu();

            // Open AI is a top-level USE item, not a submenu entry.
            expect(screen.getByText('Open AI')).toBeInTheDocument();
            expect(screen.queryByTestId('spectrum-submenu')).not.toBeInTheDocument();
        });

        it('does not render Open AI when the callback is omitted', () => {
            renderWithProvider(
                <ProjectActionsMenu project={createMockProject({ name: 'Test' })} actions={{ onDelete: jest.fn() }} />,
            );
            openMenu();

            expect(screen.queryByText('Open AI')).not.toBeInTheDocument();
        });

        it('invokes onOpenAi with the project when selected', () => {
            const project = createMockProject({ name: 'AI Target' });
            const onOpenAi = jest.fn();
            renderWithProvider(<ProjectActionsMenu project={project} actions={{ onOpenAi }} />);
            openMenu();

            screen.getByText('Open AI').click();

            expect(onOpenAi).toHaveBeenCalledWith(project);
            expect(onOpenAi).toHaveBeenCalledTimes(1);
        });

        it('renders Open AI for EDS projects as well', () => {
            renderWithProvider(<ProjectActionsMenu project={edsProject()} actions={{ onOpenAi: jest.fn() }} />);
            openMenu();

            expect(screen.getByText('Open AI')).toBeInTheDocument();
        });
    });
});
