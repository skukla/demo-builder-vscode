/**
 * ProjectService - Simplified Project Management
 *
 * Replaces the multi-layered approach of:
 * - adobeEntityFetcher (getProjects)
 * - adobeEntitySelector (selectProject)
 * - adobeContextResolver (getCurrentProject)
 * - projectOperations (all project operations)
 *
 * Design Principle: Direct CLI calls with caching, minimal indirection.
 */

import { getLogger } from '@/core/logging';
import type { CommandExecutor } from '@/core/shell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { validateProjectId } from '@/core/validation';
import { parseJSON } from '@/types/typeGuards';
import type { AuthCache } from './authCache';
import type { AdobeProject, RawAdobeProject, AdobeConsoleWhereResponse } from './types';

export interface ProjectValidationResult {
    valid: boolean;
    project?: AdobeProject;
    error?: string;
}

/**
 * Maps raw CLI project data to AdobeProject type
 */
function mapProject(raw: RawAdobeProject): AdobeProject {
    return {
        id: raw.id,
        name: raw.name,
        title: raw.title || raw.name,
        description: raw.description,
        org_id: raw.org_id,
    };
}

/**
 * Simplified project service with direct CLI calls
 */
export class ProjectService {
    private logger = getLogger();

    constructor(
        private commandExecutor: CommandExecutor,
        private cache: AuthCache,
    ) {}

    /**
     * Get list of projects for an organization
     * Uses cache if available, otherwise fetches from CLI
     */
    async getProjects(orgId: string): Promise<AdobeProject[]> {
        // Check cache first
        const cached = this.cache.getProjects(orgId);
        if (cached) {
            return cached;
        }

        // Fetch from CLI
        const result = await this.commandExecutor.execute(
            'aio console project list --json',
            { encoding: 'utf8', timeout: TIMEOUTS.NORMAL },
        );

        // Handle "no projects" case gracefully
        if (result.code !== 0) {
            if (result.stderr?.includes('does not have any projects')) {
                return [];
            }
            throw new Error(`Failed to get projects: ${result.stderr || 'Unknown error'}`);
        }

        // Parse response
        const rawProjects = parseJSON<RawAdobeProject[]>(result.stdout);
        if (!rawProjects || !Array.isArray(rawProjects)) {
            throw new Error('Invalid projects response format');
        }

        const projects = rawProjects.map(mapProject);

        // Cache the result
        this.cache.setProjects(orgId, projects);

        this.logger.debug(`[ProjectService] Retrieved ${projects.length} projects for org ${orgId}`);
        return projects;
    }

    /**
     * Select a project
     * Invalidates downstream caches (workspaces)
     */
    async selectProject(orgId: string, projectId: string): Promise<boolean> {
        // SECURITY: Validate projectId to prevent command injection
        validateProjectId(projectId);

        const result = await this.commandExecutor.execute(
            `aio console project select ${projectId}`,
            { encoding: 'utf8', timeout: TIMEOUTS.NORMAL },
        );

        if (result.code !== 0) {
            this.logger.debug(`[ProjectService] Failed to select project ${projectId}: ${result.stderr}`);
            return false;
        }

        // Update current project in cache
        const projects = await this.getProjects(orgId);
        const selectedProject = projects.find(p => p.id === projectId);
        if (selectedProject) {
            this.cache.setCurrentProject(selectedProject);
        }

        // Invalidate workspace cache for this project
        this.cache.invalidateForProject(orgId, projectId);

        this.logger.debug(`[ProjectService] Selected project: ${projectId}`);
        return true;
    }

    /**
     * Get current project from CLI context
     */
    async getCurrentProject(): Promise<AdobeProject | undefined> {
        // Check cache first
        const cached = this.cache.getCurrentProject();
        if (cached) {
            return cached;
        }

        // Fetch from CLI
        const context = await this.getConsoleWhereContext();
        if (!context?.project) {
            return undefined;
        }

        // Handle string or object format
        let project: AdobeProject | undefined;
        if (typeof context.project === 'string') {
            // Create minimal project object
            project = {
                id: context.project,
                name: context.project,
                title: context.project,
            };
        } else {
            project = {
                id: context.project.id,
                name: context.project.name,
                title: context.project.title || context.project.name,
                description: context.project.description,
                org_id: context.project.org_id,
            };
        }

        // Cache the result
        this.cache.setCurrentProject(project);
        return project;
    }

    /**
     * Validate that a project exists and is accessible
     */
    async validateProject(orgId: string, projectId: string): Promise<ProjectValidationResult> {
        const projects = await this.getProjects(orgId);
        const project = projects.find(p => p.id === projectId);

        if (!project) {
            return { valid: false, error: `Project ${projectId} not found` };
        }

        return { valid: true, project };
    }

    /**
     * Get console.where context (shared helper)
     */
    private async getConsoleWhereContext(): Promise<AdobeConsoleWhereResponse | undefined> {
        // Check cache first
        const cached = this.cache.getConsoleWhere();
        if (cached) {
            return cached;
        }

        // Fetch from CLI
        const result = await this.commandExecutor.execute(
            'aio console where --json',
            { encoding: 'utf8', timeout: TIMEOUTS.NORMAL },
        );

        if (result.code !== 0 || !result.stdout) {
            return undefined;
        }

        const context = parseJSON<AdobeConsoleWhereResponse>(result.stdout);
        if (!context) {
            return undefined;
        }

        // Cache the result
        this.cache.setConsoleWhere(context);
        return context;
    }
}
