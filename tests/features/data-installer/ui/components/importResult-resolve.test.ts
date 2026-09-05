/**
 * `resolveResult` — which outcome the import modal shows, and for which action.
 *
 * The rule worth not losing is stated in the module: the result is keyed on the
 * LAST ACTION, not on which request objects happen to hold values. Request
 * state persists after settling, so a fixed precedence replays an old outcome
 * over a new one — a provisioning success would outrank the dry run the user
 * just ran. Every case below therefore fixes the last action and leaves the
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
} from './importResult.testUtils';

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
            title: 'Dry run passed',
            message: 'The service says this request would be accepted. Nothing has been written.',
        });
    });

    it('reports a REFUSAL as a warning — it is the answer the button went to fetch', () => {
        const result = resolveResult(
            'dryRun',
            sources({ dryRun: succeeded({ valid: false, reason: 'Catalog is locked' }) })
        );

        expect(result).toMatchObject({
            variant: 'warning',
            title: 'The service refused this request',
            message: 'Catalog is locked',
        });
    });

    it('reports a transport failure as an error', () => {
        const result = resolveResult('dryRun', sources({ dryRun: failed('Request timed out') }));

        expect(result).toEqual({
            variant: 'error',
            title: 'Dry run failed',
            message: 'Request timed out',
            offerProvisioning: false,
        });
    });

    it('offers console-free provisioning when the refusal flags missing credentials', () => {
        const result = resolveResult(
            'dryRun',
            sources({ dryRun: failed('No ACCS credentials', { needsAccsCredentials: true }) })
        );

        expect(result?.offerProvisioning).toBe(true);
    });

    it('prefers the failure over a value the request is still holding', () => {
        const stale = { ...failed<{ valid: boolean }>('Request timed out'), value: { valid: true } };

        expect(resolveResult('dryRun', sources({ dryRun: stale }))?.title).toBe('Dry run failed');
    });

    it('shows nothing while the dry run has neither answered nor failed', () => {
        expect(resolveResult('dryRun', sources({ dryRun: idle() }))).toBeNull();
    });
});

describe('resolveResult — automatic credential setup', () => {
    it('reports a settled provision as configured credentials', () => {
        const result = resolveResult('provision', sources());

        expect(result).toMatchObject({ variant: 'success', title: 'Credentials configured' });
    });

    it('reports a failure as an error, ahead of the settled flag', () => {
        const failure = { ...failed<never>('Workspace has no OAuth quota'), settled: true };

        expect(resolveResult('provision', sources({ provision: failure }))).toEqual({
            variant: 'error',
            title: 'Automatic setup failed',
            message: 'Workspace has no OAuth quota',
            offerProvisioning: false,
        });
    });

    it('shows nothing before the provision has settled', () => {
        expect(resolveResult('provision', sources({ provision: idle<never>() }))).toBeNull();
    });
});

describe('resolveResult — start and reset', () => {
    it.each([
        ['start', 'Import failed to start'],
        ['reset', 'Removal failed to start'],
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

        expect(result).toMatchObject({ variant: 'success', title: 'Import finished' });
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
