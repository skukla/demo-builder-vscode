/**
 * The storefront's static `404.html`, which Helix serves for any missing page (EDS-45).
 *
 * The file carries its OWN import map. On `adobe-commerce/boilerplate-b2b-template` that map
 * names 4 dropins while `head.html`'s names 18, and the start-up code loads the company
 * switcher whenever `commerce-companies-enabled` is on, a flag Demo Builder sets for B2B
 * packages. The import fails, the page never initialises, and every missing page draws blank
 * (measured on skukla/my-commerce-demo and skukla/kukla-justrite, 2026-10-15; the non-B2B
 * boilerplate renders because its start-up code needs only what its 404 map names).
 *
 * The fix reads the list from the site's own `head.html`, so nothing is hardcoded and it keeps
 * up when the template adds dropins. It only ADDS entries: an entry the 404 page already maps,
 * however it maps it, is left alone, and an unreadable map is not touched at all.
 *
 * The alignment is one of the storefront repairs (`storefrontRepairs.ts`), and is
 * written by the one step that runs them (`storefrontUpToDate.ts`), together with the
 * product-page eager redirect when BYOM is on: two writes to the file in a row race on its sha.
 *
 * @module features/eds/services/storefront/notFoundPage
 */

const IMPORT_MAP = /<script\b[^>]*\btype=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i;

/** The `imports` of a page's import map, or null when it has none or it does not parse. */
function readImports(html: string): Record<string, string> | null {
    const body = IMPORT_MAP.exec(html)?.[1];
    if (body === undefined) return null;
    try {
        const parsed = JSON.parse(body) as { imports?: unknown };
        const imports = parsed.imports;
        return imports && typeof imports === 'object' ? (imports as Record<string, string>) : null;
    } catch {
        return null;
    }
}

/**
 * The 404 page with every import-map entry `head.html` has and it lacks, added as lines in
 * the page's own indentation after its last entry. Nothing else in the file moves.
 *
 * @param headHtml - the site's head.html
 * @param notFoundHtml - the site's 404.html
 * @returns the aligned page, or null when nothing is missing or either map cannot be read
 */
export function alignNotFoundImportMap(headHtml: string, notFoundHtml: string): string | null {
    const wanted = readImports(headHtml);
    const has = readImports(notFoundHtml);
    if (!wanted || !has) return null;
    const missing = Object.keys(wanted).filter((key) => !(key in has));
    if (missing.length === 0) return null;

    // The last entry line inside the 404 page's map: the new lines go after it.
    const keys = Object.keys(has);
    const lastKey = keys[keys.length - 1];
    if (lastKey === undefined) return null;
    const lastEntry = new RegExp(`^([ \\t]*)${JSON.stringify(lastKey).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s*:\\s*"[^"\\n]*"`, 'm');
    const found = lastEntry.exec(notFoundHtml);
    if (!found) return null;
    const indent = found[1];
    const added = missing.map((key) => `${indent}${JSON.stringify(key)}: ${JSON.stringify(wanted[key])}`);
    const end = found.index + found[0].length;
    const aligned = `${notFoundHtml.slice(0, end)},\n${added.join(',\n')}${notFoundHtml.slice(end)}`;

    // Proof it still parses and gained exactly what was missing; anything else is not written.
    const check = readImports(aligned);
    return check && missing.every((key) => check[key] === wanted[key]) ? aligned : null;
}
