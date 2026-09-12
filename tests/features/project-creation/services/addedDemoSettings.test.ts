/**
 * The remembered demos setting: tolerant parsing (a bad entry is skipped, never
 * a refusal), one row per repository, and a write that replaces in place.
 */

import * as vscode from 'vscode';
import {
    ADDED_DEMOS_SETTING,
    addedDemoKey,
    parseAddedDemoSettings,
    readAddedDemos,
    rememberAddedDemo,
} from '@/features/project-creation/services/addedDemoSettings';
import { makeAddedDemo } from '../../../helpers/demoPackageFixtures';

const JEN = makeAddedDemo();
const BOB = makeAddedDemo({ name: 'Bob', source: { owner: 'bob', repo: 'shop' }, storefrontKind: 'headless' });

describe('parseAddedDemoSettings', () => {
    it('reads valid rows in the setting order and skips what is not a row', () => {
        const rows = parseAddedDemoSettings([
            JEN,
            { name: 'no source' },
            { ...BOB, storefrontKind: 'weird' },
            { ...BOB, kind: 'project' },
            'a string',
            BOB,
        ]);
        expect(rows).toEqual([JEN, BOB]);
    });

    it('answers nothing for a value that is not a list', () => {
        expect(parseAddedDemoSettings(3000)).toStrictEqual([]);
        expect(parseAddedDemoSettings(undefined)).toStrictEqual([]);
    });

    it('keeps a branch on the source and drops what is not a string there', () => {
        const [row] = parseAddedDemoSettings([{ ...JEN, source: { ...JEN.source, branch: 'demo' } }]);
        expect(row.source).toEqual({ owner: 'jen', repo: 'isle5-demo', branch: 'demo' });
        const [row2] = parseAddedDemoSettings([{ ...JEN, source: { ...JEN.source, branch: 7 } }]);
        expect(row2.source).toEqual({ owner: 'jen', repo: 'isle5-demo' });
    });
});

describe('addedDemoKey', () => {
    it('is the repository, case-insensitively as GitHub names are', () => {
        expect(addedDemoKey({ source: { owner: 'Jen', repo: 'Isle5-Demo' } })).toBe('jen/isle5-demo');
    });
});

describe('rememberAddedDemo', () => {
    const update = jest.fn();
    let stored: unknown[];

    beforeEach(() => {
        stored = [JEN];
        update.mockReset().mockResolvedValue(undefined);
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((key: string, fallback: unknown) => (key === ADDED_DEMOS_SETTING ? stored : fallback)),
            update,
        });
    });

    it('reads the rows back through the setting', () => {
        expect(readAddedDemos()).toEqual([JEN]);
    });

    it('appends a new repository, globally (user-scoped, as the custom libraries are)', async () => {
        const next = await rememberAddedDemo(BOB);
        expect(next).toEqual([JEN, BOB]);
        expect(update).toHaveBeenCalledWith(ADDED_DEMOS_SETTING, [JEN, BOB], vscode.ConfigurationTarget.Global);
    });

    it('replaces the row for a repository already remembered, in place', async () => {
        const renamed = { ...JEN, name: 'Isle5 (renamed)' };
        const next = await rememberAddedDemo(renamed);
        expect(next).toEqual([renamed]);
    });
});
