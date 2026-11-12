/**
 * What a FINISHED job says, by the dialog design rules (`docs/development/sop/dialog-design.md`):
 * the outcome is the dialog's TITLE and the body carries only what is left to know or do.
 *
 * An import that finished cleanly hands off to the small result (owner, 2026-11-10, walk F134):
 * "Frescopa Installed", then only where the SC's changes went and how long search takes. One that
 * finished with a problem, or stopped, stays on the steps it ran on: the record goes with the result
 * for the steps, and the footer's main action is Retry while a retry can get past the stop, else
 * Fix with AI. Before, a success was "Imported Luma" over the engine's whole note as one paragraph,
 * which the owner called "far too noisy".
 *
 * A removal keeps its own ending: it has no rows yet. It announces itself as a removal
 * ("Removed"), never an import. Records written before the `operation` field existed have none,
 * and those were all imports, so the absent field must still read as an import.
 */

import type { DataTypeStatus, ImportJobRecord } from '@/features/data-installer/types';
import {
    resolveResult,
    RETRIES_BEFORE_FIX,
} from '@/features/data-installer/ui/components/importResult';
import { jobRecord, PACK_NAME, recordOnlySources } from './importResult.testUtils';

const SEARCH = 'New products can take 20 minutes to show in search.';

/** The outcome the result view produces for a finished job of this shape. */
function outcomeOf(overrides: Partial<ImportJobRecord>, extra: { retries?: number } = {}) {
    const record = jobRecord(overrides);
    const action = record.operation === 'reset' ? 'reset' : 'start';
    return resolveResult(action, { ...recordOnlySources(record), ...extra });
}

const done = (...kinds: string[]): Record<string, DataTypeStatus> =>
    Object.fromEntries(kinds.map((kind) => [kind, 'success' as DataTypeStatus]));

describe('an import that finished cleanly (walk F134)', () => {
    it('is the small result: the pack Imported, and how long search takes, nothing else', () => {
        const record = {
            outcome: 'success' as const,
            perType: done('categories', 'products'),
            searchDelay: SEARCH,
            processingTimeMs: 72_000,
        };

        // No `run` (so no steps), no lead, no "Took …".
        expect(outcomeOf(record)).toEqual({
            variant: 'success',
            title: `${PACK_NAME} Installed`,
            finished: true,
            message: SEARCH,
        });
    });

    // Review, 2026-11-10: only a problem keeps the steps. The engine's lines for the SC go in the small
    // result's body, before the search line, a line each.
    it('is the small result with the engine\'s lines in its body, before the search line', () => {
        const result = outcomeOf({
            outcome: 'success',
            perType: done('categories', 'products'),
            savedAs: 'Nov 9, 11:52 PM',
            replaces: 'Frescopa',
            searchDelay: SEARCH,
            scLines: ['Kept 2 things you had changed in the Admin.'],
        });

        expect(result).toEqual({
            variant: 'success',
            title: `${PACK_NAME} Installed`,
            finished: true,
            details: ['Kept 2 things you had changed in the Admin.', SEARCH],
        });
    });

    // Phase 2 (owner, 2026-11-12): the save's own result title says where the changes went ("Saved to
    // My Luma", rule 17), so the install's result does not say it again (rule 3).
    it('says nothing more about a save made first: the save said it', () => {
        const result = outcomeOf({
            outcome: 'success',
            perType: done('products'),
            replaces: 'Frescopa',
            savedAs: 'Nov 9, 11:52 PM',
            searchDelay: SEARCH,
        });

        expect(result?.message).toBe(SEARCH);
    });

    it('is the title alone when there is nothing left to know', () => {
        expect(outcomeOf({ outcome: 'success', perType: done('categories') })).toEqual({
            variant: 'success',
            title: `${PACK_NAME} Installed`,
            finished: true,
        });
    });

    it('treats a record written before the operation field as an import', () => {
        expect(outcomeOf({ outcome: 'success', perType: done('products') })?.title).toBe(
            `${PACK_NAME} Installed`
        );
    });

    it('CONTROL: offers no main action when nothing needs the SC', () => {
        expect(
            outcomeOf({ outcome: 'success', perType: done('products') })?.action
        ).toBeUndefined();
    });
});

describe('an import that finished with a problem (walk F134)', () => {
    it('stays on its steps, amber, the same title, with Fix with AI and the sentence under them', () => {
        const record = {
            outcome: 'success' as const,
            perType: done('categories', 'products'),
            rowNotes: { products: 'Commerce refused 3 rows.' },
            searchDelay: SEARCH,
            processingTimeMs: 72_000,
        };

        expect(outcomeOf(record)).toEqual({
            variant: 'warning',
            title: `${PACK_NAME} Installed`,
            run: jobRecord(record),
            finished: true,
            action: 'fix',
            // Only the search sentence: no paragraph on where it went (review, 2026-11-10).
            lead: SEARCH,
            tookMs: 72_000,
        });
    });

    it('stays on its steps when the check found products that differ', () => {
        const check = {
            verdict: 'differs' as const,
            checked: 2048,
            compared: { values: 10, prices: 5, configurables: 1 },
            missing: { count: 3, examples: ['24-mb01'] },
            configurablesWithoutOptions: { count: 0, examples: [] },
            configurablesDiffer: { count: 0, examples: [] },
            valuesDiffer: { count: 0, examples: [] },
            pricesDiffer: { count: 0, examples: [] },
        };
        const result = outcomeOf({ outcome: 'success', perType: done('products'), check });

        expect(result).toMatchObject({ variant: 'warning', title: `${PACK_NAME} Installed`, action: 'fix' });
        expect(result?.run).toBeDefined();
    });

    it('CONTROL: a check that matches is a clean finish', () => {
        const check = {
            verdict: 'matches' as const,
            checked: 2048,
            compared: { values: 10, prices: 5, configurables: 1 },
            missing: { count: 0, examples: [] },
            configurablesWithoutOptions: { count: 0, examples: [] },
            configurablesDiffer: { count: 0, examples: [] },
            valuesDiffer: { count: 0, examples: [] },
            pricesDiffer: { count: 0, examples: [] },
        };

        expect(outcomeOf({ outcome: 'success', perType: done('products'), check })?.run).toBeUndefined();
    });

    it('still ran to the end when only the store settings failed, which fail without stopping it', () => {
        const result = outcomeOf({
            outcome: 'partial',
            perType: { ...done('products'), store_config: 'error' },
            stoppedAt: 'store_config',
            reason: 'The settings could not be set.',
        });

        expect(result).toMatchObject({
            variant: 'warning',
            title: `${PACK_NAME} Installed`,
            action: 'fix',
            finished: true,
        });
    });
});

describe('an import that stopped', () => {
    const stopped = {
        outcome: 'partial' as const,
        perType: { categories: 'success', products: 'error', source_items: 'error' } as Record<
            string,
            DataTypeStatus
        >,
        stoppedAt: 'products',
        reason: 'Commerce did not respond to V1/products: timed out',
    };

    it('is "Install Stopped", red, with Retry when a retry can get past it', () => {
        expect(outcomeOf({ ...stopped, retryable: true })).toMatchObject({
            variant: 'error',
            title: 'Install Stopped',
            action: 'retry',
        });
    });

    it(`offers Fix with AI once Retry has been pressed ${RETRIES_BEFORE_FIX} times`, () => {
        expect(
            outcomeOf({ ...stopped, retryable: true }, { retries: RETRIES_BEFORE_FIX })?.action
        ).toBe('fix');
        expect(
            outcomeOf({ ...stopped, retryable: true }, { retries: RETRIES_BEFORE_FIX - 1 })?.action
        ).toBe('retry');
    });

    it('offers Fix with AI when a retry would stop the same way', () => {
        expect(outcomeOf({ ...stopped, retryable: false })?.action).toBe('fix');
    });

    it('is "Install Stopped" when every data type went in and the work after them stopped', () => {
        const result = outcomeOf({
            outcome: 'partial',
            perType: done('categories', 'products'),
            stoppedAt: 'finishing',
            reason: 'Commerce answered 503.',
            retryable: true,
        });

        expect(result).toMatchObject({ variant: 'error', title: 'Install Stopped', action: 'retry' });
    });

    it('says nothing under its rows but how long it took: the rows say where it stopped', () => {
        expect(outcomeOf({ ...stopped, retryable: true })?.lead).toBeUndefined();
    });
});

describe('a removal', () => {
    it('calls a reset a REMOVAL', () => {
        expect(outcomeOf({ outcome: 'success', operation: 'reset' })?.title).toBe(
            `${PACK_NAME} Uninstalled`
        );
    });

    it('says what it left in the store as its sentence', () => {
        const result = outcomeOf({
            outcome: 'success',
            operation: 'reset',
            note: 'Kept the category Gear: it holds yours.',
        });

        expect(result).toEqual({
            variant: 'success',
            title: `${PACK_NAME} Uninstalled`,
            message: 'Kept the category Gear: it holds yours.',
        });
    });

    // Step 12: the store's root kept for it, with the Admin step that frees it.
    it('says a removal kept the root for a store, amber, and hands over its Admin step', () => {
        const keptRoot = {
            store: 'Justrite Test Store',
            category: 'ZZ Root DB12',
            restore: 'Justrite Catalog',
        };

        expect(
            outcomeOf({
                outcome: 'success',
                operation: 'reset',
                keptRoot,
                note: 'Kept the category ZZ Root DB12: ...',
            })
        ).toEqual({
            variant: 'warning',
            title: `One Step Left to Uninstall ${PACK_NAME}`,
            message:
                "Justrite Test Store still uses the datapack's root category, ZZ Root DB12, so it stayed.",
            keptRoot,
        });
    });

    it('calls a partial run a WARNING, naming the types that need attention', () => {
        const result = outcomeOf({
            outcome: 'partial',
            operation: 'reset',
            perType: { categories: 'success', products: 'error' },
        });

        expect(result).toEqual({
            variant: 'warning',
            title: `Some Data Types Not Uninstalled`,
            details: ['Products: error'],
        });
    });

    it('carries the record’s reason through as the message', () => {
        const result = outcomeOf({
            outcome: 'error',
            operation: 'reset',
            reason: 'Commerce rejected the token',
        });

        expect(result).toMatchObject({
            variant: 'error',
            title: `Couldn't Uninstall ${PACK_NAME}`,
            message: 'Commerce rejected the token',
        });
    });
});

describe('a job with no rows to end on', () => {
    it.each([
        ['never-registered', 'error', 'Install Did Not Start', undefined],
        ['stopped', 'info', 'Running in Background', 'The install continues in the background.'],
        [
            'still-running',
            'info',
            'Still Running',
            'Still running. The result will be on the Activity tab.',
        ],
        [
            'unwatchable',
            'warning',
            'Install Status Unknown',
            'Still running. The result will be on the Activity tab.',
        ],
    ])('%s reads as a %s with its own wording', (outcome, variant, title, message) => {
        const result = outcomeOf({ outcome: outcome as ImportJobRecord['outcome'] });

        expect(result).toMatchObject({ variant, title, ...(message ? { message } : {}) });
    });

    it('words a removal as a removal', () => {
        expect(outcomeOf({ outcome: 'never-registered', operation: 'reset' })?.title).toBe(
            'Uninstall Did Not Start'
        );
    });
});
