/**
 * The site paths a storefront's own JavaScript loads, read out of its code.
 *
 * A storefront needs documents that no content index lists and no page links to:
 * the cart and checkout pages, the fragments its header and footer load, the label
 * sheets its dropins fetch. What they are depends on the code, and an added demo
 * keeps whatever code it was made with. So this reads them from the code in hand
 * instead of from a list (ADR-008's "derive, don't hand-curate", at runtime and for
 * any storefront). EDS-40: a copy of a colleague's demo arrived without 18
 * documents its source serves, every one of them written in its `blocks/` and
 * `scripts/`.
 *
 * What it reads, and nothing harder:
 *
 * - a quoted site-absolute path: `rootLink('/cart')`, `loadFragment('/x')`, the
 *   default beside a `getMetadata('nav')` (`: '/nav'`), a route constant;
 * - a template built only from constants that are plain strings somewhere in the
 *   same file set: `` `${CUSTOMER_PATH}/forgotpassword` ``,
 *   `` `${CUSTOMER_PATH}${ORDER_DETAILS_PATH}` ``. One level: a constant that is
 *   itself built from constants is not followed;
 * - the sheet a `fetchPlaceholders('placeholders/cart.json')` call names.
 *
 * It over-reads on purpose. Every path returned is asked for on the source site
 * before anything is copied (`sitePathProbe`), and a string that is not a document
 * answers 404 there and is dropped. What it must NOT return is a path the source
 * answers that is not authored content, because that would be copied:
 *
 * - anything with a file extension. A file in the repository (`/data/x.json`,
 *   `/scripts/x.js`) is code. A sheet is taken only from the call that fetches a
 *   label sheet, never from a bare `.json` literal: a query index is served in a
 *   sheet's shape, and a copy of the source's would sit where the storefront's own
 *   index belongs.
 *
 * A pure function: files in, de-duplicated sorted paths out. A page is its path
 * (`/cart`); a sheet is the path a browser asks for (`/placeholders/cart.json`).
 *
 * Ported from the ADR-008 feasibility prototype (a `.mjs` under `scripts/`, deleted
 * 2026-10-12 with this module's arrival) and widened: the prototype's page pattern
 * matched only a quoted `/customer/<name>`, which found none of the pages above,
 * and it took any quoted `placeholders/<name>` for a sheet. The producer for the
 * patches repository's drift gate (`skukla/eds-demo-patches`,
 * `scripts/derive-surfaces.mjs`) is a separate program with a different job, a
 * categorised ledger for one pinned boilerplate, and stays where it is.
 *
 * @module features/eds/services/storefrontCodePaths
 */

/** One file of a storefront's repository: its path from the root, and its text. */
export interface StorefrontCodeFile {
    path: string;
    content: string;
}

/** The dropins' vendored bundles: Adobe's code, minified, and no part of this site's routes. */
const VENDORED_DROPINS = 'scripts/__dropins__/';

/**
 * Is this repository file one the reader reads?
 *
 * The storefront's own JavaScript: `.js` under `blocks/` and `scripts/`, without
 * the vendored dropins.
 */
export function isStorefrontCodeFile(path: string): boolean {
    if (!path.endsWith('.js') || path.startsWith(VENDORED_DROPINS)) return false;
    return path.startsWith('blocks/') || path.startsWith('scripts/');
}

/** One or more lower-case segments, as a published page's path is spelt. */
const SITE_PATH = String.raw`(?:\/[a-z0-9][a-z0-9-]*)+`;

/** A quoted site-absolute path, with an optional trailing slash and nothing else. */
const QUOTED_PATH = new RegExp(String.raw`(['"\`])(${SITE_PATH})\/?\1`, 'g');

/** `const NAME = '/a/path'`: a constant that is a plain string. */
const PLAIN_CONSTANT = new RegExp(
    String.raw`\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"])(${SITE_PATH})\/?\2`,
    'g',
);

/** A template literal holding at least one `${…}`, on one line. */
const TEMPLATE = /`([^`\n]*\$\{[^`\n]*)`/g;

/** A template made only of `${NAME}` parts and path text, optionally followed by a query. */
const RESOLVABLE_TEMPLATE = /^((?:\$\{[A-Za-z_$][\w$]*\}|[a-z0-9/-])+)(?:\?.*)?$/;

/** The sheet named by the call that fetches a label sheet. */
const FETCHED_SHEET = /fetchPlaceholders\(\s*(['"`])\/?([a-z0-9][a-z0-9/-]*?)(?:\.json)?\1/g;

/** A whole string that is a site path. */
const WHOLE_SITE_PATH = new RegExp(`^${SITE_PATH}$`);

/** The most values one template may expand to; a name reused in many files is not a route. */
const MAX_EXPANSIONS = 16;

type Constants = Map<string, Set<string>>;

/** Every plain-string path constant in the file set, by name. A name can have several values. */
function collectConstants(files: readonly StorefrontCodeFile[]): Constants {
    const constants: Constants = new Map();
    for (const { content } of files) {
        for (const match of content.matchAll(PLAIN_CONSTANT)) {
            const values = constants.get(match[1]) ?? new Set<string>();
            values.add(match[3]);
            constants.set(match[1], values);
        }
    }
    return constants;
}

/** Every string a template stands for, or none when any part of it is not a known constant. */
function expandTemplate(template: string, constants: Constants): string[] {
    const resolvable = RESOLVABLE_TEMPLATE.exec(template);
    if (!resolvable) return [];

    let expansions = [''];
    for (const part of resolvable[1].split(/(\$\{[^}]+\})/).filter(Boolean)) {
        const name = /^\$\{(.+)\}$/.exec(part)?.[1];
        const values = name ? [...(constants.get(name) ?? [])] : [part];
        expansions = expansions.flatMap((prefix) => values.map((value) => prefix + value));
        if (expansions.length === 0 || expansions.length > MAX_EXPANSIONS) return [];
    }
    return expansions;
}

/** The paths one file's text holds. */
function pathsInFile(content: string, constants: Constants): string[] {
    const found: string[] = [];
    for (const match of content.matchAll(QUOTED_PATH)) found.push(match[2]);
    for (const match of content.matchAll(TEMPLATE)) {
        const expansions = expandTemplate(match[1], constants).map((path) => path.replace(/\/$/, ''));
        found.push(...expansions.filter((path) => WHOLE_SITE_PATH.test(path)));
    }
    for (const match of content.matchAll(FETCHED_SHEET)) found.push(`/${match[2]}.json`);
    return found;
}

/**
 * Read the site paths a storefront's code loads.
 *
 * @param files - the storefront's code files; pass what {@link isStorefrontCodeFile} accepts
 * @returns every path found, once each, sorted: pages as `/cart`, sheets as
 *   `/placeholders/cart.json`
 */
export function deriveStorefrontCodePaths(files: readonly StorefrontCodeFile[]): string[] {
    const constants = collectConstants(files);
    const paths = new Set<string>();
    for (const { content } of files) {
        for (const path of pathsInFile(content, constants)) paths.add(path);
    }
    return [...paths].sort();
}
