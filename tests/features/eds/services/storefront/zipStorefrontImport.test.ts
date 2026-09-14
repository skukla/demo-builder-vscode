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
    cardFromZip,
    classifyZipStorefront,
    createRepositoryFromZip,
    isBinary,
    readStorefrontZip,
    setupForCard,
    suggestRepoName,
} from '@/features/eds/services/storefront/zipStorefrontImport';
import type { SettingsFile } from '@/types/settingsFile';
import { createMockLogger } from '../../../../helpers/loggerFake';

const ROOT = 'citisignal-b2b-summit-main';
const GITIGNORE = ['.hlx/*', 'coverage/*', 'logs/*', 'node_modules', '', '# comment', '.DS_Store', '*.bak', 'scripts/__dropins__/**/*.map', '.env', '!keep.bak'].join('\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

function zipWith(entries: Record<string, string | Buffer>, root: string | null = ROOT): string {
    const zip = new AdmZip();
    for (const [name, content] of Object.entries(entries)) {
        zip.addFile(root ? `${root}/${name}` : name, Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8'));
    }
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zip-import-')), 'demo.zip');
    zip.writeZip(file);
    return file;
}

const STOREFRONT = {
    'scripts/scripts.js': 'export {};',
    'scripts/delayed.js': 'export {};',
    'head.html': '<meta>',
    'fstab.yaml': 'mountpoints:\n  /: https://content.da.live/jen/summit/\n',
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
        expect([...read.files.keys()].sort()).toEqual(
            ['.gitignore', 'fonts/roboto.woff2', 'fstab.yaml', 'head.html', 'scripts/__dropins__/storefront-cart/dist/index.js', 'scripts/delayed.js', 'scripts/scripts.js'],
        );
        expect(read.dropped).toBe(10);
        expect(read.files.get('fonts/roboto.woff2')).toEqual(PNG);
    });

    it('reads a demo bundle: the repository is its storefront folder, description file included', () => {
        const read = readStorefrontZip(zipWith({
            'setup.demo-builder.json': '{}',
            'storefront/head.html': '<meta>',
            'storefront/scripts/scripts.js': 'x',
            'storefront/scripts/delayed.js': 'x',
            'storefront/demo.demo-builder.json': '{"kind":"demo","version":1,"name":"Bodea"}',
        }, 'bodea-demo-bundle'));
        expect([...read.files.keys()].sort()).toEqual(['demo.demo-builder.json', 'head.html', 'scripts/delayed.js', 'scripts/scripts.js']);
    });

    it("reads a bundle's setup part, and says when it is not a settings file", () => {
        const setup = { version: 1, exportedAt: 'x', source: { project: 'bodea' }, includesSecrets: false, selections: {}, configs: {}, selectedStack: 'eds-accs' };
        const read = readStorefrontZip(zipWith({
            'setup.demo-builder.json': JSON.stringify(setup),
            'storefront/head.html': '<meta>',
            'storefront/scripts/scripts.js': 'x',
            'storefront/scripts/delayed.js': 'x',
        }, 'bodea-demo-bundle'));
        expect(read.setup).toMatchObject({ version: 1, selectedStack: 'eds-accs' });
        expect(read.setupError).toBeUndefined();
        expect([...read.files.keys()]).not.toContain('setup.demo-builder.json');

        const bad = readStorefrontZip(zipWith({ 'setup.demo-builder.json': 'not json', 'storefront/head.html': 'x' }, 'b'));
        expect(bad.setup).toBeUndefined();
        expect(bad.setupError).toBeTruthy();
    });

    it('reads a zip with no root folder as the repository itself', () => {
        const read = readStorefrontZip(zipWith({ 'head.html': '<meta>', 'scripts/scripts.js': 'x' }, null));
        expect(read.rootName).toBeUndefined();
        expect([...read.files.keys()].sort()).toEqual(['head.html', 'scripts/scripts.js']);
    });
});

describe('classifyZipStorefront', () => {
    const logger = createMockLogger();

    it('is a storefront when the canonical files are there, and names what is missing when not', async () => {
        const good = readStorefrontZip(zipWith(STOREFRONT));
        expect(await classifyZipStorefront(good.files, logger)).toEqual({ kind: 'storefront' });

        const bad = readStorefrontZip(zipWith({ 'README.md': 'hi', 'index.html': '<p>' }));
        expect(await classifyZipStorefront(bad.files, logger)).toEqual({
            kind: 'not-a-storefront',
            missing: ['scripts/scripts.js', 'scripts/delayed.js', 'head.html'],
        });
    });
});

describe('suggestRepoName and isBinary', () => {
    it("takes the root folder's name without GitHub's branch suffix, and falls back", () => {
        expect(suggestRepoName('citisignal-b2b-summit-main', 'storefront')).toBe('citisignal-b2b-summit');
        expect(suggestRepoName('My Demo-master', 'storefront')).toBe('my-demo');
        expect(suggestRepoName('bodea-demo-bundle', 'storefront')).toBe('bodea');
        expect(suggestRepoName(undefined, 'storefront')).toBe('storefront');
        expect(suggestRepoName('---', 'storefront')).toBe('storefront');
    });

    it('tells fonts and images from text', () => {
        expect(isBinary(PNG)).toBe(true);
        expect(isBinary(Buffer.from('export default 1; // ünïcødé', 'utf-8'))).toBe(false);
    });
});

describe('createRepositoryFromZip, cardFromZip and setupForCard', () => {
    const logger = createMockLogger();
    const CREATED = { owner: 'steve', repo: 'summit', fullName: 'steve/summit', defaultBranch: 'main', fileCount: 2 };

    it('creates the repository private by default, waits for it, pushes one commit and flags it a template', async () => {
        const repoOps = {
            createEmptyRepository: jest.fn().mockResolvedValue({ fullName: 'steve/summit', name: 'summit', defaultBranch: 'main' }),
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
        const files = new Map([['head.html', Buffer.from('<meta>')], ['scripts/scripts.js', Buffer.from('x')]]);

        const created = await createRepositoryFromZip({ repoOps, fileOps, logger }, files, { repoName: 'summit', isPrivate: true });

        expect(repoOps.createEmptyRepository).toHaveBeenCalledWith('summit', true);
        expect(repoOps.waitForContent).toHaveBeenCalledWith('steve', 'summit');
        expect(fileOps.createCommit).toHaveBeenCalledWith('steve', 'summit', 'Add storefront from a zip file', 'tree-1', 'head');
        expect(repoOps.setTemplateFlag).toHaveBeenCalledWith('steve', 'summit', true);
        expect(created).toEqual(CREATED);
    });

    it('builds the card from the description file, pointed at the new repository, and none without one', () => {
        const files = new Map([['demo.demo-builder.json', Buffer.from('{"kind":"demo","version":1,"name":"Bodea","configFlags":{"commerce-b2b-enabled":true}}')]]);
        expect(cardFromZip(files, CREATED)).toEqual({
            kind: 'demo',
            version: 1,
            name: 'Bodea',
            configFlags: { 'commerce-b2b-enabled': true },
            source: { owner: 'steve', repo: 'summit', branch: 'main' },
            storefrontKind: 'eds',
        });
        expect(cardFromZip(new Map(), CREATED)).toBeUndefined();
        expect(cardFromZip(new Map([['demo.demo-builder.json', Buffer.from('nope')]]), CREATED)).toBeUndefined();
    });

    it("makes the setup the colleague's own: the wizard starts on the card, and the sender's storefront names are dropped", () => {
        const setup = {
            version: 1, exportedAt: 'x', source: { project: 'bodea' }, includesSecrets: false, selections: {}, configs: {},
            selectedPackage: 'bodea', selectedStack: 'eds-accs',
            edsConfig: { githubOwner: 'sender', repoName: 'kukla-bodea', daLiveOrg: 'sender' },
        } as unknown as SettingsFile;
        const card = { kind: 'demo' as const, version: 1, name: 'Bodea', source: { owner: 'steve', repo: 'summit', branch: 'main' }, storefrontKind: 'eds' as const };
        const own = setupForCard(setup, card);
        expect(own.demo).toEqual(card);
        expect(own.selectedPackage).toBe('added:steve/summit');
        expect(own.selectedStack).toBe('eds-accs');
        expect(own.edsConfig).toBeUndefined();
    });
});
