/**
 * The remembered demos setting: tolerant parsing (a bad entry is skipped, never
 * a refusal), one row per repository, and a write that replaces in place.
 */

import * as vscode from 'vscode';
import {
    ADDED_DEMOS_SETTING,
    addedDemoKey,
    editAddedDemo,
    forgetAddedDemo,
    isAddedDemo,
    parseAddedDemoSettings,
    readAddedDemos,
    rememberAddedDemo,
    renameAddedDemoSource,
} from '@/features/project-creation/services/addedDemoSettings';
import { makeAddedDemo } from '../../../helpers/demoPackageFixtures';

const ROBIN = makeAddedDemo();
const BOB = makeAddedDemo({ name: 'Bob', source: { owner: 'bob', repo: 'shop' }, storefrontKind: 'headless' });

describe('parseAddedDemoSettings', () => {
    it('reads valid rows in the setting order and skips what is not a row', () => {
        const rows = parseAddedDemoSettings([
            ROBIN,
            { name: 'no source' },
            { ...BOB, storefrontKind: 'weird' },
            { ...BOB, kind: 'project' },
            'a string',
            BOB,
        ]);
        expect(rows).toEqual([ROBIN, BOB]);
    });

    it('answers nothing for a value that is not a list', () => {
        expect(parseAddedDemoSettings(3000)).toStrictEqual([]);
        expect(parseAddedDemoSettings(undefined)).toStrictEqual([]);
    });

    it('keeps a branch on the source and drops what is not a string there', () => {
        const [row] = parseAddedDemoSettings([{ ...ROBIN, source: { ...ROBIN.source, branch: 'demo' } }]);
        expect(row.source).toEqual({ owner: 'robin', repo: 'isle5-demo', branch: 'demo' });
        const [row2] = parseAddedDemoSettings([{ ...ROBIN, source: { ...ROBIN.source, branch: 7 } }]);
        expect(row2.source).toEqual({ owner: 'robin', repo: 'isle5-demo' });
    });

    it('keeps the record that the extension made the repository from a zip, and only when it is true', () => {
        const [zip] = parseAddedDemoSettings([{ ...ROBIN, createdFromZip: true }]);
        expect(zip.createdFromZip).toBe(true);
        const [other] = parseAddedDemoSettings([{ ...ROBIN, createdFromZip: 'yes' }]);
        expect(other).not.toHaveProperty('createdFromZip');
    });

    it('keeps the boilerplate and lineage it read, and drops either when it is not that shape (EDS-13f)', () => {
        const boilerplate = { name: '@adobe/aem-boilerplate-commerce', version: '4.0.1' };
        const lineage = { templateRepository: { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' } };
        const [read] = parseAddedDemoSettings([{ ...ROBIN, boilerplate, lineage }]);
        const [bad] = parseAddedDemoSettings([
            { ...ROBIN, boilerplate: { name: 'x' }, lineage: { templateRepository: 'adobe-commerce/x' } },
        ]);

        expect(read.boilerplate).toEqual(boilerplate);
        expect(read.lineage).toEqual(lineage);
        expect(bad).not.toHaveProperty('boilerplate');
        expect(bad).not.toHaveProperty('lineage');
    });
});

describe('isAddedDemo', () => {
    it('accepts a row with a kind, a name, a source and a storefront kind, and nothing less', () => {
        expect(isAddedDemo(ROBIN)).toBe(true);
        expect(isAddedDemo({ ...ROBIN, storefrontKind: 'weird' })).toBe(false);
        expect(isAddedDemo({ ...ROBIN, source: { owner: 'robin' } })).toBe(false);
        expect(isAddedDemo(null)).toBe(false);
    });
});

describe('addedDemoKey', () => {
    it('is the repository, case-insensitively as GitHub names are', () => {
        expect(addedDemoKey({ source: { owner: 'Robin', repo: 'Isle5-Demo' } })).toBe('robin/isle5-demo');
    });
});

describe('rememberAddedDemo', () => {
    const update = jest.fn();
    let stored: unknown[];

    beforeEach(() => {
        stored = [ROBIN];
        update.mockReset().mockResolvedValue(undefined);
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((key: string, fallback: unknown) => (key === ADDED_DEMOS_SETTING ? stored : fallback)),
            update,
        });
    });

    it('reads the rows back through the setting', () => {
        expect(readAddedDemos()).toEqual([ROBIN]);
    });

    it('appends a new repository, globally (user-scoped, as the custom libraries are)', async () => {
        const next = await rememberAddedDemo(BOB);
        expect(next).toEqual([ROBIN, BOB]);
        expect(update).toHaveBeenCalledWith(ADDED_DEMOS_SETTING, [ROBIN, BOB], vscode.ConfigurationTarget.Global);
    });

    it('replaces the row for a repository already remembered, in place', async () => {
        const renamed = { ...ROBIN, name: 'Isle5 (renamed)' };
        const next = await rememberAddedDemo(renamed);
        expect(next).toEqual([renamed]);
    });
});

describe('renameAddedDemoSource', () => {
    const update = jest.fn();

    beforeEach(() => {
        update.mockReset().mockResolvedValue(undefined);
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((key: string, fallback: unknown) => (key === ADDED_DEMOS_SETTING ? [ROBIN, BOB] : fallback)),
            update,
        });
    });

    it('moves a remembered row to its new repository and keeps everything else on it', async () => {
        const moved = await renameAddedDemoSource({ owner: 'Robin', repo: 'ISLE5-DEMO' }, { owner: 'robin', repo: 'isle5-2026' });

        expect(moved).toBe(true);
        expect(update).toHaveBeenCalledWith(
            ADDED_DEMOS_SETTING,
            [{ ...ROBIN, source: { owner: 'robin', repo: 'isle5-2026' } }, BOB],
            vscode.ConfigurationTarget.Global,
        );
    });

    it('keeps the zip record on a followed rename', async () => {
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((key: string, fallback: unknown) =>
                key === ADDED_DEMOS_SETTING ? [{ ...ROBIN, createdFromZip: true }] : fallback,
            ),
            update,
        });
        await renameAddedDemoSource(ROBIN.source, { owner: 'robin', repo: 'isle5-2026' });

        expect(update.mock.calls[0][1]).toEqual([
            { ...ROBIN, createdFromZip: true, source: { owner: 'robin', repo: 'isle5-2026' } },
        ]);
    });

    it('writes nothing when the demo is not remembered', async () => {
        const moved = await renameAddedDemoSource({ owner: 'nobody', repo: 'x' }, { owner: 'nobody', repo: 'y' });

        expect(moved).toBe(false);
        expect(update).not.toHaveBeenCalled();
    });
});

describe('forgetAddedDemo', () => {
    const update = jest.fn();

    beforeEach(() => {
        update.mockReset().mockResolvedValue(undefined);
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((key: string, fallback: unknown) => (key === ADDED_DEMOS_SETTING ? [ROBIN, BOB] : fallback)),
            update,
        });
    });

    it('removes the row for that repository and answers what is left', async () => {
        const next = await forgetAddedDemo({ owner: 'ROBIN', repo: 'isle5-demo' });

        expect(next).toEqual([BOB]);
        expect(update).toHaveBeenCalledWith(ADDED_DEMOS_SETTING, [BOB], vscode.ConfigurationTarget.Global);
    });
});

describe('editAddedDemo', () => {
    const update = jest.fn();
    const DESCRIBED = { ...ROBIN, description: 'Old words' };

    beforeEach(() => {
        update.mockReset().mockResolvedValue(undefined);
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((key: string, fallback: unknown) => (key === ADDED_DEMOS_SETTING ? [DESCRIBED, BOB] : fallback)),
            update,
        });
    });

    it('renames and re-describes the row in place, trimmed, and keeps everything else on it', async () => {
        const edited = await editAddedDemo({ owner: 'ROBIN', repo: 'isle5-demo' }, { name: '  Isle5 luxury  ', description: ' New words ' });

        const expected = { ...DESCRIBED, name: 'Isle5 luxury', description: 'New words' };
        expect(edited).toStrictEqual(expected);
        expect(update).toHaveBeenCalledWith(ADDED_DEMOS_SETTING, [expected, BOB], vscode.ConfigurationTarget.Global);
    });

    it('keeps the zip record through an edit', async () => {
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((key: string, fallback: unknown) =>
                key === ADDED_DEMOS_SETTING ? [{ ...ROBIN, createdFromZip: true }] : fallback,
            ),
            update,
        });
        const edited = await editAddedDemo(ROBIN.source, { name: 'Isle5', description: '' });

        expect(edited?.createdFromZip).toBe(true);
    });

    it('takes a blank description off the row rather than storing an empty one', async () => {
        const edited = await editAddedDemo(ROBIN.source, { name: 'Isle5 by Robin', description: '   ' });

        expect(edited).not.toHaveProperty('description');
    });

    it('writes nothing and answers nothing for a demo that is not on the Welcome step', async () => {
        expect(await editAddedDemo({ owner: 'nobody', repo: 'nothing' }, { name: 'X', description: '' })).toBeUndefined();
        expect(update).not.toHaveBeenCalled();
    });
});
