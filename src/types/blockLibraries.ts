import type { AddonSource } from './demoPackages';

export interface BlockLibrary {
    id: string;
    name: string;
    description: string;
    type: 'standalone' | 'storefront';
    source: AddonSource;
    stackTypes: string[];
    /** Package IDs this library is NATIVE to: always included AND locked (not deselectable). */
    nativeForPackages?: string[];
    onlyForPackages?: string[];
    /**
     * Package IDs this library is pre-selected for by DEFAULT: seeded checked on
     * stack select but stays in the selectable list (user can deselect) — unlike
     * nativeForPackages' locked inclusion.
     */
    defaultForPackages?: string[];
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
    /**
     * Block IDs whose folders this library copied into the storefront (at
     * install, and by an update that copies a new one). A block in here whose
     * folder is gone was removed by hand, so an update does not copy it back.
     */
    blockIds: string[];
    /**
     * The authoring entries the extension itself added to the storefront's three
     * authoring files from this library. Absent when it added none, and on
     * records written before 2026-10-09.
     */
    addedEntries?: AddedComponentEntries;
}

/**
 * Entry ids the extension added to a storefront's authoring files, one list per
 * kind of entry. An id in here that is no longer in its file was removed by
 * hand, so an install or update leaves it out instead of putting it back.
 */
export interface AddedComponentEntries {
    /** `component-definition.json`: ids of `groups[].components[]` entries. */
    definition: string[];
    /** `component-filters.json`: block ids added to the `section` filter's `components`. */
    sectionFilter: string[];
    /** `component-filters.json`: ids of whole filter entries (e.g. `tabs`). */
    filters: string[];
    /** `component-models.json`: ids of model entries. */
    models: string[];
    /**
     * `component-definition.json`: ids of entries whose HTML example
     * (`plugins.da.unsafeHTML`) the extension filled in. Absent when it filled
     * none, and on records written before the field existed.
     */
    htmlExamples?: string[];
}

/** Persisted tracking data with installation timestamp */
export interface InstalledBlockLibrary extends LibraryVersionInfo {
    /** ISO date string when blocks were installed */
    installedAt: string;
    /**
     * Set when `demoBuilder.blockLibraries.syncBehavior` is `disabled` (or `ask`
     * + user chose Skip) and update detection found newer upstream commits.
     * Files in the storefront stay at `commitSha`; this records what we know
     * about upstream so the AI Overview screen can show "Sync disabled —
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
