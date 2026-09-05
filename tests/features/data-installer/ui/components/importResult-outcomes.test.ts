/**
 * What a FINISHED job says — one wording per terminal outcome, and the right
 * noun for the operation that produced it.
 *
 * Two rules the modal got wrong before and must not get wrong again:
 *
 *   a reset announces itself as a "Removal", never an "Import" — records
 *   written before the `operation` field existed have none, and those were all
 *   imports, so the absent field must still read as Import;
 *
 *   a SUCCESS says it once. Listing every type repeats the title in longhand
 *   and overran StatusDisplay's fixed box, which centres its content and so
 *   clipped the tick off the top and the last line off the bottom.
 */

import type { DataTypeStatus, ImportJobRecord } from '@/features/data-installer/types';
import { resolveResult } from '@/features/data-installer/ui/components/importResult';
import type { DataInstallerRequest } from '@/features/data-installer/ui/hooks/useDataInstallerRequest';

const ACTIVATION = 'act-123';

/** A request that has never run — every case here is driven by the RECORD. */
function noRequest<T>(): DataInstallerRequest<T> {
    return { settled: false, load: jest.fn(), loading: false, value: null, failure: null };
}

/** The outcome the result view produces for a finished job of this shape. */
function outcomeOf(overrides: Partial<ImportJobRecord>) {
    const record: ImportJobRecord = {
        activationId: ACTIVATION,
        datapackName: 'bodea-full',
        version: '1.0.0',
        commerceInstance: 'https://commerce.example.com',
        dataTypes: ['categories', 'products'],
        startedAt: '2026-09-01T00:00:00.000Z',
        outcome: 'success',
        perType: { categories: 'success' as DataTypeStatus },
        ...overrides,
    };
    return resolveResult('start', {
        dryRun: noRequest<{ valid: boolean; reason?: string }>(),
        start: noRequest<{ activationId: string }>(),
        reset: noRequest<{ activationId: string }>(),
        provision: noRequest<never>(),
        record,
        startedActivation: ACTIVATION,
    });
}

describe('a finished job that succeeded', () => {
    it('says it once and counts the types, without listing them', () => {
        const result = outcomeOf({
            outcome: 'success',
            perType: {
                categories: 'success' as DataTypeStatus,
                products: 'success' as DataTypeStatus,
            },
        });

        expect(result).toEqual({
            variant: 'success',
            title: 'Import finished',
            message: 'All 2 data types succeeded.',
        });
        expect(result?.details).toBeUndefined();
    });

    it('calls a reset a REMOVAL', () => {
        expect(outcomeOf({ outcome: 'success', operation: 'reset' })?.title).toBe(
            'Removal finished'
        );
    });

    it('calls an explicit import an IMPORT', () => {
        expect(outcomeOf({ outcome: 'success', operation: 'import' })?.title).toBe(
            'Import finished'
        );
    });

    it('treats a record written before the operation field as an import', () => {
        expect(outcomeOf({ outcome: 'success' })?.title).toBe('Import finished');
    });
});

describe('a finished job that did not fully succeed', () => {
    const troubled = {
        categories: 'success' as DataTypeStatus,
        products: 'failed' as DataTypeStatus,
    };

    it('calls a partial run a WARNING and says a re-run skips what exists', () => {
        const result = outcomeOf({ outcome: 'partial', perType: troubled });

        expect(result).toMatchObject({
            variant: 'warning',
            title: 'Import finished, but some data types did not. Re-running skips what already exists.',
        });
    });

    it('lists only the types that need attention, not the ones that worked', () => {
        const result = outcomeOf({ outcome: 'partial', perType: troubled });

        expect(result?.details).toEqual(['Products: failed']);
    });

    it('carries the record’s reason through as the message', () => {
        const result = outcomeOf({ outcome: 'error', reason: 'Commerce rejected the token' });

        expect(result?.message).toBe('Commerce rejected the token');
    });

    it.each([
        ['error', 'error', 'Import failed. No data type succeeded.'],
        [
            'never-registered',
            'error',
            'The import never started — the service did not register it.',
        ],
        ['stopped', 'info', 'Stopped watching. The import continues on the server.'],
        [
            'still-running',
            'info',
            'Still running after the watch window. The import continues on the server.',
        ],
        [
            'unwatchable',
            'warning',
            'Lost track of this job — it is still running on the server. Check the Installed tab for the result.',
        ],
    ])('%s reads as a %s with its own wording', (outcome, variant, title) => {
        const result = outcomeOf({ outcome: outcome as ImportJobRecord['outcome'] });

        expect(result).toMatchObject({ variant, title });
    });

    it('lower-cases the operation inside a sentence, and only there', () => {
        const result = outcomeOf({ outcome: 'never-registered', operation: 'reset' });

        expect(result?.title).toBe(
            'The removal never started — the service did not register it.'
        );
    });
});
