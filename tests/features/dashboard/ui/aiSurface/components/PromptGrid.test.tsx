/**
 * PromptGrid Tests (Batch F2)
 *
 * PromptGrid is the left-column primary content of the AI surface body.
 * It renders the curated prompts as a grid of `<PromptCard>`s under a
 * "Suggested prompts" heading. A placeholder slot for user-prompts +
 * the "+ New" tile is reserved for F3 — in F2 it's an inert element.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { PromptGrid } from '@/features/dashboard/ui/aiSurface/components/PromptGrid';
import '@testing-library/jest-dom';

const CURATED_PROMPTS = [
    { id: 'add-hero-block', title: 'Add a hero block', prompt: 'Add a hero block to the homepage with a CTA.' },
    { id: 'update-commerce-url', title: 'Update Commerce URL', prompt: 'Update the Commerce URL for this project.' },
    { id: 'inspect-block-library', title: 'Inspect the block library', prompt: 'Show me what is in my block library.' },
    { id: 'sync-storefront', title: 'Sync storefront changes', prompt: 'Sync my block edits back to GitHub.' },
    { id: 'customize-product-card', title: 'Customize a product card', prompt: 'Customize the product-card block.' },
];

function renderGrid(props: Partial<React.ComponentProps<typeof PromptGrid>> = {}) {
    const defaults: React.ComponentProps<typeof PromptGrid> = {
        curatedPrompts: CURATED_PROMPTS,
        userPrompts: [],
        onLaunch: jest.fn(),
        onLaunchUser: jest.fn(),
        onEdit: jest.fn(),
        onDuplicate: jest.fn(),
        onDelete: jest.fn(),
        onNew: jest.fn(),
    };
    return render(
        <Provider theme={defaultTheme}>
            <PromptGrid {...defaults} {...props} />
        </Provider>,
    );
}

describe('PromptGrid (Batch F2)', () => {
    it('renders the "Suggested prompts" section heading', () => {
        renderGrid();
        expect(screen.getByText(/suggested prompts/i)).toBeInTheDocument();
    });

    it('renders one card per curated prompt', () => {
        renderGrid();
        const cards = screen.getAllByTestId('ai-prompt-card');
        expect(cards.length).toBe(CURATED_PROMPTS.length);
    });

    it('renders the title of each curated prompt as a card', () => {
        renderGrid();
        for (const p of CURATED_PROMPTS) {
            expect(screen.getByText(p.title)).toBeInTheDocument();
        }
    });

    it('calls onLaunch with the prompt when a curated card is clicked', () => {
        const onLaunch = jest.fn();
        renderGrid({ onLaunch });
        const cards = screen.getAllByTestId('ai-prompt-card');
        cards[0].click();
        expect(onLaunch).toHaveBeenCalledTimes(1);
        // onLaunch receives the launched prompt's prompt text
        expect(onLaunch).toHaveBeenCalledWith(CURATED_PROMPTS[0].prompt);
    });

    describe('user-prompts section (Batch F3)', () => {
        const USER_PROMPTS = [
            { id: 'u1', title: 'My first', prompt: 'Do thing one' },
            { id: 'u2', title: 'My second', prompt: 'Do thing two' },
        ];

        it('does not render the "Your prompts" heading when userPrompts is empty', () => {
            renderGrid({ userPrompts: [] });
            expect(screen.queryByText(/your prompts/i)).not.toBeInTheDocument();
        });

        it('renders the "Your prompts" heading when there are user prompts', () => {
            renderGrid({ userPrompts: USER_PROMPTS });
            expect(screen.getByText(/your prompts/i)).toBeInTheDocument();
        });

        it('renders one card per user prompt under the section', () => {
            renderGrid({ userPrompts: USER_PROMPTS });
            // All prompt cards: curated + user
            const cards = screen.getAllByTestId('ai-prompt-card');
            expect(cards.length).toBe(CURATED_PROMPTS.length + USER_PROMPTS.length);
            // The user-prompt titles should be present
            for (const p of USER_PROMPTS) {
                expect(screen.getByText(p.title)).toBeInTheDocument();
            }
        });

        it('renders a "+ New prompt" tile alongside the user cards', () => {
            renderGrid({ userPrompts: USER_PROMPTS });
            expect(screen.getByTestId('ai-new-prompt-tile')).toBeInTheDocument();
        });

        it('renders the "+ New prompt" tile even when no user prompts exist', () => {
            renderGrid({ userPrompts: [] });
            expect(screen.getByTestId('ai-new-prompt-tile')).toBeInTheDocument();
        });

        it('clicking the "+ New prompt" tile fires onNew', () => {
            const onNew = jest.fn();
            renderGrid({ userPrompts: USER_PROMPTS, onNew });
            screen.getByTestId('ai-new-prompt-tile').click();
            expect(onNew).toHaveBeenCalledTimes(1);
        });

        it('clicking a user card body fires onLaunchUser with the prompt', () => {
            const onLaunchUser = jest.fn();
            renderGrid({ userPrompts: USER_PROMPTS, onLaunchUser });
            // Find the user prompt card by its title text and click it
            const userCard = screen.getByText('My first').closest('[data-testid="ai-prompt-card"]');
            expect(userCard).not.toBeNull();
            (userCard as HTMLElement).click();
            expect(onLaunchUser).toHaveBeenCalledTimes(1);
            expect(onLaunchUser).toHaveBeenCalledWith(USER_PROMPTS[0]);
        });
    });
});
