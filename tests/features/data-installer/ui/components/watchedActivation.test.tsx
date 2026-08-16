/**
 * Which job the import modal watches when two operations run in one session.
 *
 * The bug this pins: `useVSCodeRequest.execute` clears `error` before a request
 * but NOT `data`, and the modal never calls its `reset()`. So a completed import
 * leaves `start.value.activationId` set for the modal's lifetime. The previous
 * rule — `start.value ?? reset.value` — therefore preferred the FINISHED import
 * forever.
 *
 * What that cost: an import followed by a reset watched the wrong activation, so
 * the effect keyed on that id never re-fired, status was never re-read, polling
 * never started, and the reset's terminal record was dropped by the
 * `record.activationId === startedActivation` guard. The modal fell back to the
 * form with "Start import" enabled while a destructive reset ran server-side.
 * Reset-then-import worked, which is what made it a bug rather than a design.
 *
 * Tested as a pure function rather than through the rendered modal: driving two
 * full operations through the UI costs far more than the rule is complex, and
 * this is the whole of the rule.
 */

import { watchedActivation } from '@/features/data-installer/ui/components/ImportDatapackModal';

describe('watchedActivation', () => {
    /** The regression. Both ids are present; the reset must win. */
    it('watches the RESET after an import already finished', () => {
        expect(watchedActivation('reset', 'act-import', 'act-reset')).toBe('act-reset');
    });

    /** The direction that always worked — it must keep working. */
    it('watches the IMPORT after a reset already finished', () => {
        expect(watchedActivation('start', 'act-import', 'act-reset')).toBe('act-import');
    });

    it('watches the only job there is', () => {
        expect(watchedActivation('start', 'act-import', undefined)).toBe('act-import');
        expect(watchedActivation('reset', undefined, 'act-reset')).toBe('act-reset');
    });

    /**
     * A dry run and provisioning start no job, so neither should change which
     * job is being watched — the modal may have been reopened onto a running one.
     */
    it.each([['dryRun'], ['provision'], [null]])(
        'falls back to whichever job exists when the last action was %s',
        (action) => {
            expect(
                watchedActivation(action as never, 'act-import', undefined),
            ).toBe('act-import');
            expect(watchedActivation(action as never, undefined, 'act-reset')).toBe('act-reset');
        },
    );

    it('has nothing to watch before any job starts', () => {
        expect(watchedActivation(null, undefined, undefined)).toBeUndefined();
    });
});
