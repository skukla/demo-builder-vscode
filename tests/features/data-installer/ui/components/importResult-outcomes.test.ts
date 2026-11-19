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
import { RETRIES_BEFORE_FIX } from '@/core/utils/fixWithAi';
import { resolveResult } from '@/features/data-installer/ui/components/importResult';
import { jobRecord, PACK_NAME, recordOnlySources } from './importResult.testUtils';
import { plain } from '@/core/utils/plainText';

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
    // Owner walk Q3 (2026-11-13): the search-delay line goes from the clean result, so it is the title
    // alone, waiting for Close. The line stays for an ending that keeps its steps, and for agents.
    it('is the small result: the pack Installed, nothing else, not even how long search takes', () => {
        const record = {
            outcome: 'success' as const,
            perType: done('categories', 'products'),
            searchDelay: SEARCH,
            processingTimeMs: 72_000,
        };

        // No `run` (so no steps), no lead, no "Took …", no line: the title alone.
        expect(outcomeOf(record)).toEqual({
            thing: PACK_NAME,
            variant: 'success',
            title: `${PACK_NAME} Installed`,
            finished: true,
        });
    });

    // Review, 2026-11-10: only a problem keeps the steps. The engine's lines for the SC go in the small
    // result's body, a line each, and keep it open to be read (owner walk Q3).
    it('is the small result with the engine\'s lines in its body, and no search line', () => {
        const result = outcomeOf({
            outcome: 'success',
            perType: done('categories', 'products'),
            savedAs: 'Nov 9, 11:52 PM',
            replaces: 'Frescopa',
            searchDelay: SEARCH,
            scLines: [plain('Kept 2 things you had changed in the Admin.')],
        });

        expect(result).toEqual({
            thing: PACK_NAME,
            variant: 'success',
            title: `${PACK_NAME} Installed`,
            finished: true,
            details: ['Kept 2 things you had changed in the Admin.'],
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

        expect(result?.message).toBeUndefined();
        expect(result?.details).toBeUndefined();
    });

    it('is the title alone when there is nothing left to know', () => {
        expect(outcomeOf({ outcome: 'success', perType: done('categories') })).toEqual({
            thing: PACK_NAME,
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
            rowNotes: { products: plain('Commerce refused 3 rows.') },
            searchDelay: SEARCH,
            processingTimeMs: 72_000,
        };

        expect(outcomeOf(record)).toEqual({
            thing: PACK_NAME,
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

    // Step 03, S2: a stop is the job's failed title, "Couldn't Install <name>" (it was "Install Stopped").
    it('is "Couldn\'t Install", red, with Retry when a retry can get past it', () => {
        expect(outcomeOf({ ...stopped, retryable: true })).toMatchObject({
            variant: 'error',
            title: `Couldn't Install ${PACK_NAME}`,
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

    it('is "Couldn\'t Install" when every data type went in and the work after them stopped', () => {
        const result = outcomeOf({
            outcome: 'partial',
            perType: done('categories', 'products'),
            stoppedAt: 'finishing',
            reason: 'Commerce answered 503.',
            retryable: true,
        });

        expect(result).toMatchObject({ variant: 'error', title: `Couldn't Install ${PACK_NAME}`, action: 'retry' });
    });

    it('says nothing under its rows but how long it took: the rows say where it stopped', () => {
        expect(outcomeOf({ ...stopped, retryable: true })?.lead).toBeUndefined();
    });
});

// Step 03, S2: the ending is worded for what the job was for (`jobWords`), read off its record.
describe('an ending worded for what the job was for', () => {
    const clean = { outcome: 'success' as const, perType: done('products') };
    const stop = { outcome: 'partial' as const, perType: { products: 'error' } as Record<string, DataTypeStatus>, stoppedAt: 'products' };

    it('ends a restore as "Restored", or "Couldn\'t Restore"', () => {
        expect(outcomeOf({ ...clean, purpose: 'restore' })?.title).toBe(`${PACK_NAME} Restored`);
        expect(outcomeOf({ ...stop, purpose: 'restore' })?.title).toBe(`Couldn't Restore ${PACK_NAME}`);
    });

    it('ends an undo as "Last Save Undone", or "Couldn\'t Undo Last Save"', () => {
        expect(outcomeOf({ ...clean, purpose: 'undo' })?.title).toBe('Last Save Undone');
        expect(outcomeOf({ ...stop, purpose: 'undo' })?.title).toBe("Couldn't Undo Last Save");
    });

    it('ends a switch as an install does', () => {
        expect(outcomeOf({ ...clean, purpose: 'switch' })?.title).toBe(`${PACK_NAME} Installed`);
        expect(outcomeOf({ ...stop, purpose: 'switch' })?.title).toBe(`Couldn't Install ${PACK_NAME}`);
    });

    it('words a record with no purpose by what it replaces: another datapack is a switch', () => {
        expect(outcomeOf({ ...stop, replaces: 'Luma, eds-compatible' })?.title).toBe(`Couldn't Install ${PACK_NAME}`);
    });
});

/**
 * An uninstall, drawn as steps (step 03, S7; decisions J5-2): a clean one ends on the small result,
 * "Luma Uninstalled"; one that stopped or
 * left part behind stays on its steps as "Couldn't Uninstall Luma", with Retry (J5-1's picture).
 * The kept root keeps its Admin step in the small window.
 */
describe('a removal', () => {
    it('calls a reset a REMOVAL, and ends it on the small result', () => {
        expect(outcomeOf({ outcome: 'success', operation: 'reset' })).toEqual({
            thing: PACK_NAME,
            variant: 'success',
            title: `${PACK_NAME} Uninstalled`,
            finished: true,
        });
    });

    it('says what it left in the store as its sentence', () => {
        const result = outcomeOf({
            outcome: 'success',
            operation: 'reset',
            note: 'Kept the category Gear: it holds yours.',
            // Walk F221: the window reads the engine's lines for the SC; the note is for agents.
            scLines: [plain('Kept the category Gear: it holds yours.')],
        });

        expect(result).toEqual({
            thing: PACK_NAME,
            variant: 'success',
            title: `${PACK_NAME} Uninstalled`,
            details: ['Kept the category Gear: it holds yours.'],
            finished: true,
        });
    });

    // Step 12: the store's root kept for it, with the Admin step that frees it.
    it('says a removal kept the root for a store, amber, and hands over its Admin step', () => {
        const keptRoot = {
            store: 'Tailspin Test Store',
            category: 'ZZ Root DB12',
            restore: 'Tailspin Catalog',
        };

        expect(
            outcomeOf({
                outcome: 'success',
                operation: 'reset',
                keptRoot,
                note: 'Kept the category ZZ Root DB12: ...',
            })
        ).toEqual({
            thing: PACK_NAME,
            variant: 'warning',
            title: `One Step Left to Uninstall ${PACK_NAME}`,
            message:
                "Tailspin Test Store still uses the category ZZ Root DB12 as its root category, so Demo Builder couldn't delete that category. Everything else is uninstalled.",
            keptRoot,
            finished: true,
        });
    });

    it.each(['error', 'partial'] as const)('keeps a run that ended %s on its steps, "Couldn\'t Uninstall", with Retry', (outcome) => {
        const record = jobRecord({
            outcome,
            operation: 'reset',
            reason: 'Commerce rejected the token',
            processingTimeMs: 4000,
        });

        expect(resolveResult('reset', recordOnlySources(record))).toEqual({
            thing: PACK_NAME,
            variant: 'error',
            title: `Couldn't Uninstall ${PACK_NAME}`,
            run: record,
            action: 'retry',
            tookMs: 4000,
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
