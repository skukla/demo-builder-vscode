/**
 * Storefront Setup Shared Types
 *
 * Internal type definitions shared across storefront setup phase files.
 * These types are not part of the public API.
 *
 * @module features/eds/handlers/storefrontSetupTypes
 */

import type { ConfigurationService } from '../services/configurationService';
import type { DaLiveAuthService } from '../services/daLiveAuthService';
import type { DaLiveContentOperations } from '../services/daLiveContentOperations';
import type { GitHubAppService } from '../services/githubAppService';
import type { GitHubFileOperations } from '../services/githubFileOperations';
import type { GitHubRepoOperations } from '../services/githubRepoOperations';
import type { HelixService } from '../services/helixService';

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
    /** See {@link RepoInfo.byomOverlayFailed} — spread in from the threaded repoInfo. */
    byomOverlayFailed?: boolean;
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
     * The BYOM overlay was configured but its Configuration Service registration
     * did not land, so the storefront cannot serve product detail pages.
     *
     * Set in phase 3 and spread into {@link StorefrontSetupResult}, because the
     * pipeline otherwise finishes and reports "Complete" for a storefront missing
     * the one thing the overlay exists for.
     */
    byomOverlayFailed?: boolean;
}
