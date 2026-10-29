import type { InstalledBlockLibrary, LibraryVersionInfo } from '@/types/blockLibraries';

/**
 * The record `installedBlockLibraries` keeps for one installed library.
 *
 * ONE builder, because project creation and "install a selected library on an
 * existing project" (EDS-28) must write the same record — the update check
 * walks it, so a record shaped differently by one path is tracked differently.
 *
 * In its own module rather than blockCollectionHelpers because many suites mock
 * that one whole, and a mocked record builder writes `undefined` into a project.
 */
export function toInstalledBlockLibrary(
    version: LibraryVersionInfo,
    installedAt: string = new Date().toISOString(),
): InstalledBlockLibrary {
    return {
        name: version.name,
        source: version.source,
        commitSha: version.commitSha,
        blockIds: version.blockIds,
        // What the install added to the authoring files: the proof that lets a
        // later update tell a hand deletion from an entry it never added (EDS-36).
        ...(version.addedEntries ? { addedEntries: version.addedEntries } : {}),
        installedAt,
    };
}
