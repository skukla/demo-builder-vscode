/**
 * A published site that answers a fixed set of URLs, standing in for `fetch`.
 *
 * The content copy asks two published sites what they serve: the source it copies
 * from and the storefront it copied to. Every suite that covers one of those
 * questions needs the same fake, and what each asserts is the URL list this hands
 * back, so the fake records every call.
 *
 * Nothing else in this directory stands in for `fetch` (checked 2026-10-12: the
 * only other mention is a comment in `extensionContextFake.ts`); the suites that
 * needed one each wrote their own inline.
 *
 * A URL given as a list answers as a sheet (aem.live's single-sheet shape); a map
 * gives each URL its body, a string body being a page read with `text()`.
 */

/** aem.live's single-sheet shape, with one row. */
export const SERVED_SHEET = { total: 1, offset: 0, limit: 1, data: [{ Key: 'k', Value: 'v' }] };

/** What one URL answers: the JSON body to serve, or a page's text as a string. */
type Served = Record<string, unknown>;

/** The fake, and the URLs it has been asked for so far. */
export interface SiteFetchFake {
    fetchMock: jest.Mock;
    asked: () => string[];
    methodFor: (url: string) => string | undefined;
}

/**
 * Replace `global.fetch` with a site serving exactly `served`; every other URL is a 404.
 *
 * @param served - URLs that answer 200: a list, or a map from URL to its JSON body
 * @param unreachable - URLs whose request throws, as a network failure does
 */
export function installSiteFetch(served: Served | string[], unreachable: string[] = []): SiteFetchFake {
    const bodies: Served = Array.isArray(served)
        ? Object.fromEntries(served.map((url) => [url, SERVED_SHEET]))
        : served;
    const fetchMock = jest.fn(async (url: string, _init?: RequestInit) => {
        if (unreachable.includes(url)) throw new Error('network down');
        if (!(url in bodies)) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
        const body = bodies[url];
        // A string body is a page (`.plain.html`): `text()` is how a page is read.
        const text = async (): Promise<string> => (typeof body === 'string' ? body : JSON.stringify(body));
        return { ok: true, status: 200, json: async () => body, text };
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return {
        fetchMock,
        asked: () => fetchMock.mock.calls.map((call) => call[0]),
        methodFor: (url) => fetchMock.mock.calls.find((call) => call[0] === url)?.[1]?.method,
    };
}

const realFetch = global.fetch;

/** Put the real `fetch` back; call from `afterEach`. */
export function restoreFetch(): void {
    global.fetch = realFetch;
}
