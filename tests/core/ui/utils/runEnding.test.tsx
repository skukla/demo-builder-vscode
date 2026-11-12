/**
 * The one rule for "does this run end on the small result" (plan step-03 S1; overview Phase 4): a
 * run ends small when it succeeded, has no warning, and no row has a problem or a note. Then the
 * four run windows that decide it, each driven with the same five cases written in that window's
 * own terms, must end small exactly when the rule says.
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
import { endsSmall, type RunEnding } from '@/core/ui/utils/runEnding';
import { asDisplayName } from '@/core/utils/projectDisplayName';
import type {
    DataTypeStatus,
    ImportJobRecord,
    InstallCheck,
} from '@/features/data-installer/types';
import { resolveResult } from '@/features/data-installer/ui/components/importResult';
import { endedClean as batchEndedClean } from '@/features/projects-dashboard/ui/components/ProjectsBatchModal';
import { endedClean as updatesEndedClean } from '@/features/projects-dashboard/ui/components/UpdatesModal';
import type { BatchRowStatuses } from '@/features/projects-dashboard/ui/hooks/useProjectsBatch';
import type { RowStatuses } from '@/features/projects-dashboard/ui/hooks/useUpdatesModal';
import type { PendingUpdateRow, UpdateRowState } from '@/types/pendingUpdates';
import type { OperationProgressPayload, OperationRow } from '@/types/webviewPayloads';

describe('endsSmall', () => {
    it('ends small when it succeeded, with no warning and every row clean', () => {
        expect(endsSmall({ succeeded: true, rows: [{}, { problem: false }] })).toBe(true);
    });

    it('does not end small when the run failed', () => {
        expect(endsSmall({ succeeded: false, rows: [{}] })).toBe(false);
    });

    it('does not end small with a warning', () => {
        expect(
            endsSmall({ succeeded: true, warning: 'Prices were not published.', rows: [{}] })
        ).toBe(false);
    });

    it('does not end small when a row has a problem', () => {
        expect(endsSmall({ succeeded: true, rows: [{}, { problem: { text: 'Stopped' } }] })).toBe(
            false
        );
    });

    it('does not end small when a row has a note', () => {
        expect(endsSmall({ succeeded: true, rows: [{ note: 'One block left out.' }] })).toBe(false);
    });

    it('ends small with no rows at all, when it succeeded with no warning', () => {
        expect(endsSmall({ succeeded: true, rows: [] })).toBe(true);
    });
});

type CaseName = 'clean' | 'warning' | 'problem' | 'note' | 'failed';

/** The five cases, in the rule's own terms: what each one hands `endsSmall`. */
const CASES: Record<CaseName, RunEnding> = {
    clean: { succeeded: true, rows: [{}, {}] },
    warning: { succeeded: true, warning: 'Something did not finish.', rows: [{}, {}] },
    problem: { succeeded: true, rows: [{}, { problem: true }] },
    note: { succeeded: true, rows: [{}, { note: 'Something to know.' }] },
    failed: { succeeded: false, rows: [{}, { problem: true }] },
};

const NAMES = Object.keys(CASES) as CaseName[];

/** A run of two parts, the second one's state per case, as the Updates and batch windows tell it. */
function secondRow(name: CaseName): { state: UpdateRowState; message?: string } {
    if (name === 'problem' || name === 'failed')
        return { state: 'failed', message: 'Rate limited' };
    if (name === 'note') return { state: 'done', message: 'Something to know.' };
    return { state: 'done' };
}

function progressOf(name: CaseName): OperationProgressPayload {
    if (name === 'failed') return { id: 'x', state: 'failed', error: 'Adobe refused this.' };
    return {
        id: 'x',
        state: 'succeeded',
        ...(name === 'warning' ? { warning: 'Something did not finish.' } : {}),
    };
}

describe('the Updates window', () => {
    const rows: PendingUpdateRow[] = [
        {
            id: 'extension',
            kind: 'extension',
            group: { key: 'extension', title: 'Demo Builder' },
            label: 'Demo Builder',
            detail: 'Newer version',
            ticked: true,
        },
        {
            id: 'blocks',
            kind: 'blockLibrary',
            group: { key: 'extension', title: 'Demo Builder' },
            label: 'Demo Builder Blocks',
            detail: 'Newer version',
            ticked: true,
        },
    ];

    it.each(NAMES)('%s ends small exactly when the rule says', (name) => {
        const statuses: RowStatuses = {
            extension: { id: 'extension', state: 'done' },
            blocks: { id: 'blocks', ...secondRow(name) },
        };

        expect(updatesEndedClean(progressOf(name), rows, statuses)).toBe(endsSmall(CASES[name]));
    });
});

describe('the projects batch window', () => {
    it.each(NAMES)('%s ends small exactly when the rule says', (name) => {
        const statuses: BatchRowStatuses = {
            '/p/a': { path: '/p/a', state: 'done' },
            '/p/b': { path: '/p/b', ...secondRow(name) },
        };
        const view = {
            phase: 'running' as const,
            action: 'reset' as const,
            rows: [
                { path: '/p/a', name: asDisplayName('A') },
                { path: '/p/b', name: asDisplayName('B') },
            ],
        };

        expect(batchEndedClean({ view, progress: progressOf(name), statuses })).toBe(
            endsSmall(CASES[name])
        );
    });
});

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

    it.each(NAMES)('%s ends small exactly when the rule says', (name) => {
        const progress: OperationProgressPayload = { ...progressOf(name), rows: rowsOf(name) };
        render(
            <OperationProgressBody
                failed={name === 'failed'}
                succeeded={name !== 'failed'}
                onTyped={jest.fn()}
                progress={progress}
            />
        );

        // Ending small leaves the rows for the sentence alone.
        const small = screen.queryByText('Categories') === null;
        expect(small).toBe(endsSmall(CASES[name]));
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
            return jobRecord({ ...base, rowNotes: { products: 'Something to know.' } });
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

    it.each(NAMES)('%s ends small exactly when the rule says', (name) => {
        const result = resolveResult('start', recordOnlySources(recordOf(name)));

        // Ending small is the success with no steps kept under it.
        const small = result?.variant === 'success' && result.run === undefined;
        expect(small).toBe(endsSmall(CASES[name]));
    });
});
