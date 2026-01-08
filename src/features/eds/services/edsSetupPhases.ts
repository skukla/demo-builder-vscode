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
import { PollingService } from '@/core/shell/pollingService';
import { generateConfigFile, updateConfigFile } from '@/core/config/configFileGenerator';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { ComponentManager } from '@/features/components/services/componentManager';
import type { Logger } from '@/types/logger';
import type { DaLiveOrgOperations } from './daLiveOrgOperations';
import type { DaLiveContentOperations } from './daLiveContentOperations';
import type { GitHubTokenService } from './githubTokenService';
import type { GitHubRepoOperations } from './githubRepoOperations';
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
// Demo System Stores CitiSignal template (EDS + Adobe Commerce)
// https://github.com/demo-system-stores/accs-citisignal
const CITISIGNAL_TEMPLATE = {
    owner: 'demo-system-stores',
    repo: 'accs-citisignal',
};

const INGESTION_TOOL_DEF = {
    id: 'commerce-demo-ingestion',
    name: 'Commerce Demo Ingestion',
    type: 'tool' as const,
    source: {
        type: 'git' as const,
        url: 'https://github.com/hlxsites/commerce-demo-ingestion.git',
    },
};

const HELIX_CONFIG_URL = 'https://admin.hlx.page/config';
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
        this.logger.debug(`[EDS] Creating repository: ${config.repoName}`);

        try {
            // GitHub's template API returns 201 when request is accepted, but
            // the actual template copy happens asynchronously on GitHub's side.
            const repo = await this.repoOperations.createFromTemplate(
                CITISIGNAL_TEMPLATE.owner,
                CITISIGNAL_TEMPLATE.repo,
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
            await this.generateFstabYaml(config);

            this.logger.debug(`[EDS] Helix 5 configured via fstab.yaml`);

            // Priority 1: Verify config file was created
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
     */
    private async generateFstabYaml(config: EdsProjectConfig): Promise<void> {
        const fstabPath = path.join(config.componentPath, 'fstab.yaml');
        
        // fstab.yaml format for Helix 5
        const fstabContent = `mountpoints:
  /: https://content.da.live/${config.daLiveOrg}/${config.daLiveSite}/
`;

        try {
            await fs.writeFile(fstabPath, fstabContent, 'utf-8');
            this.logger.debug(`[EDS] Generated fstab.yaml at: ${fstabPath}`);
            this.logger.debug(`[EDS] Mountpoint: / → https://content.da.live/${config.daLiveOrg}/${config.daLiveSite}/`);
        } catch (error) {
            throw new Error(`Failed to write fstab.yaml: ${(error as Error).message}`);
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

            const isInstalled = await this.githubAppService.isAppInstalled(
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
 * Environment Configuration Phase
 */
export class EnvConfigPhase {
    constructor(private logger: Logger) {}

    /**
     * Generate site.json configuration file for EDS runtime
     * This is required for PaaS backend projects to configure commerce endpoints
     * 
     * Uses shared config file generation pattern (same as .env generation conceptually).
     * NOTE: Creates site.json even if mesh endpoint is not yet available (will be updated post-mesh)
     */
    async generateSiteJson(config: EdsProjectConfig): Promise<void> {
        // Only generate site.json for PaaS backends (adobe-commerce-paas)
        const isPaasBackend = config.backendComponentId === 'adobe-commerce-paas';
        
        if (!isPaasBackend) {
            this.logger.debug(`[EDS] Skipping site.json generation (backend: ${config.backendComponentId})`);
            return;
        }

        const hasMeshEndpoint = !!config.meshEndpoint;
        this.logger.info(`[EDS] Generating site.json for PaaS backend (mesh endpoint ${hasMeshEndpoint ? 'available' : 'pending'})`);

        const siteJsonPath = path.join(config.componentPath, 'site.json');
        const templatePath = path.join(config.componentPath, 'default-site.json');

        // Extract backend env vars (with type safety)
        const backendEnv = config.backendEnvVars || {};
        const commerceApiKey = String(backendEnv.ADOBE_CATALOG_API_KEY || '');
        const commerceEnvironmentId = String(backendEnv.ADOBE_COMMERCE_ENVIRONMENT_ID || '');
        const storeViewCode = String(backendEnv.ADOBE_COMMERCE_STORE_VIEW_CODE || 'default');
        const websiteCode = String(backendEnv.ADOBE_COMMERCE_WEBSITE_CODE || 'base');
        const storeCode = String(backendEnv.ADOBE_COMMERCE_STORE_CODE || 'main_website_store');

        try {
            // Use shared config file generator
            await generateConfigFile({
                filePath: siteJsonPath,
                templatePath,
                defaultConfig: {
                    'commerce-core-endpoint': '',
                    'commerce-endpoint': 'https://catalog-service.adobe.io/graphql',
                    'store-view-code': storeViewCode,
                    'website-code': websiteCode,
                    'store-code': storeCode,
                },
                placeholders: {
                    '{ENDPOINT}': config.meshEndpoint || '',
                    '{CS_ENDPOINT}': 'https://catalog-service.adobe.io/graphql',
                    '{COMMERCE_API_KEY}': commerceApiKey,
                    '{COMMERCE_ENVIRONMENT_ID}': commerceEnvironmentId,
                    '{STORE_VIEW_CODE}': storeViewCode,
                    '{WEBSITE_CODE}': websiteCode,
                    '{STORE_CODE}': storeCode,
                    '{ORG}': config.githubOwner,
                    '{REPO}': config.repoName,
                },
                logger: this.logger,
                description: 'EDS runtime configuration (site.json)',
            });

            if (config.meshEndpoint) {
                this.logger.info('[EDS] Generated site.json with mesh endpoint');
            } else {
                this.logger.info('[EDS] Generated site.json template (mesh endpoint will be added post-deployment)');
            }
        } catch (error) {
            throw new EdsProjectError(
                `Failed to generate site.json: ${(error as Error).message}`,
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
 * Update site.json with mesh endpoint after mesh deployment
 * This is called post-mesh to fill in the commerce-core-endpoint
 * 
 * Uses shared config file update pattern (consistent with generation).
 * NOTE: .env update is NOT needed - Phase 4's generateComponentEnvFile()
 * handles that using the standard pattern with project.meshState.endpoint
 */
export async function updateSiteJsonWithMesh(
    componentPath: string,
    meshEndpoint: string,
    logger: Logger,
): Promise<void> {
    logger.info('[EDS] Updating site.json with mesh endpoint');

    const siteJsonPath = path.join(componentPath, 'site.json');
    
    // Use shared config file updater
    await updateConfigFile(
        siteJsonPath,
        {
            'commerce-core-endpoint': meshEndpoint,
            'commerce-endpoint': 'https://catalog-service.adobe.io/graphql',
        },
        logger,
        'EDS runtime configuration (site.json)',
    );
}

/** URL generation helpers */
export const generatePreviewUrl = (owner: string, repo: string): string =>
    `https://${DEFAULT_BRANCH}--${repo}--${owner}.aem.page`;

export const generateLiveUrl = (owner: string, repo: string): string =>
    `https://${DEFAULT_BRANCH}--${repo}--${owner}.aem.live`;
