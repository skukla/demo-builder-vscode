/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
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

describe('ProjectActionsMenu', () => {
    describe('actions prop interface', () => {
        it('should render menu items from actions object', () => {
            const project = createMockProject({ name: 'Test' });
            const actions: ProjectActions = {
                onCopyPath: jest.fn(),
                onDelete: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu
                    project={project}
                    actions={actions}
                />,
            );

            const menuButton = screen.getByLabelText('More actions');
            menuButton.click();

            expect(screen.getByText('Copy Path')).toBeInTheDocument();
            expect(screen.getByText('Delete')).toBeInTheDocument();
        });

        it('should show Copy Path from actions object', () => {
            const project = createMockProject({ name: 'Test' });
            const actions: ProjectActions = {
                onCopyPath: jest.fn(),
                onDelete: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu
                    project={project}
                    actions={actions}
                />,
            );

            const menuButton = screen.getByLabelText('More actions');
            menuButton.click();

            expect(screen.getByText('Copy Path')).toBeInTheDocument();
        });

        it('should not show items when callbacks are absent in actions', () => {
            const project = createMockProject({ name: 'Test' });
            const actions: ProjectActions = {
                onDelete: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu
                    project={project}
                    actions={actions}
                />,
            );

            const menuButton = screen.getByLabelText('More actions');
            menuButton.click();

            expect(screen.queryByText('Open Project')).not.toBeInTheDocument();
            expect(screen.queryByText('Copy Path')).not.toBeInTheDocument();
        });

        it('should maintain item order with actions prop', () => {
            const project = createMockProject({ name: 'Test' });
            const actions: ProjectActions = {
                onEdit: jest.fn(),
                onRename: jest.fn(),
                onCopyPath: jest.fn(),
                onResetProject: jest.fn(),
                onExport: jest.fn(),
                onDelete: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu
                    project={project}
                    actions={actions}
                />,
            );

            const menuButton = screen.getByLabelText('More actions');
            menuButton.click();

            const menuItems = screen.getAllByRole('menuitem');
            const labels = menuItems.map(item => item.textContent);

            const renameIdx = labels.findIndex(l => l?.includes('Rename'));
            const copyPathIdx = labels.findIndex(l => l?.includes('Copy Path'));
            const resetIdx = labels.findIndex(l => l?.includes('Reset'));

            expect(renameIdx).toBeLessThan(copyPathIdx);
            expect(copyPathIdx).toBeLessThan(resetIdx);
        });

        it('should invoke correct action callback when item selected', () => {
            const project = createMockProject({ name: 'Test' });
            const actions: ProjectActions = {
                onDelete: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu
                    project={project}
                    actions={actions}
                />,
            );

            const menuButton = screen.getByLabelText('More actions');
            menuButton.click();

            const deleteItem = screen.getByText('Delete');
            deleteItem.click();

            expect(actions.onDelete).toHaveBeenCalledWith(project);
        });
    });

    describe('Open AI action (Batch E3)', () => {
        it('should render Open AI menu item when onOpenAi is provided', () => {
            const project = createMockProject({ name: 'Test' });
            const actions: ProjectActions = {
                onOpenAi: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu
                    project={project}
                    actions={actions}
                />,
            );

            const menuButton = screen.getByLabelText('More actions');
            menuButton.click();

            expect(screen.getByText('Open AI')).toBeInTheDocument();
        });

        it('should NOT render Open AI menu item when callback is omitted', () => {
            const project = createMockProject({ name: 'Test' });
            const actions: ProjectActions = {
                onDelete: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu
                    project={project}
                    actions={actions}
                />,
            );

            const menuButton = screen.getByLabelText('More actions');
            menuButton.click();

            expect(screen.queryByText('Open AI')).not.toBeInTheDocument();
        });

        it('should invoke onOpenAi with the project when item is selected', () => {
            const project = createMockProject({ name: 'AI Target Project' });
            const actions: ProjectActions = {
                onOpenAi: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu
                    project={project}
                    actions={actions}
                />,
            );

            const menuButton = screen.getByLabelText('More actions');
            menuButton.click();

            const aiItem = screen.getByText('Open AI');
            aiItem.click();

            expect(actions.onOpenAi).toHaveBeenCalledWith(project);
            expect(actions.onOpenAi).toHaveBeenCalledTimes(1);
        });

        it('should render Open AI for EDS projects as well', () => {
            // EDS project: storefrontPath set marks it as EDS via isEdsProject typeGuard
            const project = createMockProject({
                name: 'EDS AI Project',
                storefrontPath: 'eds-storefront',
            } as any);
            const actions: ProjectActions = {
                onOpenAi: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu
                    project={project}
                    actions={actions}
                />,
            );

            const menuButton = screen.getByLabelText('More actions');
            menuButton.click();

            expect(screen.getByText('Open AI')).toBeInTheDocument();
        });

        it('should place Open AI adjacent to Open in Claude Code (same group, before Delete)', () => {
            const project = createMockProject({ name: 'Test' });
            const actions: ProjectActions = {
                onOpenAi: jest.fn(),
                onOpenInClaudeCode: jest.fn(),
                onDelete: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu
                    project={project}
                    actions={actions}
                />,
            );

            const menuButton = screen.getByLabelText('More actions');
            menuButton.click();

            const menuItems = screen.getAllByRole('menuitem');
            const labels = menuItems.map((item) => item.textContent ?? '');

            const aiIdx = labels.findIndex((l) => l.includes('Open AI'));
            const claudeIdx = labels.findIndex((l) => l.includes('Open in Claude Code'));
            const deleteIdx = labels.findIndex((l) => l.includes('Delete'));

            expect(aiIdx).toBeGreaterThanOrEqual(0);
            expect(claudeIdx).toBeGreaterThanOrEqual(0);
            expect(deleteIdx).toBeGreaterThanOrEqual(0);
            // Open AI and Open in Claude Code both sit before Delete (same group)
            expect(aiIdx).toBeLessThan(deleteIdx);
            expect(claudeIdx).toBeLessThan(deleteIdx);
            // Adjacent: difference is 1
            expect(Math.abs(aiIdx - claudeIdx)).toBe(1);
        });
    });

    describe('Open in Claude Code action', () => {
        it('should render Open in Claude Code menu item when onOpenInClaudeCode is provided', () => {
            const project = createMockProject({ name: 'Test' });
            const actions: ProjectActions = {
                onOpenInClaudeCode: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu
                    project={project}
                    actions={actions}
                />,
            );

            const menuButton = screen.getByLabelText('More actions');
            menuButton.click();

            expect(screen.getByText('Open in Claude Code')).toBeInTheDocument();
        });

        it('should NOT render Open in Claude Code menu item when callback is omitted', () => {
            const project = createMockProject({ name: 'Test' });
            const actions: ProjectActions = {
                onDelete: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu
                    project={project}
                    actions={actions}
                />,
            );

            const menuButton = screen.getByLabelText('More actions');
            menuButton.click();

            expect(screen.queryByText('Open in Claude Code')).not.toBeInTheDocument();
        });

        it('should invoke onOpenInClaudeCode with the project when item is selected', () => {
            const project = createMockProject({ name: 'Test' });
            const actions: ProjectActions = {
                onOpenInClaudeCode: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu
                    project={project}
                    actions={actions}
                />,
            );

            const menuButton = screen.getByLabelText('More actions');
            menuButton.click();

            const claudeItem = screen.getByText('Open in Claude Code');
            claudeItem.click();

            expect(actions.onOpenInClaudeCode).toHaveBeenCalledWith(project);
            expect(actions.onOpenInClaudeCode).toHaveBeenCalledTimes(1);
        });

        it('should render Open in Claude Code for EDS projects as well', () => {
            // EDS project: storefrontPath set marks it as EDS via isEdsProject typeGuard
            const project = createMockProject({
                name: 'EDS Project',
                storefrontPath: 'eds-storefront',
            } as any);
            const actions: ProjectActions = {
                onOpenInClaudeCode: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu
                    project={project}
                    actions={actions}
                />,
            );

            const menuButton = screen.getByLabelText('More actions');
            menuButton.click();

            expect(screen.getByText('Open in Claude Code')).toBeInTheDocument();
        });

        it('should place Open in Claude Code before Delete in the menu', () => {
            const project = createMockProject({ name: 'Test' });
            const actions: ProjectActions = {
                onOpenInClaudeCode: jest.fn(),
                onDelete: jest.fn(),
            };
            renderWithProvider(
                <ProjectActionsMenu
                    project={project}
                    actions={actions}
                />,
            );

            const menuButton = screen.getByLabelText('More actions');
            menuButton.click();

            const menuItems = screen.getAllByRole('menuitem');
            const labels = menuItems.map((item) => item.textContent ?? '');

            const claudeIdx = labels.findIndex((l) => l.includes('Open in Claude Code'));
            const deleteIdx = labels.findIndex((l) => l.includes('Delete'));

            expect(claudeIdx).toBeGreaterThanOrEqual(0);
            expect(deleteIdx).toBeGreaterThanOrEqual(0);
            expect(claudeIdx).toBeLessThan(deleteIdx);
        });
    });
});
