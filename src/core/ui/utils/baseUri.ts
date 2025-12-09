/**
 * Base URI utility for webview media assets
 *
 * Provides access to the webview's base URI for resolving media asset paths.
 * The base URI is injected by the extension host via window.__WEBVIEW_BASE_URI__.
 */

declare global {
    interface Window {
        __WEBVIEW_BASE_URI__?: string;
    }
}

/**
 * Get the webview's base URI for media assets
 * @returns The base URI string, or undefined if not set
 */
export function getBaseUri(): string | undefined {
    return window.__WEBVIEW_BASE_URI__;
}

/**
 * Resolve a media path to a full URI
 * @param path - Relative path within media directory (e.g., "help/screenshot.png")
 * @returns Full URI string, or the original path if baseUri is not set
 */
export function resolveMediaPath(path: string): string {
    const baseUri = getBaseUri();
    if (!baseUri) {
        return path;
    }
    return `${baseUri}/media/${path}`;
}
