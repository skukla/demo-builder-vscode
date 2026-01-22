/**
 * Component Repository Resolver
 *
 * Resolves Git repository URLs for components by reading from components.json.
 * This eliminates hardcoded repository mappings and ensures updates use the same
 * source of truth as component installation.
 *
 * Extracts repository information from all component types:
 * - frontends (headless)
 * - mesh (commerce-mesh)
 * - appBuilderApps (integration-service)
 * - tools (commerce-demo-ingestion)
 */

import * as path from 'path';
import { ConfigurationLoader } from '@/core/config/ConfigurationLoader';
import type { RawComponentRegistry, RawComponentDefinition } from '@/types';
import type { Logger } from '@/types/logger';

export interface ComponentRepositoryInfo {
    /** Component ID (e.g., 'commerce-mesh', 'headless') */
    id: string;
    /** GitHub repository in owner/repo format (e.g., 'skukla/headless-citisignal-mesh') */
    repository: string;
    /** Component name for display */
    name: string;
}

export class ComponentRepositoryResolver {
    private loader: ConfigurationLoader<RawComponentRegistry>;
    private logger: Logger;
    private cache: Map<string, ComponentRepositoryInfo> | null = null;

    constructor(extensionPath: string, logger: Logger) {
        const registryPath = path.join(
            extensionPath,
            'src',
            'features',
            'components',
            'config',
            'components.json',
        );
        this.loader = new ConfigurationLoader<RawComponentRegistry>(registryPath);
        this.logger = logger;
    }

    /**
     * Get repository information for a specific component
     */
    async getRepositoryInfo(componentId: string): Promise<ComponentRepositoryInfo | null> {
        const allRepos = await this.getAllRepositories();
        return allRepos.get(componentId) || null;
    }

    /**
     * Get all component repositories from components.json
     * Results are cached after first load
     */
    async getAllRepositories(): Promise<Map<string, ComponentRepositoryInfo>> {
        if (this.cache) {
            return this.cache;
        }

        const registry = await this.loader.load();
        const repositories = new Map<string, ComponentRepositoryInfo>();

        // Extract repositories from each component category
        this.extractFromCategory(registry.frontends, repositories);
        this.extractFromCategory(registry.mesh, repositories);
        this.extractFromCategory(registry.appBuilderApps, repositories);
        this.extractFromCategory(registry.tools, repositories);

        this.cache = repositories;
        return repositories;
    }

    /**
     * Clear the cache (useful for testing or when components.json changes)
     */
    clearCache(): void {
        this.cache = null;
    }

    /**
     * Extract repository information from a component category
     */
    private extractFromCategory(
        category: Record<string, RawComponentDefinition> | undefined,
        repositories: Map<string, ComponentRepositoryInfo>,
    ): void {
        if (!category) {
            return;
        }

        for (const [componentId, definition] of Object.entries(category)) {
            // Only process components with Git sources
            if (definition.source?.type !== 'git' || !definition.source.url) {
                continue;
            }

            // Extract owner/repo from URL
            // Supports: https://github.com/owner/repo, https://github.com/owner/repo.git
            const repository = this.extractRepositoryFromUrl(definition.source.url);
            if (!repository) {
                this.logger.warn(
                    `[ComponentRepositoryResolver] Could not parse repository URL for ${componentId}: ${definition.source.url}`,
                );
                continue;
            }

            repositories.set(componentId, {
                id: componentId,
                repository,
                name: definition.name,
            });

            this.logger.trace(
                `[ComponentRepositoryResolver] ${componentId} → ${repository}`,
            );
        }
    }

    /**
     * Extract owner/repo from GitHub URL
     * @param url - GitHub repository URL
     * @returns Repository in owner/repo format, or null if invalid
     */
    private extractRepositoryFromUrl(url: string): string | null {
        try {
            // Remove .git suffix if present
            const cleanUrl = url.replace(/\.git$/, '');

            // Extract owner/repo from URL
            // Matches: https://github.com/owner/repo
            const match = cleanUrl.match(/github\.com\/([^/]+\/[^/]+)/);
            if (match && match[1]) {
                return match[1];
            }

            return null;
        } catch {
            return null;
        }
    }
}
