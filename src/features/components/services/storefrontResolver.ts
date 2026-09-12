/**
 * The one place that answers "what storefront is this project on".
 *
 * The project's own row wins (`project.demo`, written when a project is built
 * on an added demo, decision D2 of the portable-demos plan); the shipped
 * catalog answers for every other project. Every post-creation reader — reset,
 * republish, the dashboards, the AI bundle, the config generator — goes through
 * here, so a project on a colleague's storefront behaves like one on a shipped
 * brand without each reader learning about the row.
 *
 * Pure over data: the catalog is an injectable parameter defaulting to the
 * bundled JSON (the seam-injection standard), so the webview bundles can call
 * it and tests hand in a fixture. The only other module that reads the bundled
 * catalog is `demoPackageLoader.ts`; `tests/templates/spine-chokepoints.test.ts`
 * pins that.
 *
 * Template identity for UPDATES is deliberately not answered here: the update
 * checker compares `lastSyncedCommit` against the repository that commit belongs
 * to, and that pair is one record, written into the EDS instance metadata at
 * creation and on every reset (`getTemplateSource`, `updateTypes.ts`). This
 * resolver says where a reset goes; that record says what an update compares.
 *
 * @module features/components/services/storefrontResolver
 */

import demoPackagesConfig from '../config/demo-packages.json';
import type { Project } from '@/types/base';
import type { DemoPackage, DemoPackagesConfig, Storefront } from '@/types/demoPackages';
import { ADDED_DEMO_ID_PREFIX, type AddedDemo } from '@/types/projectFile';

/** The three fields a lookup reads — a wizard state or a payload can satisfy it, not only a `Project`. */
export type StorefrontLookup = Pick<Project, 'selectedPackage' | 'selectedStack' | 'demo'>;

export interface ResolvedStorefront {
    /** The package the project is on: a catalog entry, or one derived from the project's row. */
    package: DemoPackage;
    /** The storefront for the project's stack, when the package has one. */
    storefront: Storefront | undefined;
    /** Where the answer came from, for a log line or a subtitle that wants to say. */
    source: 'project' | 'catalog';
}

// `Partial`: the JSON is cast, not checked, and a catalog with no collection at all must answer "nothing" rather than throw.
const BUNDLED_PACKAGES: readonly DemoPackage[] =
    (demoPackagesConfig as unknown as Partial<DemoPackagesConfig>).packages ?? [];

/**
 * Resolve a project's package and storefront: its own row first, the catalog second.
 *
 * @param project - The ids (and row) to look up
 * @param packages - The catalog; defaults to the bundled one
 * @returns The package, its storefront for the stack, and which source answered;
 *   `undefined` when neither the row nor the catalog knows the project
 */
export function resolveStorefrontForProject(
    project: StorefrontLookup,
    packages: readonly DemoPackage[] = BUNDLED_PACKAGES,
): ResolvedStorefront | undefined {
    if (project.demo) {
        const pkg = packageFromAddedDemo(project.demo, project.selectedStack);
        return { package: pkg, storefront: storefrontFromAddedDemo(project.demo), source: 'project' };
    }
    if (!project.selectedPackage) return undefined;
    const pkg = packages.find((p) => p.id === project.selectedPackage);
    if (!pkg) return undefined;
    const storefront = project.selectedStack ? pkg.storefronts[project.selectedStack] : undefined;
    return { package: pkg, storefront, source: 'catalog' };
}

/** The id a project on an added demo carries: prefixed, so it can never collide with a shipped id. */
export function addedDemoId(demo: Pick<AddedDemo, 'source'>): string {
    return `${ADDED_DEMO_ID_PREFIX}${demo.source.owner}/${demo.source.repo}`;
}

/**
 * The row as a catalog entry, so readers that want a `DemoPackage` get one. The
 * storefront is keyed under the project's stack when it has one; a row is one
 * storefront, whichever stack the project chose.
 */
function packageFromAddedDemo(demo: AddedDemo, stackId: string | undefined): DemoPackage {
    const storefront = storefrontFromAddedDemo(demo);
    return {
        id: addedDemoId(demo),
        name: demo.name,
        description: demo.description ?? '',
        icon: demo.icon,
        configDefaults: demo.configDefaults ?? {},
        configFlags: demo.configFlags,
        requiresMesh: demo.requiresMesh,
        datapack: demo.datapack,
        integrations: demo.integrations,
        storefronts: stackId ? { [stackId]: storefront } : {},
    };
}

/**
 * The row's repository as a storefront. Template identity is the repository
 * itself, so reset goes back to it; no patches, pinning, overlay or brand
 * assets (D4: a colleague's code is theirs).
 */
function storefrontFromAddedDemo(demo: AddedDemo): Storefront {
    const { owner, repo, branch } = demo.source;
    return {
        name: demo.name,
        description: demo.description ?? '',
        source: {
            type: 'git',
            url: `https://github.com/${owner}/${repo}`,
            branch: branch ?? 'main',
            gitOptions: { shallow: true },
        },
        ...(demo.contentSource ? { contentSource: demo.contentSource } : {}),
        templateOwner: owner,
        templateRepo: repo,
    };
}
