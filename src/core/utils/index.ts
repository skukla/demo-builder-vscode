/**
 * Core Utilities
 *
 * Infrastructure utilities for webviews, progress tracking, and configuration.
 */

export { getWebviewHTML } from './getWebviewHTMLWithBundles';
export type { WebviewHTMLOptions } from './getWebviewHTMLWithBundles';

export { extractEnvVars, extractEnvVarsSync } from './envVarExtraction';

export { ProgressUnifier, formatElapsedTime } from './progressUnifier';
export type {
    UnifiedProgress,
    IDateProvider,
    ITimerProvider,
    IProcessSpawner,
    ProgressHandler,
    ExecutionContext,
} from './progressUnifier';

export { setLoadingState } from './loadingHTML';

export { TIMEOUTS } from './timeoutConfig';

export { formatDuration, formatMinutes } from './timeFormatting';

export * from './promiseUtils';

export { ExecutionLock } from './executionLock';

export { showWebviewQuickPick, showWebviewQuickPickMany } from './quickPickUtils';
export type { WebviewQuickPickOptions } from './quickPickUtils';

export { parseGitHubUrl } from './githubUrlParser';
export type { GitHubRepoInfo } from './githubUrlParser';

export { openInIncognito } from './browserUtils';

export { showOneTimeTip } from './oneTimeTip';
