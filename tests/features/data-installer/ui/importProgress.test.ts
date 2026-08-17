/**
 * Live import progress — what the spinner says while a pack lands.
 *
 * The modal used to show a bare "Importing…" for the whole run, sometimes
 * several minutes, because the per-type map only reached the webview when the
 * job finished. The map itself was never the problem: the runner builds a
 * partial one on every poll, and `classify` already depends on it being partial
 * (it must COVER the requested types before the job counts as terminal).
 *
 * This turns that map into one line and a percentage. The rules it encodes:
 *
 * - **Total comes from the REQUEST, not the map.** A type the service has not
 *   started yet is absent, so counting the map would show "6 of 6 done" early in
 *   a fourteen-type import and then go backwards.
 * - **Done means TERMINAL, not successful.** A type that errored is finished;
 *   counting only successes would stall the ring on a partial failure.
 * - **Percent never exceeds 100.** The service can report a type the request did
 *   not ask for (a dependency it pulled in), and a ring past full reads broken.
 *
 * Strict TDD: written BEFORE the module exists.
 */

import { summarizeProgress, progressLabel } from '@/features/data-installer/ui/importProgress';
import type { DataTypeStatus } from '@/features/data-installer/types';

const REQUESTED = ['attribute_sets', 'categories', 'products', 'customers'];

function statuses(over: Record<string, DataTypeStatus>): Record<string, DataTypeStatus> {
    return over;
}

describe('summarizeProgress', () => {
    it('counts the request as the total, not the partial map', () => {
        const progress = summarizeProgress(statuses({ attribute_sets: 'success' }), REQUESTED);

        expect(progress).toMatchObject({ done: 1, total: 4 });
    });

    it('names the type being processed right now', () => {
        const progress = summarizeProgress(
            statuses({ attribute_sets: 'success', categories: 'processing' }),
            REQUESTED,
        );

        expect(progress.current).toBe('categories');
    });

    /** A failed type is finished. Counting only successes stalls the ring. */
    it('counts an errored type as done', () => {
        const progress = summarizeProgress(
            statuses({ attribute_sets: 'success', categories: 'error' }),
            REQUESTED,
        );

        expect(progress.done).toBe(2);
    });

    it('leaves pending types uncounted and unnamed', () => {
        const progress = summarizeProgress(
            statuses({ attribute_sets: 'pending', categories: 'pending' }),
            REQUESTED,
        );

        // Read the field rather than matching `{current: undefined}`:
        // toMatchObject demands the KEY be present, and an absent optional is
        // exactly what this asserts.
        expect(progress.done).toBe(0);
        expect(progress.current).toBeUndefined();
    });

    it('reports nothing started as zero of the requested total', () => {
        const progress = summarizeProgress(statuses({}), REQUESTED);

        expect(progress).toMatchObject({ done: 0, total: 4, percent: 0 });
    });

    it('reaches exactly 100 when every requested type is terminal', () => {
        const progress = summarizeProgress(
            statuses({
                attribute_sets: 'success',
                categories: 'success',
                products: 'success',
                customers: 'error',
            }),
            REQUESTED,
        );

        expect(progress).toMatchObject({ done: 4, total: 4, percent: 100 });
    });

    /** The service can report a dependency the request never named. */
    it('never exceeds 100 when the service reports an unrequested type', () => {
        const progress = summarizeProgress(
            statuses({
                attribute_sets: 'success',
                categories: 'success',
                products: 'success',
                customers: 'success',
                coupons: 'success',
            }),
            REQUESTED,
        );

        expect(progress.percent).toBe(100);
    });

    /** No request means no denominator — a ring would be a lie. */
    it('reports no percent when the request named no types', () => {
        const progress = summarizeProgress(statuses({}), []);

        expect(progress).toMatchObject({ total: 0, percent: 0 });
    });
});

describe('progressLabel', () => {
    it('names the current type and the count, in human words', () => {
        const label = progressLabel({ done: 5, total: 14, current: 'customer_groups', percent: 36 });

        expect(label).toBe('Importing Customer groups… 5 of 14 done');
    });

    /** Between types there is nothing being processed, but a count still holds. */
    it('falls back to the count alone when nothing is processing', () => {
        const label = progressLabel({ done: 5, total: 14, percent: 36 });

        expect(label).toBe('5 of 14 done');
    });

    /** Before the first poll lands there is nothing honest to say. */
    it('says nothing at all before the job reports anything', () => {
        expect(progressLabel({ done: 0, total: 14, percent: 0 })).toBeUndefined();
    });

    // "Removing", not "Resetting": the button reads "Remove data…", and a
    // project RESET now RESTORES the pack — so "Resetting" here named the one
    // thing this operation is not. The `reset` operation id is unchanged.
    it('words a removal as removing, never as importing', () => {
        const label = progressLabel(
            { done: 2, total: 6, current: 'products', percent: 33 },
            'reset',
        );

        expect(label).toBe('Removing Products… 2 of 6 done');
    });
});
