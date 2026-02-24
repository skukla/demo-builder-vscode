import type { AddonSource } from './demoPackages';

export interface BlockLibrary {
    id: string;
    name: string;
    description: string;
    type: 'standalone' | 'storefront';
    source: AddonSource;
    stackTypes: string[];
    excludeForPackages?: string[];
    default?: boolean;
}

export interface BlockLibrariesConfig {
    version: string;
    libraries: BlockLibrary[];
}
