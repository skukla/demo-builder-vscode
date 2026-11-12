/**
 * A datapack job's titles, from one table (datapack simplification step 03, S2): what it says while
 * it runs, when it is done, and when it failed, for each of the five things a job can be. Result
 * titles name the thing first (conventions rule 21); failures start "Couldn't" (the house rule).
 */

import { jobPurpose, jobWords } from '@/features/data-installer/datapackWords';
import type { JobPurpose } from '@/features/data-installer/types';

describe('jobWords', () => {
    const cases: Array<[JobPurpose, string, [string, string, string]]> = [
        ['install', 'Bodea', ['Installing Bodea', 'Bodea Installed', "Couldn't Install Bodea"]],
        ['switch', 'Bodea', ['Switching to Bodea', 'Bodea Installed', "Couldn't Install Bodea"]],
        [
            'uninstall',
            'My Luma',
            ['Uninstalling My Luma', 'My Luma Uninstalled', "Couldn't Uninstall My Luma"],
        ],
        [
            'restore',
            'My Luma',
            ['Restoring My Luma', 'My Luma Restored', "Couldn't Restore My Luma"],
        ],
        ['undo', 'My Luma', ['Restoring My Luma', 'Last Save Undone', "Couldn't Undo Last Save"]],
    ];

    it.each(cases)('words a %s of %s', (purpose, name, [running, done, failed]) => {
        expect(jobWords(purpose, name)).toStrictEqual({ running, done, failed });
    });
});

describe('jobPurpose', () => {
    it('reads the purpose the record carries', () => {
        expect(jobPurpose({ purpose: 'undo', operation: 'import', replaces: 'My Luma' })).toBe(
            'undo'
        );
    });

    // Older and transient records carry none: it follows from the operation and what it replaces.
    it('derives uninstall from a reset', () => {
        expect(jobPurpose({ operation: 'reset' })).toBe('uninstall');
    });

    it('derives switch from an import replacing another datapack', () => {
        expect(jobPurpose({ operation: 'import', replaces: 'Luma, eds-compatible' })).toBe(
            'switch'
        );
    });

    it('derives install from an import replacing another version of the same datapack', () => {
        expect(jobPurpose({ replaces: 'My Luma', replacesVersion: 'Nov 9, 9:15 AM' })).toBe(
            'install'
        );
    });

    it('derives install from an import replacing nothing, or a record with no operation', () => {
        expect(jobPurpose({ operation: 'import' })).toBe('install');
        expect(jobPurpose({})).toBe('install');
    });
});
