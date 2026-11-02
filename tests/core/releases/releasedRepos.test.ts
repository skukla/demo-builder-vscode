/**
 * The list of repositories that ship by release, checked against where the builder's
 * components actually come from, so a new owned component cannot quietly follow a branch.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { RELEASED_REPOS, releasedRepoOf } from '@/core/releases/releasedRepos';

const CONFIG = join(__dirname, '../../../src/features/components/config');
const INSPECTOR = join(__dirname, '../../../src/features/eds/services/inspectorHelpers.ts');

/** Every `owner/repo` a catalog names, as a URL or as an owner + repo pair. */
function reposNamedIn(file: string): string[] {
    const text = readFileSync(join(CONFIG, file), 'utf8');
    const urls = [...text.matchAll(/github\.com\/([\w.-]+\/[\w-]+(?:\.[\w-]+)*?)(?:\.git)?"/g)].map((m) => m[1]);
    const pairs = [...text.matchAll(/"owner":\s*"([^"]+)",\s*"repo":\s*"([^"]+)"/g)].map(
        (m) => `${m[1]}/${m[2]}`,
    );
    return [...urls, ...pairs];
}

const CATALOGS = [
    'components.json',
    'app-builder-components.json',
    'block-libraries.json',
    'demo-packages.json',
];

describe('the list agrees with the catalogs', () => {
    const named = new Set(CATALOGS.flatMap(reposNamedIn));

    it('CONTROL: the scan reads every kind of source', () => {
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
        const inspector = readFileSync(INSPECTOR, 'utf8').includes("repo: 'demo-inspector-sdk'");
        expect(inspector).toBe(true);
        const used = new Set([...named, 'skukla/demo-inspector-sdk']);
        expect(RELEASED_REPOS.filter((repo) => !used.has(repo))).toStrictEqual([]);
    });
});

describe('releasedRepoOf', () => {
    it.each([
        ['https://github.com/skukla/demo-erp.git', 'skukla/demo-erp'],
        ['https://github.com/skukla/demo-erp', 'skukla/demo-erp'],
        ['https://github.com/skukla/demo-erp/\n', 'skukla/demo-erp'],
        ['git@github.com:skukla/demo-erp.git', 'skukla/demo-erp'],
    ])('%s ships by release', (url, repo) => {
        expect(releasedRepoOf(url)).toBe(repo);
    });

    it.each([
        ['Adobe', 'https://github.com/adobe/commerce-integration-starter-kit.git'],
        ['a colleague', 'https://github.com/stephen-garner-adobe/isle5'],
        ['an app an SC saved to their own GitHub', 'https://github.com/skukla/my-saved-app.git'],
        ['nothing', undefined],
    ])('%s does not', (_name, url) => {
        expect(releasedRepoOf(url)).toBeNull();
    });
});
