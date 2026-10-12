/**
 * removeBlockLibraryFiles (EDS-39) — taking a library's blocks back out of a
 * storefront repository.
 *
 * Removal is the half that can destroy an SC's work, so every test here reads
 * what was HANDED to the GitHub collaborator: which repository was listed,
 * which commit of the library was read, and exactly which paths the one commit
 * deletes. An outcome assertion alone would pass against a fake that deleted
 * the wrong folder.
 *
 * The blob shas are computed here with the git object rule (sha1 of
 * `blob <length>\0<bytes>`), not taken from the implementation.
 */

import { createHash } from 'crypto';
import {
    gitBlobSha,
    removeBlockLibraryFiles,
    type BlockLibraryRemovalFileOps,
} from '@/features/eds/services/blockLibraryRemoval';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import { createMockLogger } from '../../../helpers/loggerFake';

const COMMIT = 'c'.repeat(40);
const SOURCE = { owner: 'acme', repo: 'blocks', branch: 'main' };

function blobSha(text: string | Buffer): string {
    const bytes = Buffer.isBuffer(text) ? text : Buffer.from(text, 'utf-8');
    return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

/** The library as it was at the recorded commit: path → text. */
const LIBRARY_FILES: Record<string, string> = {
    'blocks/hero/hero.js': 'export default function hero() {}',
    'blocks/hero/hero.css': '.hero { color: red; }',
    'blocks/tabs/tabs.js': 'export default function tabs() {}',
    'blocks/cards/cards.js': 'export default function cards() {}',
    'component-models.json': JSON.stringify([
        { id: 'hero', fields: [] },
        { id: 'tabs', fields: [] },
    ]),
};

const fileOps = {
    listRepoFiles: jest.fn(),
    getFileContent: jest.fn(),
    commitTreeToBranch: jest.fn(),
    repoArchive: { downloadRepoContents: jest.fn() },
};
const ops: BlockLibraryRemovalFileOps = fileOps;

function record(overrides: Partial<InstalledBlockLibrary> = {}): InstalledBlockLibrary {
    return {
        name: 'Acme Blocks',
        source: SOURCE,
        commitSha: COMMIT,
        blockIds: ['hero'],
        installedAt: '2026-10-01T00:00:00.000Z',
        ...overrides,
    };
}

/** Script the storefront's tree: path → the text it holds now. */
function storefront(files: Record<string, string>): void {
    fileOps.listRepoFiles.mockResolvedValue(
        Object.entries(files).map(([path, text]) => ({ path, type: 'blob', sha: blobSha(text) })),
    );
}

function libraryAtCommit(files: Record<string, string | Buffer> = LIBRARY_FILES): void {
    fileOps.repoArchive.downloadRepoContents.mockResolvedValue(
        new Map(
            Object.entries(files).map(([path, text]) => [
                path,
                { data: Buffer.isBuffer(text) ? text : Buffer.from(text, 'utf-8'), mode: '100644' },
            ]),
        ),
    );
}

function remove(library: InstalledBlockLibrary, sharedBlocks = new Map<string, string>()) {
    return removeBlockLibraryFiles(
        { destOwner: 'me', destRepo: 'demo-storefront', library, sharedBlocks },
        ops,
        createMockLogger(),
    );
}

const deletion = (path: string) => ({ path, mode: '100644', type: 'blob', sha: null });

beforeEach(() => {
    jest.clearAllMocks();
    fileOps.getFileContent.mockResolvedValue(null);
    fileOps.commitTreeToBranch.mockResolvedValue('new-commit');
    libraryAtCommit();
});

describe('gitBlobSha', () => {
    it('matches git for the two blobs everyone can check', () => {
        expect(gitBlobSha(Buffer.alloc(0))).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
        expect(gitBlobSha(Buffer.from('hello\n'))).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
    });
});

describe('removeBlockLibraryFiles', () => {
    it('deletes an unedited block in ONE commit on the storefront main branch', async () => {
        storefront({
            'blocks/hero/hero.js': LIBRARY_FILES['blocks/hero/hero.js'],
            'blocks/hero/hero.css': LIBRARY_FILES['blocks/hero/hero.css'],
            'blocks/columns/columns.js': 'a template block',
            'scripts/aem.js': 'not a block',
        });

        const result = await remove(record());

        expect(fileOps.listRepoFiles).toHaveBeenCalledWith('me', 'demo-storefront', 'main');
        // The library is read at the commit it was installed from, not its branch head.
        expect(fileOps.repoArchive.downloadRepoContents).toHaveBeenCalledWith('acme', 'blocks', COMMIT);
        expect(fileOps.commitTreeToBranch).toHaveBeenCalledTimes(1);
        expect(fileOps.commitTreeToBranch).toHaveBeenCalledWith(
            'me',
            'demo-storefront',
            'main',
            [deletion('blocks/hero/hero.js'), deletion('blocks/hero/hero.css')],
            'chore: remove Acme Blocks (1 block)',
        );
        expect(result.removedBlockIds).toEqual(['hero']);
        expect(result.leftBlocks).toStrictEqual([]);
    });

    it('leaves a block the SC edited, names it, and deletes none of its files', async () => {
        storefront({
            'blocks/hero/hero.js': LIBRARY_FILES['blocks/hero/hero.js'],
            'blocks/hero/hero.css': LIBRARY_FILES['blocks/hero/hero.css'],
            'blocks/tabs/tabs.js': 'export default function tabs() { /* our change */ }',
        });

        const result = await remove(record({ blockIds: ['hero', 'tabs'] }));

        const [, , , entries] = fileOps.commitTreeToBranch.mock.calls[0];
        expect(entries).toEqual([deletion('blocks/hero/hero.js'), deletion('blocks/hero/hero.css')]);
        expect(result.removedBlockIds).toEqual(['hero']);
        expect(result.leftBlocks).toEqual([{ id: 'tabs', reason: 'changed' }]);
    });

    it('leaves a block the SC added a file to', async () => {
        storefront({
            'blocks/hero/hero.js': LIBRARY_FILES['blocks/hero/hero.js'],
            'blocks/hero/hero.css': LIBRARY_FILES['blocks/hero/hero.css'],
            'blocks/hero/notes.md': 'ours',
        });

        const result = await remove(record());

        expect(fileOps.commitTreeToBranch).not.toHaveBeenCalled();
        expect(result.leftBlocks).toEqual([{ id: 'hero', reason: 'changed' }]);
    });

    it('leaves a block the SC deleted a file from', async () => {
        storefront({ 'blocks/hero/hero.js': LIBRARY_FILES['blocks/hero/hero.js'] });

        const result = await remove(record());

        expect(fileOps.commitTreeToBranch).not.toHaveBeenCalled();
        expect(result.leftBlocks).toEqual([{ id: 'hero', reason: 'changed' }]);
    });

    it('leaves a block another selected library also provides, and names that library', async () => {
        storefront({
            'blocks/hero/hero.js': LIBRARY_FILES['blocks/hero/hero.js'],
            'blocks/hero/hero.css': LIBRARY_FILES['blocks/hero/hero.css'],
            'blocks/cards/cards.js': LIBRARY_FILES['blocks/cards/cards.js'],
        });

        const result = await remove(
            record({ blockIds: ['cards', 'hero'] }),
            new Map([['cards', 'Other Blocks']]),
        );

        const [, , , entries] = fileOps.commitTreeToBranch.mock.calls[0];
        expect(entries).toEqual([deletion('blocks/hero/hero.js'), deletion('blocks/hero/hero.css')]);
        expect(result.leftBlocks).toEqual([
            { id: 'cards', reason: 'shared', sharedWith: 'Other Blocks' },
        ]);
    });

    it('removes a binary file the installer wrote as text, which is what it did write', async () => {
        // The installer carries every file as UTF-8 text, so a binary file lands in
        // the storefront as the text round trip of its bytes. That IS what the
        // library installed, so it still counts as unedited.
        const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00, 0x01]);
        const asInstalled = Buffer.from(binary.toString('utf-8'), 'utf-8');
        libraryAtCommit({ 'blocks/hero/icon.png': binary });
        fileOps.listRepoFiles.mockResolvedValue([
            { path: 'blocks/hero/icon.png', type: 'blob', sha: blobSha(asInstalled) },
        ]);

        const result = await remove(record());

        expect(result.removedBlockIds).toEqual(['hero']);
    });

    it('leaves every block when the library cannot be read at the recorded commit', async () => {
        storefront({ 'blocks/hero/hero.js': LIBRARY_FILES['blocks/hero/hero.js'] });
        fileOps.repoArchive.downloadRepoContents.mockRejectedValue(new Error('HTTP 404'));

        const result = await remove(record());

        expect(fileOps.commitTreeToBranch).not.toHaveBeenCalled();
        expect(result.leftBlocks).toEqual([{ id: 'hero', reason: 'unverified' }]);
    });

    it('stops tracking a block whose folder the SC already deleted, with nothing to commit', async () => {
        storefront({ 'blocks/columns/columns.js': 'a template block' });

        const result = await remove(record());

        expect(fileOps.commitTreeToBranch).not.toHaveBeenCalled();
        expect(result.removedBlockIds).toStrictEqual([]);
        expect(result.clearedBlockIds).toEqual(['hero']);
        expect(result.leftBlocks).toStrictEqual([]);
    });

    it('refuses to conclude anything from a storefront it could not list', async () => {
        fileOps.listRepoFiles.mockResolvedValue([]);

        await expect(remove(record())).rejects.toThrow(/me\/demo-storefront/);
        expect(fileOps.commitTreeToBranch).not.toHaveBeenCalled();
    });

    it('takes unchanged authoring entries out in the same commit as the block files', async () => {
        storefront({
            'blocks/hero/hero.js': LIBRARY_FILES['blocks/hero/hero.js'],
            'blocks/hero/hero.css': LIBRARY_FILES['blocks/hero/hero.css'],
        });
        const models = JSON.stringify([{ id: 'columns', fields: [] }, { id: 'hero', fields: [] }], null, 2);
        fileOps.getFileContent.mockImplementation(async (_o: string, _r: string, path: string) =>
            path === 'component-models.json' ? { content: models, sha: 's', path, encoding: 'utf-8' } : null,
        );

        const result = await remove(
            record({ addedEntries: { definition: [], sectionFilter: [], filters: [], models: ['hero'] } }),
        );

        expect(fileOps.getFileContent).toHaveBeenCalledWith('me', 'demo-storefront', 'component-models.json');
        expect(fileOps.commitTreeToBranch).toHaveBeenCalledTimes(1);
        const [, , , entries] = fileOps.commitTreeToBranch.mock.calls[0];
        expect(entries).toEqual([
            deletion('blocks/hero/hero.js'),
            deletion('blocks/hero/hero.css'),
            {
                path: 'component-models.json',
                mode: '100644',
                type: 'blob',
                content: JSON.stringify([{ id: 'columns', fields: [] }], null, 2),
            },
        ]);
        expect(result.clearedEntries.models).toEqual(['hero']);
    });

    it('leaves an authoring entry the SC changed, names it, and still removes the block', async () => {
        storefront({
            'blocks/hero/hero.js': LIBRARY_FILES['blocks/hero/hero.js'],
            'blocks/hero/hero.css': LIBRARY_FILES['blocks/hero/hero.css'],
        });
        const models = JSON.stringify([{ id: 'hero', fields: [{ name: 'ours', component: 'text' }] }]);
        fileOps.getFileContent.mockImplementation(async (_o: string, _r: string, path: string) =>
            path === 'component-models.json' ? { content: models, sha: 's', path, encoding: 'utf-8' } : null,
        );

        const result = await remove(
            record({ addedEntries: { definition: [], sectionFilter: [], filters: [], models: ['hero'] } }),
        );

        const [, , , entries] = fileOps.commitTreeToBranch.mock.calls[0];
        expect(entries).toEqual([deletion('blocks/hero/hero.js'), deletion('blocks/hero/hero.css')]);
        expect(result.leftEntries).toEqual([{ file: 'component-models.json', id: 'hero' }]);
        expect(result.clearedEntries.models).toStrictEqual([]);
    });

    it('does not touch the entries of a block it left in place', async () => {
        storefront({ 'blocks/tabs/tabs.js': 'edited by the SC' });

        const result = await remove(
            record({
                blockIds: ['tabs'],
                addedEntries: { definition: [], sectionFilter: [], filters: [], models: ['tabs'] },
            }),
        );

        expect(fileOps.getFileContent).not.toHaveBeenCalled();
        expect(fileOps.commitTreeToBranch).not.toHaveBeenCalled();
        expect(result.clearedEntries.models).toStrictEqual([]);
        expect(result.leftEntries).toStrictEqual([]);
    });
});
