/**
 * PromptCard Tests
 *
 * Extracted from the inline PromptCard inside AiOverviewScreen. A card
 * renders a curated prompt's title + prompt text, and clicking the card
 * calls `onLaunch` with no arguments (the parent owns the prompt payload
 * shape it dispatches into webview messaging).
 */

import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { PromptCard } from '@/features/dashboard/ui/aiSurface/components/PromptCard';
import '@testing-library/jest-dom';

function renderCard(props: Partial<React.ComponentProps<typeof PromptCard>> = {}) {
    const defaults = {
        prompt: {
            id: 'add-hero-block',
            title: 'Add a hero block',
            prompt: 'Add a hero block to the homepage with a CTA.',
        },
        onLaunch: jest.fn(),
    };
    const merged = { ...defaults, ...props };
    const utils = render(
        <Provider theme={defaultTheme}>
            <PromptCard {...merged} />
        </Provider>,
    );
    return { ...utils, ...merged };
}

describe('PromptCard', () => {
    it('renders the prompt title', () => {
        renderCard();
        expect(screen.getByText('Add a hero block')).toBeInTheDocument();
    });

    it('renders the prompt body text', () => {
        renderCard();
        expect(
            screen.getByText('Add a hero block to the homepage with a CTA.'),
        ).toBeInTheDocument();
    });

    it('exposes a button role for the entire card', () => {
        renderCard();
        // The card itself is the interactive surface
        const card = screen.getByTestId('ai-prompt-card');
        expect(card.tagName.toLowerCase()).toBe('button');
    });

    it('calls onLaunch when the card is clicked', () => {
        const onLaunch = jest.fn();
        renderCard({ onLaunch });
        const card = screen.getByTestId('ai-prompt-card');
        fireEvent.click(card);
        expect(onLaunch).toHaveBeenCalledTimes(1);
    });

    it('passes through different prompt titles and bodies', () => {
        renderCard({
            prompt: {
                id: 'sync-storefront',
                title: 'Sync storefront changes',
                prompt: 'Sync my block edits back to GitHub.',
            },
        });
        expect(screen.getByText('Sync storefront changes')).toBeInTheDocument();
        expect(screen.getByText('Sync my block edits back to GitHub.')).toBeInTheDocument();
    });

    describe('user-prompt kebab menu', () => {
        const USER_PROMPT = {
            id: 'user-1',
            title: 'My prompt',
            prompt: 'Do something specific.',
        };

        it('does not render the kebab when isUserPrompt is omitted (curated default)', () => {
            renderCard({ prompt: USER_PROMPT });
            expect(screen.queryByLabelText(/more actions/i)).not.toBeInTheDocument();
        });

        it('does not render the kebab when isUserPrompt is false', () => {
            renderCard({ prompt: USER_PROMPT, isUserPrompt: false });
            expect(screen.queryByLabelText(/more actions/i)).not.toBeInTheDocument();
        });

        it('renders the kebab when isUserPrompt is true', () => {
            renderCard({
                prompt: USER_PROMPT,
                isUserPrompt: true,
                onEdit: jest.fn(),
                onDuplicate: jest.fn(),
                onDelete: jest.fn(),
            });
            expect(screen.getByLabelText(/more actions/i)).toBeInTheDocument();
        });

        it('opening the kebab shows Edit, Duplicate, and Delete items', () => {
            renderCard({
                prompt: USER_PROMPT,
                isUserPrompt: true,
                onEdit: jest.fn(),
                onDuplicate: jest.fn(),
                onDelete: jest.fn(),
            });
            const kebab = screen.getByLabelText(/more actions/i);
            kebab.click();
            expect(screen.getByText('Edit')).toBeInTheDocument();
            expect(screen.getByText('Duplicate')).toBeInTheDocument();
            expect(screen.getByText('Delete')).toBeInTheDocument();
        });

        it('clicking Edit invokes onEdit', () => {
            const onEdit = jest.fn();
            renderCard({
                prompt: USER_PROMPT,
                isUserPrompt: true,
                onEdit,
                onDuplicate: jest.fn(),
                onDelete: jest.fn(),
            });
            screen.getByLabelText(/more actions/i).click();
            screen.getByText('Edit').click();
            expect(onEdit).toHaveBeenCalledTimes(1);
        });

        it('clicking Duplicate invokes onDuplicate', () => {
            const onDuplicate = jest.fn();
            renderCard({
                prompt: USER_PROMPT,
                isUserPrompt: true,
                onEdit: jest.fn(),
                onDuplicate,
                onDelete: jest.fn(),
            });
            screen.getByLabelText(/more actions/i).click();
            screen.getByText('Duplicate').click();
            expect(onDuplicate).toHaveBeenCalledTimes(1);
        });

        it('clicking Delete invokes onDelete', () => {
            const onDelete = jest.fn();
            renderCard({
                prompt: USER_PROMPT,
                isUserPrompt: true,
                onEdit: jest.fn(),
                onDuplicate: jest.fn(),
                onDelete,
            });
            screen.getByLabelText(/more actions/i).click();
            screen.getByText('Delete').click();
            expect(onDelete).toHaveBeenCalledTimes(1);
        });

        it('clicking the card body still calls onLaunch when isUserPrompt', () => {
            const onLaunch = jest.fn();
            renderCard({
                prompt: USER_PROMPT,
                isUserPrompt: true,
                onLaunch,
                onEdit: jest.fn(),
                onDuplicate: jest.fn(),
                onDelete: jest.fn(),
            });
            const card = screen.getByTestId('ai-prompt-card');
            fireEvent.click(card);
            expect(onLaunch).toHaveBeenCalledTimes(1);
        });
    });

    describe('pin indicator and pin kebab item (G2)', () => {
        const USER_PROMPT = {
            id: 'user-1',
            title: 'My prompt',
            prompt: 'Do something specific.',
        };

        const ALL_HANDLERS = {
            isUserPrompt: true as const,
            onEdit: jest.fn(),
            onDuplicate: jest.fn(),
            onDelete: jest.fn(),
            onPinToggle: jest.fn(),
        };

        it('does NOT render the pin indicator when prompt.pinned is undefined', () => {
            renderCard({ prompt: USER_PROMPT, ...ALL_HANDLERS });
            expect(screen.queryByTestId('ai-prompt-pin-indicator')).not.toBeInTheDocument();
        });

        it('renders the pin indicator when prompt.pinned is true', () => {
            renderCard({ prompt: { ...USER_PROMPT, pinned: true }, ...ALL_HANDLERS });
            expect(screen.getByTestId('ai-prompt-pin-indicator')).toBeInTheDocument();
        });

        it('shows "Pin" menu item when prompt is unpinned', () => {
            renderCard({ prompt: USER_PROMPT, ...ALL_HANDLERS });
            screen.getByLabelText(/more actions/i).click();
            expect(screen.getByText('Pin')).toBeInTheDocument();
            expect(screen.queryByText('Unpin')).not.toBeInTheDocument();
        });

        it('shows "Unpin" menu item when prompt is pinned', () => {
            renderCard({ prompt: { ...USER_PROMPT, pinned: true }, ...ALL_HANDLERS });
            screen.getByLabelText(/more actions/i).click();
            expect(screen.getByText('Unpin')).toBeInTheDocument();
            expect(screen.queryByText('Pin')).not.toBeInTheDocument();
        });

        it('clicking Pin invokes onPinToggle with true', () => {
            const onPinToggle = jest.fn();
            renderCard({ prompt: USER_PROMPT, ...ALL_HANDLERS, onPinToggle });
            screen.getByLabelText(/more actions/i).click();
            screen.getByText('Pin').click();
            expect(onPinToggle).toHaveBeenCalledWith(true);
        });

        it('clicking Unpin invokes onPinToggle with false', () => {
            const onPinToggle = jest.fn();
            renderCard({ prompt: { ...USER_PROMPT, pinned: true }, ...ALL_HANDLERS, onPinToggle });
            screen.getByLabelText(/more actions/i).click();
            screen.getByText('Unpin').click();
            expect(onPinToggle).toHaveBeenCalledWith(false);
        });

        it('does NOT show "Move up" or "Move down" menu items (replaced by drag-and-drop)', () => {
            renderCard({ prompt: USER_PROMPT, ...ALL_HANDLERS });
            screen.getByLabelText(/more actions/i).click();
            expect(screen.queryByText('Move up')).not.toBeInTheDocument();
            expect(screen.queryByText('Move down')).not.toBeInTheDocument();
        });
    });
});
