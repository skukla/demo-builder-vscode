/**
 * The ONE PrerequisitesManager for the session.
 *
 * WHY THIS EXISTS. `PrerequisitesManager` owns a `PrerequisitesCacheManager`
 * whose whole job is to skip repeated CLI checks — a cache hit costs under 10ms
 * where a miss costs 500–3000ms of `aio`/`node`/`npm` invocations. It was built
 * inside `createPanelHandlerContext`, which every webview surface calls PER
 * INCOMING MESSAGE (17 call sites across six surfaces). So the cache was empty
 * every time it was consulted and could never hit — proven, before this module
 * existed, in `tests/features/prerequisites/services/prerequisiteCacheLifetime.test.ts`.
 *
 * Nothing in the manager is per-project (zero references to a project or a
 * project path); it reads one config file off the extension path and caches CLI
 * results. So one per session is not a compromise — it is what the cache assumed
 * all along.
 *
 * SAME SHAPE AS `edsServiceCache`, deliberately. That module memoises the EDS
 * clients for the same reason (`GitHubTokenService` holds a token-validation
 * cache) and is a recognised composition point for it. Memoising here rather
 * than threading the manager through six call sites keeps the change to the two
 * factories that build the context.
 *
 * @module features/prerequisites/services/prerequisitesManagerInstance
 */

import { PrerequisitesManager } from './PrerequisitesManager';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { Logger } from '@/types/logger';
import { PrerequisitesCacheManager } from './prerequisitesCacheManager';

let instance: PrerequisitesManager | undefined;

/**
 * The session's PrerequisitesManager, built on first use.
 *
 * Its dependencies arrive as PARAMETERS rather than being fetched here — this is
 * a service file, and ADR-015 confines locator lookups to the boundary. The two
 * composition points that call this are allowed to fetch and already did; the
 * first version of this module reached for the executor itself and the fetch-
 * boundary check caught it the same day.
 *
 * @param extensionPath - where `prerequisites.json` lives; identical on every
 *   call within a session, so the first caller's value wins.
 * @param logger - used only when constructing.
 * @param commandExecutor - likewise; the memoised manager keeps the first one.
 */
export function getPrerequisitesManager(
    extensionPath: string,
    logger: Logger,
    commandExecutor: CommandExecutor,
): PrerequisitesManager {
    if (!instance) {
        instance = new PrerequisitesManager(
            extensionPath,
            logger,
            commandExecutor,
            // Hand it the logger we already hold. Its constructor falls back to the
            // global getLogger(), which THROWS when none is initialised — and that
            // reached a suite the moment the cache stopped being built inside the
            // manager, where a module mock had been hiding it.
            new PrerequisitesCacheManager(logger),
        );
    }
    return instance;
}

/**
 * Drop the instance.
 *
 * For tests, and for the extension-host reload path — a stale manager would
 * carry a cache built against the previous session's CLI state.
 */
export function resetPrerequisitesManager(): void {
    instance = undefined;
}
