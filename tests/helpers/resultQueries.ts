/**
 * Find a result as every result window draws it (owner, 2026-11-17, walk F222): the thing it is
 * about as the window's heading, and what happened in bold under the large mark (`ResultBody`).
 * A test that looked for "Bodea Installed" as a heading asks for `findResult('Bodea', 'Installed')`.
 */

import { screen } from '@testing-library/react';

/**
 * Wait for the result window and check its outcome.
 *
 * @param thing - the heading: what the result is about
 * @param outcome - the words under the mark
 * @returns the heading, once both are on screen
 * @throws when the heading never appears, or no outcome under a mark has those words
 */
export async function findResult(thing: string, outcome: string): Promise<HTMLElement> {
    const heading = await screen.findByRole('heading', { name: thing });
    const outcomes = Array.from(document.querySelectorAll('.result-outcome')).map(
        (el) => el.textContent
    );
    if (!outcomes.includes(outcome)) {
        throw new Error(
            `No result outcome "${outcome}" under "${thing}"; found ${JSON.stringify(outcomes)}`
        );
    }
    return heading;
}

/**
 * The mark the result draws in its body: its `data-status` says how it ended.
 *
 * @returns the mark, or null when the result has none
 */
export function resultMark(): Element | null {
    return document.querySelector('.result-mark');
}

const STATUS_CLASS = { success: 'text-positive', warning: 'text-notice', error: 'text-negative' } as const;

/**
 * The result window on screen now: its heading names the thing, the outcome is under the mark,
 * and the mark is drawn in the status's colour.
 *
 * @param thing - the heading
 * @param outcome - the words under the mark
 * @param status - how it ended, when the test says
 * @returns the heading
 */
export function expectResult(thing: string, outcome: string, status?: keyof typeof STATUS_CLASS): HTMLElement {
    const heading = screen.getByRole('heading', { name: thing });
    expect(screen.getByText(outcome, { selector: '.result-outcome' })).toBeTruthy();
    if (status) expect(resultMark()?.querySelector(`.${STATUS_CLASS[status]}`)).toBeTruthy();
    return heading;
}
