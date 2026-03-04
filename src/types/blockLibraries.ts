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
    /** DA.live content source containing block documentation pages (.da/library/blocks/) */
    contentSource?: { org: string; site: string };
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

/** Base tracking data returned from block library installation */
export interface LibraryVersionInfo {
    /** Library display name */
    name: string;
    /** Source repository (owner/repo/branch) */
    source: AddonSource;
    /** Commit SHA of the source repo at installation time */
    commitSha: string;
    /** Block IDs installed from this library */
    blockIds: string[];
}

/** Persisted tracking data with installation timestamp */
export interface InstalledBlockLibrary extends LibraryVersionInfo {
    /** ISO date string when blocks were installed */
    installedAt: string;
}
