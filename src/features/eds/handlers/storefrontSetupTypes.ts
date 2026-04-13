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
    repoUrl?: string;
    repoOwner?: string;
    repoName?: string;
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
}
