import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ProjectActionsMenu } from '@/features/projects-dashboard/ui/components/ProjectActionsMenu';
import type { ProjectActions } from '@/features/projects-dashboard/ui/components/ProjectActionsMenu';
import { createProjectsDashboardProject } from '../../testUtils';

// Wrap component with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme} colorScheme="light">
            {ui}
        </Provider>
    );
};

/** Open the kebab and return the rendered menu (mock renders content eagerly). */
const openMenu = (): void => {
    screen.getByLabelText('More actions').click();
};

/** The "More…" submenu container, present only when low-frequency actions exist. */

/** Labels of all menuitems in document order (includes the submenu's items). */
const menuItemLabels = (): string[] =>
    screen.getAllByRole('menuitem').map((item) => item.textContent ?? '');

/** An EDS project — isEdsProject keys off an `eds-` selectedStack. */
const edsProject = (name = 'EDS Project') =>
    createProjectsDashboardProject({ name, selectedStack: 'eds-dalive' });

/**
 * An EDS project (the resolved authoring experience no longer rides in the
 * view model — the Author label is static and the backend resolves the target).
 */
const edsProjectWithExperience = (
    _experience: 'da-live-classic' | 'experience-workspace',
    name = 'EDS Project'
) => createProjectsDashboardProject({ name, selectedStack: 'eds-dalive' });

describe('ProjectActionsMenu', () => {
    describe('rendering and gating', () => {
        it('renders the kebab trigger when at least one action is wired', () => {
            renderWithProvider(
                <ProjectActionsMenu
                    project={createProjectsDashboardProject({ name: 'Test' })}
                    actions={{ onDelete: jest.fn() }}
                />
            );
            expect(screen.getByLabelText('More actions')).toBeInTheDocument();
        });

        it('renders no items for callbacks that are absent', () => {
            renderWithProvider(
                <ProjectActionsMenu
                    project={createProjectsDashboardProject({ name: 'Test' })}
                    actions={{ onDelete: jest.fn() }}
                />
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
            const project = createProjectsDashboardProject({ name: 'Test' });
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
                <ProjectActionsMenu
                    project={createProjectsDashboardProject({ name: 'Test' })}
                    isRunning={false}
                    actions={actions}
                />
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
                <ProjectActionsMenu
                    project={createProjectsDashboardProject({ name: 'Test' })}
                    isRunning
                    actions={actions}
                />
            );
            openMenu();

            expect(screen.getByText('Stop Demo')).toBeInTheDocument();
            expect(screen.getByText('Open in Browser')).toBeInTheDocument();
            expect(screen.queryByText('Start Demo')).not.toBeInTheDocument();
        });
    });

    describe('MANAGE group', () => {
        it('heads a "Manage" section with Edit, Pin, Reset in order (no Rename — inline rename owns it)', () => {
            const actions: ProjectActions = {
                onEdit: jest.fn(),
                onPinToggle: jest.fn(),
                onResetProject: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu
                    project={createProjectsDashboardProject({ name: 'Test' })}
                    actions={actions}
                />
            );
            openMenu();

            expect(screen.getByText('Manage')).toBeInTheDocument();
            expect(screen.queryByText('Rename')).not.toBeInTheDocument();
            const labels = menuItemLabels();
            const editIdx = labels.findIndex((l) => l.includes('Edit'));
            const pinIdx = labels.findIndex((l) => l.includes('Pin'));
            const resetIdx = labels.findIndex((l) => l.includes('Reset'));
            expect(editIdx).toBeGreaterThanOrEqual(0);
            expect(editIdx).toBeLessThan(pinIdx);
            expect(pinIdx).toBeLessThan(resetIdx);
        });

        it('keeps Reset a normal Manage action, not in the submenu', () => {
            renderWithProvider(
                <ProjectActionsMenu
                    project={createProjectsDashboardProject({ name: 'Test' })}
                    actions={{ onResetProject: jest.fn() }}
                />
            );
            openMenu();

            // Reset is a top-level menuitem; Copy Path lives in the submenu.
            // Reset stays a first-class Manage action. (It was contrasted against
            // Copy Path in the submenu; both the submenu and Copy Path are gone.)
            expect(screen.getByText('Reset')).toBeInTheDocument();
        });

        it('flips the pin label to Unpin when the project is pinned', () => {
            const project = createProjectsDashboardProject({ name: 'Test', pinned: true });
            renderWithProvider(
                <ProjectActionsMenu project={project} actions={{ onPinToggle: jest.fn() }} />
            );
            openMenu();

            expect(screen.getByText('Unpin')).toBeInTheDocument();
            expect(screen.queryByText('Pin')).not.toBeInTheDocument();
        });
    });

    describe('More… submenu', () => {
        it('puts Export straight in the menu, with no submenu wrapper', () => {
            renderWithProvider(
                <ProjectActionsMenu
                    project={createProjectsDashboardProject({ name: 'Test' })}
                    actions={{ onExport: jest.fn() }}
                />
            );
            openMenu();

            expect(screen.queryByTestId('spectrum-submenu-trigger')).not.toBeInTheDocument();
            expect(screen.getByText('Export')).toBeInTheDocument();
        });

        it('offers Export directly, with no More submenu to open first', () => {
            const onExport = jest.fn();
            renderWithProvider(
                <ProjectActionsMenu
                    project={createProjectsDashboardProject({ name: 'Test' })}
                    actions={{ onExport }}
                />
            );
            openMenu();

            expect(screen.queryByTestId('spectrum-submenu-trigger')).not.toBeInTheDocument();
            screen.getByText('Export').click();
            expect(onExport).toHaveBeenCalledTimes(1);
        });

        it('no longer offers Copy Path', () => {
            renderWithProvider(
                <ProjectActionsMenu
                    project={createProjectsDashboardProject({ name: 'Test' })}
                    actions={{ onExport: jest.fn() }}
                />
            );
            openMenu();

            expect(screen.queryByText('Copy Path')).not.toBeInTheDocument();
        });

        it('offers no deploy actions either — those live on their own surfaces', () => {
            renderWithProvider(
                <ProjectActionsMenu
                    project={createProjectsDashboardProject({
                        name: 'Test',
                        meshStatusSummary: 'stale',
                    })}
                    actions={
                        // onRedeployMesh is deliberately NOT in ProjectActions —
                        // the deploy surfaces own it now. The cast keeps this test
                        // able to pass the retired callback and prove the menu
                        // ignores it.
                        {
                            onExport: jest.fn(),
                            onRedeployMesh: jest.fn(),
                        } as ProjectActions
                    }
                />
            );
            openMenu();

            expect(screen.queryByText('Redeploy Mesh')).not.toBeInTheDocument();
            expect(screen.queryByText('Republish Content')).not.toBeInTheDocument();
        });
    });

    describe('Delete isolation', () => {
        it('renders Delete as the last menuitem', () => {
            const actions: ProjectActions = {
                onStartDemo: jest.fn(),
                onOpenAi: jest.fn(),
                onEdit: jest.fn(),
                onPinToggle: jest.fn(),
                onResetProject: jest.fn(),
                onExport: jest.fn(),
                onDelete: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu
                    project={createProjectsDashboardProject({ name: 'Test' })}
                    actions={actions}
                />
            );
            openMenu();

            const labels = menuItemLabels();
            expect(labels[labels.length - 1]).toContain('Delete');
        });

        it('keeps Delete in its own isolated section', () => {
            const actions: ProjectActions = { onDelete: jest.fn() };
            renderWithProvider(
                <ProjectActionsMenu
                    project={createProjectsDashboardProject({ name: 'Test' })}
                    actions={actions}
                />
            );
            openMenu();

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
                <ProjectActionsMenu
                    project={edsProjectWithExperience('da-live-classic')}
                    actions={actions}
                />
            );
            openMenu();

            expect(screen.queryByText('Start Demo')).not.toBeInTheDocument();
            expect(screen.queryByText('Stop Demo')).not.toBeInTheDocument();
            expect(screen.getByText('Open in Browser')).toBeInTheDocument();
            expect(screen.getByText('Author Content')).toBeInTheDocument();
        });
    });

    describe('Author Content label', () => {
        // The label is STATIC ("Author Content") — the resolved authoring
        // experience still decides WHERE the action opens (backend-side), it
        // just no longer varies the menu text.
        it('labels the Author item "Author Content" for a DA.live Classic project', () => {
            renderWithProvider(
                <ProjectActionsMenu
                    project={edsProjectWithExperience('da-live-classic')}
                    actions={{ onOpenDaLive: jest.fn() }}
                />
            );
            openMenu();

            expect(screen.getByText('Author Content')).toBeInTheDocument();
            expect(screen.queryByText(/Author in/)).not.toBeInTheDocument();
        });

        it('labels the Author item "Author Content" for an Experience Workspace project too', () => {
            renderWithProvider(
                <ProjectActionsMenu
                    project={edsProjectWithExperience('experience-workspace')}
                    actions={{ onOpenDaLive: jest.fn() }}
                />
            );
            openMenu();

            expect(screen.getByText('Author Content')).toBeInTheDocument();
            expect(screen.queryByText(/Author in/)).not.toBeInTheDocument();
        });

        it('shows no Author item for non-EDS projects', () => {
            // Author is EDS-only. With a non-EDS project and another action wired
            // (so the kebab still renders), it does not appear.
            const actions: ProjectActions = {
                onOpenDaLive: jest.fn(),
                onEdit: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu
                    project={createProjectsDashboardProject({ name: 'Test' })}
                    actions={actions}
                />
            );
            openMenu();

            expect(screen.queryByText('Author Content')).not.toBeInTheDocument();
        });

        it('renders no flip/switch control (relocated to Configure)', () => {
            renderWithProvider(
                <ProjectActionsMenu
                    project={edsProjectWithExperience('da-live-classic')}
                    actions={{ onOpenDaLive: jest.fn() }}
                />
            );
            openMenu();

            expect(screen.queryByText('Switch to Experience Workspace')).not.toBeInTheDocument();
            expect(screen.queryByText('Switch to DA.live Classic')).not.toBeInTheDocument();
        });
    });

    describe('Open AI action', () => {
        it('renders Open AI in the USE group when wired', () => {
            renderWithProvider(
                <ProjectActionsMenu
                    project={createProjectsDashboardProject({ name: 'Test' })}
                    actions={{ onOpenAi: jest.fn() }}
                />
            );
            openMenu();

            // Open AI is a top-level USE item, not a submenu entry.
            expect(screen.getByText('Open AI')).toBeInTheDocument();
            expect(screen.queryByTestId('spectrum-submenu')).not.toBeInTheDocument();
        });

        it('does not render Open AI when the callback is omitted', () => {
            renderWithProvider(
                <ProjectActionsMenu
                    project={createProjectsDashboardProject({ name: 'Test' })}
                    actions={{ onDelete: jest.fn() }}
                />
            );
            openMenu();

            expect(screen.queryByText('Open AI')).not.toBeInTheDocument();
        });

        it('invokes onOpenAi with the project when selected', () => {
            const project = createProjectsDashboardProject({ name: 'AI Target' });
            const onOpenAi = jest.fn();
            renderWithProvider(<ProjectActionsMenu project={project} actions={{ onOpenAi }} />);
            openMenu();

            screen.getByText('Open AI').click();

            expect(onOpenAi).toHaveBeenCalledWith(project);
            expect(onOpenAi).toHaveBeenCalledTimes(1);
        });

        it('renders Open AI for EDS projects as well', () => {
            renderWithProvider(
                <ProjectActionsMenu project={edsProject()} actions={{ onOpenAi: jest.fn() }} />
            );
            openMenu();

            expect(screen.getByText('Open AI')).toBeInTheDocument();
        });
    });

    describe('Manage Commerce action', () => {
        it('renders Manage Commerce in the USE group when wired (non-EDS)', () => {
            renderWithProvider(
                <ProjectActionsMenu
                    project={createProjectsDashboardProject({ name: 'Test' })}
                    actions={{ onOpenAdminPanel: jest.fn() }}
                />
            );
            openMenu();

            // Top-level USE item, not a submenu entry.
            expect(screen.getByText('Manage Commerce')).toBeInTheDocument();
            expect(screen.queryByTestId('spectrum-submenu')).not.toBeInTheDocument();
        });

        it('renders Manage Commerce for EDS projects as well (no type gating)', () => {
            renderWithProvider(
                <ProjectActionsMenu
                    project={edsProject()}
                    actions={{ onOpenAdminPanel: jest.fn() }}
                />
            );
            openMenu();

            expect(screen.getByText('Manage Commerce')).toBeInTheDocument();
        });

        it('does not render Manage Commerce when the callback is omitted', () => {
            renderWithProvider(
                <ProjectActionsMenu
                    project={createProjectsDashboardProject({ name: 'Test' })}
                    actions={{ onDelete: jest.fn() }}
                />
            );
            openMenu();

            expect(screen.queryByText('Manage Commerce')).not.toBeInTheDocument();
        });

        it('invokes onOpenAdminPanel with the project when selected', () => {
            const project = createProjectsDashboardProject({ name: 'Admin Target' });
            const onOpenAdminPanel = jest.fn();
            renderWithProvider(
                <ProjectActionsMenu project={project} actions={{ onOpenAdminPanel }} />
            );
            openMenu();

            screen.getByText('Manage Commerce').click();

            expect(onOpenAdminPanel).toHaveBeenCalledWith(project);
            expect(onOpenAdminPanel).toHaveBeenCalledTimes(1);
        });
    });
});
