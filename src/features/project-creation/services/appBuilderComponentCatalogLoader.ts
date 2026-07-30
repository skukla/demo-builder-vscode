/**
 * AppBuilderComponent Catalog Loader
 *
 * Loads and filters the pre-built appBuilderComponent catalog (app-builder-components.json) — the
 * 6th declarative config, mirroring blockLibraryLoader. Filters by the user's
 * chosen backend/frontend and resolves entry source + env schema for the
 * selection/deploy paths.
 *
 * @module features/project-creation/services/appBuilderComponentCatalogLoader
 */

import appBuilderComponentsConfig from '../config/app-builder-components.json';
import type {
    AppBuilderComponentsCatalog,
    AppBuilderComponentCatalogEntry,
    AppBuilderComponentEnvVar,
} from '@/types/appBuilderComponents';
import type { AddonSource } from '@/types/demoPackages';

const config = appBuilderComponentsConfig as unknown as AppBuilderComponentsCatalog;

/** An App Builder component fits an axis if it is unconstrained on it OR lists the id. */
function fitsAxis(constraint: string[] | undefined, id: string): boolean {
    if (!constraint || constraint.length === 0) return true;
    return constraint.includes(id);
}

/**
 * Get all pre-built appBuilderComponents compatible with the given backend + frontend.
 *
 * An entry matches when it is unconstrained on (or lists) BOTH the backend and
 * the frontend. Unconstrained axes match any id.
 *
 * @param backendId - Selected backend id (e.g. "adobe-commerce-paas")
 * @param frontendId - Selected frontend id (e.g. "eds-storefront", "headless")
 * @returns Array of compatible catalog entries (empty if none match)
 */
export function getAvailableAppBuilderComponents(
    backendId: string,
    frontendId: string,
): AppBuilderComponentCatalogEntry[] {
    return config.appBuilderComponents.filter(
        (entry) =>
            fitsAxis(entry.compatibleBackends, backendId) &&
            fitsAxis(entry.compatibleFrontends, frontendId),
    );
}

/**
 * Resolve a catalog entry by id.
 *
 * @param id - The appBuilderComponent id (e.g. "commerce-paas-mesh")
 * @returns The entry, or undefined if unknown
 */
export function getAppBuilderComponentEntry(
    id: string,
): AppBuilderComponentCatalogEntry | undefined {
    return config.appBuilderComponents.find((entry) => entry.id === id);
}

/**
 * Whether a GitHub source matches a blank/starter (`blank: true`) catalog
 * entry — the "built with AI" recognition used by the dashboard card model.
 * Matches on owner AND repo, so a fork of the shell repo under a different
 * owner is NOT recognized as AI-built.
 *
 * @param source - A component's GitHub source ({owner, repo})
 * @returns true when the source is a blank catalog entry's repo
 */
export function isBlankSource(source: { owner: string; repo: string }): boolean {
    return config.appBuilderComponents.some(
        (entry) =>
            entry.blank === true &&
            entry.source.owner === source.owner &&
            entry.source.repo === source.repo,
    );
}

/**
 * GitHub owner/repo charset — mirrors the dashboard's resolvePublicRepo gate
 * (appComponentManager). owner/repo are interpolated into a shell-executed
 * `git clone` and into componentDef.id (a path segment), so shell
 * metacharacters and dot-only names are rejected fail-fast. Sources can arrive
 * from imported settings files, not just the UI, so the gate lives here.
 */
const GITHUB_NAME = /^[A-Za-z0-9._-]+$/;
/** Safe git ref charset (branch names may contain slashes; `..` is rejected separately). */
const GIT_REF = /^[A-Za-z0-9._/-]+$/;

function assertGitHubName(value: string, label: string): void {
    if (!GITHUB_NAME.test(value) || value === '.' || value === '..') {
        throw new Error(`Invalid GitHub ${label}: "${value}"`);
    }
}

function assertGitRef(value: string): void {
    if (!GIT_REF.test(value) || value.includes('..')) {
        throw new Error(`Invalid git branch: "${value}"`);
    }
}

/**
 * An explicit instance id becomes a `components/<id>/` folder segment and a
 * `deriveOwPackage` input, so it is gated on the same safe charset as
 * owner/repo (GITHUB_NAME; dot-only names rejected as path traversal).
 */
function assertInstanceId(value: string): void {
    if (!GITHUB_NAME.test(value) || value === '.' || value === '..') {
        throw new Error(`Invalid integration instance id: "${value}"`);
    }
}

/**
 * Build a custom-URL integration entry from a user-provided GitHub source.
 *
 * The custom-URL door: an integration acquired by owner/repo (optionally branch)
 * rather than from the pre-built catalog. Branch defaults to 'main'. Shared by the
 * dashboard add-handler and the wizard creation-flow integrations phase.
 *
 * Shell instancing: when the caller passes an explicit `id` (the
 * `appBuilderComponentSources` map key), it becomes the entry id — letting N
 * named instances share one template repo. Without it, the id derives from
 * `${owner}-${repo}` (the dashboard add door, unchanged). The display name
 * resolves from `source.name` when present, else the repo name.
 *
 * @param source - The GitHub source ({owner, repo, branch?, name?})
 * @param id - Optional explicit instance id (the sources-map key)
 * @returns A synthesized `kind: 'integration'` catalog entry
 * @throws When owner/repo/branch/id fall outside the safe charsets
 *         (shell-injection and path-traversal gate — see GITHUB_NAME/GIT_REF above)
 */
export function buildCustomIntegrationEntry(
    source: {
        owner: string;
        repo: string;
        branch?: string;
        name?: string;
    },
    id?: string,
): AppBuilderComponentCatalogEntry {
    assertGitHubName(source.owner, 'owner');
    assertGitHubName(source.repo, 'repo');
    if (source.branch !== undefined) {
        assertGitRef(source.branch);
    }
    if (id !== undefined) {
        assertInstanceId(id);
    }
    return {
        id: id ?? `${source.owner}-${source.repo}`,
        name: source.name ?? source.repo,
        description: `Custom App Builder component from ${source.owner}/${source.repo}`,
        kind: 'integration',
        source: { owner: source.owner, repo: source.repo, branch: source.branch ?? 'main' },
    };
}

/**
 * Resolve an App Builder component id to its GitHub source.
 *
 * @param id - The appBuilderComponent id
 * @returns The {owner, repo, branch} source, or undefined if unknown
 */
export function getAppBuilderComponentSource(id: string): AddonSource | undefined {
    return getAppBuilderComponentEntry(id)?.source;
}

/**
 * Get an App Builder component's own env-var schema.
 *
 * @param id - The appBuilderComponent id
 * @returns The env schema array (empty if unknown or none declared)
 */
export function getAppBuilderComponentEnvSchema(id: string): AppBuilderComponentEnvVar[] {
    return getAppBuilderComponentEntry(id)?.envSchema ?? [];
}

/**
 * Get the display name for an App Builder component.
 *
 * @param id - The appBuilderComponent id
 * @returns The name, or the id as fallback
 */
export function getAppBuilderComponentName(id: string): string {
    return getAppBuilderComponentEntry(id)?.name ?? id;
}
