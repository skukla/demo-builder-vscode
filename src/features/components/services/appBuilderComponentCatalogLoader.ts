/**
 * AppBuilderComponent Catalog Loader
 *
 * Loads and filters the pre-built appBuilderComponent catalog — the 6th
 * declarative config, mirroring blockLibraryLoader. Filters by the user's chosen
 * backend/frontend and resolves entry source + env schema for the
 * selection/deploy paths.
 *
 * The catalog has TWO halves and only one of them is authored:
 *
 *   - integrations — authored in `app-builder-components.json`
 *   - meshes       — DERIVED from `stacks.json` + `components.json`
 *                    (see {@link deriveMeshCatalogEntries})
 *
 * Meshes are derived because they already existed in the registry, and the
 * hand-authored copies had drifted: both EDS rows cloned the wrong repository.
 * Authoring a mesh row here again would re-create that second contract — add it
 * to `stacks.json` and `components.json` instead, exactly as project creation
 * expects.
 *
 * @module features/components/services/appBuilderComponentCatalogLoader
 */

import appBuilderComponentsConfig from '../config/app-builder-components.json';
import { deriveMeshCatalogEntries } from './meshCatalogDerivation';
import type {
    AppBuilderComponentsCatalog,
    AppBuilderComponentCatalogEntry,
} from '@/types/appBuilderComponents';

const authored = appBuilderComponentsConfig as unknown as AppBuilderComponentsCatalog;

/**
 * The full catalog: derived meshes first, then authored integrations.
 *
 * Computed once at module load — both inputs are static JSON, so there is
 * nothing to invalidate.
 */
const allEntries: AppBuilderComponentCatalogEntry[] = [
    ...deriveMeshCatalogEntries(),
    ...authored.appBuilderComponents,
];

const config = { ...authored, appBuilderComponents: allEntries };

/** An App Builder component fits an axis if it is unconstrained on it OR lists the id. */
function fitsAxis(constraint: string[] | undefined, id: string): boolean {
    if (!constraint || constraint.length === 0) return true;
    return constraint.includes(id);
}

/**
 * Does one entry fit the project's stack? The single-entry form of
 * {@link getAvailableAppBuilderComponents}, for the add door: galleries are
 * already axis-filtered, but the dashboard/MCP add-by-id path resolves from
 * the RAW catalog, so a constrained entry (the starter kit is Commerce-only)
 * could be added to a project whose stack cannot use it. A backendless
 * project passes `''`, which no constrained entry lists — so a Commerce-gated
 * entry is refused there too, by the same rule the galleries use.
 *
 * @param entry - the resolved catalog (or synthesized custom) entry
 * @param backendId - the project's backend id ('' when none)
 * @param frontendId - the project's frontend id ('' when none)
 * @returns true when both axes fit
 */
export function entryFitsProjectAxes(
    entry: AppBuilderComponentCatalogEntry,
    backendId: string,
    frontendId: string,
): boolean {
    return (
        fitsAxis(entry.compatibleBackends, backendId) &&
        fitsAxis(entry.compatibleFrontends, frontendId)
    );
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
 * Is this entry a genuine PRE-BUILT integration — something the "Pre-built
 * integration" gallery should offer?
 *
 * The catalog is a mixed list and most of it is not. Meshes are DERIVED from
 * stacks.json + components.json and the kind picker already offers them as
 * "API Mesh"; the blank shell is authored as `kind:'integration'` but seeds the
 * "Build custom" flow. Showing either in the gallery lists the same thing twice
 * under two names — which is what a colleague hit on 2026-08-06, seeing two
 * options in a catalog that has no pre-built integrations at all.
 *
 * The `blank` half is the one that bites: the shell IS `kind:'integration'`, so a
 * kind-only filter keeps it. That rule previously lived in a prop docblock on
 * CatalogStage rather than in code, so no caller applied it.
 *
 * @param entry - a catalog entry
 * @returns true when the entry is a finished, pickable integration
 */
export function isPrebuiltIntegration(entry: AppBuilderComponentCatalogEntry): boolean {
    return entry.kind === 'integration' && entry.blank !== true;
}

/**
 * Resolve a catalog entry by id.
 *
 * @param id - The appBuilderComponent id (e.g. "eds-commerce-mesh")
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
 * GitHub owner/repo charset. owner/repo are interpolated into a shell-executed
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

// Three one-line accessors over getAppBuilderComponentEntry were deleted
// 2026-08-23 (getAppBuilderComponentName / -Source / -EnvSchema): every
// production consumer reads the entry's field directly, and the accessors'
// only references were their own tests. Read `entry.<field>` off
// getAppBuilderComponentEntry rather than re-adding a wrapper per field.
