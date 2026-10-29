/**
 * Rebuild a copied page's own metadata block from the source page's `<head>`.
 *
 * The content copy reads `<page>.plain.html`, and the renderer (Adobe's
 * helix-html-pipeline) takes the page's `metadata` block OUT of that body and turns
 * it into `<meta>` tags in the head. So a page copied from `.plain.html` arrives in
 * DA.live without its template, robots, cache-control or title. Measured 2026-10-16:
 * Adobe's `/customer/account` has `template: My Account, Columns`; every copy had none,
 * and the commerce account layout keys off that template.
 *
 * Not every head tag was authored. Read from the renderer's source
 * (`extract-metadata.js`, `get-metadata.js`, `render.js`):
 *
 *   - `og:*`, `twitter:*`, `article:*` are always generated (mirrors of title,
 *     description and image, or fixed defaults), so they are never rebuilt.
 *   - A missing title is DERIVED from the first heading, else the first paragraph,
 *     which can be a block's name row (bodea's home page is titled "Targeted Block").
 *     A title equal to any heading, paragraph or cell text, or to a block's name, is
 *     treated as derived.
 *   - A missing description is DERIVED from the first paragraph of ten or more words;
 *     a description equal to that is treated as derived.
 *   - Every other name comes from the page's block, from the site's `/metadata.json`
 *     sheet by URL rule, or from the site's `head.html`. The last two are site-wide,
 *     so they are subtracted: a sheet value is left out when the page shows the SAME
 *     value, and any name `head.html` writes is left out.
 *
 * Keep this module `vscode`-free (the MCP server constructs the DA.live stack in a
 * separate Node process).
 *
 * @module features/eds/services/daLive/daLivePageMetadata
 */

import { escapeHtml } from './daLiveSpreadsheetUtils';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/** One row of a page's metadata block: the key as an author types it, and its value. */
export interface PageMetadataEntry {
    key: string;
    value: string;
}

/** What the whole site puts in every page's head, so it is not taken for the page's own. */
export interface SiteWideMetadata {
    /** Meta names the site's `head.html` writes into every page. */
    headHtmlNames: ReadonlySet<string>;
    /** The site sheet's values for this page's URL, by meta name. */
    sheetValues: Readonly<Record<string, string>>;
}

const NO_SITE_WIDE: SiteWideMetadata = { headHtmlNames: new Set(), sheetValues: {} };

/** Prefixes the renderer fills in on every page. */
const GENERATED_PREFIXES = ['og:', 'twitter:', 'article:'];

/**
 * Set by every content source's `head.html` (all five measured 2026-10-16), so it
 * alone never justifies the two site-wide reads; the full check still subtracts it.
 */
const KNOWN_HEAD_HTML_NAMES: ReadonlySet<string> = new Set(['viewport']);

const ENTITIES: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
};

function decodeEntities(text: string): string {
    return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, code: string) => {
        if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? match;
        const hex = code[1] === 'x' || code[1] === 'X';
        const [digits, radix] = hex ? [code.slice(2), 16] : [code.slice(1), 10];
        return String.fromCodePoint(parseInt(digits, radix));
    });
}

/** Visible text of an HTML fragment, whitespace collapsed. */
function textOf(html: string): string {
    return decodeEntities(html.replace(/<[^>]*>/g, ''))
        .replace(/\s+/g, ' ')
        .trim();
}

/** The renderer's own name rule (`toMetaName`): non-name characters to `-`, lower case. */
function toMetaName(key: string): string {
    return key.replace(/[^0-9a-zA-Z:_-]/g, '-').toLowerCase();
}

/** `cache-control` becomes `Cache Control`, which the renderer reads back as `cache-control`. */
function toAuthoredKey(name: string): string {
    return name
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/** Every `<meta>` in some HTML, as name (or property) and decoded content. */
function readMetaTags(html: string): Array<{ name: string; content: string }> {
    const tags: Array<{ name: string; content: string }> = [];
    for (const [, attrs] of html.matchAll(/<meta\s([^>]*)>/gi)) {
        const attr = (key: string): string | undefined =>
            new RegExp(`\\b${key}="([^"]*)"`, 'i').exec(attrs)?.[1];
        const name = attr('name') ?? attr('property');
        const content = attr('content');
        if (name && content !== undefined) tags.push({ name, content: decodeEntities(content) });
    }
    return tags;
}

/** Text of every heading, paragraph and plain cell: where a derived title can come from. */
function derivableTitles(plainHtml: string): Set<string> {
    const texts = new Set<string>();
    for (const [, , inner] of plainHtml.matchAll(/<(h[1-6]|p)\b[^>]*>([^]*?)<\/\1>/gi)) {
        texts.add(textOf(inner));
    }
    // A block cell holding bare text (no element inside it). Its own pass: a
    // section `<div>` matched alongside would swallow the paragraphs within it.
    for (const [, inner] of plainHtml.matchAll(/<div\b[^>]*>([^<]*)<\/div>/gi)) {
        texts.add(textOf(inner));
    }
    return texts;
}

/** Lower case, runs of anything else to one `-`: how a block's name becomes its class. */
function toClassName(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^0-9a-z]+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Whether the renderer could have made this title itself: the text of a heading,
 * paragraph or cell, or a block's NAME (its header row, e.g. "Commerce Account Nav"
 * for `commerce-account-nav`), which `.plain.html` keeps only as the class.
 */
function isDerivedTitle(title: string, plainHtml: string): boolean {
    if (derivableTitles(plainHtml).has(title)) return true;
    const name = toClassName(title);
    for (const [, classes] of plainHtml.matchAll(/<div class="([^"]+)"/gi)) {
        if (toClassName(classes) === name) return true;
    }
    return false;
}

/** The renderer's `extractDescription`: first paragraph of 10+ words (or one very long word). */
function derivedDescription(plainHtml: string): string {
    for (const [, inner] of plainHtml.matchAll(/<p\b[^>]*>([^]*?)<\/p>/gi)) {
        const words = textOf(inner).split(' ');
        const longWord = words.some((w) => w.length > 25 && !w.startsWith('http'));
        if (words.length >= 10 || longWord) {
            return `${words.slice(0, 25).join(' ')}${words.length > 25 ? ' ...' : ''}`;
        }
    }
    return '';
}

/** Whether a head tag is the page's own rather than generated or site-wide. */
function isAuthored(
    tag: { name: string; content: string },
    plainHtml: string,
    siteWide: SiteWideMetadata,
): boolean {
    const name = tag.name.toLowerCase();
    if (!tag.content || GENERATED_PREFIXES.some((p) => name.startsWith(p))) return false;
    if (siteWide.headHtmlNames.has(name)) return false;
    if (siteWide.sheetValues[name] === tag.content) return false;
    return name !== 'description' || tag.content !== derivedDescription(plainHtml);
}

/**
 * The page's own metadata, as rows of a metadata block.
 *
 * @param pageHtml - the rendered page (only its `<head>` is read)
 * @param plainHtml - the same page's `.plain.html`, to recognise derived values
 * @param siteWide - what the site's sheet and `head.html` supply (see {@link siteWideMetadata})
 * @returns the rows to rebuild, title first, then the head's order; empty when none
 */
export function authoredPageMetadata(
    pageHtml: string,
    plainHtml: string,
    siteWide: SiteWideMetadata,
): PageMetadataEntry[] {
    const head = pageHtml.split(/<\/head>/i)[0];
    const entries: PageMetadataEntry[] = [];
    const titleMatch = /<title>([^]*?)<\/title>/i.exec(head);
    const title = titleMatch ? textOf(titleMatch[1]) : '';
    const titleFromSheet = siteWide.sheetValues.title === title;
    if (title && !titleFromSheet && !isDerivedTitle(title, plainHtml)) {
        entries.push({ key: 'Title', value: title });
    }
    for (const tag of readMetaTags(head)) {
        if (isAuthored(tag, plainHtml, siteWide)) {
            entries.push({ key: toAuthoredKey(tag.name.toLowerCase()), value: tag.content });
        }
    }
    return entries;
}

/** The renderer's `globToRegExp`: `**` any depth, `*` one segment's worth. */
function globToRegExp(glob: string): RegExp | null {
    const source = glob
        .split('**')
        .join('|')
        .split('*')
        .join('[0-9a-z-.]*')
        .split('|')
        .join('.*');
    try {
        return new RegExp(`^${source}$`);
    } catch {
        return null;
    }
}

function urlMatches(url: string, webPath: string): boolean {
    if (!url.includes('*')) return url === webPath;
    return globToRegExp(url)?.test(webPath) ?? false;
}

/** One sheet row's values, by meta name: a key/value pair, else every named column. */
function rowValues(row: Record<string, unknown>): Array<[string, string]> {
    const lower = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]));
    const { url: _url, key, value, ...rest } = lower;
    if (typeof key === 'string' && typeof value === 'string' && key && value) {
        return [[toMetaName(key), value]];
    }
    return Object.entries(rest)
        .filter((pair): pair is [string, string] => typeof pair[1] === 'string' && !!pair[1])
        .map(([k, v]) => [toMetaName(k), v]);
}

/**
 * What the site supplies to one page: the meta names in its `head.html`, and the
 * sheet rows that match the page's URL (the renderer's `Modifiers.getModifiers`).
 *
 * @param headHtml - the site's `head.html`, or `''` when it has none
 * @param sheet - the site's parsed `/metadata.json`; anything without a `data` list is no sheet
 * @param webPath - the page's web path (`/customer/account`, `/`)
 */
export function siteWideMetadata(headHtml: string, sheet: unknown, webPath: string): SiteWideMetadata {
    const headHtmlNames = new Set(readMetaTags(headHtml).map((t) => t.name.toLowerCase()));
    const rows = (sheet as { data?: unknown } | undefined)?.data;
    const sheetValues: Record<string, string> = {};
    if (!Array.isArray(rows)) return { headHtmlNames, sheetValues };
    for (const row of rows as Array<Record<string, unknown>>) {
        const url = row.URL ?? row.url;
        if (typeof url !== 'string' || !url || !urlMatches(url, webPath)) continue;
        for (const [name, value] of rowValues(row)) sheetValues[name] = value;
    }
    return { headHtmlNames, sheetValues };
}

/**
 * Add a `metadata` block to the end of the page's last section.
 *
 * The block has the shape this copy already writes for `section-metadata` (the
 * `.plain.html` shape, stored by DA.live as written): one `<div>` row per entry,
 * a key cell and a value cell.
 *
 * @returns the page unchanged when there are no entries
 */
export function appendMetadataBlock(plainHtml: string, entries: PageMetadataEntry[]): string {
    if (entries.length === 0) return plainHtml;
    const rows = entries
        .map((e) => `<div><div>${escapeHtml(e.key)}</div><div>${escapeHtml(e.value)}</div></div>`)
        .join('');
    const block = `<div class="metadata">${rows}</div>`;
    const end = plainHtml.lastIndexOf('</div>');
    if (end < 0) return `${plainHtml}<div>${block}</div>`;
    return `${plainHtml.slice(0, end)}${block}${plainHtml.slice(end)}`;
}

/** A CDN read: the body when 200, `''` when 404, `undefined` when it could not be read. */
async function readCdnText(url: string): Promise<string | undefined> {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUTS.NORMAL) });
        if (response.status === 404) return '';
        return response.ok ? await response.text() : undefined;
    } catch {
        return undefined;
    }
}

function parseSheet(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

/**
 * Read the source page's head and work out its own metadata. Best-effort: anything
 * that cannot be read leaves the page as it was copied before (no block), never fails
 * the copy. The site's `head.html` and sheet are read only when the page shows a
 * candidate, so most pages cost one extra read.
 *
 * @param sourceBaseUrl - the source CDN (`https://main--site--org.aem.live`)
 * @param sourcePath - the page's web path
 * @param plainHtml - the page's `.plain.html` as read from the source, before patches
 */
export async function readAuthoredPageMetadata(
    sourceBaseUrl: string,
    sourcePath: string,
    plainHtml: string,
    logger: Logger,
): Promise<PageMetadataEntry[]> {
    const pageHtml = await readCdnText(`${sourceBaseUrl}${sourcePath}`);
    if (!pageHtml) {
        logger.debug(`[DA.live] Page metadata not read for ${sourcePath}: page head unavailable`);
        return [];
    }
    const quick = { headHtmlNames: KNOWN_HEAD_HTML_NAMES, sheetValues: NO_SITE_WIDE.sheetValues };
    if (authoredPageMetadata(pageHtml, plainHtml, quick).length === 0) return [];

    const [headHtml, sheetText] = await Promise.all([
        readCdnText(`${sourceBaseUrl}/head.html`),
        readCdnText(`${sourceBaseUrl}/metadata.json`),
    ]);
    if (headHtml === undefined || sheetText === undefined) {
        logger.debug(`[DA.live] Page metadata not rebuilt for ${sourcePath}: site head/sheet unreadable`);
        return [];
    }
    const siteWide = siteWideMetadata(headHtml, sheetText ? parseSheet(sheetText) : undefined, sourcePath);
    return authoredPageMetadata(pageHtml, plainHtml, siteWide);
}
