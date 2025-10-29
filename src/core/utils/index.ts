/**
 * Core Utilities
 *
 * Infrastructure utilities for webviews, progress tracking, and configuration.
 */

export { generateWebviewHTML } from './webviewHTMLBuilder';
export type { WebviewHTMLOptions } from './webviewHTMLBuilder';

export { extractEnvVars, extractEnvVarsSync } from './envVarExtraction';

export { ProgressUnifier } from './progressUnifier';
export type {
    UnifiedProgress
} from './progressUnifier';

export { setLoadingState } from './loadingHTML';

export { TIMEOUTS } from './timeoutConfig';

export * from './promiseUtils';
