/**
 * Demo Package Loader (re-export)
 *
 * Re-exports from the canonical location at services/demoPackageLoader.ts.
 * UI helpers and other consumers within project-creation should import from here.
 * Cross-feature consumers should import from '@/features/project-creation/services/demoPackageLoader'.
 */

export {
    loadDemoPackages,
    getPackageById,
    getStorefrontForStack,
    getAvailableStacksForPackage,
    getAllStorefronts,
    getAddonSource,
} from '../../services/demoPackageLoader';

export type { StorefrontWithContext } from '../../services/demoPackageLoader';

export {
    getAvailableBlockLibraries,
    getDefaultBlockLibraryIds,
    getBlockLibrarySource,
    getBlockLibraryName,
} from '../../services/blockLibraryLoader';
