/**
 * Demo Package Loader
 *
 * Utility for loading demo packages from demo-packages.json.
 * Provides functions to retrieve packages and their storefronts
 * for specific stack configurations.
 *
 * Structure: Option A (Nested Storefronts)
 * - Packages contain storefronts keyed by stack ID
 * - No contentSources (EDS URLs derivable from source.url)
 *
 * This replaces the separate brandStackLoader.ts and templateLoader.ts
 * with a unified loader for the simplified demo-packages architecture.
 */

import demoPackagesConfig from '../../config/demo-packages.json';
import type { DemoPackage, DemoPackagesConfig, Storefront } from '@/types/demoPackages';

/**
 * Storefront with package and stack context
 *
 * Used by getAllStorefronts() to return storefronts with their
 * associated package and stack identifiers.
 */
export interface StorefrontWithContext {
    /** Package ID this storefront belongs to */
    packageId: string;
    /** Stack ID (key in storefronts object) */
    stackId: string;
    /** The storefront configuration */
    storefront: Storefront;
}

/**
 * Load all demo packages from demo-packages.json
 *
 * @returns Promise resolving to array of demo packages
 *
 * @example
 * const packages = await loadDemoPackages();
 * console.log(`Found ${packages.length} packages`);
 */
export async function loadDemoPackages(): Promise<DemoPackage[]> {
    // Import is synchronous, but we return Promise for consistency
    // and to support future async loading scenarios (e.g., remote config)
    const config = demoPackagesConfig as unknown as DemoPackagesConfig;
    return config.packages;
}

/**
 * Get a demo package by its ID
 *
 * @param packageId - The unique identifier of the package (e.g., "citisignal", "buildright")
 * @returns Promise resolving to the package, or undefined if not found
 *
 * @example
 * const pkg = await getPackageById('citisignal');
 * if (pkg) {
 *   console.log(`Found package: ${pkg.name}`);
 * }
 */
export async function getPackageById(packageId: string): Promise<DemoPackage | undefined> {
    if (!packageId) {
        return undefined;
    }
    const packages = await loadDemoPackages();
    return packages.find(pkg => pkg.id === packageId);
}

/**
 * Get the storefront configuration for a specific stack within a package
 *
 * Each demo package can have multiple storefronts keyed by stack ID
 * (e.g., 'headless-paas', 'eds-paas', 'eds-accs').
 * This function retrieves the storefront for a given package and stack combination.
 *
 * @param packageId - The demo package ID (e.g., "citisignal")
 * @param stackId - The stack ID (e.g., "headless-paas", "eds-paas")
 * @returns Promise resolving to the Storefront, or undefined if not found
 *
 * @example
 * const storefront = await getStorefrontForStack('citisignal', 'headless-paas');
 * if (storefront) {
 *   console.log('Git source:', storefront.source.url);
 * }
 */
export async function getStorefrontForStack(
    packageId: string,
    stackId: string,
): Promise<Storefront | undefined> {
    const pkg = await getPackageById(packageId);
    if (!pkg) {
        return undefined;
    }

    return pkg.storefronts[stackId];
}

/**
 * Get all available stack IDs for a given package
 *
 * Returns the keys of the storefronts object for the specified package,
 * representing the stack architectures available for that package.
 *
 * @param packageId - The demo package ID (e.g., "citisignal")
 * @returns Promise resolving to array of stack IDs, or empty array if package not found
 *
 * @example
 * const stacks = await getAvailableStacksForPackage('citisignal');
 * // Returns: ['headless-paas', 'eds-paas', 'eds-accs']
 */
export async function getAvailableStacksForPackage(packageId: string): Promise<string[]> {
    const pkg = await getPackageById(packageId);
    if (!pkg) {
        return [];
    }

    return Object.keys(pkg.storefronts);
}

/**
 * Get all storefronts from all packages with their package and stack context
 *
 * Useful for displaying a flat list of all available storefronts
 * across all packages, with their associated package and stack identifiers.
 *
 * @returns Promise resolving to array of storefronts with context
 *
 * @example
 * const storefronts = await getAllStorefronts();
 * storefronts.forEach(({ packageId, stackId, storefront }) => {
 *   console.log(`${packageId} - ${stackId}: ${storefront.name}`);
 * });
 */
export async function getAllStorefronts(): Promise<StorefrontWithContext[]> {
    const packages = await loadDemoPackages();
    const result: StorefrontWithContext[] = [];

    for (const pkg of packages) {
        for (const [stackId, storefront] of Object.entries(pkg.storefronts)) {
            result.push({
                packageId: pkg.id,
                stackId,
                storefront,
            });
        }
    }

    return result;
}
