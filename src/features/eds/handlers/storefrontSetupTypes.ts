/**
 * Storefront Setup Shared Types
 *
 * Internal type definitions shared across storefront setup phase files.
 * These types are not part of the public API.
 *
 * @module features/eds/handlers/storefrontSetupTypes
 */

import type { ConfigurationService } from '../services/configurationService';
import type { DaLiveAuthService } from '../services/daLive/daLiveAuthService';
import type { DaLiveContentOperations } from '../services/daLive/daLiveContentOperations';
import type { GitHubAppService } from '../services/github/githubAppService';
import type { GitHubFileOperations } from '../services/github/githubFileOperations';
import type { GitHubRepoOperations } from '../services/github/githubRepoOperations';
import type { HelixService } from '../services/helix/helixService';

/**
 * Result of storefront setup phase execution
 */
export interface StorefrontSetupResult {
    success: boolean;
    error?: string;
    /**
     * The pipeline stopped because AEM Code Sync is not installed and the user
     * is being walked through installing it. A halt with a remedy in progress —
     * NOT a failure. Callers must not convert this into an error message: doing
     * so replaces the install dialog with the failure screen and strands the
     * resume handler that would have continued the run.
     */
    awaitingGitHubApp?: boolean;
    repoUrl?: string;
    repoOwner?: string;
    repoName?: string;
    /** See {@link RepoInfo.pdpCaveats} — spread in from the threaded repoInfo. */
    pdpCaveats?: string[];
    // Note: previewUrl/liveUrl not included - derived from githubRepo by typeGuards
}

/**
 * Services bundle for storefront setup phases
 */
export interface SetupServices {
    githubRepoOps: GitHubRepoOperations;
    githubFileOps: GitHubFileOperations;
    githubAppService: GitHubAppService;
    daLiveContentOps: DaLiveContentOperations;
    helixService: HelixService;
    daLiveAuthService: DaLiveAuthService;
    daLiveTokenProvider: { getAccessToken: () => Promise<string | null> };
    configurationService: ConfigurationService;
}

/**
 * Mutable repo info passed through phases
 */
export interface RepoInfo {
    repoUrl?: string;
    repoOwner: string;
    repoName: string;
    /**
     * User-facing reasons product detail pages will not work, collected as the
     * phases run and spread into {@link StorefrontSetupResult}.
     *
     * One channel rather than a flag per cause, because the pipeline otherwise
     * finishes and reports "Complete" for a storefront missing the one thing the
     * overlay exists for. Three causes feed it today: the overlay was configured
     * and failed to register (phase 3), no overlay was configured at all — BYOM
     * off or an invalid URL (phase 3), and the smart-404 handler was skipped
     * (phase 2). The last two were entirely silent before 2026-08-10.
     *
     * Empty or absent means no caveat. Anything in here changes what the
     * completion message says.
     */
    pdpCaveats?: string[];
}
