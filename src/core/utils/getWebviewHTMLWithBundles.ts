/**
 * Webview HTML Generator with 4-Bundle Pattern
 *
 * This module provides a reusable helper for generating webview HTML with webpack's
 * 4-bundle code-splitting pattern (runtime, vendors, common, feature).
 *
 * This pattern eliminates single-bundle timeout issues that occur when loading
 * large bundles in VS Code webviews.
 *
 * @module core/utils/getWebviewHTMLWithBundles
 */

import * as vscode from 'vscode';

/**
 * Bundle URIs for webpack code-split bundles.
 * Must be loaded in this specific order:
 * 1. runtime - Webpack runtime and chunk loading logic
 * 2. vendors - Third-party libraries (React, Spectrum, etc.)
 * 3. common - Shared application code (WebviewClient, shared components)
 * 4. feature - Feature-specific bundle (wizard, dashboard, configure, welcome)
 */
export interface BundleUris {
    /** Webpack runtime bundle (chunk loading logic) */
    runtime: vscode.Uri;
    /** Third-party vendor libraries (React, Spectrum) */
    vendors: vscode.Uri;
    /** Shared application code (WebviewClient) */
    common: vscode.Uri;
    /** Feature-specific code (wizard, dashboard, etc.) */
    feature: vscode.Uri;
}

/**
 * Options for generating webview HTML with 4-bundle pattern.
 */
export interface WebviewHTMLWithBundlesOptions {
    /** Bundle URIs in load order (runtime, vendors, common, feature) */
    bundleUris: BundleUris;

    /** Cryptographic nonce for CSP script-src directive */
    nonce: string;

    /** CSP source for webview resources (e.g., webview.cspSource) */
    cspSource: string;

    /** Webview title (displays in tab) */
    title: string;

    /** Optional: Additional image sources for CSP img-src directive */
    additionalImgSources?: string[];
}

/**
 * Generates HTML for VS Code webview with webpack 4-bundle pattern.
 *
 * This helper extracts the working pattern from showWelcome.ts (lines 72-116)
 * into a reusable function to eliminate single-bundle timeout issues.
 *
 * Bundle loading order is critical:
 * 1. runtime-bundle.js - Webpack runtime and chunk loading logic
 * 2. vendors-bundle.js - React, Spectrum, and third-party libraries
 * 3. common-bundle.js - Shared code including WebviewClient
 * 4. [feature]-bundle.js - Feature-specific code (wizard, dashboard, etc.)
 *
 * CSP Compliance:
 * - All script tags use same nonce for Content-Security-Policy
 * - No inline scripts allowed
 * - cspSource must match webview's cspSource property
 *
 * @param options - Configuration for HTML generation
 * @returns Well-formed HTML5 document string
 * @throws Error if nonce is empty (CSP requirement)
 *
 * @example
 * ```typescript
 * const html = getWebviewHTMLWithBundles({
 *   bundleUris: {
 *     runtime: panel.webview.asWebviewUri(runtimePath),
 *     vendors: panel.webview.asWebviewUri(vendorsPath),
 *     common: panel.webview.asWebviewUri(commonPath),
 *     feature: panel.webview.asWebviewUri(wizardPath)
 *   },
 *   nonce: getNonce(),
 *   cspSource: panel.webview.cspSource,
 *   title: 'Demo Builder Wizard'
 * });
 * ```
 */
export function getWebviewHTMLWithBundles(options: WebviewHTMLWithBundlesOptions): string {
    const {
        bundleUris,
        nonce,
        cspSource,
        title,
        additionalImgSources = [],
    } = options;

    // Validate required nonce for CSP
    if (!nonce || nonce.trim() === '') {
        throw new Error('Nonce is required for CSP compliance');
    }

    // Build img-src directive: default sources + additional
    const imgSources = ['https:', 'data:', ...additionalImgSources].join(' ');

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
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${bundleUris.runtime}"></script>
    <script nonce="${nonce}" src="${bundleUris.vendors}"></script>
    <script nonce="${nonce}" src="${bundleUris.common}"></script>
    <script nonce="${nonce}" src="${bundleUris.feature}"></script>
</body>
</html>`;
}
