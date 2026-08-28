/**
 * EDS service instance cache.
 *
 * One place owns the cached GitHub services and the DA.live auth service,
 * because the caches are module-level mutable state: split the accessors from
 * `clearServiceCache` and a caller can clear one copy while another module
 * hands out the stale one.
 *
 * @module features/eds/handlers/edsServiceCache
 */

import * as vscode from 'vscode';
import { DaLiveAuthService } from '../services/daLive/daLiveAuthService';
import { createDaLiveServiceTokenProvider } from '../services/daLive/daLiveContentOperations';
import { GitHubFileOperations } from '../services/github/githubFileOperations';
import { GitHubOAuthService } from '../services/github/githubOAuthService';
import { GitHubRepoOperations } from '../services/github/githubRepoOperations';
import { GitHubTokenService } from '../services/github/githubTokenService';
import { HelixService } from '../services/helix/helixService';
import { ServiceLocator } from '@/core/di';
import { getLogger } from '@/core/logging';
import type { HandlerContext } from '@/types/handlers';

/**
 * GitHub Services - composed from extracted modules
 */
export interface GitHubServices {
    tokenService: GitHubTokenService;
    repoOperations: GitHubRepoOperations;
    fileOperations: GitHubFileOperations;
    oauthService: GitHubOAuthService;
}

/** Cached GitHub services (per extension context) */
let cachedGitHubServices: GitHubServices | null = null;

/** Cached DaLiveAuthService instance (for darkalley OAuth) */
let cachedDaLiveAuthService: DaLiveAuthService | null = null;

/**
 * Get or create GitHub services
 * Returns all GitHub-related services with explicit dependencies
 *
 * Parameter narrowed to the ONE field this actually reads
 * (`context.context.secrets`) — same reason `getDaLiveAuthService` below
 * takes ExtensionContext directly: callers without a full HandlerContext
 * (commands, headless paths) can then call it without a widening cast.
 */
export function getGitHubServices(context: Pick<HandlerContext, 'context'>): GitHubServices {
    const logger = getLogger();
    if (!cachedGitHubServices) {
        logger.debug('[EDS:ServiceCache] Creating NEW GitHub services (no cache)');
        const tokenService = new GitHubTokenService(context.context.secrets, logger);
        const repoOperations = new GitHubRepoOperations(tokenService, ServiceLocator.getCommandExecutor(), logger);
        const fileOperations = new GitHubFileOperations(tokenService, logger);
        const oauthService = new GitHubOAuthService(context.context.secrets, logger);

        cachedGitHubServices = {
            tokenService,
            repoOperations,
            fileOperations,
            oauthService,
        };
        logger.debug('[EDS:ServiceCache] GitHub services created and cached');
    } else {
        logger.debug('[EDS:ServiceCache] Returning CACHED GitHub services');
    }
    return cachedGitHubServices;
}

/**
 * Get or create DaLiveAuthService instance (for darkalley OAuth).
 * Accepts ExtensionContext directly so callers without HandlerContext can use it.
 */
export function tryCreateDaLiveTokenProvider(
    extensionContext: vscode.ExtensionContext | undefined,
): { getAccessToken(): Promise<string | null | undefined> } | undefined {
    // Non-fatal by design. The DA.live session is needed only for sites carrying
    // an `access.admin` role; an unprotected site works without it, so a partial
    // or absent ExtensionContext (headless, MCP, a test harness) must degrade to
    // the previous behaviour rather than break a check that used to succeed.
    if (!extensionContext) return undefined;
    try {
        return createDaLiveServiceTokenProvider(getDaLiveAuthService(extensionContext));
    } catch {
        return undefined;
    }
}

export function getDaLiveAuthService(extensionContext: vscode.ExtensionContext): DaLiveAuthService {
    // Initialize Helix key persistence alongside DA.live auth (idempotent).
    // Fire-and-forget: secretStorage ref is set synchronously, migration runs async.
    void HelixService.initKeyStore(extensionContext.secrets, extensionContext.globalState);
    if (!cachedDaLiveAuthService) {
        cachedDaLiveAuthService = new DaLiveAuthService(extensionContext);
    }
    return cachedDaLiveAuthService;
}

/**
 * Clear cached service instances
 *
 * Call this when extension is deactivated to clean up resources.
 */
export function clearServiceCache(): void {
    const logger = getLogger();
    logger.debug('[EDS:ServiceCache] CLEARING all service caches', {
        hadGitHubServices: !!cachedGitHubServices,
        hadDaLiveAuthService: !!cachedDaLiveAuthService,
        timestamp: new Date().toISOString(),
    });
    cachedGitHubServices = null;
    if (cachedDaLiveAuthService) {
        cachedDaLiveAuthService.dispose();
        cachedDaLiveAuthService = null;
    }
    logger.debug('[EDS:ServiceCache] All service caches cleared');
}
