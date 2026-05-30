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

            // SidebarNav is gone; nav items never render anywhere.
            expect(screen.queryByText('Overview')).not.toBeInTheDocument();
        });
    });

    // Configure and Wizard modes are intentionally absent — see Sidebar.tsx
    // for the rationale. Configure is a self-contained webview; the Wizard
    // timeline lives inside its own webview column.
});
