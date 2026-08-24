/**
 * Demo Package Loader (re-export)
 *
 * Re-exports from the canonical location at services/demoPackageLoader.ts.
 * UI helpers and other consumers within project-creation should import from here.
 * Cross-feature consumers should import from '@/features/components/services/demoPackageLoader'.
 */

export {
    loadDemoPackages,
    getSelectablePackages,
    getPackageById,
    getStorefrontForStack,
    getAvailableStacksForPackage,
    getAllStorefronts,
    getAddonSource,
} from '@/features/components/services/demoPackageLoader';

export type { StorefrontWithContext } from '@/features/components/services/demoPackageLoader';

export {
    getAvailableBlockLibraries,
    getNativeBlockLibraries,
    getDefaultBlockLibraryIds,
    getBlockLibrarySource,
    getBlockLibraryName,
} from '@/features/components/services/blockLibraryLoader';
