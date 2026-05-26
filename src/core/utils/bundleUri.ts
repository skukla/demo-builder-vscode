/**
 * Bundle URI Utility
 *
 * Returns the webview URI for a feature's esbuild IIFE bundle.
 * Each feature has a single self-contained bundle; no shared
 * runtime/vendors/common split is needed with esbuild.
 *
 * @module core/utils/bundleUri
 */

import * as path from 'path';
import * as vscode from 'vscode';

export interface BundleUriOptions {
    /** VS Code webview instance */
    webview: vscode.Webview;

    /** Extension installation path (context.extensionPath) */
    extensionPath: string;

    /** Bundle name without the suffix, e.g. 'wizard', 'dashboard' */
    featureBundleName: string;
}

/**
 * Returns the webview URI for `dist/webview/<featureBundleName>-bundle.js`.
 */
export function getBundleUri(options: BundleUriOptions): vscode.Uri {
    const { webview, extensionPath, featureBundleName } = options;
    const bundlePath = path.join(
        extensionPath,
        'dist',
        'webview',
        `${featureBundleName}-bundle.js`,
    );
    return webview.asWebviewUri(vscode.Uri.file(bundlePath));
}

// ---------------------------------------------------------------------------
// Legacy alias — kept for incremental migration of callers.
// ---------------------------------------------------------------------------
/** @deprecated Use {@link getBundleUri} instead */
export function createBundleUris(options: BundleUriOptions): {
    runtime: vscode.Uri;
    vendors: vscode.Uri;
    common: vscode.Uri;
    feature: vscode.Uri;
} {
    const uri = getBundleUri(options);
    return { runtime: uri, vendors: uri, common: uri, feature: uri };
}

/** @deprecated Use {@link BundleUriOptions} instead */
export type { BundleUriOptions as BundleUris };
