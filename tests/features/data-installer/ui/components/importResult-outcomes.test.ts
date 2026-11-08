/**
 * What a FINISHED job says, by the dialog design rules (`docs/development/sop/dialog-design.md`):
 * the outcome is the dialog's TITLE and the body carries only what is left to know or do.
 *
 * An import ends on the rows it ran on (owner, 2026-11-07, "A run ends where it ran"): the title
 * names the kind of thing ("Datapack Imported", "Import Stopped"), the record goes with it for the
 * rows, and the footer's main action is Retry while a retry can get past the stop, else Fix with AI.
 * Before, a success was "Imported Luma" over the engine's whole note as one paragraph, which the
 * owner called "far too noisy".
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

const STORE = 'Justrite Test Store';
const SEARCH = 'Products can take up to 20 minutes to appear in storefront search.';

/** The outcome the result view produces for a finished job of this shape. */
function outcomeOf(overrides: Partial<ImportJobRecord>, extra: { retries?: number } = {}) {
    const record = jobRecord(overrides);
    const action = record.operation === 'reset' ? 'reset' : 'start';
    return resolveResult(action, { ...recordOnlySources(record), store: STORE, ...extra });
}

const done = (...kinds: string[]): Record<string, DataTypeStatus> =>
    Object.fromEntries(kinds.map((kind) => [kind, 'success' as DataTypeStatus]));

describe('an import that ran to the end', () => {
    it('is "Datapack Imported", with the record for its rows and the sentence under them', () => {
        const record = {
            outcome: 'success' as const,
            perType: done('categories', 'products'),
            searchDelay: SEARCH,
        };

        expect(outcomeOf(record)).toEqual({
            variant: 'success',
            title: 'Datapack Imported',
            run: jobRecord(record),
            lead: `${PACK_NAME} is in ${STORE}. ${SEARCH}`,
        });
    });

    it('CONTROL: offers no main action when nothing needs the SC', () => {
        expect(
            outcomeOf({ outcome: 'success', perType: done('products') })?.action
        ).toBeUndefined();
    });

    it('is amber, with Fix with AI, when a row went in with a problem', () => {
        const result = outcomeOf({
            outcome: 'success',
            perType: done('products'),
            rowNotes: { products: 'The store refused 3.' },
        });

        expect(result).toMatchObject({
            variant: 'warning',
            title: 'Datapack Imported',
            action: 'fix',
        });
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
            title: 'Datapack Imported',
            action: 'fix',
        });
    });

    it('treats a record written before the operation field as an import', () => {
        expect(outcomeOf({ outcome: 'success', perType: done('products') })?.title).toBe(
            'Datapack Imported'
        );
    });

    it('carries how long the job took, when it said', () => {
        expect(outcomeOf({ outcome: 'success', processingTimeMs: 72_000 })?.tookMs).toBe(72_000);
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

    it('is "Import Stopped", red, with Retry when a retry can get past it', () => {
        expect(outcomeOf({ ...stopped, retryable: true })).toMatchObject({
            variant: 'error',
            title: 'Import Stopped',
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

    it('says nothing under its rows but how long it took: the rows say where it stopped', () => {
        expect(outcomeOf({ ...stopped, retryable: true })?.lead).toBeUndefined();
    });
});

describe('a removal', () => {
    it('calls a reset a REMOVAL', () => {
        expect(outcomeOf({ outcome: 'success', operation: 'reset' })?.title).toBe(
            `Removed ${PACK_NAME}`
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
            title: `Removed ${PACK_NAME}`,
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
            title: `Action Required to Remove ${PACK_NAME}`,
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
            title: `Removed ${PACK_NAME}, Except Some Data Types`,
            details: ['Products: error', 'Running it again skips existing items.'],
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
            title: `Couldn't Remove ${PACK_NAME}`,
            message: 'Commerce rejected the token',
        });
    });
});

describe('a job with no rows to end on', () => {
    it.each([
        ['never-registered', 'error', 'Import Did Not Start', undefined],
        ['stopped', 'info', 'Running in Background', 'The import continues in the background.'],
        [
            'still-running',
            'info',
            'Still Running',
            'The import continues in the background. See the Activity tab for the result.',
        ],
        [
            'unwatchable',
            'warning',
            'Import Status Unknown',
            'It is still running. See the Activity tab for the result.',
        ],
    ])('%s reads as a %s with its own wording', (outcome, variant, title, message) => {
        const result = outcomeOf({ outcome: outcome as ImportJobRecord['outcome'] });

        expect(result).toMatchObject({ variant, title, ...(message ? { message } : {}) });
    });

    it('words a removal as a removal', () => {
        expect(outcomeOf({ outcome: 'never-registered', operation: 'reset' })?.title).toBe(
            'Removal Did Not Start'
        );
    });
});
