/**
 * Runs the built smart-404 snippet against a stub page, for the `pdp404Snippet` suites.
 *
 * The snippet is browser code in a string; the only way to know where it sends a shopper
 * is to execute it. The stub page is `window` (`isErrorPage`, `location`), `document`
 * (`<main>`), `fetch` and `setTimeout` (which runs its callback at once, so the retry's
 * one-second wait costs the suite nothing): the HEAD probe answers 404, and the action
 * answers `answer`.
 */

import { buildSmart404Snippet } from '@/features/eds/services/pdp/pdp404Snippet';

export const TRIGGER_URL = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/prepublish-pdp';

/** The storefront's own 404 body, as the stub `<main>` holds it before the snippet runs. */
export const OWN_404_BODY = 'Page Not Found';

export interface Smart404Visit {
    /** Every URL fetched, with its method. */
    requests: Array<{ url: string; method?: string }>;
    /** Every `location.replace` target. */
    redirects: string[];
    /** What `<main>` shows once the snippet has finished. */
    main: { className: string; innerHTML: string };
    /** Every caption `<main>` showed while the snippet ran, in order. */
    shown: string[];
}

/** What the action answers: its status (200 when `ok`, else 404 unless given), and its body. */
export interface Smart404Answer {
    ok: boolean;
    status?: number;
    body?: unknown;
}

/**
 * A `<main>` that behaves like the DOM's for what the snippet does to it: `innerHTML`
 * replaces the children, `childNodes` lists them, and `replaceChildren` puts nodes back.
 */
class StubMain {
    className = 'error';
    private nodes: unknown[] = [OWN_404_BODY];
    readonly shown: string[] = [];

    get childNodes(): unknown[] {
        return [...this.nodes];
    }

    get innerHTML(): string {
        return this.nodes.join('');
    }

    set innerHTML(html: string) {
        this.nodes = [html];
        this.shown.push(html);
    }

    replaceChildren(...nodes: unknown[]): void {
        this.nodes = nodes;
    }
}

/** Let the snippet's async work settle: it awaits fetch and json, nothing else. */
async function settle(): Promise<void> {
    for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Open `pathname` as a 404 page and run the snippet.
 *
 * @param pathname - the address the shopper opened
 * @param answer - what the action answers
 * @param site - the storefront the snippet is built for
 */
export async function visitSmart404(
    pathname: string,
    answer: Smart404Answer,
    site: { org: string; site: string } = { org: 'skukla', site: 'kukla-justrite' },
): Promise<Smart404Visit> {
    const requests: Smart404Visit['requests'] = [];
    const redirects: string[] = [];
    const main = new StubMain();
    const status = answer.status ?? (answer.ok ? 200 : 404);
    const fetchStub = async (url: string, init?: { method?: string }) => {
        requests.push({ url, method: init?.method });
        if (init?.method === 'HEAD') return { ok: false, status: 404 };
        return { ok: answer.ok, status, json: async () => answer.body ?? {} };
    };
    const window = {
        isErrorPage: true,
        location: { pathname, search: '', replace: (to: string) => redirects.push(to) },
    };
    const document = { getElementById: () => null, querySelector: () => main };
    const now = (callback: () => void) => callback();
    const snippet = buildSmart404Snippet(TRIGGER_URL, site.org, site.site);
    new Function('window', 'document', 'fetch', 'setTimeout', snippet)(window, document, fetchStub, now);
    await settle();
    return {
        requests,
        redirects,
        main: { className: main.className, innerHTML: main.innerHTML },
        shown: main.shown,
    };
}
