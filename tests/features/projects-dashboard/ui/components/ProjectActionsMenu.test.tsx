/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ProjectActionsMenu } from '@/features/projects-dashboard/ui/components/ProjectActionsMenu';
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
    describe('Open Project menu item', () => {
        it('should show Open Project when onOpenFolder is provided', () => {
            const project = createMockProject({ name: 'Test' });
            renderWithProvider(
                <ProjectActionsMenu
                    project={project}
                    onOpenFolder={jest.fn()}
                    onDelete={jest.fn()}
                />,
            );

            // Open the menu by clicking the trigger button
            const menuButton = screen.getByLabelText('More actions');
            menuButton.click();

            expect(screen.getByText('Open Project')).toBeInTheDocument();
        });

        it('should not show Open Project when onOpenFolder is not provided', () => {
            const project = createMockProject({ name: 'Test' });
            renderWithProvider(
                <ProjectActionsMenu
                    project={project}
                    onDelete={jest.fn()}
                />,
            );

            const menuButton = screen.getByLabelText('More actions');
            menuButton.click();

            expect(screen.queryByText('Open Project')).not.toBeInTheDocument();
        });
    });

    describe('Copy Path menu item', () => {
        it('should show Copy Path when onCopyPath is provided', () => {
            const project = createMockProject({ name: 'Test' });
            renderWithProvider(
                <ProjectActionsMenu
                    project={project}
                    onCopyPath={jest.fn()}
                    onDelete={jest.fn()}
                />,
            );

            const menuButton = screen.getByLabelText('More actions');
            menuButton.click();

            expect(screen.getByText('Copy Path')).toBeInTheDocument();
        });

        it('should not show Copy Path when onCopyPath is not provided', () => {
            const project = createMockProject({ name: 'Test' });
            renderWithProvider(
                <ProjectActionsMenu
                    project={project}
                    onDelete={jest.fn()}
                />,
            );

            const menuButton = screen.getByLabelText('More actions');
            menuButton.click();

            expect(screen.queryByText('Copy Path')).not.toBeInTheDocument();
        });
    });

    describe('menu item order', () => {
        it('should place Open Project and Copy Path after Rename and before Reset', () => {
            const project = createMockProject({ name: 'Test' });
            renderWithProvider(
                <ProjectActionsMenu
                    project={project}
                    onEdit={jest.fn()}
                    onRename={jest.fn()}
                    onOpenFolder={jest.fn()}
                    onCopyPath={jest.fn()}
                    onResetProject={jest.fn()}
                    onExport={jest.fn()}
                    onDelete={jest.fn()}
                />,
            );

            const menuButton = screen.getByLabelText('More actions');
            menuButton.click();

            // All items should be present
            const menuItems = screen.getAllByRole('menuitem');
            const labels = menuItems.map(item => item.textContent);

            // Find the indices of the relevant items
            const renameIdx = labels.findIndex(l => l?.includes('Rename'));
            const openFolderIdx = labels.findIndex(l => l?.includes('Open Project'));
            const copyPathIdx = labels.findIndex(l => l?.includes('Copy Path'));
            const resetIdx = labels.findIndex(l => l?.includes('Reset'));

            expect(renameIdx).toBeLessThan(openFolderIdx);
            expect(openFolderIdx).toBeLessThan(copyPathIdx);
            expect(copyPathIdx).toBeLessThan(resetIdx);
        });
    });
});
