/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { Sidebar } from '@/features/sidebar/ui/Sidebar';
import {
    createProjectsContext,
    createProjectContext,
    createWizardContext,
    createConfigureContext,
} from '../testUtils';

// Wrap component with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme} colorScheme="light">
            {ui}
        </Provider>
    );
};

describe('Sidebar', () => {
    describe('Projects context', () => {
        it('should render "Demo Builder" header', () => {
            renderWithProvider(
                <Sidebar
                    context={createProjectsContext()}
                    onNavigate={jest.fn()}
                />
            );

            expect(screen.getByText('Demo Builder')).toBeInTheDocument();
        });

        it('should render Projects navigation item', () => {
            renderWithProvider(
                <Sidebar
                    context={createProjectsContext()}
                    onNavigate={jest.fn()}
                />
            );

            expect(screen.getByText('Projects')).toBeInTheDocument();
        });

        it('should not show back button on Projects context', () => {
            const onBack = jest.fn();
            renderWithProvider(
                <Sidebar
                    context={createProjectsContext()}
                    onNavigate={jest.fn()}
                    onBack={onBack}
                />
            );

            // Back button should not be rendered for projects context
            expect(screen.queryByText('Projects', { selector: 'button' })).not.toBeInTheDocument();
            expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
        });
    });

    describe('Project Detail context', () => {
        it('should render project name as header', () => {
            renderWithProvider(
                <Sidebar
                    context={createProjectContext({ name: 'My Demo Project' })}
                    onNavigate={jest.fn()}
                />
            );

            expect(screen.getByText('My Demo Project')).toBeInTheDocument();
        });

        it('should render navigation items: Overview, Configure, Updates', () => {
            renderWithProvider(
                <Sidebar
                    context={createProjectContext()}
                    onNavigate={jest.fn()}
                />
            );

            expect(screen.getByText('Overview')).toBeInTheDocument();
            expect(screen.getByText('Configure')).toBeInTheDocument();
            expect(screen.getByText('Updates')).toBeInTheDocument();
        });

        it('should show back button with "Projects" text', () => {
            const onBack = jest.fn();
            renderWithProvider(
                <Sidebar
                    context={createProjectContext()}
                    onNavigate={jest.fn()}
                    onBack={onBack}
                />
            );

            const backButton = screen.getByRole('button', { name: /projects/i });
            expect(backButton).toBeInTheDocument();
        });

        it('should call onBack when back button clicked', () => {
            const onBack = jest.fn();
            renderWithProvider(
                <Sidebar
                    context={createProjectContext()}
                    onNavigate={jest.fn()}
                    onBack={onBack}
                />
            );

            const backButton = screen.getByRole('button', { name: /projects/i });
            fireEvent.click(backButton);

            expect(onBack).toHaveBeenCalled();
        });

        it('should call onNavigate when navigation item clicked', () => {
            const onNavigate = jest.fn();
            renderWithProvider(
                <Sidebar
                    context={createProjectContext()}
                    onNavigate={onNavigate}
                />
            );

            fireEvent.click(screen.getByText('Configure'));

            expect(onNavigate).toHaveBeenCalledWith('configure');
        });
    });

    describe('Configure context', () => {
        it('should render project name as header', () => {
            renderWithProvider(
                <Sidebar
                    context={createConfigureContext({ name: 'Config Project' })}
                    onNavigate={jest.fn()}
                />
            );

            expect(screen.getByText('Config Project')).toBeInTheDocument();
        });

        it('should render navigation with Configure active', () => {
            renderWithProvider(
                <Sidebar
                    context={createConfigureContext()}
                    onNavigate={jest.fn()}
                />
            );

            // Configure should be present
            expect(screen.getByText('Configure')).toBeInTheDocument();
        });

        it('should show back button with "Projects" text', () => {
            renderWithProvider(
                <Sidebar
                    context={createConfigureContext()}
                    onNavigate={jest.fn()}
                    onBack={jest.fn()}
                />
            );

            const backButton = screen.getByRole('button', { name: /projects/i });
            expect(backButton).toBeInTheDocument();
        });
    });

    describe('Wizard context', () => {
        it('should render "NEW DEMO" header', () => {
            renderWithProvider(
                <Sidebar
                    context={createWizardContext()}
                    onNavigate={jest.fn()}
                />
            );

            expect(screen.getByText('NEW DEMO')).toBeInTheDocument();
        });

        it('should render wizard steps progress', () => {
            renderWithProvider(
                <Sidebar
                    context={createWizardContext(2)}
                    onNavigate={jest.fn()}
                />
            );

            // Should show wizard step labels
            expect(screen.getByText('Sign In')).toBeInTheDocument();
            expect(screen.getByText('Project')).toBeInTheDocument();
            expect(screen.getByText('Workspace')).toBeInTheDocument();
            expect(screen.getByText('Components')).toBeInTheDocument();
            expect(screen.getByText('API Mesh')).toBeInTheDocument();
            expect(screen.getByText('Review')).toBeInTheDocument();
        });

        it('should show back button with "Cancel" text', () => {
            renderWithProvider(
                <Sidebar
                    context={createWizardContext()}
                    onNavigate={jest.fn()}
                    onBack={jest.fn()}
                />
            );

            const backButton = screen.getByRole('button', { name: /cancel/i });
            expect(backButton).toBeInTheDocument();
        });

        it('should call onBack when Cancel clicked', () => {
            const onBack = jest.fn();
            renderWithProvider(
                <Sidebar
                    context={createWizardContext()}
                    onNavigate={jest.fn()}
                    onBack={onBack}
                />
            );

            const cancelButton = screen.getByRole('button', { name: /cancel/i });
            fireEvent.click(cancelButton);

            expect(onBack).toHaveBeenCalled();
        });

        it('should show completed steps with checkmark', () => {
            // Step 2 (index 2) means steps 0 and 1 are completed
            renderWithProvider(
                <Sidebar
                    context={createWizardContext(2)}
                    onNavigate={jest.fn()}
                />
            );

            const checkmarks = screen.getAllByText('✓');
            expect(checkmarks).toHaveLength(2);
        });

        it('should show current step with filled indicator', () => {
            renderWithProvider(
                <Sidebar
                    context={createWizardContext(2)}
                    onNavigate={jest.fn()}
                />
            );

            expect(screen.getByText('●')).toBeInTheDocument();
        });
    });

    describe('no onBack provided', () => {
        it('should not render back button when onBack is not provided', () => {
            renderWithProvider(
                <Sidebar
                    context={createProjectContext()}
                    onNavigate={jest.fn()}
                />
            );

            // No back button should appear without onBack handler
            expect(screen.queryByRole('button', { name: /projects/i })).not.toBeInTheDocument();
        });
    });
});
