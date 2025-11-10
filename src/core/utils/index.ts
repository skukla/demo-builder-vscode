/**
 * Core Utilities
 *
 * Infrastructure utilities for webviews, progress tracking, and configuration.
 */

// Note: generateWebviewHTML has been deprecated and removed
// All webview commands should use getWebviewHTMLWithBundles instead

export { getWebviewHTMLWithBundles } from './getWebviewHTMLWithBundles';
export type { BundleUris, WebviewHTMLWithBundlesOptions } from './getWebviewHTMLWithBundles';

export { extractEnvVars, extractEnvVarsSync } from './envVarExtraction';

export { ProgressUnifier } from './progressUnifier';
export type {
    UnifiedProgress,
} from './progressUnifier';

export { setLoadingState } from './loadingHTML';

export { TIMEOUTS } from './timeoutConfig';

export * from './promiseUtils';
