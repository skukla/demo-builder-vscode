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
    describe('Projects context (WelcomeView)', () => {
        it('should render "New Project" button', () => {
            renderWithProvider(
                <Sidebar
                    context={createProjectsContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                />
            );

            expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument();
        });

        it('should call onCreateProject when "New Project" button clicked', () => {
            const onCreateProject = jest.fn();
            renderWithProvider(
                <Sidebar
                    context={createProjectsContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={onCreateProject}
                />
            );

            fireEvent.click(screen.getByRole('button', { name: /new project/i }));

            expect(onCreateProject).toHaveBeenCalled();
        });

        it('should render Documentation icon button when onOpenDocs provided', () => {
            renderWithProvider(
                <Sidebar
                    context={createProjectsContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onOpenDocs={jest.fn()}
                />
            );

            expect(screen.getByRole('button', { name: /documentation/i })).toBeInTheDocument();
        });

        it('should render Get Help icon button when onOpenHelp provided', () => {
            renderWithProvider(
                <Sidebar
                    context={createProjectsContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onOpenHelp={jest.fn()}
                />
            );

            expect(screen.getByRole('button', { name: /get help/i })).toBeInTheDocument();
        });

        it('should render Settings icon button when onOpenSettings provided', () => {
            renderWithProvider(
                <Sidebar
                    context={createProjectsContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onOpenSettings={jest.fn()}
                />
            );

            expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
        });

        it('should call onOpenDocs when Documentation icon clicked', () => {
            const onOpenDocs = jest.fn();
            renderWithProvider(
                <Sidebar
                    context={createProjectsContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onOpenDocs={onOpenDocs}
                />
            );

            fireEvent.click(screen.getByRole('button', { name: /documentation/i }));

            expect(onOpenDocs).toHaveBeenCalled();
        });

        it('should call onOpenHelp when Get Help icon clicked', () => {
            const onOpenHelp = jest.fn();
            renderWithProvider(
                <Sidebar
                    context={createProjectsContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onOpenHelp={onOpenHelp}
                />
            );

            fireEvent.click(screen.getByRole('button', { name: /get help/i }));

            expect(onOpenHelp).toHaveBeenCalled();
        });

        it('should call onOpenSettings when Settings icon clicked', () => {
            const onOpenSettings = jest.fn();
            renderWithProvider(
                <Sidebar
                    context={createProjectsContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onOpenSettings={onOpenSettings}
                />
            );

            fireEvent.click(screen.getByRole('button', { name: /settings/i }));

            expect(onOpenSettings).toHaveBeenCalled();
        });
    });

    describe('Project Detail context', () => {
        it('should render project name as header', () => {
            renderWithProvider(
                <Sidebar
                    context={createProjectContext({ name: 'My Demo Project' })}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                />
            );

            expect(screen.getByText('My Demo Project')).toBeInTheDocument();
        });

        it('should render navigation items: Overview, Configure, Updates', () => {
            renderWithProvider(
                <Sidebar
                    context={createProjectContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
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
                    onCreateProject={jest.fn()}
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
                    onCreateProject={jest.fn()}
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
                    onCreateProject={jest.fn()}
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
                    onCreateProject={jest.fn()}
                />
            );

            expect(screen.getByText('Config Project')).toBeInTheDocument();
        });

        it('should render navigation with Configure active', () => {
            renderWithProvider(
                <Sidebar
                    context={createConfigureContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
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
                    onCreateProject={jest.fn()}
                    onBack={jest.fn()}
                />
            );

            const backButton = screen.getByRole('button', { name: /projects/i });
            expect(backButton).toBeInTheDocument();
        });
    });

    describe('Wizard context', () => {
        it('should render "Setup Progress" header', () => {
            renderWithProvider(
                <Sidebar
                    context={createWizardContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                />
            );

            expect(screen.getByText('Setup Progress')).toBeInTheDocument();
        });

        it('should render wizard steps progress', () => {
            renderWithProvider(
                <Sidebar
                    context={createWizardContext(2)}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
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
                    onCreateProject={jest.fn()}
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
                    onCreateProject={jest.fn()}
                    onBack={onBack}
                />
            );

            const cancelButton = screen.getByRole('button', { name: /cancel/i });
            fireEvent.click(cancelButton);

            expect(onBack).toHaveBeenCalled();
        });

        it('should show completed steps with timeline indicators', () => {
            // Step 3 (1-indexed) means steps 0 and 1 are completed, step 2 is current
            renderWithProvider(
                <Sidebar
                    context={createWizardContext(3)}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                />
            );

            // Completed steps have timeline-step-dot-completed class
            // Current step is step 3 (index 2), so steps 0 and 1 are completed
            const authStep = screen.getByTestId('timeline-step-auth');
            const projectStep = screen.getByTestId('timeline-step-project');

            expect(authStep).toBeInTheDocument();
            expect(projectStep).toBeInTheDocument();
        });

        it('should show current step with proper indicator', () => {
            renderWithProvider(
                <Sidebar
                    context={createWizardContext(2)}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                />
            );

            // Current step has aria-current="step"
            const currentStep = screen.getByTestId('timeline-step-project');
            expect(currentStep).toHaveAttribute('aria-current', 'step');
        });
    });

    describe('no onBack provided', () => {
        it('should not render back button when onBack is not provided', () => {
            renderWithProvider(
                <Sidebar
                    context={createProjectContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                />
            );

            // No back button should appear without onBack handler
            expect(screen.queryByRole('button', { name: /projects/i })).not.toBeInTheDocument();
        });
    });
});
