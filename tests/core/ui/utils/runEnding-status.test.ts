/**
 * The one amber rule (owner walk Q9 and Q6, 2026-11-13; plan step-07 I3): a run's title turns amber
 * when the run has a warning or any row (a nested one included) has a problem, meaning Commerce
 * refused or failed to write something, or a reset did not do something it should have (code not
 * published, the mesh not redeployed). A note alone (edits kept, rows already there, content kept on
 * purpose, "Saved to My Luma.") stays green and keeps the window open. A failure is red.
 *
 * The four windows that colour a run's end each get the same five cases, written in that window's
 * own terms, and must colour it exactly as `endStatus` does.
 */

import { progressEnding, progressFrame } from '@/core/ui/components/feedback/OperationProgressBody';
import { endStatus, type RunEnding } from '@/core/ui/utils/runEnding';
import { asDisplayName } from '@/core/utils/projectDisplayName';
import type { DataTypeStatus, ImportJobRecord } from '@/features/data-installer/types';
import { resolveResult } from '@/features/data-installer/ui/components/importResult';
import { runStatus } from '@/features/projects-dashboard/ui/components/ProjectsBatchModal';
import { runHeadingOf } from '@/features/projects-dashboard/ui/components/UpdatesModal';
import type { BatchRowStatuses } from '@/features/projects-dashboard/ui/hooks/useProjectsBatch';
import type { RowStatuses } from '@/features/projects-dashboard/ui/hooks/useUpdatesModal';
import type { PendingUpdateRow } from '@/types/pendingUpdates';
import type { OperationProgressPayload, OperationRow } from '@/types/webviewPayloads';
import {
    jobRecord,
    recordOnlySources,
} from '../../../features/data-installer/ui/components/importResult.testUtils';

describe('endStatus', () => {
    it('is green when it succeeded with no warning and no row with a problem', () => {
        expect(endStatus({ succeeded: true, rows: [{}, { problem: false }] })).toBe('success');
    });

    it('stays green with a note: something to know is not something that went wrong', () => {
        expect(endStatus({ succeeded: true, rows: [{ note: 'Content kept.' }] })).toBe('success');
    });

    it('is amber with a warning', () => {
        expect(
            endStatus({ succeeded: true, warning: 'Prices were not published.', rows: [] })
        ).toBe('warning');
    });

    it('is amber when a row has a problem', () => {
        expect(
            endStatus({
                succeeded: true,
                rows: [{}, { problem: { text: 'Commerce refused 3 rows.' } }],
            })
        ).toBe('warning');
    });

    it('is amber when a row nested under a step has a problem', () => {
        expect(endStatus({ succeeded: true, rows: [{ types: [{}, { problem: true }] }] })).toBe(
            'warning'
        );
    });

    it('is red when the run failed', () => {
        expect(endStatus({ succeeded: false, rows: [] })).toBe('error');
    });
});

type CaseName = 'clean' | 'warning' | 'problem' | 'note' | 'failed';

/** The five cases, in the rule's own terms. */
const CASES: Record<CaseName, RunEnding> = {
    clean: { succeeded: true, rows: [{}, {}] },
    warning: { succeeded: true, warning: 'Something did not finish.', rows: [{}, {}] },
    problem: { succeeded: true, rows: [{}, { problem: true }] },
    note: { succeeded: true, rows: [{}, { note: 'Something to know.' }] },
    failed: { succeeded: false, rows: [{}, { problem: true }] },
};

const NAMES = Object.keys(CASES) as CaseName[];
const NOTE = "Content kept: the demo's pages can't be reached.";

function progressOf(name: CaseName): OperationProgressPayload {
    if (name === 'failed') return { id: 'x', state: 'failed', error: 'Adobe refused this.' };
    return {
        id: 'x',
        state: 'succeeded',
        ...(name === 'warning' ? { warning: 'Something did not finish.' } : {}),
    };
}

describe('the progress window', () => {
    const done: OperationRow = {
        kind: 'categories',
        label: 'Categories',
        status: 'success',
        line: 'Done',
    };

    function payloadOf(name: CaseName): OperationProgressPayload {
        const base = progressOf(name);
        if (name === 'problem') {
            // A nested row Commerce refused, under its step: amber even so.
            const refused: OperationRow = {
                kind: 'products',
                label: 'Products',
                status: 'warning',
                problem: { text: 'Commerce refused 3 rows.', failed: false },
            };
            return {
                ...base,
                rows: [
                    {
                        kind: 'export',
                        label: 'Export from Commerce',
                        status: 'success',
                        line: 'Done',
                        types: [done, refused],
                    },
                ],
            };
        }
        if (name === 'note') return { ...base, note: 'Saved to My Luma.', rows: [done] };
        return { ...base, rows: [done] };
    }

    it.each(NAMES)('%s is coloured exactly as the rule says', (name) => {
        const progress = payloadOf(name);
        const frame = progressFrame({
            title: 'Saving My Luma',
            thing: 'My Luma',
            successTitle: 'Saved to My Luma',
            failureTitle: "Couldn't Save My Luma",
            failed: progress.state === 'failed',
            succeeded: progress.state === 'succeeded',
            ending: progressEnding(progress),
        });

        expect(frame.status).toBe(endStatus(CASES[name]));
    });
});

describe('the projects batch window', () => {
    /** The second project's row per case: a reset that did not publish its code is a problem. */
    function second(name: CaseName): BatchRowStatuses[string] {
        if (name === 'failed') return { path: '/p/b', state: 'failed', message: 'GitHub refused.' };
        if (name === 'problem')
            return {
                path: '/p/b',
                state: 'done',
                warnings: ['The storefront code was not published.'],
            };
        if (name === 'note') return { path: '/p/b', state: 'done', message: NOTE };
        return { path: '/p/b', state: 'done' };
    }

    const view = {
        phase: 'running' as const,
        action: 'reset' as const,
        rows: [
            { path: '/p/a', name: asDisplayName('A') },
            { path: '/p/b', name: asDisplayName('B') },
        ],
    };

    it.each(NAMES)('%s is coloured exactly as the rule says', (name) => {
        const statuses: BatchRowStatuses = {
            '/p/a': { path: '/p/a', state: 'done' },
            '/p/b': second(name),
        };

        expect(runStatus({ view, progress: progressOf(name), statuses })).toBe(
            endStatus(CASES[name])
        );
    });
});

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

    function statusesOf(name: CaseName): RowStatuses {
        // The run's warning counts only while a row it is about has not ended done (EDS-56: the SC's AI
        // finishing a kept fix turns its row done after the run), so its case leaves one row untold.
        if (name === 'warning') return { extension: { id: 'extension', state: 'done' } };
        const blocks = (() => {
            if (name === 'problem' || name === 'failed')
                return { id: 'blocks', state: 'failed' as const, message: 'Rate limited' };
            if (name === 'note')
                return { id: 'blocks', state: 'done' as const, message: 'Something to know.' };
            return { id: 'blocks', state: 'done' as const };
        })();
        return { extension: { id: 'extension', state: 'done' }, blocks };
    }

    it.each(NAMES)('%s is coloured exactly as the rule says', (name) => {
        expect(runHeadingOf(progressOf(name), rows, statusesOf(name)).status).toBe(
            endStatus(CASES[name])
        );
    });
});

describe('the install result', () => {
    const differs = {
        verdict: 'differs' as const,
        checked: 2048,
        compared: { values: 10, prices: 5, configurables: 1 },
        missing: { count: 3, examples: ['24-mb01'] },
        configurablesWithoutOptions: { count: 0, examples: [] },
        configurablesDiffer: { count: 0, examples: [] },
        valuesDiffer: { count: 0, examples: [] },
        pricesDiffer: { count: 0, examples: [] },
    };

    function recordOf(name: CaseName): ImportJobRecord {
        const perType: Record<string, DataTypeStatus> = {
            products: 'success',
            categories: 'success',
        };
        const base = { dataTypes: ['products', 'categories'], perType };
        if (name === 'warning') return jobRecord({ ...base, check: differs });
        // Commerce refused rows: the engine's line on that type's row.
        if (name === 'problem')
            return jobRecord({ ...base, rowNotes: { products: 'Commerce refused 3 rows.' } });
        // The SC's edits kept: something to know.
        if (name === 'note')
            return jobRecord({ ...base, scLines: ['Kept 3 items changed in the Admin.'] });
        if (name === 'failed')
            return jobRecord({
                ...base,
                outcome: 'error',
                perType: { ...perType, products: 'error' },
                stoppedAt: 'products',
            });
        return jobRecord(base);
    }

    it.each(NAMES)('%s is coloured exactly as the rule says', (name) => {
        expect(resolveResult('start', recordOnlySources(recordOf(name)))?.variant).toBe(
            endStatus(CASES[name])
        );
    });

    it('keeps the window open on a note, green: it has a line to read', () => {
        expect(resolveResult('start', recordOnlySources(recordOf('note')))).toMatchObject({
            variant: 'success',
            details: ['Kept 3 items changed in the Admin.'],
        });
    });
});
