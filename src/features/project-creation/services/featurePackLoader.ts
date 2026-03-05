/**
 * Feature Pack Loader
 *
 * Loads and filters feature packs from feature-packs.json.
 * Provides functions to determine which feature packs are available
 * for a given stack and package combination, resolve sources,
 * and retrieve config flags for injection.
 *
 * Per-package availability is defined in demo-packages.json via the
 * `featurePacks` field (required/optional/excluded), mirroring the
 * addon availability pattern.
 *
 * @module features/project-creation/services/featurePackLoader
 */

import demoPackagesConfig from '../config/demo-packages.json';
import featurePacksConfig from '../config/feature-packs.json';
import type { DemoPackagesConfig, AddonSource } from '@/types/demoPackages';
import type { FeaturePack, FeaturePacksConfig } from '@/types/featurePacks';
import type { Stack } from '@/types/stacks';

const config = featurePacksConfig as unknown as FeaturePacksConfig;
const packagesConfig = demoPackagesConfig as unknown as DemoPackagesConfig;

/**
 * Look up the per-package availability for a feature pack.
 *
 * @returns 'required' | 'optional' | 'excluded' | undefined
 */
function getPackageAvailability(packId: string, packageId: string): string | undefined {
    const pkg = packagesConfig.packages.find(p => p.id === packageId);
    return pkg?.featurePacks?.[packId];
}

/**
 * Get all feature packs available for the given stack and package.
 *
 * Returns packs that are "optional" for the package and compatible
 * with the stack's frontend type. Required packs are excluded here
 * (use getNativeFeaturePacks for those).
 *
 * @param stack - The selected stack object
 * @param packageId - The selected package ID (e.g., "isle5")
 * @returns Array of optional feature packs
 */
export function getAvailableFeaturePacks(
    stack: Stack,
    packageId: string,
): FeaturePack[] {
    return config.featurePacks.filter(pack => {
        if (!pack.stackTypes.includes(stack.frontend)) return false;
        const availability = getPackageAvailability(pack.id, packageId);
        return availability === 'optional';
    });
}

/**
 * Get feature packs that are required (native) for the given package.
 *
 * Required packs are always installed. Shown as disabled checkboxes
 * in the UI to inform the user without allowing removal.
 *
 * @param stack - The selected stack object
 * @param packageId - The selected package ID
 * @returns Array of required feature packs (empty if none)
 */
export function getNativeFeaturePacks(
    stack: Stack,
    packageId: string,
): FeaturePack[] {
    return config.featurePacks.filter(pack => {
        if (!pack.stackTypes.includes(stack.frontend)) return false;
        const availability = getPackageAvailability(pack.id, packageId);
        return availability === 'required';
    });
}

/**
 * Check whether a feature pack is available for the given package.
 *
 * Returns true for both "required" and "optional" packs.
 * Returns false for "excluded" or undefined (not listed).
 *
 * @param packId - The feature pack ID (e.g., "b2b-commerce")
 * @param packageId - The project package ID (e.g., "isle5")
 * @returns True if the pack may be used with this package
 */
export function isFeaturePackAvailableForPackage(packId: string, packageId: string): boolean {
    const availability = getPackageAvailability(packId, packageId);
    return availability === 'required' || availability === 'optional';
}

/**
 * Resolve a feature pack ID to its source configuration.
 *
 * @param packId - The feature pack ID (e.g., "b2b-commerce")
 * @returns The AddonSource, or undefined if the pack doesn't exist
 */
export function getFeaturePackSource(packId: string): AddonSource | undefined {
    const pack = config.featurePacks.find(p => p.id === packId);
    return pack?.source;
}

/**
 * Resolve a feature pack ID to its config flags.
 *
 * @param packId - The feature pack ID
 * @returns Config flag map, or undefined if no flags defined
 */
export function getFeaturePackConfigFlags(packId: string): Record<string, boolean> | undefined {
    const pack = config.featurePacks.find(p => p.id === packId);
    return pack?.configFlags;
}

/**
 * Get the display name for a feature pack.
 *
 * @param packId - The feature pack ID
 * @returns The pack name, or the ID as fallback
 */
export function getFeaturePackName(packId: string): string {
    const pack = config.featurePacks.find(p => p.id === packId);
    return pack?.name ?? packId;
}

/**
 * Get the full feature pack definition by ID.
 *
 * @param packId - The feature pack ID
 * @returns The full FeaturePack, or undefined if not found
 */
export function getFeaturePack(packId: string): FeaturePack | undefined {
    return config.featurePacks.find(p => p.id === packId);
}
