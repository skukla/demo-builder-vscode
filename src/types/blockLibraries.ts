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
    /**
     * Set when `demoBuilder.blockLibraries.syncBehavior` is `disabled` (or `ask`
     * + user chose Skip) and update detection found newer upstream commits.
     * Files in the storefront stay at `commitSha`; this records what we know
     * about upstream so the AI Configuration tab can show "Sync disabled —
     * N commits behind upstream" without lying about which files are present.
     *
     * Cleared when the user re-enables sync and a successful update runs.
     */
    syncDisabledMarker?: {
        /** Latest upstream commit SHA we know about (but did not install) */
        upstreamSha: string;
        /** ISO date string of the last update check that set this marker */
        lastCheckedAt: string;
    };
}
