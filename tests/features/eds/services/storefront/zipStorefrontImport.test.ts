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
    isBinary,
    readStorefrontZip,
    suggestRepoName,
} from '@/features/eds/services/storefront/zipStorefrontImport';
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
