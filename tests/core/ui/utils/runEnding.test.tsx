/**
 * The one rule for "did this run end clean" (plan step-03 S1; overview Phase 4): a run ends clean
 * when it succeeded, has no warning, and no row has a problem or a note. Then the two windows of one
 * thing's run that decide it, each driven with the same five cases written in that window's own
 * terms, must leave their rows out exactly when the rule says. The window keeps its size either way,
 * and a run over several things keeps its rows on every end (owner, 2026-11-17, walk F222), so the
 * Updates and projects batch windows no longer decide it.
 *
 * A note reaches a progress-window row (a datapack save) as a problem that did not fail
 * (`runRows.ts`), so that window's note case is that shape.
 */

import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';
import React from 'react';
import {
    jobRecord,
    recordOnlySources,
} from '../../../features/data-installer/ui/components/importResult.testUtils';
import { OperationProgressBody } from '@/core/ui/components/feedback/OperationProgressBody';
import { endsClean, type RunEnding } from '@/core/ui/utils/runEnding';
import type {
    DataTypeStatus,
    ImportJobRecord,
    InstallCheck,
} from '@/features/data-installer/types';
import { resolveResult } from '@/features/data-installer/ui/components/importResult';
import type { OperationProgressPayload, OperationRow } from '@/types/webviewPayloads';
import { plain } from '@/features/data-installer/plainFailure';

describe('endsClean', () => {
    it('ends clean when it succeeded, with no warning and every row clean', () => {
        expect(endsClean({ succeeded: true, rows: [{}, { problem: false }] })).toBe(true);
    });

    it('does not end clean when the run failed', () => {
        expect(endsClean({ succeeded: false, rows: [{}] })).toBe(false);
    });

    it('does not end clean with a warning', () => {
        expect(
            endsClean({ succeeded: true, warning: 'Prices were not published.', rows: [{}] })
        ).toBe(false);
    });

    it('does not end clean when a row has a problem', () => {
        expect(endsClean({ succeeded: true, rows: [{}, { problem: { text: 'Stopped' } }] })).toBe(
            false
        );
    });

    it('does not end clean when a row has a note', () => {
        expect(endsClean({ succeeded: true, rows: [{ note: 'One block left out.' }] })).toBe(false);
    });

    it('ends clean with no rows at all, when it succeeded with no warning', () => {
        expect(endsClean({ succeeded: true, rows: [] })).toBe(true);
    });
});

type CaseName = 'clean' | 'warning' | 'problem' | 'note' | 'failed';

/** The five cases, in the rule's own terms: what each one hands `endsClean`. */
const CASES: Record<CaseName, RunEnding> = {
    clean: { succeeded: true, rows: [{}, {}] },
    warning: { succeeded: true, warning: 'Something did not finish.', rows: [{}, {}] },
    problem: { succeeded: true, rows: [{}, { problem: true }] },
    note: { succeeded: true, rows: [{}, { note: 'Something to know.' }] },
    failed: { succeeded: false, rows: [{}, { problem: true }] },
};

const NAMES = Object.keys(CASES) as CaseName[];

function progressOf(name: CaseName): OperationProgressPayload {
    if (name === 'failed') return { id: 'x', state: 'failed', error: 'Adobe refused this.' };
    return {
        id: 'x',
        state: 'succeeded',
        ...(name === 'warning' ? { warning: 'Something did not finish.' } : {}),
    };
}

describe('the progress window (a run with rows, a datapack save)', () => {
    function rowsOf(name: CaseName): OperationRow[] {
        const first: OperationRow = {
            kind: 'categories',
            label: 'Categories',
            status: 'success',
            line: 'Done',
        };
        if (name === 'problem' || name === 'failed') {
            return [
                first,
                {
                    kind: 'products',
                    label: 'Products',
                    status: 'error',
                    problem: { text: 'Stopped', failed: true },
                },
            ];
        }
        if (name === 'note') {
            return [
                first,
                {
                    kind: 'products',
                    label: 'Products',
                    status: 'warning',
                    problem: { text: 'Something to know.', failed: false },
                },
            ];
        }
        return [first, { kind: 'products', label: 'Products', status: 'success', line: 'Done' }];
    }

    it.each(NAMES)('%s leaves its rows out exactly when the rule says', (name) => {
        const progress: OperationProgressPayload = { ...progressOf(name), rows: rowsOf(name) };
        render(
            <OperationProgressBody
                failed={name === 'failed'}
                succeeded={name !== 'failed'}
                onTyped={jest.fn()}
                progress={progress}
            />
        );

        // Ending clean leaves the rows out, the outcome and its sentence alone.
        const clean = screen.queryByText('Categories') === null;
        expect(clean).toBe(endsClean(CASES[name]));
    });
});

describe('the import window (an install the engine ran)', () => {
    const differs: InstallCheck = {
        verdict: 'differs',
        checked: 2048,
        compared: { values: 10, prices: 5, configurables: 1 },
        missing: { count: 3, examples: ['24-mb01'] },
        configurablesWithoutOptions: { count: 0, examples: [] },
        configurablesDiffer: { count: 0, examples: [] },
        valuesDiffer: { count: 0, examples: [] },
        pricesDiffer: { count: 0, examples: [] },
    };

    /** Two data types; the store configuration fails without stopping the import. */
    function recordOf(name: CaseName): ImportJobRecord {
        const perType: Record<string, DataTypeStatus> = {
            products: 'success',
            store_config: 'success',
        };
        const base = { dataTypes: ['products', 'store_config'], perType };
        if (name === 'warning') return jobRecord({ ...base, check: differs });
        if (name === 'problem') {
            return jobRecord({
                ...base,
                outcome: 'partial',
                perType: { ...perType, store_config: 'error' },
                stoppedAt: 'store_config',
            });
        }
        if (name === 'note')
            return jobRecord({ ...base, rowNotes: { products: plain('Something to know.') } });
        if (name === 'failed') {
            return jobRecord({
                ...base,
                outcome: 'error',
                perType: { ...perType, products: 'error' },
                stoppedAt: 'products',
            });
        }
        return jobRecord(base);
    }

    it.each(NAMES)('%s leaves its rows out exactly when the rule says', (name) => {
        const result = resolveResult('start', recordOnlySources(recordOf(name)));

        // Ending clean is the success with no steps kept under it.
        const clean = result?.variant === 'success' && result.run === undefined;
        expect(clean).toBe(endsClean(CASES[name]));
    });
});
