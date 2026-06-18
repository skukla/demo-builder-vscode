/**
 * Commands module barrel export
 * Provides clean imports for all command execution functionality
 */

// Main executor
export { CommandExecutor } from './commandExecutor';

// Sub-services
export { EnvironmentSetup } from './environmentSetup';
export { RetryStrategyManager } from './retryStrategyManager';
export { ResourceLocker } from './resourceLocker';
export { PollingService } from './pollingService';
export { FileWatcher } from './fileWatcher';
export { CommandSequencer } from './commandSequencer';

// Shared component build step (mesh + app deploy)
export { buildComponent } from './buildComponent';
export type { BuildComponentOptions } from './buildComponent';

// Org-context targeting (per-invocation AIO_CONSOLE_* env)
export {
    buildAioConsoleEnv,
    buildOrgTargetFromProjectAdobe,
    withOrgContext,
    getActiveOrgContext,
} from './orgContextEnv';

// Types
export type {
    CommandResult,
    RetryStrategy,
    PollOptions,
    ExecuteOptions,
    CommandRequest,
    CommandConfig,
} from './types';
export type { OrgContextTarget, CachedOrgRef, ProjectAdobeRef } from './orgContextEnv';
