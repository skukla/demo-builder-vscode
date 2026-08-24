/**
 * Pure helpers for DA.live content operations.
 *
 * Stateless URL/path/HTML transforms extracted from `DaLiveContentOperations`
 * as part of its decomposition. No `this`, no I/O, no logger — just
 * deterministic string work, unit-testable in isolation.
 *
 * Keep this module `vscode`-free (the MCP server constructs the content
 * operations in a separate Node process).
 *
 * @module features/eds/services/daLive/daLiveContentHelpers
 */

import { normalizePath } from './daLiveConstants';

/**
 * Transform plain aem.live HTML into DA.live document HTML.
 *
 * Rewrites relative `media_<hash>` URLs to absolute source-CDN URLs (the Admin
 * API downloads them into the Media Bus during preview), preserves otherwise-empty
 * structural divs (Helix strips empty elements, but EDS blocks depend on them),
 * and wraps the content in the `<body><header/><main>…</main><footer/></body>`
 * shell DA.live expects.
 *
 * @param html - Plain HTML content from an aem.live `.plain.html` endpoint
 * @param sourceBaseUrl - Base URL for the source CDN (e.g. `https://main--site--org.aem.live`)
 * @returns Document HTML formatted for DA.live with absolute image URLs
 */
export function transformHtmlForDaLive(html: string, sourceBaseUrl: string): string {
    let transformed = html;

    // Handle ./media_xxx URLs (most common in .plain.html). Preserve query
    // params — they may carry optimization hints.
    transformed = transformed.replace(
        /(['"])\.\/media_([a-f0-9]+\.[a-z0-9]+)(\?[^'"]*)?(['"])/gi,
        (_match, openQuote, mediaPath, queryParams, closeQuote) => {
            const fullPath = queryParams
                ? `media_${mediaPath}${queryParams}`
                : `media_${mediaPath}`;
            return `${openQuote}${sourceBaseUrl}/${fullPath}${closeQuote}`;
        },
    );

    // Handle /media_xxx URLs (absolute paths without domain).
    transformed = transformed.replace(
        /(['"])\/media_([a-f0-9]+\.[a-z0-9]+)(\?[^'"]*)?(['"])/gi,
        (_match, openQuote, mediaPath, queryParams, closeQuote) => {
            const fullPath = queryParams
                ? `media_${mediaPath}${queryParams}`
                : `media_${mediaPath}`;
            return `${openQuote}${sourceBaseUrl}/${fullPath}${closeQuote}`;
        },
    );

    // Preserve empty structural divs (DA.live/Helix strip empty elements, but
    // EDS blocks like header expect their sections). <p>&nbsp;</p> survives the
    // round-trip conversion.
    transformed = transformed.replace(/<div>(\s*)<\/div>/gi, '<div><p>&nbsp;</p></div>');

    return `<body><header></header><main>${transformed}</main><footer></footer></body>`;
}

/** Build the source CDN URL for fetching content (`.plain.html` for HTML paths). */
export function buildSourceUrl(
    sourceBaseUrl: string,
    sourcePath: string,
    isHtmlPath: boolean,
): string {
    if (!isHtmlPath) {
        return `${sourceBaseUrl}${sourcePath}`;
    }
    if (sourcePath === '/' || sourcePath.endsWith('/')) {
        return `${sourceBaseUrl}${sourcePath}index.plain.html`;
    }
    return `${sourceBaseUrl}${sourcePath}.plain.html`;
}

/** Resolve the DA.live destination path, appending `.html`/`index.html` for HTML content. */
export function resolveDaPath(destPath: string, isHtml: boolean): string {
    let daPath = normalizePath(destPath);
    if (isHtml && !daPath.endsWith('.html')) {
        daPath = daPath === '' || daPath.endsWith('/') ? `${daPath}index.html` : `${daPath}.html`;
    }
    return daPath;
}
