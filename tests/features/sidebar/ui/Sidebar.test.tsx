import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { Sidebar } from '@/features/sidebar/ui/Sidebar';
import { createProjectsContext, createProjectContext } from '../testUtils';

const renderWithProvider = (ui: React.ReactElement) =>
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            {ui}
        </Provider>
    );

describe('Sidebar', () => {
    describe('Projects context (no project loaded)', () => {
        it('renders the utility bar', () => {
            renderWithProvider(
                <Sidebar
                    context={createProjectsContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onOpenTools={jest.fn()}
                />
            );

            expect(screen.getByRole('button', { name: /tools/i })).toBeInTheDocument();
        });

        it('renders the AiZone (AI is globally available, not project-scoped)', () => {
            renderWithProvider(
                <Sidebar
                    context={createProjectsContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onOpenAiChat={jest.fn()}
                    onShowPrompts={jest.fn()}
                />
            );

            expect(screen.getByRole('button', { name: /^chat$/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /^prompts$/i })).toBeInTheDocument();
        });
    });

    describe('Project Detail context', () => {
        it('does NOT render the project name — that lives on the dashboard', () => {
            renderWithProvider(
                <Sidebar
                    context={createProjectContext({ name: 'My Demo Project' })}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                />
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
                />
            );

            expect(screen.getByRole('button', { name: /^chat$/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /^prompts$/i })).toBeInTheDocument();
        });

        it('keeps Chat a plain button when no onNewAiChat callback is given', () => {
            // ADDITIVE. Gating the zone on the new callback made the whole AiZone
            // vanish for every existing caller, since they all pass exactly two
            // callbacks — this pins that it cannot happen again.
            renderWithProvider(
                <Sidebar
                    context={createProjectContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onOpenAiChat={jest.fn()}
                    onShowPrompts={jest.fn()}
                />
            );

            expect(screen.getByRole('button', { name: /^chat$/i })).toBeInTheDocument();
            expect(screen.queryByRole('menuitem', { name: /new chat/i })).not.toBeInTheDocument();
        });

        it('offers Continue and New chat from the Chat menu when onNewAiChat is given', () => {
            // Chat becomes a MenuTrigger rather than gaining a sibling tile —
            // the projects toolbar's `New` button pattern. The repo's Spectrum
            // mock renders menu content eagerly, so no open-click is needed.
            const onOpenAiChat = jest.fn();
            const onNewAiChat = jest.fn();
            renderWithProvider(
                <Sidebar
                    context={createProjectContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onOpenAiChat={onOpenAiChat}
                    onShowPrompts={jest.fn()}
                    onNewAiChat={onNewAiChat}
                />
            );

            fireEvent.click(screen.getByRole('menuitem', { name: /new chat/i }));
            expect(onNewAiChat).toHaveBeenCalledTimes(1);
            expect(onOpenAiChat).not.toHaveBeenCalled();

            fireEvent.click(screen.getByRole('menuitem', { name: /continue chat/i }));
            expect(onOpenAiChat).toHaveBeenCalledTimes(1);
        });

        it('renders THREE AI tiles once the workbench has a callback', () => {
            // Reversed 2026-08-25. Two earlier readings said a third tile would
            // not fit; both missed that the stack was CENTRED, so half the
            // leftover space sat above the zone label doing nothing. Top-aligned
            // (`.sidebar-view`), the slack gathers below the last tile — which is
            // exactly where a new tile extends into.
            renderWithProvider(
                <Sidebar
                    context={createProjectContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onOpenAiChat={jest.fn()}
                    onShowPrompts={jest.fn()}
                    onNewAiChat={jest.fn()}
                />
            );

            const aiTiles = screen
                .getAllByRole('button')
                .filter((b) =>
                    /^(chat|prompts|workbench)$/i.test(b.getAttribute('aria-label') ?? '')
                );
            // Two tiles since the Workbench moved to feature/evaluation-mode-dry-run
            // on 2026-08-26 (AI-3b): Chat and Prompts.
            expect(aiTiles).toHaveLength(2);
        });

        it('renders no Workbench tile — that surface is on its own branch', () => {
            // Kept as a NEGATIVE: the tile existed until 2026-08-26 and the
            // AiZone docstring still explains why the wrap breakpoint is 640px.
            // If it comes back, it should come back deliberately (AI-3b).
            renderWithProvider(
                <Sidebar
                    context={createProjectContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onOpenAiChat={jest.fn()}
                    onShowPrompts={jest.fn()}
                />
            );

            expect(screen.queryByRole('button', { name: /^workbench$/i })).toBeNull();
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
                />
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
                />
            );

            fireEvent.click(screen.getByRole('button', { name: /^prompts$/i }));

            expect(onShowPrompts).toHaveBeenCalled();
        });

        it('renders the utility bar as a footer', () => {
            renderWithProvider(
                <Sidebar
                    context={createProjectContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                    onOpenTools={jest.fn()}
                />
            );

            expect(screen.getByRole('button', { name: /tools/i })).toBeInTheDocument();
        });

        it('does NOT render the configure nav list — that is configure-mode only', () => {
            renderWithProvider(
                <Sidebar
                    context={createProjectContext()}
                    onNavigate={jest.fn()}
                    onCreateProject={jest.fn()}
                />
            );

            // SidebarNav is gone; nav items never render anywhere.
            expect(screen.queryByText('Overview')).not.toBeInTheDocument();
        });
    });

    // Configure and Wizard modes are intentionally absent — see Sidebar.tsx
    // for the rationale. Configure is a self-contained webview; the Wizard
    // timeline lives inside its own webview column.
});
