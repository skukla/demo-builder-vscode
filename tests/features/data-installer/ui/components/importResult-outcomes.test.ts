/**
 * What a FINISHED job says, by the dialog design rules (owner, 2026-10-31,
 * `docs/development/sop/dialog-design.md`): the outcome is the dialog's TITLE, naming the
 * pack, and the body carries only what is left to know or do.
 *
 * Two rules the modal got wrong before and must not get wrong again:
 *
 *   a reset announces itself as a removal ("Removed"), never an import. Records
 *   written before the `operation` field existed have none, and those were all
 *   imports, so the absent field must still read as an import;
 *
 *   a SUCCESS says it once, in the title. Listing every type repeated it in longhand,
 *   and a sentence under it ("Every data type went in.") said nothing the title had not.
 */

import type { DataTypeStatus, ImportJobRecord } from '@/features/data-installer/types';
import { resolveResult } from '@/features/data-installer/ui/components/importResult';
import { jobRecord, PACK_NAME, recordOnlySources } from './importResult.testUtils';

/** The outcome the result view produces for a finished job of this shape. */
function outcomeOf(overrides: Partial<ImportJobRecord>) {
    return resolveResult('start', recordOnlySources(jobRecord(overrides)));
}

describe('a finished job that succeeded', () => {
    it('says it in the title, naming the pack, and nothing else', () => {
        const result = outcomeOf({
            outcome: 'success',
            perType: {
                categories: 'success' as DataTypeStatus,
                products: 'success' as DataTypeStatus,
            },
        });

        expect(result).toEqual({ variant: 'success', title: `Imported ${PACK_NAME}` });
    });

    it('says what installing again kept as its sentence (step 05)', () => {
        const result = outcomeOf({
            outcome: 'success',
            perType: { products: 'success' as DataTypeStatus },
            note: 'Kept 2 things you had changed in the Admin.',
        });

        expect(result).toEqual({ variant: 'success', title: `Imported ${PACK_NAME}`, message: 'Kept 2 things you had changed in the Admin.' });
    });

    it('calls a reset a REMOVAL', () => {
        expect(outcomeOf({ outcome: 'success', operation: 'reset' })?.title).toBe(`Removed ${PACK_NAME}`);
    });

    it('calls an explicit import an IMPORT', () => {
        expect(outcomeOf({ outcome: 'success', operation: 'import' })?.title).toBe(`Imported ${PACK_NAME}`);
    });

    it('treats a record written before the operation field as an import', () => {
        expect(outcomeOf({ outcome: 'success' })?.title).toBe(`Imported ${PACK_NAME}`);
    });

    it('carries how long the job took, when it said', () => {
        expect(outcomeOf({ outcome: 'success', processingTimeMs: 72_000 })?.tookMs).toBe(72_000);
    });

    // Step 12: the store's root kept for it, with the Admin step that frees it.
    it('says a removal kept the root for a store, amber, and hands over its Admin step', () => {
        const keptRoot = { store: 'Justrite Test Store', category: 'ZZ Root DB12', restore: 'Justrite Catalog' };

        expect(outcomeOf({ outcome: 'success', operation: 'reset', keptRoot, note: 'Kept the category ZZ Root DB12: ...' })).toEqual({
            variant: 'warning',
            title: `Removed ${PACK_NAME}, except 1 category`,
            message: 'Justrite Test Store uses ZZ Root DB12 as its root category, so it stayed.',
            keptRoot,
        });
    });
});

describe('a finished job that did not fully succeed', () => {
    const troubled = {
        categories: 'success' as DataTypeStatus,
        products: 'failed' as DataTypeStatus,
    };

    it('calls a partial run a WARNING, naming the types that need attention, and says a re-run skips what is there', () => {
        const result = outcomeOf({ outcome: 'partial', perType: troubled });

        expect(result).toEqual({
            variant: 'warning',
            title: `Imported ${PACK_NAME}, except some data types`,
            details: ['Products: failed', 'Running it again skips what is already there.'],
        });
    });

    it('still says what it kept when some types did not finish', () => {
        const result = outcomeOf({ outcome: 'partial', perType: troubled, note: 'Kept 1 thing you had changed in the Admin.' });

        expect(result?.details).toEqual([
            'Kept 1 thing you had changed in the Admin.',
            'Products: failed',
            'Running it again skips what is already there.',
        ]);
    });

    it('carries the record’s reason through as the message', () => {
        const result = outcomeOf({ outcome: 'error', reason: 'Commerce rejected the token' });

        expect(result).toMatchObject({ variant: 'error', title: `Couldn't import ${PACK_NAME}`, message: 'Commerce rejected the token' });
    });

    it.each([
        ['never-registered', 'error', 'The import never started', undefined],
        ['stopped', 'info', 'Stopped watching', 'The import carries on without you.'],
        ['still-running', 'info', 'Still running', 'The import carries on without you. Its result shows on the Activity tab.'],
        ['unwatchable', 'warning', 'Lost track of the import', 'It is still running. Its result shows on the Activity tab.'],
    ])('%s reads as a %s with its own wording', (outcome, variant, title, message) => {
        const result = outcomeOf({ outcome: outcome as ImportJobRecord['outcome'] });

        expect(result).toMatchObject({ variant, title, ...(message ? { message } : {}) });
    });

    it('words a removal as a removal inside a sentence', () => {
        expect(outcomeOf({ outcome: 'never-registered', operation: 'reset' })?.title).toBe('The removal never started');
        expect(outcomeOf({ outcome: 'error', operation: 'reset' })?.title).toBe(`Couldn't remove ${PACK_NAME}`);
    });
});
