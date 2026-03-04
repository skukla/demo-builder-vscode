/**
 * Block Library Loader
 *
 * Loads and filters block libraries from block-libraries.json.
 * Provides functions to determine which libraries are available
 * for a given stack and package combination, compute defaults,
 * and resolve library sources for installation.
 *
 * @module features/project-creation/services/blockLibraryLoader
 */

import blockLibrariesConfig from '../config/block-libraries.json';
import type { BlockLibrariesConfig, BlockLibrary } from '@/types/blockLibraries';
import type { AddonSource } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';

const config = blockLibrariesConfig as unknown as BlockLibrariesConfig;

/**
 * Get all block libraries available for the given stack and package.
 *
 * Filters by stack type (e.g., EDS-only) and excludes libraries
 * whose source is the same storefront the user already selected
 * (native blocks are always included automatically).
 *
 * @param stack - The selected stack object
 * @param packageId - The selected package ID (e.g., "citisignal")
 * @returns Array of available block libraries
 */
export function getAvailableBlockLibraries(
    stack: Stack,
    packageId: string,
): BlockLibrary[] {
    return config.libraries.filter(lib => {
        if (!lib.stackTypes.includes(stack.frontend)) return false;
        if (lib.nativeForPackages?.includes(packageId)) return false;
        if (lib.onlyForPackages && !lib.onlyForPackages.includes(packageId)) return false;
        return true;
    });
}

/**
 * Get block libraries that are native to the given package.
 *
 * Native libraries have blocks that ship with the package's storefront,
 * so they're always included. Shown as disabled checkboxes in the UI
 * to inform the user without allowing removal.
 *
 * @param stack - The selected stack object
 * @param packageId - The selected package ID
 * @returns Array of native block libraries (empty if none)
 */
export function getNativeBlockLibraries(
    stack: Stack,
    packageId: string,
): BlockLibrary[] {
    return config.libraries.filter(lib => {
        if (!lib.stackTypes.includes(stack.frontend)) return false;
        return lib.nativeForPackages?.includes(packageId) ?? false;
    });
}

/**
 * Get the IDs of block libraries that should be pre-selected by default.
 *
 * When `userDefaults` is provided (from VS Code settings), uses those
 * preferences instead of the `default` field from block-libraries.json.
 * Only libraries that are available for the given stack/package are returned.
 *
 * @param stack - The selected stack object
 * @param packageId - The selected package ID
 * @param userDefaults - Optional array of enabled library IDs from VS Code settings
 * @returns Array of library IDs that should be pre-selected
 */
export function getDefaultBlockLibraryIds(
    stack: Stack,
    packageId: string,
    userDefaults?: string[],
): string[] {
    const available = getAvailableBlockLibraries(stack, packageId);
    if (userDefaults) {
        return available
            .filter(lib => userDefaults.includes(lib.id))
            .map(lib => lib.id);
    }
    return available
        .filter(lib => lib.default)
        .map(lib => lib.id);
}

/**
 * Check whether a built-in block library is available for the given package.
 *
 * Respects onlyForPackages: libraries with onlyForPackages are available only
 * for those packages (e.g. buildright-blocks only for buildright). Prevents
 * installing package-incompatible libraries from stale project config.
 *
 * @param libraryId - The block library ID (e.g., "buildright-blocks")
 * @param packageId - The project package ID (e.g., "isle5")
 * @returns True if the library may be installed for this package
 */
export function isBlockLibraryAvailableForPackage(libraryId: string, packageId: string): boolean {
    const lib = config.libraries.find(l => l.id === libraryId);
    if (!lib) return false;
    if (lib.onlyForPackages && !lib.onlyForPackages.includes(packageId)) return false;
    return true;
}

/**
 * Resolve a block library ID to its source configuration.
 *
 * @param libraryId - The block library ID (e.g., "isle5")
 * @returns The AddonSource, or undefined if the library doesn't exist
 */
export function getBlockLibrarySource(libraryId: string): AddonSource | undefined {
    const lib = config.libraries.find(l => l.id === libraryId);
    return lib?.source;
}

/**
 * Resolve a block library ID to its DA.live content source.
 *
 * The content source hosts block documentation pages at .da/library/blocks/.
 * These pages are copied to the user's site during the pipeline so that
 * DA.live's block library can render them.
 *
 * @param libraryId - The block library ID (e.g., "demo-team-blocks")
 * @returns The content source {org, site}, or undefined if not configured
 */
export function getBlockLibraryContentSource(libraryId: string): { org: string; site: string } | undefined {
    const lib = config.libraries.find(l => l.id === libraryId);
    return lib?.contentSource;
}

/**
 * Get the display name for a block library.
 *
 * @param libraryId - The block library ID
 * @returns The library name, or the ID as fallback
 */
export function getBlockLibraryName(libraryId: string): string {
    const lib = config.libraries.find(l => l.id === libraryId);
    return lib?.name ?? libraryId;
}
