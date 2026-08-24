/**
 * Mesh Catalog Derivation
 *
 * Mesh catalog entries are DERIVED here, never authored. Two configs already own
 * every fact one needs, and they are the pair project creation uses:
 *
 *   - `stacks.json`     — which mesh a frontend+backend pair uses
 *                         (`stack.optionalDependencies`)
 *   - `components.json` — that mesh's name, description, repository, pinned git
 *                         ref, and env contract (`mesh.<id>`)
 *
 * Deriving is what keeps the dashboard's Add picker and the creation wizard on
 * ONE mesh identity. They were previously separate: `app-builder-components.json`
 * hand-authored three mesh rows in their own id namespace, and a third file
 * (`appBuilderComponentSelectionState`) existed only to translate between the two.
 * The translation table was correct, which is precisely why the defect survived —
 * each authored row's `source.repo` had been filled in to match its OWN id string
 * rather than the registry component it stood for, so both EDS rows cloned the
 * wrong repository:
 *
 *   catalog `commerce-eds-mesh` (EDS+ACCS) → cloned skukla/commerce-eds-mesh,
 *   which is the PaaS mesh; the actual ACCS mesh (skukla/eds-accs-mesh) was
 *   reachable from no row at all.
 *
 * A derived entry cannot drift that way: the repo comes from the registry url of
 * the very id being derived.
 *
 * @module features/components/services/meshCatalogDerivation
 */

import stacksConfig from '../config/stacks.json';
import componentsConfig from '@/features/components/config/components.json';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AddonSource } from '@/types/demoPackages';

/**
 * Every API Mesh deploy subscribes the same Adobe API, so this is a property of
 * API Mesh rather than of any one mesh repo — it has no per-mesh home in the
 * registry and does not earn one.
 */
const MESH_REQUIRED_APIS = ['GraphQLServiceSDK'];

/** The registry shape this module reads (a narrow view of components.json). */
interface RegistryMeshDefinition {
    name: string;
    description?: string;
    source?: {
        url?: string;
        gitOptions?: { tag?: string; branch?: string };
    };
    configuration?: { providesEnvVars?: string[] };
}

const registryMeshes =
    (componentsConfig as unknown as { mesh?: Record<string, RegistryMeshDefinition> }).mesh ?? {};

/** Stack rows carry the frontend/backend pair and the mesh ids they may use. */
interface StackRow {
    frontend?: string;
    backend?: string;
    dependencies?: string[];
    optionalDependencies?: string[];
}

const stacks = (stacksConfig as unknown as { stacks?: StackRow[] }).stacks ?? [];

/**
 * Split a GitHub clone url into {owner, repo}.
 *
 * Returns undefined for anything that is not a GitHub url, so a registry entry
 * pointing somewhere else is skipped rather than deriving a broken source.
 */
function parseGitHubUrl(url: string): { owner: string; repo: string } | undefined {
    const match = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url);
    if (!match) return undefined;
    return { owner: match[1], repo: match[2] };
}

/**
 * Resolve a registry mesh's clone source, preferring its pinned tag.
 *
 * `AddonSource.branch` is passed to `git clone --branch`, which accepts a tag
 * just as well as a branch — so the registry's `tag: "stable"` pin survives into
 * the dashboard path instead of being flattened to `main`.
 */
function resolveSource(definition: RegistryMeshDefinition): AddonSource | undefined {
    const url = definition.source?.url;
    if (!url) return undefined;
    const parsed = parseGitHubUrl(url);
    if (!parsed) return undefined;
    const gitOptions = definition.source?.gitOptions;
    return { ...parsed, branch: gitOptions?.tag ?? gitOptions?.branch ?? 'main' };
}

/** Accumulated frontend/backend ids for one mesh id. */
interface MeshAxes {
    frontends: Set<string>;
    backends: Set<string>;
}

/**
 * Collect, per mesh id, every frontend and backend whose stack offers it.
 *
 * A mesh offered by more than one stack accumulates the union — which is how
 * `headless-commerce-mesh` ends up compatible with both Commerce backends
 * without either fact being written down twice.
 */
function collectAxesByMeshId(): Map<string, MeshAxes> {
    const axes = new Map<string, MeshAxes>();
    for (const stack of stacks) {
        const meshIds = [...(stack.dependencies ?? []), ...(stack.optionalDependencies ?? [])];
        for (const id of meshIds) {
            if (!(id in registryMeshes)) continue;
            const existing = axes.get(id) ?? { frontends: new Set(), backends: new Set() };
            if (stack.frontend) existing.frontends.add(stack.frontend);
            if (stack.backend) existing.backends.add(stack.backend);
            axes.set(id, existing);
        }
    }
    return axes;
}

/**
 * Build the mesh half of the App Builder component catalog from the registry.
 *
 * Ids are REGISTRY ids (`eds-accs-mesh`, not `commerce-eds-mesh`), which is what
 * lets `isMeshComponentId`, the keyed `appBuilderComponents` map, and
 * `regenerateProjectEnvFiles` all recognise a dashboard-added mesh.
 *
 * A mesh no stack offers is not derived: reachability through `stacks.json` is
 * the definition of "the extension ships this mesh".
 *
 * @returns One catalog entry per registry mesh reachable from a stack
 */
export function deriveMeshCatalogEntries(): AppBuilderComponentCatalogEntry[] {
    const entries: AppBuilderComponentCatalogEntry[] = [];
    for (const [id, axes] of collectAxesByMeshId()) {
        const definition = registryMeshes[id];
        const source = resolveSource(definition);
        if (!source) continue;
        entries.push({
            id,
            name: definition.name,
            description: definition.description ?? definition.name,
            kind: 'mesh',
            source,
            compatibleFrontends: [...axes.frontends],
            compatibleBackends: [...axes.backends],
            requiredApis: MESH_REQUIRED_APIS,
            providesEnvVars: definition.configuration?.providesEnvVars ?? [],
        });
    }
    return entries;
}
