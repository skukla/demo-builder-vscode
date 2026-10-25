/**
 * Runs the built smart-404 snippet against a stub page, for the `pdp404Snippet` suites.
 *
 * The snippet is browser code in a string; the only way to know where it sends a shopper
 * is to execute it. The stub page is `window` (`isErrorPage`, `location`), `document`
 * (`<main>`) and `fetch`: the HEAD probe answers 404, and the action answers `answer`.
 */

import { buildSmart404Snippet } from '@/features/eds/services/pdp/pdp404Snippet';

export const TRIGGER_URL = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/prepublish-pdp';

export interface Smart404Visit {
    /** Every URL fetched, with its method. */
    requests: Array<{ url: string; method?: string }>;
    /** Every `location.replace` target. */
    redirects: string[];
    /** What `<main>` shows while the action runs. */
    main: { className: string; innerHTML: string };
}

/** Let the snippet's async work settle: it awaits fetch and json, nothing else. */
async function settle(): Promise<void> {
    for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Open `pathname` as a 404 page and run the snippet.
 *
 * @param pathname - the address the shopper opened
 * @param answer - what the action answers: its body, and whether it succeeded
 * @param site - the storefront the snippet is built for
 */
export async function visitSmart404(
    pathname: string,
    answer: { ok: boolean; body?: unknown },
    site: { org: string; site: string } = { org: 'skukla', site: 'kukla-justrite' },
): Promise<Smart404Visit> {
    const requests: Smart404Visit['requests'] = [];
    const redirects: string[] = [];
    const main = { className: 'error', innerHTML: 'Page Not Found' };
    const fetchStub = async (url: string, init?: { method?: string }) => {
        requests.push({ url, method: init?.method });
        if (init?.method === 'HEAD') return { ok: false, status: 404 };
        return { ok: answer.ok, status: answer.ok ? 200 : 404, json: async () => answer.body ?? {} };
    };
    const window = {
        isErrorPage: true,
        location: { pathname, search: '', replace: (to: string) => redirects.push(to) },
    };
    const document = { getElementById: () => null, querySelector: () => main };
    const snippet = buildSmart404Snippet(TRIGGER_URL, site.org, site.site);
    new Function('window', 'document', 'fetch', snippet)(window, document, fetchStub);
    await settle();
    return { requests, redirects, main };
}
