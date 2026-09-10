/**
 * Adobe Entity Service Factory
 *
 * Creates and wires the three specialized services for managing Adobe entities
 * (organizations, projects, workspaces). Handles the initialization order
 * required by their cross-dependencies.
 *
 * Architecture:
 * ```
 * createEntityServices()
 * ├── AdobeEntityFetcher   — Fetch via SDK with CLI fallback
 * ├── AdobeContextResolver — Resolve current CLI context
 * └── AdobeEntitySelector  — Select entities via CLI commands
 * ```
 */

import { AdobeContextResolver } from './adobeContextResolver';
import { AdobeEntityFetcher } from './adobeEntityFetcher';
import { AdobeEntitySelector } from './adobeEntitySelector';
import type { AdobeSDKClient } from './adobeSDKClient';
import type { AuthCacheManager } from './authCacheManager';
import type { StepLogger } from '@/core/logging/stepLogger';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { Logger } from '@/types/logger';

export interface EntityServices {
    fetcher: AdobeEntityFetcher;
    resolver: AdobeContextResolver;
    selector: AdobeEntitySelector;
}

/**
 * Create and wire the entity sub-services.
 *
 * The Fetcher needs a callback to Selector.clearConsoleContext() (when no
 * orgs are accessible), so the Selector is built first. The Selector takes
 * only the executor and the cache, so there is no cycle to break.
 */
export function createEntityServices(
    commandManager: CommandExecutor,
    sdkClient: AdobeSDKClient,
    cacheManager: AuthCacheManager,
    logger: Logger,
    stepLogger: StepLogger,
    /**
     * Answers "is the session actually still valid?" before the fetcher tells a
     * user it expired. Optional so existing callers and tests are unaffected; when
     * absent the fetcher keeps its previous, blunter assertion.
     */
    isTokenValid?: () => Promise<boolean>,
): EntityServices {
    const selector = new AdobeEntitySelector(
        commandManager,
        cacheManager,
    );

    const fetcher = new AdobeEntityFetcher(
        commandManager,
        sdkClient,
        cacheManager,
        logger,
        stepLogger,
        {
            onNoOrgsAccessible: () => selector.clearConsoleContext(),
            ...(isTokenValid ? { isTokenValid } : {}),
        },
    );

    const resolver = new AdobeContextResolver(
        commandManager,
        cacheManager,
        fetcher,
    );

    return { fetcher, resolver, selector };
}
