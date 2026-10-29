/**
 * Runs the built smart-404 script against a stub page, for the `pdp404Snippet` suites.
 *
 * The script is browser code in a string; the only way to know where it sends a shopper
 * is to execute it. It runs inline at the end of `404.html`'s body, so the stub page is
 * what exists at that moment: `window` (`isErrorPage`, `location`), `document` (`<head>`,
 * `<body>`, an undecorated `<main>`, `createElement`), `fetch` and `setTimeout` (which runs
 * its callback at once, so the retry's one-second wait costs the suite nothing). The HEAD
 * probe answers 404, and the action answers `answer`.
 */

import { buildSmart404Snippet } from '@/features/eds/services/pdp/pdp404Snippet';

export const TRIGGER_URL = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/prepublish-pdp';

/** The storefront's own 404 body, as `<main>` holds it before the script runs. */
export const OWN_404_BODY = 'Page Not Found';

export interface Smart404Visit {
    /** Every URL fetched, with its method. */
    requests: Array<{ url: string; method?: string }>;
    /** Every `location.replace` target. */
    redirects: string[];
    /** What `<main>` holds once the script has finished: the script never touches it. */
    main: { className: string; innerHTML: string };
    /** The loading state the script showed, in order (each element's markup). */
    shown: string[];
    /** Whether anything of the script's is still on the page: its loading state, its hide. */
    left: { loading: boolean; mainHidden: boolean };
    /** The tab title when the action was asked, and once the script has finished. */
    title: { whileLoading?: string; after: string };
}

/** What the action answers: its status (200 when `ok`, else 404 unless given), and its body. */
export interface Smart404Answer {
    ok: boolean;
    status?: number;
    body?: unknown;
}

/** An element the script creates: markup in, `remove()` takes it off the page. */
class StubElement {
    id = '';
    innerHTML = '';
    textContent = '';
    attached = false;

    remove(): void {
        this.attached = false;
    }
}

/** The page at the end of `404.html`'s body, before the storefront's scripts decorate it. */
class StubPage {
    title = 'Page not found';
    readonly main = { className: 'error', innerHTML: OWN_404_BODY, before: (el: StubElement) => this.attach(el) };
    readonly elements: StubElement[] = [];
    readonly head = { appendChild: (el: StubElement) => this.attach(el) };
    readonly body = { append: (el: StubElement) => this.attach(el) };

    createElement = (): StubElement => new StubElement();
    querySelector = (selector: string) => (selector === 'main' ? this.main : null);
    getElementById = (id: string) => this.elements.find((el) => el.attached && el.id === id) ?? null;

    private attach(el: StubElement): void {
        el.attached = true;
        this.elements.push(el);
    }

    get shown(): string[] {
        return this.elements.filter((el) => el.innerHTML.includes('smart404Spin')).map((el) => el.innerHTML);
    }

    get left(): Smart404Visit['left'] {
        const attached = this.elements.filter((el) => el.attached);
        return {
            loading: attached.some((el) => el.innerHTML.includes('smart404Spin')),
            mainHidden: attached.some((el) => /main\s*\{/.test(el.textContent)),
        };
    }
}

/** Let the script's async work settle: it awaits fetch and json, nothing else. */
async function settle(): Promise<void> {
    for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Open `pathname` as a 404 page and run the script.
 *
 * @param pathname - the address the shopper opened
 * @param answer - what the action answers
 * @param site - the storefront the script is built for
 * @param search - the address's query (`?pdpRetry=1` on the visit after a reload)
 */
export async function visitSmart404(
    pathname: string,
    answer: Smart404Answer,
    site: { org: string; site: string } = { org: 'skukla', site: 'kukla-justrite' },
    search = '',
): Promise<Smart404Visit> {
    const requests: Smart404Visit['requests'] = [];
    const redirects: string[] = [];
    const page = new StubPage();
    const status = answer.status ?? (answer.ok ? 200 : 404);
    let whileLoading: string | undefined;
    const fetchStub = async (url: string, init?: { method?: string }) => {
        requests.push({ url, method: init?.method });
        if (init?.method === 'POST') whileLoading = page.title;
        if (init?.method === 'HEAD') return { ok: false, status: 404 };
        return { ok: answer.ok, status, json: async () => answer.body ?? {} };
    };
    const window = {
        isErrorPage: true,
        location: { pathname, search, replace: (to: string) => redirects.push(to) },
    };
    const now = (callback: () => void) => callback();
    const snippet = buildSmart404Snippet(TRIGGER_URL, site.org, site.site);
    new Function('window', 'document', 'fetch', 'setTimeout', snippet)(window, page, fetchStub, now);
    await settle();
    return {
        requests,
        redirects,
        main: { className: page.main.className, innerHTML: page.main.innerHTML },
        shown: page.shown,
        left: page.left,
        title: { whileLoading, after: page.title },
    };
}
