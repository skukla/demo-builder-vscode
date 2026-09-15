/**
 * flattenArchiveRoot — a GitHub release archive unpacks into one wrapper folder
 * (`owner-repo-sha/`); the component's files belong one level up.
 *
 * Replaces a shell step, `mv "$T"/*\/* "$T"/ && rm -rf "$T"/*\/`, whose second
 * glob also matched every folder the first had just moved up, and whose `*`
 * skipped dotfiles. A component update kept `package.json` and lost `app/`,
 * `src/` and `.gitignore`, and verification (which checks only `package.json`)
 * called it a success (found 2026-09-15).
 *
 * These run the real `unzip` on a real archive into a temp folder, because the
 * updater's own suites mock the filesystem and the shell and so asserted the
 * broken command's text for as long as it existed.
 */

import AdmZip from 'adm-zip';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { flattenArchiveRoot } from '@/features/updates/services/archiveRoot';

/** Every path under `dir`, relative, sorted. */
function tree(dir: string): string[] {
    const out: string[] = [];
    const walk = (rel: string): void => {
        for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
            const child = path.join(rel, entry.name);
            out.push(entry.isDirectory() ? `${child}/` : child);
            if (entry.isDirectory()) walk(child);
        }
    };
    walk('');
    return out.sort();
}

describe('flattenArchiveRoot', () => {
    let base: string;
    let target: string;

    beforeEach(() => {
        base = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-root-'));
        target = path.join(base, 'component');
        fs.mkdirSync(target);
    });

    afterEach(() => {
        fs.rmSync(base, { recursive: true, force: true });
    });

    it('keeps every folder, file and dotfile of a GitHub archive, one level up', async () => {
        const zip = new AdmZip();
        zip.addFile('skukla-citisignal-nextjs-abc123/package.json', Buffer.from('{"name":"x"}'));
        zip.addFile('skukla-citisignal-nextjs-abc123/.gitignore', Buffer.from('node_modules\n'));
        zip.addFile('skukla-citisignal-nextjs-abc123/app/pages/index.tsx', Buffer.from('export {}\n'));
        zip.addFile('skukla-citisignal-nextjs-abc123/.github/workflows/ci.yml', Buffer.from('on: push\n'));
        const archive = path.join(base, 'release.zip');
        zip.writeZip(archive);
        execFileSync('unzip', ['-q', archive, '-d', target]);

        await flattenArchiveRoot(target);

        expect(tree(target)).toEqual([
            '.github/',
            '.github/workflows/',
            '.github/workflows/ci.yml',
            '.gitignore',
            'app/',
            'app/pages/',
            'app/pages/index.tsx',
            'package.json',
        ]);
        // Nothing staged beside the component is left behind.
        expect(fs.readdirSync(base).sort()).toEqual(['component', 'release.zip']);
    });

    it('keeps a folder inside the archive that has the wrapper folder\'s own name', async () => {
        fs.mkdirSync(path.join(target, 'repo-sha', 'repo-sha'), { recursive: true });
        fs.writeFileSync(path.join(target, 'repo-sha', 'repo-sha', 'kept.txt'), 'x');

        await flattenArchiveRoot(target);

        expect(tree(target)).toEqual(['repo-sha/', 'repo-sha/kept.txt']);
    });

    it('refuses an archive that is not one wrapper folder, and changes nothing', async () => {
        fs.writeFileSync(path.join(target, 'package.json'), '{}');
        fs.mkdirSync(path.join(target, 'src'));

        await expect(flattenArchiveRoot(target)).rejects.toThrow('one top-level folder');
        expect(tree(target)).toEqual(['package.json', 'src/']);
    });
});
