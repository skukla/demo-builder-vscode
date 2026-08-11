/**
 * AppBuilderComponent Selection Model (D2 Track B — Step 01)
 *
 * Pure, side-effect-free backbone shared by the wizard picker (Step 03),
 * Configure (Step 04), and the dashboard list (Step 05). Turns the
 * axis-filtered catalog (appBuilderComponentCatalogLoader) into a list the pickers
 * render, annotating each entry with a required/optional requirement.
 *
 * The requirement rule GENERALIZES today's mesh `requiresMesh` toggle to any
 * appBuilderComponent id and mirrors the block-library nativeForPackages /
 * onlyForPackages scoping precedent (blockLibraryLoader):
 *   - onlyForPackages excludes the entry from non-listed packages.
 *   - nativeForPackages → 'required' (auto-included, shown locked).
 *   - a mesh-kind entry resolves from the package's requiresMesh
 *     (true → required; 'optional'/undefined → optional).
 *   - everything else → 'optional' (toggleable).
 *
 * No new package-config JSON fields are introduced (Rule of Three): mesh reuses
 * `requiresMesh`; non-mesh scoping reuses the catalog entry's native/only fields.
 *
 * @module features/project-creation/services/appBuilderComponentSelection
 */

import { getAvailableAppBuilderComponents } from './appBuilderComponentCatalogLoader';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { DemoPackage } from '@/types/demoPackages';

/** Whether the user must keep this appBuilderComponent (locked) or may toggle it. */
export type AppBuilderComponentRequirement = 'required' | 'optional';

/** A catalog entry annotated with its package-resolved requirement. */
export type SelectableAppBuilderComponent = AppBuilderComponentCatalogEntry & {
    requirement: AppBuilderComponentRequirement;
};

/** True when the entry is available for the package (onlyForPackages scoping). */
function isAvailableForPackage(entry: AppBuilderComponentCatalogEntry, packageId: string): boolean {
    if (entry.onlyForPackages && !entry.onlyForPackages.includes(packageId)) {
        return false;
    }
    return true;
}

/**
 * Resolve the required/optional requirement for one entry against a package.
 *
 * Mirrors block-library native scoping and generalizes the mesh requiresMesh
 * precedent. Kept under the complexity limit with early returns (no nested
 * ternaries).
 */
function resolveRequirement(
    pkg: DemoPackage,
    entry: AppBuilderComponentCatalogEntry,
): AppBuilderComponentRequirement {
    if (entry.nativeForPackages?.includes(pkg.id)) {
        return 'required';
    }
    if (entry.kind === 'mesh' && pkg.requiresMesh === true) {
        return 'required';
    }
    return 'optional';
}

/**
 * Get the appBuilderComponents a package may select for the chosen backend + frontend.
 *
 * Delegates axis filtering to getAvailableAppBuilderComponents, applies onlyForPackages
 * scoping, then annotates each surviving entry with its requirement.
 *
 * @param pkg - The selected demo package (provides id + requiresMesh)
 * @param backendId - Selected backend id (e.g. "adobe-commerce-paas")
 * @param frontendId - Selected frontend id (e.g. "eds-storefront")
 * @returns Axis-filtered, package-scoped, requirement-annotated entries
 */
export function getSelectableAppBuilderComponents(
    pkg: DemoPackage,
    backendId: string,
    frontendId: string,
): SelectableAppBuilderComponent[] {
    return getAvailableAppBuilderComponents(backendId, frontendId)
        .filter(entry => isAvailableForPackage(entry, pkg.id))
        .map(entry => ({ ...entry, requirement: resolveRequirement(pkg, entry) }));
}
