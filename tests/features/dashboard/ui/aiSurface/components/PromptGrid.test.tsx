/**
 * PromptGrid Tests
 *
 * Renders user-saved prompts in a single grid with a search input.
 * Pinned prompts render first; within each pin-group, alphabetical
 * (case-insensitive) by title. The filter narrows the rendered set
 * non-destructively (case-insensitive substring match against title +
 * prompt body).
 */

import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { PromptGrid } from '@/features/dashboard/ui/aiSurface/components/PromptGrid';
import '@testing-library/jest-dom';

function renderGrid(props: Partial<React.ComponentProps<typeof PromptGrid>> = {}) {
    const defaults: React.ComponentProps<typeof PromptGrid> = {
        userPrompts: [],
        onLaunchUser: jest.fn(),
        onEdit: jest.fn(),
        onDuplicate: jest.fn(),
        onDelete: jest.fn(),
        onPinToggle: jest.fn(),
        onNew: jest.fn(),
    };
    return render(
        <Provider theme={defaultTheme}>
            <PromptGrid {...defaults} {...props} />
        </Provider>,
    );
}

describe('PromptGrid', () => {
    it('does NOT render a "Suggested prompts" section (curated removed)', () => {
        renderGrid({ userPrompts: [
            { id: 'u1', title: 'My prompt', prompt: 'do thing' },
        ] });
        expect(screen.queryByText(/suggested prompts/i)).not.toBeInTheDocument();
    });

    it('renders one card per user prompt', () => {
        renderGrid({
            userPrompts: [
                { id: 'u1', title: 'First', prompt: 'a' },
                { id: 'u2', title: 'Second', prompt: 'b' },
            ],
        });
        const cards = screen.getAllByTestId('ai-prompt-card');
        expect(cards.length).toBe(2);
    });

    it('renders the "+ New prompt" tile alongside user cards', () => {
        renderGrid({ userPrompts: [
            { id: 'u1', title: 'My prompt', prompt: 'do thing' },
        ] });
        expect(screen.getByTestId('ai-new-prompt-tile')).toBeInTheDocument();
    });

    it('renders the "+ New prompt" tile even when no user prompts exist', () => {
        renderGrid({ userPrompts: [] });
        expect(screen.getByTestId('ai-new-prompt-tile')).toBeInTheDocument();
    });

    it('clicking the "+ New prompt" tile fires onNew', () => {
        const onNew = jest.fn();
        renderGrid({ userPrompts: [
            { id: 'u1', title: 'My prompt', prompt: 'do thing' },
        ], onNew });
        screen.getByTestId('ai-new-prompt-tile').click();
        expect(onNew).toHaveBeenCalledTimes(1);
    });

    it('clicking a user card body fires onLaunchUser with the prompt', () => {
        const onLaunchUser = jest.fn();
        const userPrompts = [
            { id: 'u1', title: 'My first', prompt: 'do thing one' },
        ];
        renderGrid({ userPrompts, onLaunchUser });
        const card = screen.getByText('My first').closest('[data-testid="ai-prompt-card"]');
        expect(card).not.toBeNull();
        (card as HTMLElement).click();
        expect(onLaunchUser).toHaveBeenCalledTimes(1);
        expect(onLaunchUser).toHaveBeenCalledWith(userPrompts[0]);
    });

    describe('pinned-first sort', () => {
        const PROMPTS = [
            { id: 'u1', title: 'Banana', prompt: 'b' },
            { id: 'u2', title: 'Apple', prompt: 'a', pinned: true },
            { id: 'u3', title: 'Cherry', prompt: 'c' },
            { id: 'u4', title: 'Avocado', prompt: 'd', pinned: true },
        ];

        it('renders pinned prompts first, then unpinned, alphabetical within each group', () => {
            renderGrid({ userPrompts: PROMPTS });
            // Visible cards in DOM order should be: Apple, Avocado, Banana, Cherry
            const titles = screen.getAllByTestId('ai-prompt-card').map(card =>
                card.querySelector('.text-sm')?.textContent ?? card.textContent ?? '',
            );
            expect(titles[0]).toContain('Apple');
            expect(titles[1]).toContain('Avocado');
            expect(titles[2]).toContain('Banana');
            expect(titles[3]).toContain('Cherry');
        });
    });

    describe('filter / search', () => {
        const PROMPTS = [
            { id: 'u1', title: 'Add hero block', prompt: 'Insert a hero block at the top' },
            { id: 'u2', title: 'Sync storefront', prompt: 'Push changes to GitHub' },
            { id: 'u3', title: 'Customize card', prompt: 'Change product card layout' },
            { id: 'u4', title: 'Banana', prompt: 'Just a banana' },
            { id: 'u5', title: 'Pineapple', prompt: 'fruit' },
            { id: 'u6', title: 'Carrot', prompt: 'veg' },
        ];

        it('renders a search input', () => {
            renderGrid({ userPrompts: PROMPTS });
            expect(screen.getByPlaceholderText(/search prompts/i)).toBeInTheDocument();
        });

        it('typing in search filters by title (case-insensitive)', () => {
            renderGrid({ userPrompts: PROMPTS });
            const input = screen.getByPlaceholderText(/search prompts/i);
            fireEvent.change(input, { target: { value: 'hero' } });
            const cards = screen.getAllByTestId('ai-prompt-card');
            expect(cards.length).toBe(1);
            expect(screen.getByText('Add hero block')).toBeInTheDocument();
        });

        it('typing in search filters by prompt body too', () => {
            renderGrid({ userPrompts: PROMPTS });
            const input = screen.getByPlaceholderText(/search prompts/i);
            fireEvent.change(input, { target: { value: 'github' } });
            const cards = screen.getAllByTestId('ai-prompt-card');
            expect(cards.length).toBe(1);
            expect(screen.getByText('Sync storefront')).toBeInTheDocument();
        });

        it('clearing the filter restores the full set', () => {
            renderGrid({ userPrompts: PROMPTS });
            const input = screen.getByPlaceholderText(/search prompts/i);
            fireEvent.change(input, { target: { value: 'hero' } });
            expect(screen.getAllByTestId('ai-prompt-card').length).toBe(1);
            fireEvent.change(input, { target: { value: '' } });
            expect(screen.getAllByTestId('ai-prompt-card').length).toBe(PROMPTS.length);
        });

        it('renders zero cards when filter matches nothing — only the New tile remains', () => {
            renderGrid({ userPrompts: PROMPTS });
            const input = screen.getByPlaceholderText(/search prompts/i);
            fireEvent.change(input, { target: { value: 'xyznomatch' } });
            expect(screen.queryAllByTestId('ai-prompt-card').length).toBe(0);
            expect(screen.getByTestId('ai-new-prompt-tile')).toBeInTheDocument();
        });
    });
});
