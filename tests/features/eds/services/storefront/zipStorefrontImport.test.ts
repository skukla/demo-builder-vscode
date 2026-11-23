/**
 * A storefront that arrived as a zip: what is kept, what is dropped, whether
 * it is a storefront at all, and the repository name it suggests. The zip is
 * built in the test from the shapes the 2026-09-12 colleague zip had (one root
 * folder, `.npm-cache/`, its own `.gitignore`, fonts).
 */

import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    classifyZipStorefront,
    contentSourceOfZip,
    createRepositoryFromZip,
    readStorefrontZip,
    setupForCard,
    suggestRepoName,
} from '@/features/eds/services/storefront/zipStorefrontImport';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { projectFileV2 } from '../../../../helpers/projectFileFixtures';

const ROOT = 'citisignal-b2b-summit-main';
const GITIGNORE = [
    '.hlx/*',
    'coverage/*',
    'logs/*',
    'node_modules',
    '',
    '# comment',
    '.DS_Store',
    '*.bak',
    'scripts/__dropins__/**/*.map',
    '.env',
    '!keep.bak',
].join('\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

function zipWith(entries: Record<string, string | Buffer>, root: string | null = ROOT): string {
    const zip = new AdmZip();
    for (const [name, content] of Object.entries(entries)) {
        zip.addFile(
            root ? `${root}/${name}` : name,
            Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8')
        );
    }
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zip-import-')), 'demo.zip');
    zip.writeZip(file);
    return file;
}

const STOREFRONT = {
    'scripts/scripts.js': 'export {};',
    'scripts/delayed.js': 'export {};',
    'head.html': '<meta>',
    'fstab.yaml': 'mountpoints:\n  /: https://content.da.live/robin/summit/\n',
    '.gitignore': GITIGNORE,
    'fonts/roboto.woff2': PNG,
};

describe('readStorefrontZip', () => {
    it('strips the single root folder, keeps the storefront, drops what a repository never carries and what .gitignore says', () => {
        const file = zipWith({
            ...STOREFRONT,
            '.npm-cache/_cacache/index': 'x',
            'node_modules/left-pad/index.js': 'x',
            '.git/HEAD': 'ref',
            '.DS_Store': 'x',
            'blocks/.DS_Store': 'x',
            'notes.bak': 'x',
            'logs/2026.log': 'x',
            '.hlx/query-index.json': '{}',
            'scripts/__dropins__/storefront-cart/dist/index.js.map': '{}',
            'scripts/__dropins__/storefront-cart/dist/index.js': 'x',
            '.env': 'SECRET=1',
        });

        const read = readStorefrontZip(file);

        expect(read.rootName).toBe(ROOT);
        expect([...read.files.keys()].sort()).toEqual([
            '.gitignore',
            'fonts/roboto.woff2',
            'fstab.yaml',
            'head.html',
            'scripts/__dropins__/storefront-cart/dist/index.js',
            'scripts/delayed.js',
            'scripts/scripts.js',
        ]);
        expect(read.dropped).toBe(10);
        expect(read.files.get('fonts/roboto.woff2')).toEqual(PNG);
    });

    it('drops every .env file at any depth, whatever the zip\'s own ignore file says (secrets never ship)', () => {
        // No .gitignore at all: the always-drop rule alone must catch them.
        const { '.gitignore': _ignore, ...noIgnore } = STOREFRONT;
        const file = zipWith({
            ...noIgnore,
            '.env': 'SECRET=1',
            '.env.local': 'SECRET=2',
            '.env.production': 'SECRET=3',
            '.env.example': 'SECRET=',
            'api/.env': 'SECRET=4',
            'tools/deep/.env.development.local': 'SECRET=5',
            'scripts/environment.js': 'export {};',
            'docs/.envrc': 'export SECRET=6',
        });

        const read = readStorefrontZip(file);

        expect([...read.files.keys()].sort()).toEqual([
            'fonts/roboto.woff2',
            'fstab.yaml',
            'head.html',
            'scripts/delayed.js',
            'scripts/environment.js',
            'scripts/scripts.js',
        ]);
        expect(read.dropped).toBe(7);
    });

    it('reads a demo bundle: the repository is its storefront folder, description file included', () => {
        const read = readStorefrontZip(
            zipWith(
                {
                    'setup.demo-builder.json': '{}',
                    'storefront/head.html': '<meta>',
                    'storefront/scripts/scripts.js': 'x',
                    'storefront/scripts/delayed.js': 'x',
                    'storefront/demo.demo-builder.json':
                        '{"kind":"demo","version":1,"name":"Bodea"}',
                },
                'bodea-demo-bundle'
            )
        );
        expect([...read.files.keys()].sort()).toEqual([
            'demo.demo-builder.json',
            'head.html',
            'scripts/delayed.js',
            'scripts/scripts.js',
        ]);
    });

    it("reads a bundle's setup part, and says when it is not a settings file", () => {
        const setup = {
            version: 1,
            exportedAt: 'x',
            source: { project: 'bodea' },
            selections: {},
            configs: {},
            selectedStack: 'eds-accs',
        };
        const read = readStorefrontZip(
            zipWith(
                {
                    'setup.demo-builder.json': JSON.stringify(setup),
                    'storefront/head.html': '<meta>',
                    'storefront/scripts/scripts.js': 'x',
                    'storefront/scripts/delayed.js': 'x',
                },
                'bodea-demo-bundle'
            )
        );
        // A bundle written before 2026-10 carries a version-1 setup; it reads
        // through the one reader and arrives as a version-2 file.
        expect(read.setup).toMatchObject({ kind: 'project', version: 2, selectedStack: 'eds-accs' });
        expect(read.setupError).toBeUndefined();
        expect([...read.files.keys()]).not.toContain('setup.demo-builder.json');

        const bad = readStorefrontZip(
            zipWith({ 'setup.demo-builder.json': 'not json', 'storefront/head.html': 'x' }, 'b')
        );
        expect(bad.setup).toBeUndefined();
        expect(bad.setupError).toBeTruthy();
    });

    it('reads a zip with no root folder as the repository itself', () => {
        const read = readStorefrontZip(
            zipWith({ 'head.html': '<meta>', 'scripts/scripts.js': 'x' }, null)
        );
        expect(read.rootName).toBeUndefined();
        expect([...read.files.keys()].sort()).toEqual(['head.html', 'scripts/scripts.js']);
    });
});

describe('classifyZipStorefront', () => {
    const logger = createMockLogger();

    it('is a storefront when the canonical files are there, and names what is missing when not', async () => {
        // Every template has a 404.html; Adobe's B2B template has no scripts/delayed.js.
        const { 'scripts/delayed.js': _delayed, ...b2b } = STOREFRONT;
        const good = readStorefrontZip(zipWith({ ...b2b, '404.html': '<html></html>' }));
        expect(await classifyZipStorefront(good.files, logger)).toEqual({ kind: 'storefront' });

        const bad = readStorefrontZip(zipWith({ 'README.md': 'hi', 'index.html': '<p>' }));
        expect(await classifyZipStorefront(bad.files, logger)).toEqual({
            kind: 'not-a-storefront',
            missing: ['scripts/scripts.js', '404.html', 'head.html'],
        });
    });
});

describe('suggestRepoName', () => {
    it("takes the root folder's name without GitHub's branch suffix, and falls back", () => {
        expect(suggestRepoName('citisignal-b2b-summit-main', 'storefront')).toBe(
            'citisignal-b2b-summit'
        );
        expect(suggestRepoName('My Demo-master', 'storefront')).toBe('my-demo');
        expect(suggestRepoName('bodea-demo-bundle', 'storefront')).toBe('bodea');
        expect(suggestRepoName(undefined, 'storefront')).toBe('storefront');
        expect(suggestRepoName('---', 'storefront')).toBe('storefront');
    });
});

describe('createRepositoryFromZip and setupForCard', () => {
    const logger = createMockLogger();
    const CREATED = {
        owner: 'steve',
        repo: 'summit',
        fullName: 'steve/summit',
        defaultBranch: 'main',
        fileCount: 2,
    };

    it('creates the repository private by default, waits for it, pushes one commit and flags it a template', async () => {
        const repoOps = {
            createEmptyRepository: jest.fn().mockResolvedValue({
                fullName: 'steve/summit',
                name: 'summit',
                defaultBranch: 'main',
            }),
            waitForContent: jest.fn().mockResolvedValue(true),
            setTemplateFlag: jest.fn().mockResolvedValue(undefined),
        };
        const fileOps = {
            getBranchInfo: jest.fn().mockResolvedValue({ commitSha: 'head', treeSha: 't0' }),
            createBlob: jest.fn(),
            createTree: jest.fn().mockResolvedValue('tree-1'),
            createCommit: jest.fn().mockResolvedValue('c1'),
            updateBranchRef: jest.fn().mockResolvedValue(undefined),
        };
        const files = new Map([
            ['head.html', Buffer.from('<meta>')],
            ['scripts/scripts.js', Buffer.from('x')],
        ]);

        const onProgress = jest.fn();
        const created = await createRepositoryFromZip(
            { repoOps, fileOps, logger, onProgress },
            files,
            { repoName: 'summit', isPrivate: true }
        );

        // Each step the dialog's spinner names, in order (owner, 2026-09-14).
        expect(onProgress.mock.calls).toStrictEqual([
            ['Creating the repository', 'summit, 2 files'],
            ['Pushing files', '2 of 2'],
            ['Finishing up', 'Marking it as a template'],
        ]);

        expect(repoOps.createEmptyRepository).toHaveBeenCalledWith('summit', true);
        expect(repoOps.waitForContent).toHaveBeenCalledWith('steve', 'summit');
        expect(fileOps.createCommit).toHaveBeenCalledWith(
            'steve',
            'summit',
            'Add storefront from a zip file',
            'tree-1',
            'head'
        );
        expect(repoOps.setTemplateFlag).toHaveBeenCalledWith('steve', 'summit', true);
        // The pushed commit comes back: an imported project records it to reset to (EDS-72).
        expect(created).toEqual({ ...CREATED, commit: 'c1' });
    });

    // EDS-72: Import from File makes the PROJECT's own repository from a bundle, so it is
    // created in the namespace the project uses and is not flagged a template.
    it('creates a project repository in a namespace, unflagged, when asked', async () => {
        const repoOps = {
            createEmptyRepository: jest.fn().mockResolvedValue({ fullName: 'acme/summit', name: 'summit', defaultBranch: 'main' }),
            waitForContent: jest.fn().mockResolvedValue(true),
            setTemplateFlag: jest.fn().mockResolvedValue(undefined),
        };
        const fileOps = {
            getBranchInfo: jest.fn().mockResolvedValue({ commitSha: 'head', treeSha: 't0' }),
            createBlob: jest.fn(),
            createTree: jest.fn().mockResolvedValue('tree-1'),
            createCommit: jest.fn().mockResolvedValue('c9'),
            updateBranchRef: jest.fn().mockResolvedValue(undefined),
        };
        const onProgress = jest.fn();

        const created = await createRepositoryFromZip(
            { repoOps, fileOps, logger, onProgress },
            new Map([['head.html', Buffer.from('<meta>')]]),
            { repoName: 'summit', isPrivate: false, namespace: 'acme', template: false },
        );

        expect(repoOps.createEmptyRepository).toHaveBeenCalledWith('summit', false, 'acme');
        expect(repoOps.setTemplateFlag).not.toHaveBeenCalled();
        expect(onProgress.mock.calls.map(([message]) => message)).not.toContain('Finishing up');
        expect(created).toMatchObject({ owner: 'acme', repo: 'summit', commit: 'c9' });
    });

    it("makes the setup the colleague's own: the wizard starts on the card, and the sender's storefront stays provenance", () => {
        const setup = projectFileV2();
        const card = {
            kind: 'demo' as const,
            version: 1,
            name: 'Bodea',
            source: { owner: 'steve', repo: 'summit', branch: 'main' },
            storefrontKind: 'eds' as const,
        };
        const own = setupForCard(setup, card);
        expect(own.demo).toEqual(card);
        expect(own.selectedPackage).toBe('added:steve/summit');
        expect(own.selectedStack).toBe('eds-accs');
        // Provenance, never a setting: the wizard seeds no storefront from it.
        expect(own.source.storefront).toEqual(setup.source.storefront);
        expect(own).not.toHaveProperty('edsConfig');
    });
});

// EDS-72: a project made from a bundle copies its pages from the sender's published site, which
// the bundle names (Export writes it into the description file) or its fstab.yaml mounts.
describe('contentSourceOfZip', () => {
    it("reads the description file's content site, index path included", () => {
        const files = new Map([
            ['demo.demo-builder.json', Buffer.from('{"kind":"demo","version":2,"name":"Bodea","contentSource":{"org":"sender","site":"kukla-bodea","indexPath":"/query-index.json"}}')],
            ['fstab.yaml', Buffer.from('mountpoints:\n  /: https://content.da.live/other/site/\n')],
        ]);
        expect(contentSourceOfZip(files)).toStrictEqual({ org: 'sender', site: 'kukla-bodea', indexPath: '/query-index.json' });
    });

    it("falls back to the site fstab.yaml mounts, at the usual index, and to nothing without either", () => {
        const fstab = new Map([['fstab.yaml', Buffer.from('mountpoints:\n  /: https://content.da.live/sender/kukla-bodea/\n')]]);
        expect(contentSourceOfZip(fstab)).toStrictEqual({ org: 'sender', site: 'kukla-bodea', indexPath: '/full-index.json' });
        expect(contentSourceOfZip(new Map())).toBeUndefined();
    });
});
