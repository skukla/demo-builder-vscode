/**
 * `resolveResult` — which outcome the import modal shows, and for which action.
 *
 * The rule worth not losing is stated in the module: the result is keyed on the
 * LAST ACTION, not on which request objects happen to hold values. Request
 * state persists after settling, so a fixed precedence replays an old outcome
 * over a new one — an earlier import's failure would outrank the dry run the
 * user just ran. Every case below therefore fixes the last action and leaves the
 * other requests holding stale values, which is the state the modal is really
 * in.
 */

import {
    resolveResult,
    type LastAction,
} from '@/features/data-installer/ui/components/importResult';
import {
    ACTIVATION,
    failed,
    idle,
    jobRecord,
    sources,
    succeeded,
    PACK_NAME,
} from './importResult.testUtils';
import { ErrorCode } from '@/types/errorCodes';

describe('resolveResult — no action yet', () => {
    it.each([
        ['null', null],
        ['an action the switch does not name', 'rebuild' as LastAction],
    ])('shows nothing for %s, however much request state is lying around', (_label, action) => {
        expect(resolveResult(action as LastAction | null, sources())).toBeNull();
    });
});

describe('resolveResult — dry run', () => {
    it('reports a pass as a success, saying nothing was written', () => {
        const result = resolveResult('dryRun', sources({ dryRun: succeeded({ valid: true }) }));

        expect(result).toEqual({
            variant: 'success',
            title: 'Dry Run Passed',
            message: 'Nothing was written.',
        });
    });

    it('reports a REFUSAL as a warning — it is the answer the button went to fetch', () => {
        const result = resolveResult(
            'dryRun',
            sources({ dryRun: succeeded({ valid: false, reason: 'Catalog is locked' }) })
        );

        expect(result).toMatchObject({
            variant: 'warning',
            title: 'Validation Failed',
            message: 'Catalog is locked',
        });
    });

    it('reports a transport failure as an error', () => {
        const result = resolveResult('dryRun', sources({ dryRun: failed('Request timed out') }));

        expect(result).toEqual({
            variant: 'error',
            title: 'Dry Run Failed',
            message: 'Request timed out',
        });
    });

    it('prefers the failure over a value the request is still holding', () => {
        const stale = { ...failed<{ valid: boolean }>('Request timed out'), value: { valid: true } };

        expect(resolveResult('dryRun', sources({ dryRun: stale }))?.title).toBe('Dry Run Failed');
    });

    it('shows nothing while the dry run has neither answered nor failed', () => {
        expect(resolveResult('dryRun', sources({ dryRun: idle() }))).toBeNull();
    });
});

describe('resolveResult — start and reset', () => {
    it.each([
        ['start', "Couldn't Start the Import"],
        ['reset', "Couldn't Start the Removal"],
    ])('%s reports its own wording for a request that never started', (action, title) => {
        const failure = failed<{ activationId: string }>('The service is unreachable');
        const result = resolveResult(
            action as LastAction,
            sources({ start: failure, reset: failure })
        );

        expect(result).toMatchObject({ variant: 'error', title });
    });

    it('reads the START request when the last action was start', () => {
        const result = resolveResult(
            'start',
            sources({ start: failed('start blew up'), reset: failed('reset blew up') })
        );

        expect(result?.message).toBe('start blew up');
    });

    it('reads the RESET request when the last action was reset', () => {
        const result = resolveResult(
            'reset',
            sources({ start: failed('start blew up'), reset: failed('reset blew up') })
        );

        expect(result?.message).toBe('reset blew up');
    });

    it('shows the terminal record for THIS session’s job', () => {
        const result = resolveResult(
            'start',
            sources({ record: jobRecord(), startedActivation: ACTIVATION })
        );

        expect(result).toMatchObject({ variant: 'success', title: `Imported ${PACK_NAME}` });
    });

    it('shows nothing while the record is still being watched', () => {
        const result = resolveResult(
            'start',
            sources({ record: jobRecord({ outcome: 'watching' }), startedActivation: ACTIVATION })
        );

        expect(result).toBeNull();
    });

    it('shows nothing for a terminal record belonging to a DIFFERENT job', () => {
        const result = resolveResult(
            'start',
            sources({ record: jobRecord(), startedActivation: 'act-999' })
        );

        expect(result).toBeNull();
    });

    it('shows nothing when there is no record at all', () => {
        const result = resolveResult('start', sources({ startedActivation: ACTIVATION }));

        expect(result).toBeNull();
    });
});

describe('resolveResult — a removal that was to save the changes first (step 05)', () => {
    const SAVED_NOTE = 'Saved to the Acme Demo pack. Bodea is unchanged.';

    it('says nothing was removed when the save failed, with a way back to the confirm', () => {
        const reset = { ...failed<{ activationId: string }>('The library is not answering.') };
        reset.failure = { message: 'The library is not answering.', code: ErrorCode.CHANGES_NOT_SAVED };

        expect(resolveResult('reset', sources({ reset }))).toEqual({
            variant: 'error',
            title: "Couldn't save changes. Nothing was removed.",
            message: 'The library is not answering.',
            backToConfirm: true,
        });
    });

    it('CONTROL: any other failure to start is the plain one, back to the form', () => {
        const result = resolveResult('reset', sources({ reset: failed('The service said no.') }));

        expect(result?.title).toBe("Couldn't Start the Removal");
        expect(result).not.toHaveProperty('backToConfirm');
    });

    it('says where the changes went on a removal that finished', () => {
        const result = resolveResult('reset', sources({
            reset: succeeded({ activationId: ACTIVATION, savedNote: SAVED_NOTE }),
            record: jobRecord({ operation: 'reset', outcome: 'success', activationId: ACTIVATION }),
            startedActivation: ACTIVATION,
        }));

        expect(result).toMatchObject({ variant: 'success', message: SAVED_NOTE });
    });

    it('keeps what the removal itself had to say, then adds it, on one that failed too', () => {
        const result = resolveResult('reset', sources({
            reset: succeeded({ activationId: ACTIVATION, savedNote: SAVED_NOTE }),
            record: jobRecord({ operation: 'reset', outcome: 'error', reason: 'Commerce refused a product.', activationId: ACTIVATION }),
            startedActivation: ACTIVATION,
        }));

        expect(result).toMatchObject({ variant: 'error', message: `Commerce refused a product. ${SAVED_NOTE}` });
    });

    it('CONTROL: an import says nothing of it, whatever an earlier removal left', () => {
        const result = resolveResult('start', sources({
            start: succeeded({ activationId: ACTIVATION }),
            reset: succeeded({ activationId: 'older', savedNote: SAVED_NOTE }),
            record: jobRecord({ outcome: 'success', activationId: ACTIVATION }),
            startedActivation: ACTIVATION,
        }));

        expect(result).not.toHaveProperty('message');
    });
});
