/**
 * Bundle URI Utility
 *
 * Consolidates the webview bundle URI construction pattern that was duplicated
 * across 4 command files. Creates VS Code webview URIs for webpack's 4-bundle
 * code-splitting pattern (runtime, vendors, common, feature).
 *
 * This utility eliminates ~60 lines of duplicated code while maintaining
 * type safety with the existing BundleUris interface.
 *
 * @module core/utils/bundleUri
 */

import * as path from 'path';
import * as vscode from 'vscode';

// Re-export BundleUris type from getWebviewHTMLWithBundles for convenience
export type { BundleUris } from './getWebviewHTMLWithBundles';

/**
 * Options for creating bundle URIs.
 */
export interface BundleUriOptions {
    /** VS Code webview instance (from panel.webview) */
    webview: vscode.Webview;

    /** Extension installation path (from context.extensionPath) */
    extensionPath: string;

    /** Feature-specific bundle name (e.g., 'dashboard', 'wizard', 'configure') */
    featureBundleName: string;
}

/**
 * Creates bundle URIs for webpack code-split bundles.
 *
 * Webpack code splitting requires loading bundles in order:
 * 1. runtime (webpack runtime and chunk loading)
 * 2. vendors (React, Spectrum, third-party libraries)
 * 3. common (shared code including WebviewClient)
 * 4. feature (feature-specific code)
 *
 * This pattern eliminates single-bundle timeout issues in VS Code webviews.
 *
 * @param options - Bundle URI creation options
 * @returns BundleUris object compatible with getWebviewHTMLWithBundles
 *
 * @example
 * ```typescript
 * const bundleUris = createBundleUris({
 *     webview: this.panel!.webview,
 *     extensionPath: this.context.extensionPath,
 *     featureBundleName: 'dashboard',
 * });
 *
 * return getWebviewHTMLWithBundles({
 *     bundleUris,
 *     nonce,
 *     cspSource: this.panel!.webview.cspSource,
 *     title: 'Project Dashboard',
 * });
 * ```
 */
export function createBundleUris(options: BundleUriOptions): import('./getWebviewHTMLWithBundles').BundleUris {
    const { webview, extensionPath, featureBundleName } = options;

    const webviewPath = path.join(extensionPath, 'dist', 'webview');

    return {
        runtime: webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'runtime-bundle.js')),
        ),
        vendors: webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'vendors-bundle.js')),
        ),
        common: webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'common-bundle.js')),
        ),
        feature: webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, `${featureBundleName}-bundle.js`)),
        ),
    };
}
