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

const renderWithProvider = (ui: React.ReactElement) =>
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            {ui}
        </Provider>,
    );

describe('Sidebar', () => {
    describe('Projects context (no project loaded)', () => {
        it('renders the utility bar', () => {
            const { container } = renderWithProvider(
                <Sidebar
                    context={createProjectsContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onOpenTools={jest.fn()}
                />,
            );

            expect(container.querySelector('.sidebar-utility-bar')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /tools/i })).toBeInTheDocument();
        });

        it('does NOT render an AI zone — AI is project-scoped', () => {
            renderWithProvider(
                <Sidebar
                    context={createProjectsContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onOpenAiChat={jest.fn()}
                    onShowPrompts={jest.fn()}
                />,
            );

            expect(screen.queryByRole('button', { name: /^chat$/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /^prompts$/i })).not.toBeInTheDocument();
        });
    });

    describe('Project Detail context', () => {
        it('does NOT render the project name — that lives on the dashboard', () => {
            renderWithProvider(
                <Sidebar
                    context={createProjectContext({ name: 'My Demo Project' })}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                />,
            );

            expect(screen.queryByText('My Demo Project')).not.toBeInTheDocument();
        });

        it('renders the AiZone Chat and Prompts buttons when callbacks provided', () => {
            renderWithProvider(
                <Sidebar
                    context={createProjectContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onOpenAiChat={jest.fn()}
                    onShowPrompts={jest.fn()}
                />,
            );

            expect(screen.getByRole('button', { name: /^chat$/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /^prompts$/i })).toBeInTheDocument();
        });

        it('dispatches onOpenAiChat when Chat is clicked', () => {
            const onOpenAiChat = jest.fn();
            renderWithProvider(
                <Sidebar
                    context={createProjectContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onOpenAiChat={onOpenAiChat}
                    onShowPrompts={jest.fn()}
                />,
            );

            fireEvent.click(screen.getByRole('button', { name: /^chat$/i }));

            expect(onOpenAiChat).toHaveBeenCalled();
        });

        it('dispatches onShowPrompts when Prompts is clicked', () => {
            const onShowPrompts = jest.fn();
            renderWithProvider(
                <Sidebar
                    context={createProjectContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onOpenAiChat={jest.fn()}
                    onShowPrompts={onShowPrompts}
                />,
            );

            fireEvent.click(screen.getByRole('button', { name: /^prompts$/i }));

            expect(onShowPrompts).toHaveBeenCalled();
        });

        it('renders the utility bar as a footer', () => {
            const { container } = renderWithProvider(
                <Sidebar
                    context={createProjectContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onOpenTools={jest.fn()}
                />,
            );

            expect(container.querySelector('.sidebar-utility-bar')).toBeInTheDocument();
        });

        it('does NOT render the configure nav list — that is configure-mode only', () => {
            renderWithProvider(
                <Sidebar
                    context={createProjectContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                />,
            );

            // The configure nav items appear only in configure mode.
            // 'Overview' / 'Configure' / 'Updates' should be absent here.
            expect(screen.queryByText('Overview')).not.toBeInTheDocument();
        });
    });

    describe('Configure context', () => {
        it('renders project name as header', () => {
            renderWithProvider(
                <Sidebar
                    context={createConfigureContext({ name: 'Config Project' })}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                />,
            );

            expect(screen.getByText('Config Project')).toBeInTheDocument();
        });

        it('renders Overview / Configure / Updates nav items', () => {
            renderWithProvider(
                <Sidebar
                    context={createConfigureContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                />,
            );

            expect(screen.getByText('Overview')).toBeInTheDocument();
            expect(screen.getByText('Configure')).toBeInTheDocument();
            expect(screen.getByText('Updates')).toBeInTheDocument();
        });

        it('does NOT render an AI nav item — AI lives in its own zone now', () => {
            renderWithProvider(
                <Sidebar
                    context={createConfigureContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                />,
            );

            // The legacy "AI" nav item is gone; "AI" only appears as a zone
            // label when AiZone is rendered, not as a nav row. We assert no
            // "AI" nav row by checking against the AiZone's presence:
            // configure context without AiZone callbacks → no "AI" anywhere.
            expect(screen.queryByText('AI')).not.toBeInTheDocument();
        });

        it('renders the AiZone when callbacks provided in configure mode', () => {
            renderWithProvider(
                <Sidebar
                    context={createConfigureContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onOpenAiChat={jest.fn()}
                    onShowPrompts={jest.fn()}
                />,
            );

            expect(screen.getByRole('button', { name: /^chat$/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /^prompts$/i })).toBeInTheDocument();
        });

        it('shows a back button to "Projects" when onBack provided', () => {
            renderWithProvider(
                <Sidebar
                    context={createConfigureContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onBack={jest.fn()}
                />,
            );

            expect(screen.getByRole('button', { name: /projects/i })).toBeInTheDocument();
        });

        it('does not render back button when onBack is absent', () => {
            renderWithProvider(
                <Sidebar
                    context={createConfigureContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                />,
            );

            expect(screen.queryByRole('button', { name: /projects/i })).not.toBeInTheDocument();
        });
    });

    describe('Wizard context', () => {
        it('renders "Setup Progress" header', () => {
            renderWithProvider(
                <Sidebar
                    context={createWizardContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                />,
            );

            expect(screen.getByText('Setup Progress')).toBeInTheDocument();
        });

        it('renders wizard step labels', () => {
            renderWithProvider(
                <Sidebar
                    context={createWizardContext(2)}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                />,
            );

            expect(screen.getByText('Sign In')).toBeInTheDocument();
            expect(screen.getByText('Project')).toBeInTheDocument();
            expect(screen.getByText('Workspace')).toBeInTheDocument();
            expect(screen.getByText('Components')).toBeInTheDocument();
            expect(screen.getByText('API Mesh')).toBeInTheDocument();
            expect(screen.getByText('Review')).toBeInTheDocument();
        });

        it('marks the current step with aria-current', () => {
            renderWithProvider(
                <Sidebar
                    context={createWizardContext(2)}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                />,
            );

            const currentStep = screen.getByTestId('timeline-step-project');
            expect(currentStep).toHaveAttribute('aria-current', 'step');
        });

        it('renders the utility footer below the timeline', () => {
            const { container } = renderWithProvider(
                <Sidebar
                    context={createWizardContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onOpenTools={jest.fn()}
                />,
            );

            expect(container.querySelector('.sidebar-utility-bar')).toBeInTheDocument();
        });
    });
});
