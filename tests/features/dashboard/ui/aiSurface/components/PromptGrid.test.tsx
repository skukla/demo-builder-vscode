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

function gridProps(
    props: Partial<React.ComponentProps<typeof PromptGrid>> = {}
): React.ComponentProps<typeof PromptGrid> {
    return {
        userPrompts: [],
        onLaunchUser: jest.fn(),
        onEdit: jest.fn(),
        onDuplicate: jest.fn(),
        onDelete: jest.fn(),
        onPinToggle: jest.fn(),
        onNew: jest.fn(),
        ...props,
    };
}

function wrap(props: React.ComponentProps<typeof PromptGrid>) {
    return (
        <Provider theme={defaultTheme}>
            <PromptGrid {...props} />
        </Provider>
    );
}

function renderGrid(props: Partial<React.ComponentProps<typeof PromptGrid>> = {}) {
    return render(wrap(gridProps(props)));
}

/** Rendered card titles, in DOM order. */
function renderedTitles(): string[] {
    return screen
        .getAllByTestId('ai-prompt-card')
        .map((card) => card.querySelector('.text-sm')?.textContent ?? '');
}

/** Open a card's kebab and pick an item by its visible label. */
function pickMenuItem(label: string): void {
    screen.getByLabelText(/more actions/i).click();
    screen.getByText(label).click();
}

describe('PromptGrid', () => {
    it('does NOT render a "Suggested prompts" section (curated removed)', () => {
        renderGrid({ userPrompts: [{ id: 'u1', title: 'My prompt', prompt: 'do thing' }] });
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
        expect(cards).toHaveLength(2);
    });

    it('renders the "+ New prompt" tile alongside user cards', () => {
        renderGrid({ userPrompts: [{ id: 'u1', title: 'My prompt', prompt: 'do thing' }] });
        expect(screen.getByTestId('ai-new-prompt-tile')).toBeInTheDocument();
    });

    it('renders the "+ New prompt" tile even when no user prompts exist', () => {
        renderGrid({ userPrompts: [] });
        expect(screen.getByTestId('ai-new-prompt-tile')).toBeInTheDocument();
    });

    it('clicking the "+ New prompt" tile fires onNew', () => {
        const onNew = jest.fn();
        renderGrid({ userPrompts: [{ id: 'u1', title: 'My prompt', prompt: 'do thing' }], onNew });
        screen.getByTestId('ai-new-prompt-tile').click();
        expect(onNew).toHaveBeenCalledTimes(1);
    });

    it('clicking a user card body fires onLaunchUser with the prompt', () => {
        const onLaunchUser = jest.fn();
        const userPrompts = [{ id: 'u1', title: 'My first', prompt: 'do thing one' }];
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
            const titles = screen
                .getAllByTestId('ai-prompt-card')
                .map(
                    (card) => card.querySelector('.text-sm')?.textContent ?? card.textContent ?? ''
                );
            expect(titles[0]).toContain('Apple');
            expect(titles[1]).toContain('Avocado');
            expect(titles[2]).toContain('Banana');
            expect(titles[3]).toContain('Cherry');
        });

        // Input order deliberately disagrees with BOTH the pin grouping and the
        // alphabetical order, so a comparator that drops either half reorders.
        it('groups pinned first and alphabetises inside each group', () => {
            renderGrid({
                userPrompts: [
                    { id: 'u1', title: 'Zebra', prompt: 'z', pinned: true },
                    { id: 'u2', title: 'Apple', prompt: 'a' },
                    { id: 'u3', title: 'Mango', prompt: 'm', pinned: true },
                    { id: 'u4', title: 'Beta', prompt: 'b' },
                ],
            });

            expect(renderedTitles()).toStrictEqual(['Mango', 'Zebra', 'Apple', 'Beta']);
        });

        it('treats titles differing only in case as equal, leaving their order alone', () => {
            renderGrid({
                userPrompts: [
                    { id: 'u1', title: 'Apple', prompt: 'a' },
                    { id: 'u2', title: 'apple', prompt: 'b' },
                ],
            });

            expect(renderedTitles()).toStrictEqual(['Apple', 'apple']);
        });
    });

    describe('handler wiring', () => {
        const PROMPT = { id: 'u1', title: 'My prompt', prompt: 'body', pinned: true };

        function spies() {
            return {
                onLaunchUser: jest.fn(),
                onEdit: jest.fn(),
                onDuplicate: jest.fn(),
                onDelete: jest.fn(),
                onPinToggle: jest.fn(),
            };
        }

        // Every kebab handler is a curried useCallback. Re-rendering with a FRESH
        // set proves the grid calls the handlers it currently holds, not the ones
        // it was first given — the failure a stale dependency list produces.
        it('routes each kebab action to the CURRENT handler, scoped to the prompt id', () => {
            const first = spies();
            const second = spies();
            const { rerender } = render(wrap(gridProps({ userPrompts: [PROMPT], ...first })));

            rerender(wrap(gridProps({ userPrompts: [PROMPT], ...second })));

            pickMenuItem('Edit');
            pickMenuItem('Duplicate');
            pickMenuItem('Delete');
            pickMenuItem('Unpin');

            expect(second.onEdit).toHaveBeenCalledWith('u1');
            expect(second.onDuplicate).toHaveBeenCalledWith('u1');
            expect(second.onDelete).toHaveBeenCalledWith('u1');
            expect(second.onPinToggle).toHaveBeenCalledWith('u1', false);
            expect(first.onEdit).not.toHaveBeenCalled();
            expect(first.onDuplicate).not.toHaveBeenCalled();
            expect(first.onDelete).not.toHaveBeenCalled();
            expect(first.onPinToggle).not.toHaveBeenCalled();
        });

        it('routes a card click to the CURRENT launch handler', () => {
            const first = spies();
            const second = spies();
            const { rerender } = render(wrap(gridProps({ userPrompts: [PROMPT], ...first })));

            rerender(wrap(gridProps({ userPrompts: [PROMPT], ...second })));
            screen.getByTestId('ai-prompt-card').click();

            expect(second.onLaunchUser).toHaveBeenCalledWith(PROMPT);
            expect(first.onLaunchUser).not.toHaveBeenCalled();
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
            expect(cards).toHaveLength(1);
            expect(screen.getByText('Add hero block')).toBeInTheDocument();
        });

        it('typing in search filters by prompt body too', () => {
            renderGrid({ userPrompts: PROMPTS });
            const input = screen.getByPlaceholderText(/search prompts/i);
            fireEvent.change(input, { target: { value: 'github' } });
            const cards = screen.getAllByTestId('ai-prompt-card');
            expect(cards).toHaveLength(1);
            expect(screen.getByText('Sync storefront')).toBeInTheDocument();
        });

        it('clearing the filter restores the full set', () => {
            renderGrid({ userPrompts: PROMPTS });
            const input = screen.getByPlaceholderText(/search prompts/i);
            fireEvent.change(input, { target: { value: 'hero' } });
            expect(screen.getAllByTestId('ai-prompt-card')).toHaveLength(1);
            fireEvent.change(input, { target: { value: '' } });
            expect(screen.getAllByTestId('ai-prompt-card')).toHaveLength(PROMPTS.length);
        });

        it('ignores surrounding whitespace and the query\'s case', () => {
            renderGrid({ userPrompts: PROMPTS });
            const input = screen.getByPlaceholderText(/search prompts/i);
            fireEvent.change(input, { target: { value: '  HERO  ' } });
            expect(screen.getAllByTestId('ai-prompt-card')).toHaveLength(1);
            expect(screen.getByText('Add hero block')).toBeInTheDocument();
        });

        // The title and the body are separate reasons to keep a card. A prompt
        // whose BODY does not mention the query proves the title half is live.
        // (Six prompts because the search field only appears above five.)
        it('keeps a prompt matched only by its title', () => {
            renderGrid({
                userPrompts: [
                    ...PROMPTS.slice(1),
                    { id: 'u7', title: 'Hero Section', prompt: 'nothing relevant here' },
                ],
            });
            const input = screen.getByPlaceholderText(/search prompts/i);
            fireEvent.change(input, { target: { value: 'hero' } });

            expect(renderedTitles()).toStrictEqual(['Hero Section']);
        });

        it('shows the prompt count, which the grid loads synchronously with the page', () => {
            renderGrid({ userPrompts: PROMPTS });

            expect(screen.getByText(`${PROMPTS.length} prompts`)).toBeInTheDocument();
        });

        it('renders zero cards when filter matches nothing — only the New tile remains', () => {
            renderGrid({ userPrompts: PROMPTS });
            const input = screen.getByPlaceholderText(/search prompts/i);
            fireEvent.change(input, { target: { value: 'xyznomatch' } });
            expect(screen.queryAllByTestId('ai-prompt-card')).toHaveLength(0);
            expect(screen.getByTestId('ai-new-prompt-tile')).toBeInTheDocument();
        });
    });
});
