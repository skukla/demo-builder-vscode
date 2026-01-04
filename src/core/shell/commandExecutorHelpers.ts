/**
 * CommandExecutor Helper Functions
 *
 * Extracted from commandExecutor.ts for improved testability and
 * adherence to SOP file size guidelines (<500 lines).
 *
 * These pure/near-pure functions handle:
 * - Adobe CLI command detection and defaults
 * - fnm command wrapping for Node version isolation
 * - Result caching lookup and storage
 */

import type { ExecuteOptions, CommandResult } from './types';
import type { CommandResultCache } from './commandResultCache';
import type { RetryStrategyManager } from './retryStrategyManager';
import { DEFAULT_SHELL } from '@/types/shell';

/**
 * Check if a command is an Adobe CLI command
 */
export function isAdobeCLICommand(command: string): boolean {
    return command.startsWith('aio ') || command.startsWith('aio-');
}

/**
 * Apply default options for Adobe CLI commands
 * Returns a new options object with defaults applied
 */
export function applyAdobeCliDefaults(
    options: ExecuteOptions,
    retryManager: RetryStrategyManager,
): ExecuteOptions {
    const result = { ...options };

    if (result.shell === undefined) {
        result.shell = DEFAULT_SHELL;
    }
    if (result.configureTelemetry === undefined) {
        result.configureTelemetry = false;
    }
    if (result.enhancePath === undefined) {
        result.enhancePath = true;
    }
    if (result.useNodeVersion === undefined) {
        result.useNodeVersion = null;
    }
    if (!result.retryStrategy) {
        result.retryStrategy = retryManager.getStrategy('adobe-cli');
    }

    return result;
}

/**
 * Build an fnm-wrapped command for Node version isolation
 * Returns the modified command and shell option
 */
export function buildFnmCommand(
    command: string,
    nodeVersion: string,
    fnmPath: string | null,
): { command: string; shell: string | undefined } {
    if (fnmPath && nodeVersion !== 'current') {
        return {
            command: `${fnmPath} exec --using=${nodeVersion} ${command}`,
            shell: '/bin/zsh',
        };
    }

    if (nodeVersion === 'current') {
        return {
            command: `eval "$(fnm env)" && ${command}`,
            shell: '/bin/zsh',
        };
    }

    return { command, shell: undefined };
}

/**
 * Enhance environment with additional PATH entries
 * Returns a new env object with PATH prepended
 */
export function enhanceEnvironmentPath(
    existingEnv: NodeJS.ProcessEnv | undefined,
    extraPaths: string[],
): NodeJS.ProcessEnv {
    return {
        ...process.env,
        ...existingEnv,
        PATH: `${extraPaths.join(':')}:${process.env.PATH || ''}`,
    };
}

/**
 * Look up a cached result for Adobe CLI commands
 * Returns the cached result if found, undefined otherwise
 */
export function lookupCachedResult(
    command: string,
    effectiveNodeVersion: string | null,
    resultCache: CommandResultCache,
): CommandResult | undefined {
    if (command === 'aio --version') {
        return resultCache.getVersionResult(command, effectiveNodeVersion);
    }

    if (command === 'aio plugins') {
        return resultCache.getPluginsResult(command, effectiveNodeVersion);
    }

    return undefined;
}

/**
 * Store a successful result in the cache for Adobe CLI commands
 */
export function storeCachedResult(
    command: string,
    effectiveNodeVersion: string | null,
    result: CommandResult,
    resultCache: CommandResultCache,
): void {
    if (command === 'aio --version') {
        resultCache.setVersionResult(command, effectiveNodeVersion, result);
    } else if (command === 'aio plugins') {
        resultCache.setPluginsResult(command, effectiveNodeVersion, result);
    }
}
