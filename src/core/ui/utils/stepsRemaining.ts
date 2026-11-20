/**
 * The words for what a run left to finish (PL-101, owner 2026-11-17): "2 steps remaining",
 * "1 step remaining". One place, because the creation end screen and the project dashboard say
 * the same thing about the same steps.
 *
 * @module core/ui/utils/stepsRemaining
 */

/**
 * @param count - the steps still to do
 * @returns the line, or undefined when none is left (nothing is shown then)
 */
export function stepsRemainingText(count: number | undefined): string | undefined {
    if (!count || count < 1) return undefined;
    return count === 1 ? '1 step remaining' : `${count} steps remaining`;
}
