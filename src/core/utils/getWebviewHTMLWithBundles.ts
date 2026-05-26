/**
 * Webview HTML Generator
 *
 * Generates VS Code webview HTML for a single esbuild IIFE bundle.
 * CSS is injected at runtime by the bundle itself (via the cssInjectionPlugin
 * in esbuild.config.js), so no separate <link> tag is needed.
 *
 * @module core/utils/getWebviewHTMLWithBundles
 */

import * as vscode from 'vscode';

export interface WebviewHTMLOptions {
    /** URI of the feature bundle (e.g. dist/webview/wizard-bundle.js) */
    scriptUri: vscode.Uri;

    /** Cryptographic nonce for CSP script-src directive */
    nonce: string;

    /** CSP source for webview resources (webview.cspSource) */
    cspSource: string;

    /** Document title shown in the webview tab */
    title: string;

    /** Additional img-src values for the CSP (default: []) */
    additionalImgSources?: string[];

    /** Base URI for media assets — exposed as window.__WEBVIEW_BASE_URI__ */
    baseUri?: vscode.Uri;
}

/**
 * Returns a well-formed HTML5 document that loads a single esbuild IIFE
 * bundle with a CSP-compliant nonce.
 */
export function getWebviewHTML(options: WebviewHTMLOptions): string {
    const {
        scriptUri,
        nonce,
        cspSource,
        title,
        additionalImgSources = [],
        baseUri,
    } = options;

    if (!nonce || nonce.trim() === '') {
        throw new Error('Nonce is required for CSP compliance');
    }

    const imgSources = [cspSource, 'https:', 'data:', ...additionalImgSources].join(' ');

    const baseUriScript = baseUri
        ? `<script nonce="${nonce}">window.__WEBVIEW_BASE_URI__ = "${baseUri.toString()}";</script>`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        style-src ${cspSource} 'unsafe-inline';
        script-src 'nonce-${nonce}' ${cspSource};
        img-src ${imgSources};
        font-src ${cspSource};
    ">
    <title>${title}</title>
    ${baseUriScript}
</head>
<body style="margin: 0;">
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Legacy alias — kept so callers can be migrated incrementally.
// New code should import getWebviewHTML directly.
// ---------------------------------------------------------------------------
/** @deprecated Use {@link getWebviewHTML} instead */
export const getWebviewHTMLWithBundles = getWebviewHTML as unknown as (
    opts: WebviewHTMLOptions & { bundleUris?: unknown },
) => string;
