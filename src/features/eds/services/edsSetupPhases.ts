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
            // GitHub's template API is synchronous - the 201 response means
            // the template is fully copied and ready to clone
            const repo = await this.repoOperations.createFromTemplate(
                CITISIGNAL_TEMPLATE.owner,
                CITISIGNAL_TEMPLATE.repo,
                config.repoName,
                config.isPrivate ?? false,
            );

            this.logger.debug(`[EDS] Repository created and ready: ${repo.fullName}`);
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

    async generateEnvFile(config: EdsProjectConfig, repo: GitHubRepo): Promise<void> {
        this.logger.debug(`[EDS] Generating .env file`);

        // Generate .env in the EDS component directory
        const envPath = path.join(config.componentPath, '.env');

        try {
            await fs.access(envPath);
            this.logger.debug(`[EDS] .env file already exists, skipping generation`);
            return;
        } catch {
            // File doesn't exist - create it
        }

        const previewUrl = `https://${DEFAULT_BRANCH}--${config.repoName}--${config.githubOwner}.aem.page`;
        const liveUrl = `https://${DEFAULT_BRANCH}--${config.repoName}--${config.githubOwner}.aem.live`;

        const envContent = `# EDS Project Configuration
# Generated by Adobe Demo Builder

# ACCS (Adobe Commerce) Configuration
ACCS_ENDPOINT=${config.accsEndpoint}

# DA.live Configuration
DA_LIVE_ORG=${config.daLiveOrg}
DA_LIVE_SITE=${config.daLiveSite}

# Helix URLs
PREVIEW_URL=${previewUrl}
LIVE_URL=${liveUrl}

# GitHub Repository
GITHUB_OWNER=${config.githubOwner}
GITHUB_REPO=${config.repoName}
REPO_URL=${repo.htmlUrl}
`;

        try {
            await fs.writeFile(envPath, envContent, 'utf-8');
            this.logger.debug(`[EDS] .env file generated`);
        } catch (error) {
            throw new EdsProjectError(
                `Failed to generate .env file: ${(error as Error).message}`,
                'env-config',
                error as Error,
            );
        }
    }
}

/** URL generation helpers */
export const generatePreviewUrl = (owner: string, repo: string): string =>
    `https://${DEFAULT_BRANCH}--${repo}--${owner}.aem.page`;

export const generateLiveUrl = (owner: string, repo: string): string =>
    `https://${DEFAULT_BRANCH}--${repo}--${owner}.aem.live`;
