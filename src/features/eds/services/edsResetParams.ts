/**
 * EDS Reset — Parameter types and extraction
 *
 * Defines the parameter shape for EDS reset operations and the
 * extractResetParams helper that validates and builds those parameters
 * from a Project instance.
 *
 * Separated from edsResetService to keep the service file under 500 lines.
 *
 * @module features/eds/services/edsResetParams
 */

import { COMPONENT_IDS } from '@/core/constants';
import demoPackagesConfig from '@/features/project-creation/config/demo-packages.json';
import type { Project } from '@/types/base';
import type { HandlerResponse } from '@/types/handlers';

// ==========================================================
// Types
// ==========================================================

/**
 * Parameters for EDS reset operation
 */
export interface EdsResetParams {
    // Repository
    repoOwner: string;
    repoName: string;

    // DA.live
    daLiveOrg: string;
    daLiveSite: string;

    // Template
    templateOwner: string;
    templateRepo: string;
    contentSource?: {
        org: string;
        site: string;
        indexPath?: string;
    };

    // Project data for config generation
    project: Project;

    // Optional features
    /** Include block library configuration (default: false) */
    includeBlockLibrary?: boolean;
    /** Verify CDN resources after publish (default: false) */
    verifyCdn?: boolean;
    /** Redeploy API Mesh after reset (default: false) */
    redeployMesh?: boolean;
    /** Content patches to apply during content copy */
    contentPatches?: string[];
}

/**
 * Progress callback info for EDS reset
 */
export interface EdsResetProgress {
    step: number;
    totalSteps: number;
    message: string;
}

/**
 * Result of EDS reset operation
 */
export interface EdsResetResult extends HandlerResponse {
    /** Number of files reset in repository */
    filesReset?: number;
    /** Number of content files copied */
    contentCopied?: number;
    /** Whether mesh was redeployed */
    meshRedeployed?: boolean;
    /** Specific error type for UI handling */
    errorType?: string;
    /** Additional error details */
    errorDetails?: Record<string, unknown>;
}

/**
 * Result of parameter extraction
 */
export type ExtractParamsResult = {
    success: true;
    params: EdsResetParams;
} | {
    success: false;
    error: string;
    code?: string;
};

// ==========================================================
// Validation
// ==========================================================

/** Validate that a GitHub owner or repo name is safe for URL construction. */
export function assertValidGitHubSlug(value: string, field: string): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
        throw new Error(`Invalid ${field}: must contain only alphanumeric characters, hyphens, and underscores`);
    }
}

// ==========================================================
// Parameter Extraction
// ==========================================================

/**
 * Extract reset parameters from a project
 *
 * Reads EDS metadata and template configuration from project and demo packages.
 *
 * @param project - Project to extract parameters from
 * @returns Extraction result with params or error
 */
export function extractResetParams(project: Project): ExtractParamsResult {
    // Get EDS metadata from component instance (project-specific data)
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const repoFullName = edsInstance?.metadata?.githubRepo as string | undefined;
    const daLiveOrg = edsInstance?.metadata?.daLiveOrg as string | undefined;
    const daLiveSite = edsInstance?.metadata?.daLiveSite as string | undefined;

    // Derive template config from brand+stack (source of truth)
    const pkg = demoPackagesConfig.packages.find((p: { id: string }) => p.id === project.selectedPackage);
    const storefronts = pkg?.storefronts as Record<string, {
        templateOwner?: string;
        templateRepo?: string;
        contentSource?: { org: string; site: string; indexPath?: string };
        contentPatches?: string[];
    }> | undefined;
    const storefront = project.selectedStack ? storefronts?.[project.selectedStack] : undefined;
    const templateOwner = storefront?.templateOwner;
    const templateRepo = storefront?.templateRepo;
    const contentSourceConfig = storefront?.contentSource;
    const contentPatches = storefront?.contentPatches;

    // Validate required fields
    if (!repoFullName) {
        return {
            success: false,
            error: 'EDS metadata missing - no GitHub repository configured',
            code: 'CONFIG_INVALID',
        };
    }

    const [repoOwner, repoName] = repoFullName.split('/');
    if (!repoOwner || !repoName) {
        return {
            success: false,
            error: 'Invalid repository format',
            code: 'CONFIG_INVALID',
        };
    }

    // Validate GitHub slug characters — values are used directly in Helix API URL construction
    try {
        assertValidGitHubSlug(repoOwner, 'repoOwner');
        assertValidGitHubSlug(repoName, 'repoName');
    } catch (error) {
        return { success: false, error: (error as Error).message, code: 'CONFIG_INVALID' };
    }

    if (!daLiveOrg || !daLiveSite) {
        return {
            success: false,
            error: 'DA.live configuration missing',
            code: 'CONFIG_INVALID',
        };
    }

    // Validate DA.live org/site slugs — used directly in content source URL construction
    try {
        assertValidGitHubSlug(daLiveOrg, 'daLiveOrg');
        assertValidGitHubSlug(daLiveSite, 'daLiveSite');
    } catch (error) {
        return { success: false, error: (error as Error).message, code: 'CONFIG_INVALID' };
    }

    if (!templateOwner || !templateRepo) {
        return {
            success: false,
            error: 'Template configuration missing. Cannot reset without knowing the template repository.',
            code: 'CONFIG_INVALID',
        };
    }

    return {
        success: true,
        params: {
            repoOwner,
            repoName,
            daLiveOrg,
            daLiveSite,
            templateOwner,
            templateRepo,
            ...(contentSourceConfig && { contentSource: contentSourceConfig }),
            project,
            contentPatches,
        },
    };
}
