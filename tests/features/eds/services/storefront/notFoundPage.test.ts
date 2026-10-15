/**
 * The storefront's static 404.html (EDS-45).
 *
 * Helix serves `404.html` for any missing page, and it carries its OWN import map. On the
 * B2B template that map names 4 dropins while the start-up code also loads the company
 * switcher, so every missing page drew blank (seen on skukla/my-commerce-demo, 2026-10-15).
 * The fixtures below are the template's real import maps, trimmed to the entries that matter.
 */

import { withEagerRedirect } from '@/features/eds/services/pdp/pdp404HandlerPublisher';
import { alignNotFoundImportMap, updateNotFoundPage } from '@/features/eds/services/storefront/notFoundPage';
import { createMockGithub, type GithubFake } from '../../../../helpers/githubFake';
import { createMockLogger } from '../../../../helpers/loggerFake';

const HEAD = `<meta name="viewport" content="width=device-width, initial-scale=1"/>
<script nonce="aem" type="importmap">
    {
        "imports": {
            "@dropins/storefront-auth/": "/scripts/__dropins__/storefront-auth/",
            "@dropins/storefront-cart/": "/scripts/__dropins__/storefront-cart/",
            "@dropins/storefront-company-switcher/": "/scripts/__dropins__/storefront-company-switcher/",
            "@dropins/tools/": "/scripts/__dropins__/tools/"
        }
    }
</script>
`;

const NOT_FOUND = `<!DOCTYPE html>
<html>
<head>
  <title>Page not found</title>
  <script nonce="aem" type="importmap">
    {
        "imports": {
            "@dropins/tools/": "/scripts/__dropins__/tools/",
            "@dropins/storefront-cart/": "/scripts/__dropins__/storefront-cart/",
            "@dropins/storefront-auth/": "/scripts/__dropins__/storefront-auth/"
        }
    }
  </script>
  <script nonce="aem" type="text/javascript">
    window.isErrorPage = true;
  </script>
</head>
<body><main class="error"><h2 class="error-message">Page Not Found</h2></main></body>
</html>
`;

function importsOf(html: string): Record<string, string> {
    const body = /<script\b[^>]*type="importmap"[^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1] ?? '{}';
    return (JSON.parse(body) as { imports: Record<string, string> }).imports;
}

describe('alignNotFoundImportMap', () => {
    it('adds the entries head.html has and 404.html lacks', () => {
        const aligned = alignNotFoundImportMap(HEAD, NOT_FOUND);

        expect(aligned).not.toBeNull();
        expect(importsOf(aligned!)).toEqual(importsOf(HEAD));
    });

    it('only adds: every line of the page is still there, in order', () => {
        const aligned = alignNotFoundImportMap(HEAD, NOT_FOUND)!;
        const added = aligned.split('\n').filter((line) => !NOT_FOUND.split('\n').includes(line));

        // The last old entry gains a comma; the one new entry is the only other change.
        expect(added).toEqual([
            '            "@dropins/storefront-auth/": "/scripts/__dropins__/storefront-auth/",',
            '            "@dropins/storefront-company-switcher/": "/scripts/__dropins__/storefront-company-switcher/"',
        ]);
        expect(aligned).toContain('window.isErrorPage = true;');
    });

    it('keeps an entry 404.html maps differently from head.html', () => {
        const own = NOT_FOUND.replace('"/scripts/__dropins__/tools/"', '"/my/own/tools/"');

        const aligned = alignNotFoundImportMap(HEAD, own)!;

        expect(importsOf(aligned)['@dropins/tools/']).toBe('/my/own/tools/');
    });

    it('answers null when nothing is missing', () => {
        const aligned = alignNotFoundImportMap(HEAD, NOT_FOUND)!;

        expect(alignNotFoundImportMap(HEAD, aligned)).toBeNull();
    });

    it('answers null when either import map cannot be read', () => {
        expect(alignNotFoundImportMap('<head></head>', NOT_FOUND)).toBeNull();
        expect(alignNotFoundImportMap(HEAD, '<html><head></head></html>')).toBeNull();
        expect(alignNotFoundImportMap(HEAD, NOT_FOUND.replace('"imports": {', '"imports": {,'))).toBeNull();
    });
});

describe('updateNotFoundPage', () => {
    function github(files: Record<string, string | undefined>): GithubFake {
        return createMockGithub({
            getFileContent: jest.fn(async (_o: string, _r: string, path: string) =>
                files[path] === undefined ? null : { content: files[path]!, sha: `${path}-sha` },
            ),
        });
    }

    it('writes the aligned page once, against the sha it read', async () => {
        const gh = github({ 'head.html': HEAD, '404.html': NOT_FOUND });

        await updateNotFoundPage(gh, 'me', 'store', createMockLogger(), { eagerRedirect: false });

        expect(gh.createOrUpdateFile).toHaveBeenCalledTimes(1);
        const [owner, repo, path, content, message, sha] = gh.createOrUpdateFile.mock.calls[0] as unknown as [
            string, string, string, string, string, string,
        ];
        expect([owner, repo, path, sha]).toEqual(['me', 'store', '404.html', '404.html-sha']);
        expect(importsOf(content)).toEqual(importsOf(HEAD));
        expect(message).toBe('chore(demo-builder): give 404.html the dropins head.html loads');
    });

    it('puts the eager redirect in the same write when asked', async () => {
        const gh = github({ 'head.html': HEAD, '404.html': NOT_FOUND });

        await updateNotFoundPage(gh, 'me', 'store', createMockLogger(), { eagerRedirect: true });

        expect(gh.createOrUpdateFile).toHaveBeenCalledTimes(1);
        const content = (gh.createOrUpdateFile.mock.calls[0] as unknown as string[])[3];
        expect(content).toContain('Smart 404 PDP eager redirect');
        expect(importsOf(content)).toEqual(importsOf(HEAD));
    });

    it('writes nothing when the page is already current', async () => {
        const aligned = alignNotFoundImportMap(HEAD, NOT_FOUND)!;
        const gh = github({ 'head.html': HEAD, '404.html': aligned });

        await updateNotFoundPage(gh, 'me', 'store', createMockLogger(), { eagerRedirect: false });

        expect(gh.createOrUpdateFile).not.toHaveBeenCalled();
    });

    it('does nothing for a storefront with no 404.html', async () => {
        const gh = github({ 'head.html': HEAD });

        await updateNotFoundPage(gh, 'me', 'store', createMockLogger(), { eagerRedirect: true });

        expect(gh.createOrUpdateFile).not.toHaveBeenCalled();
    });

    it('never throws when the write is refused', async () => {
        const gh = github({ 'head.html': HEAD, '404.html': NOT_FOUND });
        gh.createOrUpdateFile.mockRejectedValue(new Error('409 conflict'));
        const logger = createMockLogger();

        await expect(
            updateNotFoundPage(gh, 'me', 'store', logger, { eagerRedirect: false }),
        ).resolves.toBeUndefined();
        expect(logger.warn).toHaveBeenCalled();
    });
});

/**
 * The product-page eager redirect in 404.html (moved here from the installer's suite when
 * 404.html got one writer). Helix serves the static 404.html on unknown-path 404s, bypassing
 * head.html, so the redirect head.html carries has to be in this page too.
 */
describe('withEagerRedirect', () => {
    const PAGE =
        '<!DOCTYPE html><html><head><title>Page not found</title><script nonce="aem">window.isErrorPage = true;</script></head><body><h1>404</h1></body></html>';

    it('splices the redirect in before </head>, with the page nonce, keeping the page', () => {
        const out = withEagerRedirect(PAGE, createMockLogger())!;

        expect(out.indexOf('Smart 404 PDP eager redirect')).toBeLessThan(out.indexOf('</head>'));
        expect(out).toContain('nonce="aem"');
        expect(out).toContain('window.isErrorPage = true');
        // Spliced, not duplicated: slicing the wrong half back on keeps every marker and
        // reads as correct to everything above.
        expect(out.match(/<!DOCTYPE html>/g)).toHaveLength(1);
    });

    it('skips a page with no nonced script tag, where CSP would block the redirect', () => {
        expect(withEagerRedirect('<!DOCTYPE html><html><head><title>404</title></head></html>', createMockLogger())).toBeNull();
    });

    it('appends when there is no </head> to insert before', () => {
        const noHead = '<script nonce="aem">window.isErrorPage = true;</script><h1>404</h1>';

        const out = withEagerRedirect(noHead, createMockLogger())!;

        expect(out.startsWith(noHead)).toBe(true);
        expect(out).toContain('Smart 404 PDP eager redirect');
    });

    it('inserts before </head> even at the very start of the file', () => {
        const headFirst = '</head><body><script nonce="aem">x</script></body>';

        const out = withEagerRedirect(headFirst, createMockLogger())!;

        expect(out.endsWith(headFirst)).toBe(true);
        expect(out.indexOf('Smart 404 PDP eager redirect')).toBeLessThan(out.indexOf('</head>'));
    });

    it('is idempotent: a page that already has it answers null', () => {
        const done = withEagerRedirect(PAGE, createMockLogger())!;

        expect(withEagerRedirect(done, createMockLogger())).toBeNull();
    });
});
