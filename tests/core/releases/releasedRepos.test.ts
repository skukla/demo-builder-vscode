/**
 * Which repository a clone's remote names. The list itself is checked against the catalogs in
 * `tests/sop/component-releases.test.ts`.
 */

import { releasedRepoOf } from '@/core/releases/releasedRepos';

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
