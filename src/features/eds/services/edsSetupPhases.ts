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
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { ComponentManager } from '@/features/components/services/componentManager';
import type { Logger } from '@/types/logger';
import type { DaLiveOrgOperations } from './daLiveOrgOperations';
import type { DaLiveContentOperations } from './daLiveContentOperations';
import type { GitHubTokenService } from './githubTokenService';
import type { GitHubRepoOperations } from './githubRepoOperations';
import {
    EdsProjectError,
    type EdsProjectConfig,
    type GitHubRepo,
} from './types';

/**
 * GitHub services for EDS phases
 */
export interface GitHubServicesForPhases {
    tokenService: GitHubTokenService;
    repoOperations: GitHubRepoOperations;
}

// Constants
const CITISIGNAL_TEMPLATE = {
    owner: 'skukla',
    repo: 'citisignal-one',
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
            const repo = await this.repoOperations.createFromTemplate(
                CITISIGNAL_TEMPLATE.owner,
                CITISIGNAL_TEMPLATE.repo,
                config.repoName,
                config.isPrivate ?? false,
            );

            this.logger.debug(`[EDS] Repository created: ${repo.fullName}`);
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

    async clone(repo: GitHubRepo, config: EdsProjectConfig): Promise<void> {
        this.logger.debug(`[EDS] Cloning repository to: ${config.projectPath}`);

        try {
            await this.repoOperations.cloneRepository(repo.cloneUrl, config.projectPath);
            this.logger.debug(`[EDS] Repository cloned successfully`);
        } catch (error) {
            throw new EdsProjectError(
                `Failed to clone repository: ${(error as Error).message}`,
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
    constructor(
        private authService: AuthenticationService,
        private logger: Logger,
    ) {}

    async configure(config: EdsProjectConfig, repo: GitHubRepo): Promise<void> {
        this.logger.debug(`[EDS] Configuring Helix 5 for: ${repo.fullName}`);

        try {
            const tokenManager = this.authService.getTokenManager();
            const token = await tokenManager.getAccessToken();

            if (!token) {
                throw new Error('Not authenticated with Adobe IMS');
            }

            const configUrl = `${HELIX_CONFIG_URL}/${config.githubOwner}/${config.repoName}/${DEFAULT_BRANCH}`;

            const configBody = {
                contentBusId: `${config.daLiveOrg}/${config.daLiveSite}`,
                mountpoints: {
                    '/': `https://content.da.live/${config.daLiveOrg}/${config.daLiveSite}/`,
                },
            };

            const response = await fetch(configUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(configBody),
                signal: AbortSignal.timeout(TIMEOUTS.EDS_HELIX_CONFIG),
            });

            if (!response.ok) {
                throw new Error(`Helix config API returned ${response.status}`);
            }

            this.logger.debug(`[EDS] Helix 5 configured successfully`);
        } catch (error) {
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

    async verifyCodeSync(config: EdsProjectConfig, _repo: GitHubRepo): Promise<void> {
        this.logger.debug(`[EDS] Verifying code sync for: ${config.githubOwner}/${config.repoName}`);

        const codeUrl = `${HELIX_CODE_URL}/${config.githubOwner}/${config.repoName}/${DEFAULT_BRANCH}/scripts/aem.js`;
        const pollInterval = TIMEOUTS.EDS_CODE_SYNC_POLL;

        let attempts = 0;

        while (attempts < MAX_CODE_SYNC_ATTEMPTS) {
            attempts++;

            try {
                const response = await fetch(codeUrl, {
                    method: 'GET',
                    signal: AbortSignal.timeout(pollInterval),
                });

                if (response.ok) {
                    this.logger.debug(`[EDS] Code synced after ${attempts} attempts`);
                    return;
                }

                if (response.status === 404) {
                    this.logger.debug(`[EDS] Code not synced yet, attempt ${attempts}/${MAX_CODE_SYNC_ATTEMPTS}`);
                }
            } catch {
                this.logger.debug(`[EDS] Code sync poll failed, attempt ${attempts}/${MAX_CODE_SYNC_ATTEMPTS}`);
            }

            if (attempts < MAX_CODE_SYNC_ATTEMPTS) {
                await new Promise((resolve) => setTimeout(resolve, pollInterval));
            }
        }

        throw new EdsProjectError(
            `Code sync timeout after ${MAX_CODE_SYNC_ATTEMPTS} attempts`,
            'code-sync',
        );
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

        const envPath = path.join(config.projectPath, '.env');

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
