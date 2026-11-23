/**
 * A component the builder owns ships by release: a push reaches no SC, a release does.
 *
 * Two ways this drifts without any error. A new owned repository in a catalog that is missing from
 * the list follows its branch, so a push ships it. And a second reader of GitHub's releases decides
 * "newest" its own way, as three copies did until 2026-11-02: the installer took the first listed,
 * which on the beta channel could be an alpha.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { RELEASED_REPOS } from '@/core/releases/releasedRepos';

const ROOT = join(__dirname, '../..');
const CONFIG = join(ROOT, 'src/features/components/config');
const INSPECTOR = join(ROOT, 'src/features/eds/services/inspectorHelpers.ts');
const READER = 'src/core/releases/readNewestRelease.ts';
const RELEASES_ENDPOINT = /\/releases\/latest|\/releases\?per_page/;

const CATALOGS = [
    'components.json',
    'app-builder-components.json',
    'block-libraries.json',
    'demo-packages.json',
];

function reposNamedIn(file: string): string[] {
    const text = readFileSync(join(CONFIG, file), 'utf8');
    const urls = [...text.matchAll(/github\.com\/([\w.-]+\/[\w-]+(?:\.[\w-]+)*?)(?:\.git)?"/g)].map((m) => m[1]);
    const pairs = [...text.matchAll(/"owner":\s*"([^"]+)",\s*"repo":\s*"([^"]+)"/g)].map(
        (m) => `${m[1]}/${m[2]}`,
    );
    return [...urls, ...pairs];
}

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return sourceFiles(full);
        return /\.tsx?$/.test(name) ? [full] : [];
    });
}

describe('a component the builder owns ships by release', () => {
    const named = new Set(CATALOGS.flatMap(reposNamedIn));

    it('CONTROL: the catalog scan reads every kind of source', () => {
        expect(named).toContain('skukla/demo-erp');
        expect(named).toContain('skukla/eds-accs-mesh');
        expect(named).toContain('skukla/citisignal-nextjs');
        expect(named).toContain('skukla/demo-builder-block-library');
        expect(named).toContain('adobe-commerce/boilerplate-b2b-template');
    });

    it('every skukla repository a catalog names ships by release', () => {
        const owned = [...named].filter((repo) => repo.startsWith('skukla/'));
        expect(owned.filter((repo) => !(RELEASED_REPOS as readonly string[]).includes(repo))).toStrictEqual([]);
    });

    it('every listed repository is really used: by a catalog, or the inspector', () => {
        expect(readFileSync(INSPECTOR, 'utf8')).toContain("repo: 'demo-inspector-sdk'");
        const used = new Set([...named, 'skukla/demo-inspector-sdk']);
        expect(RELEASED_REPOS.filter((repo) => !used.has(repo))).toStrictEqual([]);
    });

    it('only one module reads GitHub\'s releases', () => {
        const readers = sourceFiles(join(ROOT, 'src'))
            .filter((file) => RELEASES_ENDPOINT.test(readFileSync(file, 'utf8')))
            .map((file) => file.slice(ROOT.length + 1));

        expect(readers).toStrictEqual([READER]);
    });
});
