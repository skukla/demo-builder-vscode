/**
 * The one door failure text takes to a datapack screen (release walk F221, owner 2026-11-17).
 *
 * The engine's failures reached the SC as Commerce wrote them: "products p2 (Invalid SKU)", "It
 * stopped at Products: Commerce did not respond to V1/products: …", "each named in Debug Logs".
 * Every field a datapack screen draws a failure from is typed {@link PlainText}, and only two things
 * make one: {@link plainFailure}, which translates whatever arrived, and {@link plain}, for a
 * literal. The compiler then refuses raw text at every such field. The rows an install skipped are
 * grouped in `plainRows.ts`, whose lines go through {@link plainFailure} too.
 *
 * The raw text is not lost: the job record's `reason`, `note` and `skipped[].reason` keep it for
 * Debug Logs and the agent tools.
 *
 * Pure, with no Node or VS Code import: the webview bundles draw from it too.
 *
 * @module features/data-installer/plainFailure
 */

import { FINISHING_STOP, REPLACE_STOP, SAVE_STOP } from './types';
import { dataTypeLabel } from './ui/dataTypeLabel';

/** Where a job can stop that is not a data type: no "while … installing" for these. */
const NOT_A_KIND = new Set<string>([FINISHING_STOP, REPLACE_STOP, SAVE_STOP]);

declare const PLAIN: unique symbol;

/** Words fit for an SC's screen. Made only by {@link plainFailure} or {@link plain}. */
export type PlainText = string & { readonly [PLAIN]: true };

/** A literal, and only a literal: a string built at run time is `never` here. */
type Literal<T extends string> = Record<never, never> extends Record<T, 1> ? never : T;

const mint = (text: string): PlainText => text as PlainText;

/**
 * A literal already in plain words. The compiler refuses anything but a literal, so a value built
 * from raw text has to go through {@link plainFailure}.
 */
export function plain<T extends string>(text: Literal<T>): PlainText {
    return mint(text);
}

/** What an install was doing when it stopped, for "while products were installing". */
export interface FailureDuring {
    /** The data type in progress, as the engine names it ("products"). */
    kind?: string;
    work?: 'installing' | 'uninstalling';
}

/** A row's kind in words: singular, plural. Unknown kinds use their label. */
const NOUNS: Record<string, [string, string]> = {
    attribute_sets: ['attribute set', 'attribute sets'],
    product_attributes: ['attribute', 'attributes'],
    attribute_assign_to_set: ['attribute in a set', 'attributes in sets'],
    categories: ['category', 'categories'],
    customer_groups: ['customer group', 'customer groups'],
    customers: ['customer', 'customers'],
    products: ['product', 'products'],
    giftcards: ['gift card', 'gift cards'],
    cart_rules: ['cart rule', 'cart rules'],
    coupons: ['coupon', 'coupons'],
    stocks: ['stock', 'stocks'],
    sources: ['source', 'sources'],
    stock_source_links: ['stock link', 'stock links'],
    b2b_shared_catalogs: ['shared catalog', 'shared catalogs'],
    b2b_companies: ['company', 'companies'],
    store_config: ['setting', 'settings'],
};

/** A row's kind in words, singular for one: "category", "categories". */
export function nounOf(kind: string, count: number): string {
    const known = NOUNS[kind];
    if (known) return count === 1 ? known[0] : known[1];
    return dataTypeLabel(kind).toLowerCase();
}

const NO_REASON = 'It stopped without a reason.';
const NO_ANSWER_IN_TIME = 'No answer came in time.';
const SIGN_IN = "Commerce didn't accept the sign-in. Sign in to Adobe again.";

/** Text that is still raw: an API route, a status code, a JSON body. */
const LOOKS_RAW =
    /\bV1\/|\/rest\/|\bHTTP \d{3}\b|^\s*[{[]|\b(answered|status) \d{3}\b/iu;
const NO_ANSWER =
    /did not (respond|answer)|timed? ?out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed|socket hang up/iu;

function textOf(raw: unknown): string {
    if (raw instanceof Error) return raw.message;
    return typeof raw === 'string' ? raw : '';
}

function statusOf(raw: unknown, text: string): number | undefined {
    const status = (raw as { status?: unknown } | null | undefined)?.status;
    if (typeof status === 'number') return status;
    const said = /Commerce answered (\d{3})\b/u.exec(text);
    return said ? Number(said[1]) : undefined;
}

/** " while products were installing", or nothing when the kind is not a data type. */
function whileDoing(during: FailureDuring | undefined): string {
    if (!during?.kind || NOT_A_KIND.has(during.kind)) return '';
    // Store configuration is named as Commerce Admin names it (the datapack words SOP).
    const label =
        during.kind === 'store_config'
            ? 'store configuration'
            : dataTypeLabel(during.kind).toLowerCase();
    const verb = label.endsWith('s') ? 'were' : 'was';
    return ` while ${label} ${verb} ${during.work ?? 'installing'}`;
}

/** Commerce's own message the house knows, for rows of `kind`: what is wrong, lower case. */
export function knownMessage(message: string, kind: string, count: number): string | undefined {
    if (/invalid sku/iu.test(message))
        return count === 1 ? "Commerce didn't accept its SKU" : "Commerce didn't accept their SKUs";
    if (/url key .*already exists/iu.test(message)) {
        return count === 1
            ? `another ${nounOf(kind, 1)} already uses its web address`
            : `other ${nounOf(kind, 2)} already use their web addresses`;
    }
    return undefined;
}

/** What a refusal's status means for one row or several, lower case. */
export function statusMeaning(status: number | undefined, count: number, removing = false): string {
    const one = count === 1;
    if (status === 404)
        return one
            ? "Commerce couldn't find something it needs"
            : "Commerce couldn't find something they need";
    if (status === 409)
        return one
            ? 'it clashes with something already in Commerce'
            : 'they clash with something already in Commerce';
    if (removing) return one ? "Commerce wouldn't delete it" : "Commerce wouldn't delete them";
    return one ? "Commerce didn't accept it" : "Commerce didn't accept them";
}

export const sentence = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;

/** No answer: Commerce's when the text names it, else no one's in particular (a request timing out). */
function noAnswer(text: string, during: FailureDuring | undefined): string {
    return /commerce/iu.test(text) ? `Commerce stopped answering${whileDoing(during)}.` : NO_ANSWER_IN_TIME;
}

/** A stop by its status, or undefined for a refusal of the rows themselves. */
function stopByStatus(
    status: number | undefined,
    during: FailureDuring | undefined,
): string | undefined {
    if (status === 401 || status === 403) return SIGN_IN;
    if (status === 429) return `Commerce was too busy to answer${whileDoing(during)}.`;
    if (status !== undefined && status >= 500)
        return `Commerce ran into a problem${whileDoing(during)}.`;
    if (status === 404) return "Commerce couldn't find something the datapack needs.";
    return undefined;
}

/** Commerce's message inside the raw text, its JSON `message` when it has one. */
function messageIn(text: string): string {
    const body = text.replace(/^Commerce answered \d+ for [^:]*: /u, '');
    try {
        const parsed = JSON.parse(body) as { message?: unknown };
        return typeof parsed.message === 'string' ? parsed.message : body;
    } catch {
        return body;
    }
}

/**
 * Why something stopped or was refused, in words an SC reads: Commerce not answering, refusing the
 * sign-in, failing, or refusing the data, each without a route or a status code. A sentence Demo
 * Builder wrote itself is kept; anything else still raw gets "Commerce didn't accept it."
 *
 * @param raw - the error, or the text a record kept of it
 * @param during - the data type in progress, for "while products were installing"
 */
export function plainFailure(raw: unknown, during?: FailureDuring): PlainText {
    const text = textOf(raw).trim();
    if (text === '') return mint(NO_REASON);
    const status = statusOf(raw, text);
    if (NO_ANSWER.test(text) && status === undefined) return mint(noAnswer(text, during));
    const stop = stopByStatus(status, during);
    if (stop) return mint(stop);
    const fromCommerce = status !== undefined || LOOKS_RAW.test(text);
    if (!fromCommerce) return mint(text);
    const known = knownMessage(messageIn(text), during?.kind ?? 'item', 1);
    if (known) return mint(sentence(known.replace('its SKU', 'the SKU')));
    return mint(sentence(statusMeaning(status, 1)));
}

/** A line naming what failed and why: "Products: Commerce didn't accept it." */
export function plainLabelled(label: string, raw: unknown, during?: FailureDuring): PlainText {
    return mint(`${label}: ${plainFailure(raw, during)}`);
}
