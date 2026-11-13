/**
 * Progress rows as the run's window draws them, typed to `OperationRow` so `typecheck:tests` reads
 * the shape (root CLAUDE.md, "a shape written where the compiler cannot read it WILL be invented").
 */

import type { OperationRow } from '@/types/webviewPayloads';

/** A step with rows nested under it: the import's Install step, one data type working. */
export const STEP_WITH_TYPES: OperationRow = {
    kind: 'install',
    label: 'Install My Luma',
    status: 'checking',
    line: 'Installing',
    types: [
        { kind: 'categories', label: 'Categories', status: 'success', line: '12 Categories' },
        { kind: 'products', label: 'Products', status: 'checking', line: 'Installing 1,200 of 2,046' },
        { kind: 'customers', label: 'Customers', status: 'pending', line: 'Waiting' },
    ],
};

/** A step with no nested rows that stopped: its problem in place of a line. */
export const FAILED_STEP: OperationRow = {
    kind: 'verify',
    label: 'Verify the Import',
    status: 'error',
    problem: { text: 'Commerce did not answer.', failed: true },
};

/** A save's two steps as it writes (Phase 7b): the export done, its save row spinning. */
export const SAVE_WRITING: OperationRow[] = [
    {
        kind: 'export',
        label: 'Export from Commerce',
        status: 'success',
        line: 'Exported',
        types: [{ kind: 'categories', label: 'Categories', status: 'success', line: 'Done' }],
    },
    { kind: 'save', label: 'Save My Luma', status: 'checking', line: 'Saving to My Datapacks' },
];
