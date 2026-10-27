/**
 * codeServed — after a code publish, the live site serves the code the repository has,
 * or the run says it does not (2026-10-23: JustRite's reset left three fixes off the
 * site while its card said the storefront was current).
 */

import {
    codeNotServedSentence,
    confirmCodeServed,
    confirmStorefrontCodeServed,
    type CodeServedDeps,
} from '@/features/eds/services/storefront/codeServed';
import { createMockLogger } from '../../../../helpers/loggerFake';

jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

/** A repository and a site; `publish` copies a file from one to the other after `lag` publishes. */
function world(repo: Record<string, string>, served: Record<string, string>, lag = 1) {
    const publishes: string[] = [];
    const deps: CodeServedDeps = {
        repoText: async (path) => repo[path],
        servedText: async (path) => served[path],
        publish: async (path) => {
            publishes.push(path);
            if (publishes.filter((p) => p === path).length >= lag) served[path] = repo[path];
        },
        pause: jest.fn().mockResolvedValue(undefined),
        logger: createMockLogger(),
    };
    return { deps, publishes };
}

describe('confirmCodeServed', () => {
    it('publishes nothing when the site already serves what was committed', async () => {
        const { deps, publishes } = world({ 'scripts/a.js': 'new' }, { 'scripts/a.js': 'new' });

        await expect(confirmCodeServed(['scripts/a.js'], deps)).resolves.toStrictEqual([]);
        expect(publishes).toStrictEqual([]);
    });

    it('publishes again only the files the site serves old, and stops once they match', async () => {
        const { deps, publishes } = world(
            { '404.html': 'new', 'scripts/commerce.js': 'new', 'scripts/b.js': 'same' },
            { '404.html': 'old', 'scripts/commerce.js': 'old', 'scripts/b.js': 'same' },
        );

        await expect(confirmCodeServed(['404.html', 'scripts/commerce.js', 'scripts/b.js'], deps)).resolves.toEqual(
            [],
        );
        expect(publishes.sort()).toEqual(['404.html', 'scripts/commerce.js']);
        expect(deps.pause).toHaveBeenCalledTimes(1);
    });

    it('returns what the site still serves old after every round', async () => {
        const { deps, publishes } = world({ 'scripts/a.js': 'new' }, { 'scripts/a.js': 'old' }, 99);

        await expect(confirmCodeServed(['scripts/a.js'], deps)).resolves.toEqual(['scripts/a.js']);
        expect(publishes).toHaveLength(3);
    });

    it('counts a file the site does not serve at all as not served', async () => {
        const { deps } = world({ 'scripts/new.js': 'x' }, {}, 99);

        await expect(confirmCodeServed(['scripts/new.js'], deps)).resolves.toEqual(['scripts/new.js']);
    });

    it('leaves out files it cannot compare as text, and files the repository does not have', async () => {
        const { deps, publishes } = world({ 'scripts/a.js': 'x' }, {});

        await confirmCodeServed(['media/logo.png', 'scripts/gone.js'], deps);

        expect(publishes).toStrictEqual([]);
    });

    // What AEM serves for an HTML file, from JustRite's live 404.html (2026-10-23): the CSP
    // meta moved to a header, every nonce replaced. An exact comparison called the new page
    // "not served" for good.
    const COMMITTED_HTML = [
        '<head>',
        '  <meta',
        '    http-equiv="Content-Security-Policy"',
        `    content="script-src 'nonce-aem' 'strict-dynamic';"`,
        '    move-to-http-header="true"',
        '  >',
        '  <script nonce="aem" type="importmap">{"imports":{"@dropins/tools/":"/t/","@dropins/cart/":"/c/"}}</script>',
        '</head>',
    ].join('\n');
    const SERVED_HTML = [
        '<head>',
        '  ',
        '  <script nonce="yDWl1DtegOD3NLh0PzJCANYU" type="importmap">{"imports":{"@dropins/tools/":"/t/","@dropins/cart/":"/c/"}}</script>',
        '</head>',
    ].join('\n');

    it('reads an HTML file as AEM serves it, without the moved meta and with a fresh nonce', async () => {
        const { deps, publishes } = world({ '404.html': COMMITTED_HTML }, { '404.html': SERVED_HTML });

        await expect(confirmCodeServed(['404.html'], deps)).resolves.toStrictEqual([]);
        expect(publishes).toStrictEqual([]);
    });

    it('CONTROL: still sees an HTML file the site serves old', async () => {
        const old = SERVED_HTML.replace('"@dropins/cart/":"/c/"', '');
        const { deps } = world({ '404.html': COMMITTED_HTML }, { '404.html': old }, 99);

        await expect(confirmCodeServed(['404.html'], deps)).resolves.toStrictEqual(['404.html']);
    });

    it('treats a failed publish like any other file still not served', async () => {
        const { deps } = world({ 'scripts/a.js': 'new' }, { 'scripts/a.js': 'old' });
        deps.publish = jest.fn().mockRejectedValue(new Error('403'));

        await expect(confirmCodeServed(['scripts/a.js'], deps)).resolves.toEqual(['scripts/a.js']);
    });
});

describe('codeNotServedSentence', () => {
    it('says nothing when every file reached the site', () => {
        expect(codeNotServedSentence([])).toBeUndefined();
    });

    it('names the files and the way to fix it', () => {
        expect(codeNotServedSentence(['404.html', 'scripts/commerce.js'])).toBe(
            '2 code files did not reach the live site (404.html, scripts/commerce.js), so it still runs the old ' +
                'code. Select Republish on the project dashboard to publish the code again.',
        );
    });
});

describe('confirmStorefrontCodeServed', () => {
    const SITE = { owner: 'skukla', repo: 'kukla-justrite' };
    const originalFetch = global.fetch;

    function github(overrides: Record<string, jest.Mock> = {}) {
        const treeCommits = {
            earliestRecentCommitSha: jest.fn().mockResolvedValue('template'),
            filesChangedSince: jest.fn().mockResolvedValue(['scripts/commerce.js']),
        };
        return {
            getLatestCommitSha: jest.fn().mockResolvedValue('head'),
            getFileContent: jest
                .fn()
                .mockImplementation(async (_o: string, _r: string, path: string) => ({ content: 'new', sha: 's', path })),
            treeCommits: { ...treeCommits, ...overrides },
            ...(overrides.getLatestCommitSha ? { getLatestCommitSha: overrides.getLatestCommitSha } : {}),
        };
    }

    /** The site: one body for every file, or a body per file (absent = 404). */
    function serve(body: string | Record<string, string>): void {
        global.fetch = jest.fn(async (url: string) => {
            const path = new URL(url).pathname.slice(1);
            const text = typeof body === 'string' ? body : body[path];
            return { ok: text !== undefined, text: async () => text };
        }) as unknown as typeof fetch;
    }

    /** The template's two probe files, served as committed. */
    const TEMPLATE_SERVED = { 'scripts/aem.js': 'new', 'styles/styles.css': 'new' };

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it("compares from the reset's own commit, reading the repository at its head", async () => {
        serve('new');
        const files = github();

        const said = await confirmStorefrontCodeServed(files, { previewCode: jest.fn() }, SITE, 'reset', createMockLogger());

        expect(said).toBeUndefined();
        expect(files.treeCommits.filesChangedSince).toHaveBeenCalledWith('skukla', 'kukla-justrite', 'reset');
        expect(files.getFileContent).toHaveBeenCalledWith('skukla', 'kukla-justrite', 'scripts/commerce.js', 'head');
        expect(files.treeCommits.earliestRecentCommitSha).not.toHaveBeenCalled();
    });

    it("compares a just-created storefront from the commit its template made", async () => {
        serve('new');
        const files = github();

        await confirmStorefrontCodeServed(files, { previewCode: jest.fn() }, SITE, undefined, createMockLogger());

        expect(files.treeCommits.filesChangedSince).toHaveBeenCalledWith('skukla', 'kukla-justrite', 'template');
    });

    it('publishes the stale file on its own and says so when the site never catches up', async () => {
        serve({ ...TEMPLATE_SERVED, 'scripts/commerce.js': 'old' });
        const previewCode = jest.fn().mockResolvedValue(undefined);

        const said = await confirmStorefrontCodeServed(github(), { previewCode }, SITE, 'reset', createMockLogger());

        expect(previewCode).toHaveBeenCalledWith('skukla', 'kukla-justrite', '/scripts/commerce.js');
        expect(said).toContain('1 code file did not reach the live site (scripts/commerce.js)');
    });

    /**
     * mrajkovich/bodea, 2026-10-27 (EDS-66): AEM accepted the publish of `/*` and never
     * brought the template's own files, so the site served no styles and no scripts. Those
     * files are in no later commit, so the changed-file check never looked at them.
     */
    it("publishes all the code again when the site does not serve the template's files", async () => {
        const site: Record<string, string> = { 'scripts/commerce.js': 'new' };
        serve(site);
        const previewCode = jest.fn(async (_o: string, _r: string, path: string) => {
            if (path === '/*') Object.assign(site, TEMPLATE_SERVED);
        });

        const said = await confirmStorefrontCodeServed(github(), { previewCode }, SITE, undefined, createMockLogger());

        expect(previewCode).toHaveBeenCalledTimes(1);
        expect(previewCode).toHaveBeenCalledWith('skukla', 'kukla-justrite', '/*');
        expect(said).toBeUndefined();
    });

    it("says the pages show without styles or scripts when the template's code never arrives", async () => {
        serve({ 'scripts/commerce.js': 'new' });
        const previewCode = jest.fn().mockResolvedValue(undefined);

        const said = await confirmStorefrontCodeServed(github(), { previewCode }, SITE, undefined, createMockLogger());

        expect(previewCode.mock.calls.map((call) => call[2])).toEqual(['/*', '/*', '/*']);
        expect(said).toBe(
            "The storefront's code did not reach the live site (scripts/aem.js, styles/styles.css), so its pages " +
                'show without styles or scripts. Select Republish on the project dashboard to publish the code again.',
        );
    });

    it('CONTROL: publishes nothing more when the site serves the template and every change', async () => {
        serve({ ...TEMPLATE_SERVED, 'scripts/commerce.js': 'new' });
        const previewCode = jest.fn();

        await confirmStorefrontCodeServed(github(), { previewCode }, SITE, undefined, createMockLogger());

        expect(previewCode).not.toHaveBeenCalled();
    });

    it('has nothing to check when nothing was committed after the starting commit', async () => {
        const files = github({ getLatestCommitSha: jest.fn().mockResolvedValue('reset') });

        await confirmStorefrontCodeServed(files, { previewCode: jest.fn() }, SITE, 'reset', createMockLogger());

        expect(files.treeCommits.filesChangedSince).not.toHaveBeenCalled();
    });

    it('never fails the run it is part of', async () => {
        const files = github({ filesChangedSince: jest.fn().mockRejectedValue(new Error('rate limited')) });

        await expect(
            confirmStorefrontCodeServed(files, { previewCode: jest.fn() }, SITE, 'reset', createMockLogger()),
        ).resolves.toBeUndefined();
    });
});
