/**
 * The one place CommandExecutor's machinery is assembled.
 *
 * ADR-015 permits construction in `extension.ts` and in a feature's
 * `create...Deps` file. This is that file for the shell: it exists so
 * `extension.ts` reads as one call rather than seven `new`s, and so tests can
 * hand in plain fakes instead of module-mocking six modules to reach past a
 * constructor.
 *
 * @module core/shell/commandExecutorDeps
 */

import { CommandResultCache } from './commandResultCache';
import { CommandSequencer } from './commandSequencer';
import type { CommandExecutorDeps } from './commandExecutor';
import { EnvironmentSetup } from './environmentSetup';
import { FileWatcher } from './fileWatcher';
import { PollingService } from './pollingService';
import { ResourceLocker } from './resourceLocker';
import { RetryStrategyManager } from './retryStrategyManager';

/** Build the real machinery. Overrides are for tests that vary ONE part. */
export function createCommandExecutorDeps(
    overrides: Partial<CommandExecutorDeps> = {},
): CommandExecutorDeps {
    const pollingService = overrides.pollingService ?? new PollingService();
    return {
        environmentSetup: overrides.environmentSetup ?? new EnvironmentSetup(),
        retryManager: overrides.retryManager ?? new RetryStrategyManager(),
        resourceLocker: overrides.resourceLocker ?? new ResourceLocker(),
        pollingService,
        // FileWatcher polls; it shares the executor's polling service rather
        // than starting a second one, which is what it did when it built its own.
        fileWatcher: overrides.fileWatcher ?? new FileWatcher(pollingService),
        commandSequencer: overrides.commandSequencer ?? new CommandSequencer(),
        resultCache: overrides.resultCache ?? new CommandResultCache(),
    };
}
