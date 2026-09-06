/**
 * AiOverviewScreen Tests — what the screen does with a response it cannot use
 *
 * The same guard, `response?.success && Array.isArray(response.aiPrompts)`, stands
 * in front of all five places that replace the visible list: the mount fetch, save,
 * duplicate, delete and pin. Three answers must leave the list exactly as it was —
 * no answer at all, a success carrying no list, and a list that did not succeed —
 * and none of them may throw. Every case below is run against every site, because
 * the guards are five copies and nothing keeps them in step.
 */

/* eslint-disable jest/expect-expect -- every case asserts through expectListUntouched below */

import { screen, fireEvent, act, within } from '@testing-library/react';
import { renderScreen } from './AiOverviewScreen.testUtils';
import type { AiPrompt } from '@/types/base';

const SEEDED: AiPrompt[] = [
    { id: 'p-alpha', title: 'Alpha prompt', prompt: 'Alpha body' },
    { id: 'p-beta', title: 'Beta prompt', prompt: 'Beta body' },
];

/** A list the screen must never adopt, so its title is its own assertion. */
const INTRUDER: AiPrompt[] = [{ id: 'x', title: 'Must not appear', prompt: 'x' }];

const UNUSABLE: Array<[string, unknown]> = [
    ['no answer at all', undefined],
    ['a success carrying no list', { success: true }],
    ['a list that did not succeed', { success: false, aiPrompts: INTRUDER }],
];

/** The titles currently on screen, in render order. */
function visibleTitles(): string[] {
    return screen
        .queryAllByTestId('ai-prompt-card-wrapper')
        .map((card) => within(card).getByTestId('ai-prompt-card').textContent ?? '');
}

function expectListUntouched(): void {
    expect(screen.queryByText('Must not appear')).not.toBeInTheDocument();
    expect(visibleTitles()).toHaveLength(SEEDED.length);
    expect(screen.getByText('Alpha prompt')).toBeInTheDocument();
    expect(screen.getByText('Beta prompt')).toBeInTheDocument();
}

async function chooseFromKebab(index: number, label: string): Promise<void> {
    const card = screen.getAllByTestId('ai-prompt-card-wrapper')[index];
    await act(async () => {
        within(card).getByLabelText(/more actions/i).click();
    });
    await act(async () => {
        within(card).getByText(label).click();
        await Promise.resolve();
        await Promise.resolve();
    });
}

/** Render with the seed list already showing, then answer everything with `answer`. */
async function seedThenAnswer(answer: unknown) {
    const rendered = await renderScreen({ projectOverrides: { aiPrompts: SEEDED } });
    (rendered.webviewClient.request as jest.Mock).mockResolvedValue(answer);
    return rendered;
}

describe('AiOverviewScreen — unusable responses', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe.each(UNUSABLE)('given %s', (_label, answer) => {
        it('keeps the seeded list when the mount fetch answers that way', async () => {
            await renderScreen({
                projectOverrides: { aiPrompts: SEEDED },
                requestOverrides: { 'list-ai-prompts': answer },
            });

            expectListUntouched();
        });

        it('keeps the list when a save answers that way', async () => {
            await seedThenAnswer(answer);

            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-new-prompt-tile'));
            });
            fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Gamma' } });
            fireEvent.change(screen.getByLabelText(/prompt/i), { target: { value: 'Gamma body' } });
            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
                await Promise.resolve();
                await Promise.resolve();
            });

            expectListUntouched();
        });

        it('keeps the list when a duplicate answers that way', async () => {
            await seedThenAnswer(answer);

            await chooseFromKebab(0, 'Duplicate');

            expectListUntouched();
        });

        it('keeps the list when a delete answers that way', async () => {
            await seedThenAnswer(answer);

            await chooseFromKebab(0, 'Delete');

            expectListUntouched();
        });

        it('keeps the list when a pin toggle answers that way', async () => {
            await seedThenAnswer(answer);

            await chooseFromKebab(0, 'Pin');

            expectListUntouched();
        });
    });
});
