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
import type { OrganizationValidator } from './organizationValidator';
import type { StepLogger } from '@/core/logging';
import type { CommandExecutor } from '@/core/shell';
import type { Logger } from '@/types/logger';

export interface EntityServices {
    fetcher: AdobeEntityFetcher;
    resolver: AdobeContextResolver;
    selector: AdobeEntitySelector;
}

/**
 * Create and wire the entity sub-services.
 *
 * Handles the Fetcher↔Selector cross-dependency: Fetcher needs a callback
 * to Selector.clearConsoleContext() (when no orgs are accessible), while
 * Selector depends on Fetcher (to populate cache after selection). A mutable
 * reference resolves this initialization-order constraint.
 */
export function createEntityServices(
    commandManager: CommandExecutor,
    sdkClient: AdobeSDKClient,
    cacheManager: AuthCacheManager,
    organizationValidator: OrganizationValidator,
    logger: Logger,
    stepLogger: StepLogger,
): EntityServices {
    // Mutable reference for the Fetcher → Selector callback
    const selectorContainer: { ref?: AdobeEntitySelector } = {};

    const fetcher = new AdobeEntityFetcher(
        commandManager,
        sdkClient,
        cacheManager,
        logger,
        stepLogger,
        {
            onNoOrgsAccessible: async () => {
                if (selectorContainer.ref) {
                    await selectorContainer.ref.clearConsoleContext();
                }
            },
        },
    );

    const resolver = new AdobeContextResolver(
        commandManager,
        cacheManager,
        fetcher,
    );

    const selector = new AdobeEntitySelector(
        commandManager,
        cacheManager,
        organizationValidator,
        fetcher,
        resolver,
        logger,
        stepLogger,
    );

    selectorContainer.ref = selector;

    return { fetcher, resolver, selector };
}
