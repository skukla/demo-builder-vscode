/**
 * EDS Setup Phases
 *
 * Individual setup phase implementations for EDS project creation:
 * - GitHub repository management (create, fetch, cleanup)
 * - Helix 5 configuration
 * - Code sync verification
 * - DA.live content population
 * - Tool installation
 * - Environment file generation
 *
 * Extracted from EdsProjectService for better modularity.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateURL } from '@/core/validation';
import { PollingService } from '@/core/shell/pollingService';
import { generateConfigFile } from '@/core/config/configFileGenerator';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { ComponentManager } from '@/features/components/services/componentManager';
import type { Logger } from '@/types/logger';
import type { DaLiveOrgOperations } from './daLiveOrgOperations';
import type { DaLiveContentOperations } from './daLiveContentOperations';
import type { GitHubTokenService } from './githubTokenService';
import type { GitHubRepoOperations } from './githubRepoOperations';
import type { GitHubFileOperations } from './githubFileOperations';
import {
    EdsProjectError,
    GitHubAppNotInstalledError,
    type EdsProjectConfig,
    type GitHubRepo,
    type PhaseProgressCallback,
} from './types';
import type { GitHubAppService } from './githubAppService';

// Re-export PhaseProgressCallback for consumers
export type { PhaseProgressCallback } from './types';

/**
 * GitHub services for EDS phases
 */
export interface GitHubServicesForPhases {
    tokenService: GitHubTokenService;
    repoOperations: GitHubRepoOperations;
}

// Constants
const INGESTION_TOOL_DEF = {
    id: 'commerce-demo-ingestion',
    name: 'Commerce Demo Ingestion',
    type: 'tool' as const,
    source: {
        type: 'git' as const,
        url: 'https://github.com/hlxsites/commerce-demo-ingestion.git',
    },
};

const HELIX_CODE_URL = 'https://admin.hlx.page/code';
const MAX_CODE_SYNC_ATTEMPTS = 25;
const DEFAULT_BRANCH = 'main';

// Verify clone by checking directory is not empty
// Different EDS templates may have different file structures, so we just verify
// that at least some files were cloned
const MIN_FILES_AFTER_CLONE = 1;

/**
 * GitHub Repository Phase
 */
export class GitHubRepoPhase {
    private repoOperations: GitHubRepoOperations;
    private daLiveOrgOps: DaLiveOrgOperations;
    private logger: Logger;

    constructor(
        githubServices: GitHubServicesForPhases,
        daLiveOrgOps: DaLiveOrgOperations,
        logger: Logger,
    ) {
        this.repoOperations = githubServices.repoOperations;
        this.daLiveOrgOps = daLiveOrgOps;
        this.logger = logger;
    }

    async createFromTemplate(config: EdsProjectConfig): Promise<GitHubRepo> {
        // Template must be provided via configuration (demo-packages.json → frontendSource)
        if (!config.templateOwner || !config.templateRepo) {
            throw new EdsProjectError(
                'Template repository not configured. Ensure frontendSource is defined in demo-packages.json ' +
                'with a valid GitHub URL (e.g., https://github.com/owner/repo)',
                'github-repo',
            );
        }

        this.logger.debug(`[EDS] Creating repository: ${config.repoName} from template: ${config.templateOwner}/${config.templateRepo}`);

        try {
            // GitHub's template API returns 201 when request is accepted, but
            // the actual template copy happens asynchronously on GitHub's side.
            const repo = await this.repoOperations.createFromTemplate(
                config.templateOwner,
                config.templateRepo,
                config.repoName,
                config.isPrivate ?? false,
            );

            this.logger.debug(`[EDS] Repository creation initiated: ${repo.fullName}`);
            
            // Poll repository until template content is populated
            // This prevents cloning an empty repository
            const [owner, repoName] = repo.fullName.split('/');
            const hasContent = await this.repoOperations.waitForContent(owner, repoName, config.abortSignal);

            if (!hasContent) {
                this.logger.warn('[EDS] Repository may still be populating, proceeding with clone anyway');
            }
            
            this.logger.debug(`[EDS] Repository ready: ${repo.fullName}`);
            return repo;
        } catch (error) {
            throw new EdsProjectError(
                `Failed to create repository: ${(error as Error).message}`,
                'github-repo',
                error as Error,
            );
        }
    }

    async getExisting(config: EdsProjectConfig): Promise<GitHubRepo> {
        if (!config.existingRepo) {
            throw new EdsProjectError('Existing repository not specified', 'github-repo');
        }

        const [owner, repoName] = config.existingRepo.split('/');
        if (!owner || !repoName) {
            throw new EdsProjectError('Invalid repository format. Use owner/repo', 'github-repo');
        }

        this.logger.debug(`[EDS] Fetching existing repository: ${config.existingRepo}`);

        try {
            const repo = await this.repoOperations.getRepository(owner, repoName);
            this.logger.debug(`[EDS] Existing repository found: ${repo.fullName}`);
            return repo;
        } catch (error) {
            throw new EdsProjectError(
                `Failed to access repository: ${(error as Error).message}`,
                'github-repo',
                error as Error,
            );
        }
    }

    async cleanupForRepurpose(config: EdsProjectConfig): Promise<void> {
        if (!config.existingRepo) {
            throw new EdsProjectError('Existing repository not specified', 'github-repo');
        }

        const [owner, repoName] = config.existingRepo.split('/');
        if (!owner || !repoName) {
            throw new EdsProjectError('Invalid repository format. Use owner/repo', 'github-repo');
        }

        this.logger.info(`[EDS] Repurpose cleanup for: ${config.existingRepo}`);

        try {
            this.logger.debug(`[EDS] Deleting repository: ${config.existingRepo}`);
            await this.repoOperations.deleteRepository(owner, repoName);
            this.logger.debug(`[EDS] Repository deleted`);
        } catch (error) {
            throw new EdsProjectError(
                `Failed to delete repository: ${(error as Error).message}`,
                'github-repo',
                error as Error,
            );
        }

        if (config.daLiveOrg && config.daLiveSite) {
            try {
                this.logger.debug(`[EDS] Deleting DA.live content: ${config.daLiveOrg}/${config.daLiveSite}`);
                await this.daLiveOrgOps.deleteSite(config.daLiveOrg, config.daLiveSite);
                this.logger.debug(`[EDS] DA.live content deleted`);
            } catch (error) {
                this.logger.warn(`[EDS] Failed to delete DA.live content: ${(error as Error).message}`);
            }
        }

        config.repoName = repoName;
        config.githubOwner = owner;
    }

    async clone(
        repo: GitHubRepo,
        config: EdsProjectConfig,
        onProgress?: PhaseProgressCallback,
    ): Promise<void> {
        // Clone to components/eds-storefront/ like other frontends
        const clonePath = config.componentPath;
        this.logger.debug(`[EDS] Cloning repository to: ${clonePath}`);

        try {
            // Ensure parent directory exists
            await fs.mkdir(path.dirname(clonePath), { recursive: true });

            // Clean up any existing directory (from previous failed attempts)
            try {
                await fs.access(clonePath);
                this.logger.debug(`[EDS] Removing existing component directory: ${clonePath}`);
                await fs.rm(clonePath, { recursive: true, force: true });
            } catch {
                // Directory doesn't exist, no cleanup needed
            }

            onProgress?.('Cloning repository...');
            await this.repoOperations.cloneRepository(repo.cloneUrl, clonePath);
            this.logger.debug(`[EDS] Repository cloned successfully`);

            // Priority 3: Post-clone verification - check key files exist
            onProgress?.('Verifying clone integrity...');
            await this.verifyCloneComplete(clonePath);
        } catch (error) {
            if (error instanceof EdsProjectError) {
                throw error;
            }
            throw new EdsProjectError(
                `Failed to clone repository: ${(error as Error).message}`,
                'github-clone',
                error as Error,
            );
        }
    }

    /**
     * Verify clone completed successfully by checking directory has content
     * Different templates may have different structures, so we just verify
     * that files were actually cloned
     */
    private async verifyCloneComplete(projectPath: string): Promise<void> {
        this.logger.debug(`[EDS] Verifying clone integrity at: ${projectPath}`);

        try {
            const files = await fs.readdir(projectPath);
            
            // Filter out hidden files for the count (but they're still valid)
            const visibleFiles = files.filter(f => !f.startsWith('.'));
            this.logger.debug(`[EDS] Found ${files.length} total files (${visibleFiles.length} visible)`);
            this.logger.debug(`[EDS] Directory contents: ${files.slice(0, 10).join(', ')}${files.length > 10 ? '...' : ''}`);

            if (files.length < MIN_FILES_AFTER_CLONE) {
                throw new EdsProjectError(
                    `Clone verification failed: Directory is empty or incomplete (found ${files.length} files)`,
                    'github-clone',
                );
            }

            this.logger.debug(`[EDS] Clone verification complete - ${files.length} files present`);
        } catch (error) {
            if (error instanceof EdsProjectError) {
                throw error;
            }
            this.logger.error(`[EDS] Failed to verify clone: ${(error as Error).message}`);
            throw new EdsProjectError(
                `Clone verification failed: Cannot read directory at ${projectPath}`,
                'github-clone',
                error as Error,
            );
        }
    }
}

/**
 * Helix Configuration Phase
 */
export class HelixConfigPhase {
    private pollingService: PollingService;

    constructor(
        private authService: AuthenticationService,
        private logger: Logger,
        private githubAppService: GitHubAppService,
        private fileOperations?: GitHubFileOperations,
    ) {
        this.pollingService = new PollingService();
    }

    async configure(
        config: EdsProjectConfig,
        repo: GitHubRepo,
        onProgress?: PhaseProgressCallback,
    ): Promise<void> {
        this.logger.debug(`[EDS] Configuring Helix 5 for: ${repo.fullName}`);

        try {
            // Modern Helix 5 approach: Generate fstab.yaml in the repo
            // This replaces the deprecated admin.hlx.page/config API which requires complex auth
            onProgress?.('Generating fstab.yaml configuration...');
            const fstabContent = await this.generateFstabYaml(config);

            this.logger.debug(`[EDS] Helix 5 configured via fstab.yaml`);

            // Push fstab.yaml to GitHub - required for Helix to fetch content
            // Without this, Helix code sync will work but content fetch will fail
            if (this.fileOperations) {
                onProgress?.('Pushing fstab.yaml to GitHub...');
                await this.pushFstabToGitHub(repo, fstabContent);
            } else {
                this.logger.warn('[EDS] GitHubFileOperations not provided - fstab.yaml only saved locally');
            }

            // Priority 1: Verify config file was created locally
            onProgress?.('Verifying Helix config...');
            await this.verifyHelixConfig(config);
        } catch (error) {
            if (error instanceof EdsProjectError) {
                throw error;
            }
            const message = (error as Error).message;
            if (message.includes('timeout') || message.includes('abort')) {
                throw new EdsProjectError('Helix configuration timeout', 'helix-config', error as Error);
            }
            throw new EdsProjectError(
                `Failed to configure Helix: ${message}`,
                'helix-config',
                error as Error,
            );
        }
    }

    /**
     * Generate fstab.yaml file in the repository
     * Modern Helix 5 approach - configuration in repo instead of API
     * @returns The fstab.yaml content for pushing to GitHub
     */
    private async generateFstabYaml(config: EdsProjectConfig): Promise<string> {
        const fstabPath = path.join(config.componentPath, 'fstab.yaml');

        // fstab.yaml format for Helix 5
        const fstabContent = `mountpoints:
  /: https://content.da.live/${config.daLiveOrg}/${config.daLiveSite}/
`;

        try {
            await fs.writeFile(fstabPath, fstabContent, 'utf-8');
            this.logger.debug(`[EDS] Generated fstab.yaml at: ${fstabPath}`);
            this.logger.debug(`[EDS] Mountpoint: / → https://content.da.live/${config.daLiveOrg}/${config.daLiveSite}/`);
            return fstabContent;
        } catch (error) {
            throw new Error(`Failed to write fstab.yaml: ${(error as Error).message}`);
        }
    }

    /**
     * Push fstab.yaml to GitHub repository
     * This is required for Helix to fetch content from DA.live
     */
    private async pushFstabToGitHub(repo: GitHubRepo, content: string): Promise<void> {
        if (!this.fileOperations) {
            throw new Error('GitHubFileOperations not available');
        }

        const [owner, repoName] = repo.fullName.split('/');
        this.logger.info(`[EDS] Pushing fstab.yaml to GitHub: ${owner}/${repoName}`);

        try {
            // Check if fstab.yaml already exists (to get SHA for update)
            const existingFile = await this.fileOperations.getFileContent(owner, repoName, 'fstab.yaml');
            const sha = existingFile?.sha;

            // Create or update fstab.yaml in the repository
            await this.fileOperations.createOrUpdateFile(
                owner,
                repoName,
                'fstab.yaml',
                content,
                'chore: configure fstab.yaml for DA.live content source',
                sha,
            );

            this.logger.info('[EDS] fstab.yaml pushed to GitHub successfully');
        } catch (error) {
            throw new Error(`Failed to push fstab.yaml to GitHub: ${(error as Error).message}`);
        }
    }

    /**
     * Verify Helix configuration file exists
     * Checks that fstab.yaml was created successfully
     */
    private async verifyHelixConfig(config: EdsProjectConfig): Promise<void> {
        this.logger.debug(`[EDS] Verifying fstab.yaml exists`);

        const fstabPath = path.join(config.componentPath, 'fstab.yaml');

        try {
            await fs.access(fstabPath);
            this.logger.debug(`[EDS] Verified fstab.yaml exists at: ${fstabPath}`);
        } catch {
            throw new Error(`fstab.yaml not found at ${fstabPath}`);
        }
    }

    /**
     * Priority 2: Verify code sync using PollingService
     *
     * If code sync fails, checks if the GitHub app is installed.
     * If not installed, throws GitHubAppNotInstalledError with install URL
     * so the executor can pause and prompt the user.
     */
    async verifyCodeSync(
        config: EdsProjectConfig,
        _repo: GitHubRepo,
        onProgress?: PhaseProgressCallback,
    ): Promise<void> {
        this.logger.debug(`[EDS] Verifying code sync for: ${config.githubOwner}/${config.repoName}`);

        const codeUrl = `${HELIX_CODE_URL}/${config.githubOwner}/${config.repoName}/${DEFAULT_BRANCH}/scripts/aem.js`;

        try {
            onProgress?.('Checking code sync status...');
            await this.pollingService.pollUntilCondition(
                async () => {
                    try {
                        const response = await fetch(codeUrl, {
                            method: 'GET',
                            signal: AbortSignal.timeout(TIMEOUTS.POLL.INTERVAL),
                        });
                        return response.ok;
                    } catch {
                        return false;
                    }
                },
                {
                    name: 'code-sync',
                    maxAttempts: MAX_CODE_SYNC_ATTEMPTS,
                    initialDelay: TIMEOUTS.POLL.INTERVAL,
                    maxDelay: TIMEOUTS.POLL.INTERVAL,
                    timeout: TIMEOUTS.LONG,
                },
            );

            this.logger.debug(`[EDS] Code sync verified`);
        } catch (error) {
            // Code sync failed - check if GitHub app is installed
            this.logger.debug('[EDS] Code sync failed, checking app installation');

            const { isInstalled } = await this.githubAppService.isAppInstalled(
                config.githubOwner,
                config.repoName,
            );

            if (!isInstalled) {
                // App not installed - throw specific error for executor to handle
                const installUrl = this.githubAppService.getInstallUrl(
                    config.githubOwner,
                    config.repoName,
                );
                this.logger.info(`[EDS] GitHub app not installed. Install URL: ${installUrl}`);
                throw new GitHubAppNotInstalledError(
                    config.githubOwner,
                    config.repoName,
                    installUrl,
                );
            }

            // App is installed but sync still failed - throw original error
            throw new EdsProjectError(
                `Code sync timeout: ${(error as Error).message}`,
                'code-sync',
                error as Error,
            );
        }
    }
}

/**
 * Content and Tools Phase
 */
export class ContentPhase {
    constructor(
        private daLiveContentOps: DaLiveContentOperations,
        private componentManager: ComponentManager,
        private logger: Logger,
    ) {}

    async populateDaLiveContent(
        config: EdsProjectConfig,
        progressCallback?: (progress: { percentage: number }) => void,
    ): Promise<void> {
        this.logger.debug(`[EDS] Populating DA.live content: ${config.daLiveOrg}/${config.daLiveSite}`);

        try {
            // If resetting existing site content, delete all existing content first
            if (config.resetSiteContent) {
                this.logger.info(`[EDS] Resetting DA.live site content: ${config.daLiveOrg}/${config.daLiveSite}`);
                try {
                    await this.daLiveOrgOps.deleteSite(config.daLiveOrg, config.daLiveSite);
                    this.logger.debug('[EDS] Existing DA.live content deleted');
                } catch (error) {
                    // Log warning but don't fail - site might not exist yet
                    this.logger.warn(`[EDS] Failed to delete existing DA.live content: ${(error as Error).message}`);
                }
            }

            const result = await this.daLiveContentOps.copyCitisignalContent(
                config.daLiveOrg,
                config.daLiveSite,
                progressCallback ? (progress) => {
                    progressCallback({ percentage: progress.percentage });
                } : undefined,
            );

            if (!result.success) {
                const failedCount = result.failedFiles.length;
                throw new Error(`Content copy failed: ${failedCount} files failed`);
            }

            this.logger.debug(`[EDS] DA.live content populated: ${result.totalFiles} files`);
        } catch (error) {
            throw new EdsProjectError(
                `Failed to populate DA.live content: ${(error as Error).message}`,
                'dalive-content',
                error as Error,
            );
        }
    }

    async cloneIngestionTool(config: EdsProjectConfig): Promise<void> {
        this.logger.debug(`[EDS] Cloning ingestion tool`);

        try {
            const toolsProject = {
                path: path.join(config.projectPath, 'tools'),
                name: config.projectName,
                componentInstances: {},
            };

            await fs.mkdir(toolsProject.path, { recursive: true });

            const result = await this.componentManager.installComponent(
                toolsProject as any,
                INGESTION_TOOL_DEF as any,
                { skipDependencies: true },
            );

            if (!result.success) {
                throw new Error(result.error || 'Tool installation failed');
            }

            this.logger.debug(`[EDS] Ingestion tool cloned successfully`);
        } catch (error) {
            throw new EdsProjectError(
                `Failed to clone ingestion tool: ${(error as Error).message}`,
                'tools-clone',
                error as Error,
            );
        }
    }
}

/**
 * Store configuration IDs from Commerce storeConfig query
 * Used for dynamic ID lookup instead of hardcoded defaults
 */
interface StoreConfig {
    storeViewId: string;
    websiteId: string;
    rootCategoryId: string;
}

/**
 * Fetch store configuration IDs from Commerce GraphQL endpoint
 * Used for dynamic ID lookup instead of hardcoded defaults
 *
 * @param graphqlEndpoint - Full GraphQL URL (e.g., https://commerce.example.com/graphql)
 * @param logger - Logger instance for debug output
 * @returns StoreConfig if successful, null on any error (graceful fallback)
 */
async function fetchStoreConfig(
    graphqlEndpoint: string,
    logger: Logger,
): Promise<StoreConfig | null> {
    try {
        // SECURITY: Validate URL before making external request (SSRF prevention)
        validateURL(graphqlEndpoint);

        const response = await fetch(graphqlEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: '{ storeConfig { id website_id root_category_id } }',
            }),
            signal: AbortSignal.timeout(TIMEOUTS.PREREQUISITE_CHECK),
        });

        if (!response.ok) {
            logger.debug(`[EDS] storeConfig fetch failed: ${response.status}`);
            return null;
        }

        const json = await response.json();
        const config = json?.data?.storeConfig;

        if (config?.id == null || config?.website_id == null || config?.root_category_id == null) {
            logger.debug('[EDS] storeConfig response missing required fields');
            return null;
        }

        return {
            storeViewId: String(config.id),
            websiteId: String(config.website_id),
            rootCategoryId: String(config.root_category_id),
        };
    } catch (error) {
        logger.debug(`[EDS] storeConfig fetch error: ${(error as Error).message}`);
        return null;
    }
}

/**
 * Environment Configuration Phase
 *
 * NOTE: This class is DEPRECATED and maintained only for test compatibility.
 * The functionality has been moved to the standalone function `generateConfigJsonPostMesh`
 * which is called post-mesh deployment for better timing.
 *
 * New code should use `generateConfigJsonPostMesh` directly.
 */
export class EnvConfigPhase {
    constructor(private logger: Logger) {}

    /**
     * Fetch store configuration IDs from Commerce GraphQL endpoint
     * Uses publicly accessible storeConfig query (no auth required)
     *
     * @param graphqlEndpoint - Full GraphQL URL (e.g., https://commerce.example.com/graphql)
     * @returns StoreConfig if successful, null on any error
     *
     * @deprecated Use fetchStoreConfig standalone function instead
     */
    private async fetchStoreConfig(graphqlEndpoint: string): Promise<StoreConfig | null> {
        // Delegate to standalone function to eliminate code duplication
        return fetchStoreConfig(graphqlEndpoint, this.logger);
    }

    /**
     * Generate config.json configuration file for EDS runtime
     * This is required for PaaS backend projects to configure commerce endpoints
     *
     * Uses shared config file generation pattern (same as .env generation conceptually).
     * NOTE: Creates config.json even if mesh endpoint is not yet available (will be updated post-mesh)
     */
    async generateConfigJson(config: EdsProjectConfig): Promise<void> {
        // Only generate config.json for PaaS backends (adobe-commerce-paas)
        const isPaasBackend = config.backendComponentId === 'adobe-commerce-paas';

        if (!isPaasBackend) {
            this.logger.debug(`[EDS] Skipping config.json generation (backend: ${config.backendComponentId})`);
            return;
        }

        const hasMeshEndpoint = !!config.meshEndpoint;
        this.logger.info(`[EDS] Generating config.json for PaaS backend (mesh endpoint ${hasMeshEndpoint ? 'available' : 'pending'})`);

        const configJsonPath = path.join(config.componentPath, 'config.json');
        // Template is named default-site.json in the citisignal repo, but we output to config.json
        const templatePath = path.join(config.componentPath, 'default-site.json');

        // Extract backend env vars (with type safety)
        // Store codes are required - collected from user in Settings Collection step
        const backendEnv = config.backendEnvVars || {};
        const commerceApiKey = String(backendEnv.ADOBE_CATALOG_API_KEY || '');
        const commerceEnvironmentId = String(backendEnv.ADOBE_COMMERCE_ENVIRONMENT_ID || '');
        const storeViewCode = String(backendEnv.ADOBE_COMMERCE_STORE_VIEW_CODE || '');
        const websiteCode = String(backendEnv.ADOBE_COMMERCE_WEBSITE_CODE || '');
        const storeCode = String(backendEnv.ADOBE_COMMERCE_STORE_CODE || '');

        // Build additional placeholder values
        // DA.live content source URL (used for content federation)
        const contentSource = `https://content.da.live/${config.daLiveOrg}/${config.daLiveSite}`;
        // Live domain URL for analytics and CDN config
        const liveDomain = `main--${config.repoName}--${config.githubOwner}.aem.live`;

        // Commerce store numeric IDs
        // Attempt dynamic lookup via storeConfig GraphQL query, fall back to demo defaults
        // Note: storeId remains hardcoded - not available via storeConfig query
        const storeId = '1';
        let storeViewId = '1';
        let websiteId = '1';
        let rootCategoryId = '2';

        if (config.meshEndpoint) {
            const storeConfig = await this.fetchStoreConfig(config.meshEndpoint);
            if (storeConfig) {
                storeViewId = storeConfig.storeViewId;
                websiteId = storeConfig.websiteId;
                rootCategoryId = storeConfig.rootCategoryId;
                this.logger.info('[EDS] Using dynamic store IDs from Commerce storeConfig');
            } else {
                this.logger.info('[EDS] Using default store IDs (storeConfig fetch failed)');
            }
        } else {
            this.logger.debug('[EDS] Skipping storeConfig fetch (mesh endpoint not available)');
        }

        // Admin email for Helix sidekick config_admin access (empty = not configured)
        const adminEmail = '';

        try {
            // Use shared config file generator
            await generateConfigFile({
                filePath: configJsonPath,
                templatePath,
                defaultConfig: {
                    'commerce-core-endpoint': '',
                    'commerce-endpoint': config.meshEndpoint || '',
                    'store-view-code': storeViewCode,
                    'website-code': websiteCode,
                    'store-code': storeCode,
                },
                placeholders: {
                    // Commerce endpoints
                    '{ENDPOINT}': config.meshEndpoint || '',
                    '{CS_ENDPOINT}': config.meshEndpoint || '',
                    // Commerce credentials
                    '{COMMERCE_API_KEY}': commerceApiKey,
                    '{COMMERCE_ENVIRONMENT_ID}': commerceEnvironmentId,
                    // Commerce store codes
                    '{STORE_VIEW_CODE}': storeViewCode,
                    '{WEBSITE_CODE}': websiteCode,
                    '{STORE_CODE}': storeCode,
                    // Commerce store IDs (numeric)
                    '{STORE_ID}': storeId,
                    '{STORE_VIEW_ID}': storeViewId,
                    '{WEBSITE_ID}': websiteId,
                    // Commerce catalog
                    '{YOUR_ROOT_CATEGORY_ID}': rootCategoryId,
                    // GitHub/Helix identifiers
                    '{ORG}': config.githubOwner,
                    '{REPO}': config.repoName,
                    '{SITE}': config.repoName,
                    // Content and domain
                    '{CONTENT_SOURCE}': contentSource,
                    '{DOMAIN}': liveDomain,
                    // Access control
                    '{ADMIN_USER_EMAIL}': adminEmail,
                },
                logger: this.logger,
                description: 'EDS runtime configuration (config.json)',
            });

            if (config.meshEndpoint) {
                this.logger.info('[EDS] Generated config.json with mesh endpoint');
            } else {
                this.logger.info('[EDS] Generated config.json template (mesh endpoint will be added post-deployment)');
            }
        } catch (error) {
            throw new EdsProjectError(
                `Failed to generate config.json: ${(error as Error).message}`,
                'env-config',
                error as Error,
            );
        }
    }

    /**
     * NOTE: .env generation is now handled by Phase 4's generateComponentEnvFile()
     * This uses the standard pattern:
     * - Reads requiredEnvVars from components.json (eds frontend component)
     * - Uses sharedEnvVars registry for field definitions
     * - Auto-populates MESH_ENDPOINT from project.meshState.endpoint
     * - Applies standard priority order: runtime → wizard → defaults
     *
     * No custom .env generation needed here!
     */
}

/**
 * Update config.json with mesh endpoint after mesh deployment
 * This is called post-mesh to fill in the commerce-core-endpoint
 *
 * Uses shared config file update pattern (consistent with generation).
 * NOTE: .env update is NOT needed - Phase 4's generateComponentEnvFile()
 * handles that using the standard pattern with project.meshState.endpoint
 */
export async function updateConfigJsonWithMesh(
    componentPath: string,
    meshEndpoint: string,
    logger: Logger,
): Promise<void> {
    logger.info('[EDS] Updating config.json with mesh endpoint');

    const configJsonPath = path.join(componentPath, 'config.json');

    try {
        // Read existing config
        const content = await fs.readFile(configJsonPath, 'utf-8');
        const config = JSON.parse(content) as Record<string, unknown>;

        // Update endpoints in public.default (where EDS runtime expects them)
        if (config.public && typeof config.public === 'object') {
            const publicConfig = config.public as Record<string, unknown>;
            if (publicConfig.default && typeof publicConfig.default === 'object') {
                const defaultConfig = publicConfig.default as Record<string, unknown>;
                defaultConfig['commerce-core-endpoint'] = meshEndpoint;
                defaultConfig['commerce-endpoint'] = meshEndpoint;
                logger.debug('[EDS] Updated endpoints in public.default');
            }
        }

        // Write back
        await fs.writeFile(configJsonPath, JSON.stringify(config, null, 2), 'utf-8');
        logger.info('[EDS] config.json updated with mesh endpoint');
    } catch (error) {
        logger.error('[EDS] Failed to update config.json', error as Error);
        throw error;
    }
}

/**
 * Configuration for generating config.json after mesh deployment
 * This interface defines all data needed to generate config.json with mesh endpoint
 */
export interface ConfigJsonPostMeshParams {
    /** Path to EDS component directory */
    componentPath: string;
    /** Mesh endpoint URL (required - this is the whole point of post-mesh generation) */
    meshEndpoint: string;
    /** GitHub repository owner */
    githubOwner: string;
    /** GitHub repository name */
    repoName: string;
    /** DA.live organization name */
    daLiveOrg: string;
    /** DA.live site name */
    daLiveSite: string;
    /** Backend environment variables (for store codes) */
    backendEnvVars?: Record<string, string>;
    /** Logger instance */
    logger: Logger;
}

/**
 * Generate config.json AFTER mesh deployment (Phase 5 optimization)
 *
 * This function generates config.json from scratch with the mesh endpoint already set.
 * Unlike the old flow (generate empty → deploy mesh → update), this:
 * - Generates config.json ONCE with complete data
 * - Eliminates the staleness window
 * - Reduces GitHub pushes from 2 to 1
 *
 * @param params - Configuration parameters for config.json generation
 * @throws Error if generation fails
 */
export async function generateConfigJsonPostMesh(params: ConfigJsonPostMeshParams): Promise<void> {
    const { componentPath, meshEndpoint, githubOwner, repoName, daLiveOrg, daLiveSite, backendEnvVars, logger } = params;

    logger.info('[EDS] Generating config.json with mesh endpoint (post-mesh)');

    const configJsonPath = path.join(componentPath, 'config.json');
    const templatePath = path.join(componentPath, 'default-site.json');

    // Extract backend env vars
    const backendEnv = backendEnvVars || {};
    const commerceApiKey = String(backendEnv.ADOBE_CATALOG_API_KEY || '');
    const commerceEnvironmentId = String(backendEnv.ADOBE_COMMERCE_ENVIRONMENT_ID || '');
    const storeViewCode = String(backendEnv.ADOBE_COMMERCE_STORE_VIEW_CODE || '');
    const websiteCode = String(backendEnv.ADOBE_COMMERCE_WEBSITE_CODE || '');
    const storeCode = String(backendEnv.ADOBE_COMMERCE_STORE_CODE || '');

    // Build URLs
    const contentSource = `https://content.da.live/${daLiveOrg}/${daLiveSite}`;
    const liveDomain = `main--${repoName}--${githubOwner}.aem.live`;

    // Commerce store IDs - fetch dynamically or use defaults
    const storeId = '1';
    let storeViewId = '1';
    let websiteId = '1';
    let rootCategoryId = '2';

    // Fetch dynamic store IDs from Commerce (mesh endpoint is always available here)
    const storeConfig = await fetchStoreConfig(meshEndpoint, logger);
    if (storeConfig) {
        storeViewId = storeConfig.storeViewId;
        websiteId = storeConfig.websiteId;
        rootCategoryId = storeConfig.rootCategoryId;
        logger.info('[EDS] Using dynamic store IDs from Commerce storeConfig');
    } else {
        logger.info('[EDS] Using default store IDs (storeConfig fetch failed)');
    }

    // Admin email placeholder
    const adminEmail = '';

    try {
        await generateConfigFile({
            filePath: configJsonPath,
            templatePath,
            defaultConfig: {
                'commerce-core-endpoint': meshEndpoint,
                'commerce-endpoint': meshEndpoint,
                'store-view-code': storeViewCode,
                'website-code': websiteCode,
                'store-code': storeCode,
            },
            placeholders: {
                // Commerce endpoints - mesh endpoint is now ALWAYS available
                '{ENDPOINT}': meshEndpoint,
                '{CS_ENDPOINT}': meshEndpoint,
                // Commerce credentials
                '{COMMERCE_API_KEY}': commerceApiKey,
                '{COMMERCE_ENVIRONMENT_ID}': commerceEnvironmentId,
                // Commerce store codes
                '{STORE_VIEW_CODE}': storeViewCode,
                '{WEBSITE_CODE}': websiteCode,
                '{STORE_CODE}': storeCode,
                // Commerce store IDs (numeric)
                '{STORE_ID}': storeId,
                '{STORE_VIEW_ID}': storeViewId,
                '{WEBSITE_ID}': websiteId,
                // Commerce catalog
                '{YOUR_ROOT_CATEGORY_ID}': rootCategoryId,
                // GitHub/Helix identifiers
                '{ORG}': githubOwner,
                '{REPO}': repoName,
                '{SITE}': repoName,
                // Content and domain
                '{CONTENT_SOURCE}': contentSource,
                '{DOMAIN}': liveDomain,
                // Access control
                '{ADMIN_USER_EMAIL}': adminEmail,
            },
            logger,
            description: 'EDS runtime configuration (config.json)',
        });

        logger.info('[EDS] Generated config.json with mesh endpoint');
    } catch (error) {
        logger.error('[EDS] Failed to generate config.json', error as Error);
        throw error;
    }
}

/** URL generation helpers */
export const generatePreviewUrl = (owner: string, repo: string): string =>
    `https://${DEFAULT_BRANCH}--${repo}--${owner}.aem.page`;

export const generateLiveUrl = (owner: string, repo: string): string =>
    `https://${DEFAULT_BRANCH}--${repo}--${owner}.aem.live`;
