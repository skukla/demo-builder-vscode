/**
 * EDS Reset — Parameter types and extraction
 *
 * Defines the parameter shape for EDS reset operations and the
 * extractResetParams helper that validates and builds those parameters
 * from a Project instance.
 *
 * Separated from edsResetService to keep the service file under 500 lines.
 *
 * @module features/eds/services/reset/edsResetParams
 */

import { COMPONENT_IDS } from '@/core/constants';
import { resolveStorefrontForProject } from '@/features/components/services/storefrontResolver';
import type { Project } from '@/types/base';
import type {
    BrandAssetsConfig,
    CodePatchSource,
    DemoPackage,
    Storefront,
} from '@/types/demoPackages';
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
    /** Optional second content source for the customer account chrome (hybrid
     *  packages: B2B base + brand overlay). Overlaid after the main copy. */
    accountContentSource?: {
        org: string;
        site: string;
    };
    /** Optional BYOM content overlay URL (from storefront template). */
    byomOverlayUrl?: string;

    // Project data for config generation
    project: Project;

    // Optional features
    /** Include block library configuration (default: false) */
    includeBlockLibrary?: boolean;
    /** Verify CDN resources after publish (default: false) */
    verifyCdn?: boolean;
    /** Redeploy API Mesh after reset (default: false) */
    redeployMesh?: boolean;
    /**
     * Keep the site's current content: reset the code only. Offered when an
     * added demo's content site cannot be reached (content is not forkable).
     */
    keepContent?: boolean;
    /** Content patches to apply during content copy */
    contentPatches?: string[];
    /** External source for content patches (sibling of codePatchSource). */
    contentPatchSource?: { owner: string; repo: string; path: string };
    /** Code patch IDs to apply during reset (canonical files + installed blocks) */
    codePatches?: string[];
    /**
     * External repository for code patches. When set, `codePatches` IDs are
     * fetched from this source. Distinct from `contentPatchSource` so a
     * storefront can pin code and content ledgers independently.
     */
    codePatchSource?: CodePatchSource;
    /** Additive brand files + optional head.html snippet vendored during the
     *  shared pipeline (create + reset). From demo-packages.json storefronts. */
    brandAssets?: BrandAssetsConfig;
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
    /**
     * What the dry check of the load-bearing patches found on an added demo's
     * code (D23), in SC words. Present only for a project built on an added demo.
     */
    demoCaveats?: string[];
    /** Additional error details */
    errorDetails?: Record<string, unknown>;
}

/**
 * Result of parameter extraction
 */
export type ExtractParamsResult =
    | {
          success: true;
          params: EdsResetParams;
      }
    | {
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
        throw new Error(
            `Invalid ${field}: must contain only alphanumeric characters, hyphens, and underscores`,
        );
    }
}

/**
 * Parse and validate an "owner/repo" full name into its parts.
 *
 * @returns `{ owner, name }` on success, or `{ error }` if the format is invalid.
 */
function validateRepoFormat(
    repoFullName: string,
): { owner: string; name: string } | { error: string } {
    const [owner, name] = repoFullName.split('/');
    if (!owner || !name) {
        return { error: 'Invalid repository format' };
    }
    return { owner, name };
}

/**
 * Validate the given GitHub/DA.live slug values (used directly in API URL
 * construction). Returns an error message for the first invalid slug, or null
 * if all are valid.
 */
function validateGitHubSlugs(slugs: Array<{ value: string; field: string }>): string | null {
    try {
        for (const { value, field } of slugs) {
            assertValidGitHubSlug(value, field);
        }
        return null;
    } catch (error) {
        return (error as Error).message;
    }
}

/** The storefront-derived template configuration a reset reads. */
type StorefrontConfig = Partial<
    Pick<
        Storefront,
        | 'templateOwner'
        | 'templateRepo'
        | 'contentSource'
        | 'accountContentSource'
        | 'contentPatches'
        | 'contentPatchSource'
        | 'codePatches'
        | 'codePatchSource'
        | 'brandAssets'
        | 'byomOverlayUrl'
    >
>;

/**
 * The storefront template configuration a project resets to: its own row
 * first, the catalog second (`resolveStorefrontForProject`).
 *
 * @returns The matching storefront config, or an empty object if none matches.
 */
export function resolveStorefrontConfig(
    project: Project,
    // Injectable for tests; defaults to the bundled catalog inside the resolver.
    packages?: readonly DemoPackage[],
): StorefrontConfig {
    return resolveStorefrontForProject(project, packages)?.storefront ?? {};
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
export function extractResetParams(
    project: Project,
    // Injectable for tests; defaults to the bundled catalog inside the resolver.
    packages?: readonly DemoPackage[],
): ExtractParamsResult {
    // Get EDS metadata from component instance (project-specific data)
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const repoFullName = edsInstance?.metadata?.githubRepo as string | undefined;
    const daLiveOrg = edsInstance?.metadata?.daLiveOrg as string | undefined;
    // Legacy-first, repo fallback: the loader strips a daLiveSite that equals
    // the repo name (the normal state since the name unification), so the
    // field survives only on unmigrated projects. Caught live 2026-08-23:
    // without the fallback, reset AND refresh-block-library refused every
    // migrated project with "DA.live configuration missing".
    const daLiveSite =
        (edsInstance?.metadata?.daLiveSite as string | undefined) ??
        (repoFullName ? repoFullName.split('/')[1] : undefined);

    // Derive template config from brand+stack (source of truth)
    const {
        templateOwner,
        templateRepo,
        contentSource: contentSourceConfig,
        accountContentSource: accountContentSourceConfig,
        contentPatches,
        contentPatchSource,
        codePatches,
        codePatchSource,
        brandAssets,
        byomOverlayUrl,
    } = resolveStorefrontConfig(project, packages);

    // Validate required fields
    if (!repoFullName) {
        return {
            success: false,
            error: 'EDS metadata missing - no GitHub repository configured',
            code: 'CONFIG_INVALID',
        };
    }

    const repo = validateRepoFormat(repoFullName);
    if ('error' in repo) {
        return { success: false, error: repo.error, code: 'CONFIG_INVALID' };
    }
    const { owner: repoOwner, name: repoName } = repo;

    // Validate GitHub slug characters — values are used directly in Helix API URL construction
    const repoSlugError = validateGitHubSlugs([
        { value: repoOwner, field: 'repoOwner' },
        { value: repoName, field: 'repoName' },
    ]);
    if (repoSlugError) {
        return { success: false, error: repoSlugError, code: 'CONFIG_INVALID' };
    }

    if (!daLiveOrg || !daLiveSite) {
        return {
            success: false,
            error: 'DA.live configuration missing',
            code: 'CONFIG_INVALID',
        };
    }

    // Validate DA.live org/site slugs — used directly in content source URL construction
    const daLiveSlugError = validateGitHubSlugs([
        { value: daLiveOrg, field: 'daLiveOrg' },
        { value: daLiveSite, field: 'daLiveSite' },
    ]);
    if (daLiveSlugError) {
        return { success: false, error: daLiveSlugError, code: 'CONFIG_INVALID' };
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
            ...(accountContentSourceConfig && { accountContentSource: accountContentSourceConfig }),
            ...(byomOverlayUrl && { byomOverlayUrl }),
            project,
            contentPatches,
            ...(contentPatchSource && { contentPatchSource }),
            codePatches,
            ...(codePatchSource && { codePatchSource }),
            ...(brandAssets && { brandAssets }),
        },
    };
}
