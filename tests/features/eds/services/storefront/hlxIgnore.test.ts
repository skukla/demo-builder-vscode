/**
 * hlxIgnore: which repository files AEM is told never to serve.
 *
 * The patterns below are Bodea's own `.hlxignore` (skukla/my-commerce-demo, read
 * 2026-10-29), from Adobe's B2B template. Its `_*.json` line is why 28 block-model files
 * were reported as "did not reach the live site" after a reset: AEM never serves them.
 */

import { hlxIgnored, parseHlxIgnore } from '@/features/eds/services/storefront/hlxIgnore';

const BODEA = [
    '.*',
    '*.md',
    '*.d.ts',
    '*.map',
    'karma.config.js',
    'LICENSE',
    'package.json',
    'package-lock.json',
    'test/*',
    'postinstall.js',
    'build.mjs',
    'cypress/',
    'tools/picker/src/*',
    'tools/pdp-metadata/*',
    'plugins/experimentation/documentation/images/*',
    '_*.json',
    'sync-block-collection.sh',
    '',
].join('\n');

const ignored = (path: string): boolean => hlxIgnored(parseHlxIgnore(BODEA), path);

describe('hlxIgnored, with Bodea\'s .hlxignore', () => {
    it.each([
        'blocks/hero-3/_hero-3.json',
        'blocks/quote/_quote.json',
        '_root.json',
        '.github/workflows/main.yaml',
        '.hlxignore',
        'README.md',
        'blocks/hero-3/README.md',
        'scripts/types.d.ts',
        'package.json',
        'test/blocks.test.js',
        'cypress/e2e/home.cy.js',
        'tests/cypress/support.js',
        'tools/picker/src/index.js',
    ])('leaves out %s', (path) => {
        expect(ignored(path)).toBe(true);
    });

    it.each([
        'blocks/hero-3/hero-3.js',
        'blocks/hero-3/hero-3.css',
        'component-models.json',
        'scripts/aem.js',
        'styles/styles.css',
        'head.html',
        '404.html',
        'blocks/test/test.js',
        'tools/picker/index.html',
        'scripts/package.json.js',
    ])('keeps %s', (path) => {
        expect(ignored(path)).toBe(false);
    });
});

describe('parseHlxIgnore', () => {
    it('skips blank lines and comments, and leaves out nothing for an empty file', () => {
        expect(hlxIgnored(parseHlxIgnore('# just a comment\n\n'), 'scripts/aem.js')).toBe(false);
        expect(hlxIgnored(parseHlxIgnore(''), '_x.json')).toBe(false);
    });

    it('anchors a pattern that starts with a slash to the root', () => {
        const rules = parseHlxIgnore('/drafts');
        expect(hlxIgnored(rules, 'drafts/a.html')).toBe(true);
        expect(hlxIgnored(rules, 'blocks/drafts/a.js')).toBe(false);
    });

    it('matches across folders with **', () => {
        expect(hlxIgnored(parseHlxIgnore('docs/**/*.png'), 'docs/a/b/c.png')).toBe(true);
    });

    // Gitignore's own rule: a later "!" line brings a file back.
    it('honours a negation line', () => {
        const rules = parseHlxIgnore('_*.json\n!_keep.json');
        expect(hlxIgnored(rules, '_keep.json')).toBe(false);
        expect(hlxIgnored(rules, '_other.json')).toBe(true);
    });
});
