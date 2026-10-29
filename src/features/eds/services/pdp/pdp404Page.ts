/**
 * Where the smart-404 scripts sit in a storefront's code — pure text work, no I/O.
 *
 * Two marked blocks, each swapped in place when Demo Builder's copy changes:
 *  - the eager script, in `<head>` of both `head.html` and `404.html` (`pdp404Snippet.ts`
 *    authors it): lowercases a mixed-case product link and hides `<main>` before paint;
 *  - the recovery script, inline at the end of `404.html`'s body: publishes a cold product
 *    or category page and reloads into it.
 *
 * The recovery script lived in `scripts/delayed.js` until 2026-10-29. Adobe's B2B template
 * removed that file on 2026-07-30 (boilerplate-b2b-template d966eff9e: delayed loading now
 * waits for cookie consent in `consent-check.js`), so a storefront built on it had no
 * first-visit recovery: the install skipped with "delayed.js not found". Every template has
 * a `404.html`, Helix serves it for every missing page, and a script inline there needs no
 * helper script of Adobe's and waits for no consent. `withoutDelayedJsHandler` takes the
 * old copy out of a storefront that still has it, so the script never runs twice.
 *
 * Writing the files is not done here: `bringStorefrontUpToDate` writes `404.html` once with
 * every change it needs, and `storefrontCodeBlocks.ts` writes `head.html` and `delayed.js`.
 */

import {
    extractCspNonce,
    replaceMarkedBlock,
    SMART_404_HEAD_MARKER_END,
    SMART_404_HEAD_MARKER_START,
    SMART_404_HEAD_SNIPPET_TEMPLATE,
    SMART_404_MARKER_END,
    SMART_404_MARKER_START,
} from './pdp404Snippet';
import type { Logger } from '@/types/logger';

export const SMART_404_PAGE_MARKER_START = '<!-- === Smart 404 recovery (Demo Builder) === -->';
export const SMART_404_PAGE_MARKER_END = '<!-- === end Smart 404 recovery === -->';

/** What making a block current does to a page: a new page, nothing, or nothing safe. */
export type BlockOutcome =
    | { kind: 'changed'; html: string }
    | { kind: 'current' }
    | { kind: 'skipped'; reason: string };

/** One of Demo Builder's marked blocks in a page. */
export interface PageBlock {
    /** The page's name, for the reason a skip gives. */
    file: string;
    start: string;
    end: string;
    /** Where a page without the block gets it: before this tag, else at the end. */
    before: '</head>' | '</body>';
    /** The block, with the page's CSP nonce on its script. */
    build: (nonce: string) => string;
}

/**
 * Make `block` current in `html`: added where there is none, swapped in place where an
 * older copy is. Skipped, with the reason, where it cannot be done safely: the page has no
 * nonced script to take the CSP nonce from (a script without it would be blocked), or the
 * block has no end marker (where it ends would be a guess).
 *
 * @param html - the page as read
 * @param block - which block, and how to build it
 */
export function withCurrentBlock(html: string, block: PageBlock): BlockOutcome {
    const nonce = extractCspNonce(html);
    if (!nonce) return { kind: 'skipped', reason: `${block.file} has no nonced script tag` };
    const fresh = block.build(nonce);
    if (html.includes(block.start)) {
        const replaced = replaceMarkedBlock(html, block.start, block.end, fresh);
        if (replaced === null) {
            return { kind: 'skipped', reason: `${block.file} has Demo Builder's block with no end marker` };
        }
        return replaced === html ? { kind: 'current' } : { kind: 'changed', html: replaced };
    }
    const at = html.lastIndexOf(block.before);
    return { kind: 'changed', html: at >= 0 ? html.slice(0, at) + fresh + html.slice(at) : html + fresh };
}

/** The eager script's block in `file` (`head.html` or `404.html`). */
export function eagerBlock(file: string): PageBlock {
    return {
        file,
        start: SMART_404_HEAD_MARKER_START,
        end: SMART_404_HEAD_MARKER_END,
        before: '</head>',
        build: (nonce) => SMART_404_HEAD_SNIPPET_TEMPLATE.replace(/__NONCE__/g, nonce),
    };
}

/**
 * The eager script, made current in a 404.html's text. Helix serves this file on 404
 * responses for unknown paths, bypassing `head.html`, so the script head.html carries has
 * to be here too, in `<head>` so it runs before body paint.
 *
 * @param html - the 404.html as read
 * @param logger - says why nothing was written
 * @returns the page with the current script, or null when there is nothing to write
 */
export function withEagerRedirect(html: string, logger: Logger): string | null {
    const outcome = withCurrentBlock(html, eagerBlock('404.html'));
    if (outcome.kind === 'changed') return outcome.html;
    if (outcome.kind === 'current') logger.info('[PDP404] Eager redirect already current in 404.html — skipping');
    else logger.warn(`[PDP404] Eager redirect not added: ${outcome.reason} (the recovery script still runs)`);
    return null;
}

/**
 * The recovery script, made current at the end of a 404.html's body.
 *
 * @param html - the 404.html as read
 * @param handler - the script, built for this storefront (`buildSmart404Snippet`)
 */
export function withRecoveryHandler(html: string, handler: string): BlockOutcome {
    return withCurrentBlock(html, {
        file: '404.html',
        start: SMART_404_PAGE_MARKER_START,
        end: SMART_404_PAGE_MARKER_END,
        before: '</body>',
        build: (nonce) => `\n${SMART_404_PAGE_MARKER_START}\n<script nonce="${nonce}">${handler}</script>\n${SMART_404_PAGE_MARKER_END}\n`,
    });
}

/** What taking the old copy out of `scripts/delayed.js` found. */
export type DelayedJsOutcome = { kind: 'removed'; content: string } | { kind: 'absent' } | { kind: 'half-marked' };

/**
 * `scripts/delayed.js` without Demo Builder's old copy of the recovery script: the marked
 * block, and the one newline either side the old install added with it. Nothing else in
 * the file moves. A start marker with no end marker after it is left alone: where the
 * block ends would be a guess, and a wrong guess cuts the storefront's own code.
 *
 * @param content - delayed.js as read
 */
export function withoutDelayedJsHandler(content: string): DelayedJsOutcome {
    const start = content.indexOf(SMART_404_MARKER_START);
    if (start === -1) return { kind: 'absent' };
    const endMarker = content.indexOf(SMART_404_MARKER_END, start + SMART_404_MARKER_START.length);
    if (endMarker === -1) return { kind: 'half-marked' };
    const from = content[start - 1] === '\n' ? start - 1 : start;
    let to = endMarker + SMART_404_MARKER_END.length;
    if (content[to] === '\n') to += 1;
    return { kind: 'removed', content: content.slice(0, from) + content.slice(to) };
}
