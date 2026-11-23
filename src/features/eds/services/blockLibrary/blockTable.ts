/**
 * Cuts the blocks out of a page's `.plain.html`, the way DA.live's Import Blocks does
 * (adobe/da-live `blocks/config/blocks-import/blocks.js`, Apache-2.0).
 *
 * A block is a classed div directly inside a section (a top-level div), named by its first class.
 * Its example is its INNER html, settings rows included, with active content dropped first. There
 * is no DOM here, so sanitize-html does the drop and unwrap and a div scanner finds the blocks.
 *
 * Examples are copied from other people's public sites into the SC's site, so event-handler
 * attributes and unsafe link and image URLs go too: Adobe gets that from a DA round trip and
 * `dropUnsafeUrls`, which this path does not have.
 */

import sanitizeHtml from 'sanitize-html';
import { isSafeSrcset, isSafeUrl } from './safeUrl';

/** One instance of a block on a page: its style variant and its inner HTML. */
export interface VariantExample {
    variant: string;
    html: string;
}

/** One instance of a block on a page, with the block's name. */
export interface PageBlock extends VariantExample {
    name: string;
}

// Mirrors adobe/da-live blocks/config/blocks-import/blocks.js `isBlockName` (Import Blocks).
export const isBlockName = (name: string): boolean => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);

// Mirrors adobe/da-live blocks/config/blocks-import/blocks.js `DROP` (Import Blocks' preClean).
const DROP = new Set([
    'script', 'style', 'link', 'meta', 'base', 'iframe', 'frame', 'object', 'embed', 'svg', 'math',
    'template', 'noscript', 'form', 'input', 'select', 'textarea', 'button',
    'hr', 'table', 'da-loc-deleted', 'da-diff-deleted',
]);
// Mirrors adobe/da-live blocks/config/blocks-import/blocks.js `UNWRAP` (Import Blocks' preClean).
const UNWRAP = new Set(['da-loc-added', 'da-diff-added']);

/** Written without a closing tag, as a browser serializes them. */
const VOID_TAGS = [
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track',
    'wbr',
];

const DIV_TAG = /<div\b[^>]*>|<\/div>/g;
const CLASS_ATTR = /\sclass="([^"]*)"/;

/** Set on an element the filter must remove; never written, since the element goes. */
const UNSAFE_MARK = 'data-db-unsafe';
type UnsafeVerdict = 'unwrap' | 'drop';
type Attributes = Record<string, string>;

// Mirrors adobe/da-live blocks/config/blocks-import/blocks.js `dropUnsafeUrls` (Import Blocks):
// an unsafe link keeps its text, an unsafe image or picture source goes.
function unsafeVerdict(tag: string, attribs: Attributes): UnsafeVerdict | undefined {
    if (tag === 'a') return isSafeUrl(attribs.href) ? undefined : 'unwrap';
    if (tag === 'img') return isSafeUrl(attribs.src) ? undefined : 'drop';
    if (tag === 'source') return isSafeSrcset(attribs.srcset) ? undefined : 'drop';
    return undefined;
}

/** Drops every `on*` attribute and marks an element with an unsafe URL for the filter. */
function markUnsafe(
    tagName: string,
    attribs: Attributes,
): { tagName: string; attribs: Attributes } {
    const kept = Object.fromEntries(Object.entries(attribs)
        .filter(([name]) => !/^on/i.test(name) && name !== UNSAFE_MARK));
    const verdict = unsafeVerdict(tagName, attribs);
    return { tagName, attribs: verdict ? { ...kept, [UNSAFE_MARK]: verdict } : kept };
}

function cleanVerdict(tag: string, attribs: Attributes): boolean | 'excludeTag' {
    const unsafe = attribs[UNSAFE_MARK];
    if (DROP.has(tag) || unsafe === 'drop') return true;
    return UNWRAP.has(tag) || unsafe === 'unwrap' ? 'excludeTag' : false;
}

// Mirrors adobe/da-live blocks/config/blocks-import/blocks.js `preClean` (Import Blocks), run once
// over the page instead of per block: DROP elements go with their content, UNWRAP keeps content.
function preClean(html: string): string {
    return sanitizeHtml(html, {
        allowedTags: false,
        allowedAttributes: false,
        allowVulnerableTags: true,
        selfClosing: VOID_TAGS,
        parser: { decodeEntities: false },
        transformTags: { '*': markUnsafe },
        exclusiveFilter: (frame) => cleanVerdict(frame.tag, frame.attribs),
    });
}

/** The block's name and classes when the opening tag is a block's, else undefined. */
function blockClasses(openingTag: string): string[] | undefined {
    const classes = (CLASS_ATTR.exec(openingTag)?.[1] ?? '').split(/\s+/).filter(Boolean);
    return classes.length > 0 && isBlockName(classes[0]) ? classes : undefined;
}

// Mirrors adobe/da-live blocks/config/blocks-import/blocks.js `variantOf` (Import Blocks).
function variantOf(classes: string[]): string {
    return classes.slice(1).filter(isBlockName).join(' ');
}

/** Every block on the page in page order (Import Blocks' `blockElements`, without NOT_BLOCKS). */
export function pageBlocks(html: string): PageBlock[] {
    const page = preClean(html);
    const blocks: PageBlock[] = [];
    let depth = 0;
    let open: { classes: string[]; innerStart: number } | undefined;
    for (const tag of page.matchAll(DIV_TAG)) {
        const index = tag.index ?? 0;
        if (tag[0] !== '</div>') {
            const classes = depth === 1 ? blockClasses(tag[0]) : undefined;
            if (classes) open = { classes, innerStart: index + tag[0].length };
            depth += 1;
            continue;
        }
        depth = Math.max(0, depth - 1);
        if (depth !== 1 || !open) continue;
        const { classes, innerStart } = open;
        blocks.push({
            name: classes[0],
            variant: variantOf(classes),
            html: page.slice(innerStart, index).trim(),
        });
        open = undefined;
    }
    return blocks;
}

// Mirrors adobe/da-live blocks/config/blocks-import/blocks.js `blockExamples` (Import Blocks).
export function blockExamplesFromPlainHtml(html: string, blockId: string): VariantExample[] {
    return pageBlocks(html)
        .filter((block) => block.name === blockId)
        .map(({ variant, html: inner }) => ({ variant, html: inner }));
}
