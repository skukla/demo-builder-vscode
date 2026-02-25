import type { AddonSource } from './demoPackages';

export interface BlockLibrary {
    id: string;
    name: string;
    description: string;
    type: 'standalone' | 'storefront';
    source: AddonSource;
    stackTypes: string[];
    nativeForPackages?: string[];
    onlyForPackages?: string[];
    default?: boolean;
}

export interface BlockLibrariesConfig {
    version: string;
    libraries: BlockLibrary[];
}

/** A user-provided block library from a GitHub URL */
export interface CustomBlockLibrary {
    /** User-provided display name (pre-filled from repo name) */
    name: string;
    /** GitHub source (owner, repo, branch) */
    source: AddonSource;
}
