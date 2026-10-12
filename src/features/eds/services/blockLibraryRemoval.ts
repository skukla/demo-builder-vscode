/**
 * Take a block library's blocks back out of a storefront repository (EDS-39) —
 * the reverse of `installBlockCollections` in `blockCollectionHelpers.ts`.
 *
 * An SC edits the blocks a library installs, so this removes a block folder
 * only with positive proof it is still what the library installed (the rule
 * ADR-013 sets for files in a project folder). The proof is byte identity: the
 * folder holds exactly the files the library had at the commit it was
 * installed from, and each file has the same git blob sha. A block ends one of
 * three ways:
 *   - removed — proven unedited, deleted in this run's one commit;
 *   - already gone — the SC deleted the folder; nothing to do;
 *   - left — edited, shared with another selected library, or impossible to
 *     check. It stays exactly as it is and the result names it with the reason.
 *
 * The library's entries in the three authoring files leave in the same commit,
 * by the same rule (`blockLibraryRemovalEntries.ts`). An entry that belongs to
 * a block left in place is not touched.
 *
 * This file only talks to GitHub. The DA.live block list and the project's
 * record are the caller's (`blockLibraryUninstall.ts`).
 *
 * @module features/eds/services/blockLibraryRemoval
 */

import { createHash } from 'crypto';
import {
    DEFINITION_FILE,
    FILTERS_FILE,
    MODELS_FILE,
    removeAddedEntries,
    type AuthoringFileContents,
    type LeftEntry,
} from './blockLibraryRemovalEntries';
import type { GitHubFileOperations } from './github/githubFileOperations';
import type { GitHubRepoArchive } from './github/githubRepoArchive';
import type { GitHubTreeInput } from './types';
import type { AddedComponentEntries, InstalledBlockLibrary } from '@/types/blockLibraries';
import type { Logger } from '@/types/logger';

/** The GitHub calls a removal makes. */
export type BlockLibraryRemovalFileOps = Pick<
    GitHubFileOperations,
    'listRepoFiles' | 'getFileContent' | 'commitTreeToBranch'
> & { repoArchive: Pick<GitHubRepoArchive, 'downloadRepoContents'> };

export interface BlockLibraryRemovalRequest {
    destOwner: string;
    destRepo: string;
    /** The library's record: where it came from, at which commit, and what it added. */
    library: Pick<InstalledBlockLibrary, 'name' | 'source' | 'commitSha' | 'blockIds' | 'addedEntries'>;
    /** Blocks another still-selected library provides: block id → that library's name. */
    sharedBlocks: Map<string, string>;
}

/**
 * Why a block stayed: `changed` — its files differ from the library's;
 * `shared` — another selected library provides it; `unverified` — the library
 * could not be read at the recorded commit, so nothing could be proven.
 */
export type LeftBlockReason = 'changed' | 'shared' | 'unverified';

export interface LeftBlock {
    id: string;
    reason: LeftBlockReason;
    /** The other library, when the reason is `shared`. */
    sharedWith?: string;
}

export interface BlockLibraryRemovalResult {
    /** Block folders this run deleted. */
    removedBlockIds: string[];
    /** Blocks the library no longer has in the storefront: deleted now, or already gone. */
    clearedBlockIds: string[];
    /** Blocks left exactly as they are, each with the reason. */
    leftBlocks: LeftBlock[];
    /** Authoring entries no longer in their file: taken out now, or already gone. */
    clearedEntries: AddedComponentEntries;
    /** Authoring entries left in place because the SC changed them. */
    leftEntries: LeftEntry[];
}

/** The sha git gives a file's bytes: sha1 of `blob <length>\0<bytes>`. */
export function gitBlobSha(bytes: Buffer): string {
    return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

/**
 * The shas a library file can have in the storefront and still be untouched:
 * its own, and the one it has after the installer's text round trip. The
 * installer carries every file as UTF-8 text (`getBlobContent`), which changes
 * the bytes of a binary file; that changed copy is what the library installed.
 */
function installedShas(bytes: Buffer): string[] {
    return [gitBlobSha(bytes), gitBlobSha(Buffer.from(bytes.toString('utf-8'), 'utf-8'))];
}

function pathsOfBlock<T>(files: Map<string, T>, blockId: string): Map<string, T> {
    const prefix = `blocks/${blockId}/`;
    return new Map([...files].filter(([path]) => path.startsWith(prefix)));
}

/** True when the folder holds exactly the library's files, byte for byte. */
function isAsInstalled(storefront: Map<string, string>, library: Map<string, Buffer>): boolean {
    if (storefront.size !== library.size) return false;
    for (const [path, sha] of storefront) {
        const bytes = library.get(path);
        if (!bytes || !installedShas(bytes).includes(sha)) return false;
    }
    return true;
}

interface BlockVerdicts {
    /** Paths to delete, for the blocks proven unedited. */
    deletePaths: string[];
    removed: string[];
    alreadyGone: string[];
    left: LeftBlock[];
}

function decideBlocks(
    request: BlockLibraryRemovalRequest,
    storefrontShas: Map<string, string>,
    libraryFiles: Map<string, Buffer> | undefined,
): BlockVerdicts {
    const verdicts: BlockVerdicts = { deletePaths: [], removed: [], alreadyGone: [], left: [] };
    for (const id of request.library.blockIds) {
        const inStorefront = pathsOfBlock(storefrontShas, id);
        const sharedWith = request.sharedBlocks.get(id);
        if (inStorefront.size === 0) {
            verdicts.alreadyGone.push(id);
        } else if (sharedWith !== undefined) {
            verdicts.left.push({ id, reason: 'shared', sharedWith });
        } else if (!libraryFiles) {
            verdicts.left.push({ id, reason: 'unverified' });
        } else if (isAsInstalled(inStorefront, pathsOfBlock(libraryFiles, id))) {
            verdicts.removed.push(id);
            verdicts.deletePaths.push(...inStorefront.keys());
        } else {
            verdicts.left.push({ id, reason: 'changed' });
        }
    }
    return verdicts;
}

/** The library's files at the recorded commit, or undefined when they cannot be read. */
async function readLibraryAtCommit(
    library: BlockLibraryRemovalRequest['library'],
    fileOps: BlockLibraryRemovalFileOps,
    logger: Logger,
): Promise<Map<string, Buffer> | undefined> {
    const { owner, repo } = library.source;
    try {
        const files = await fileOps.repoArchive.downloadRepoContents(owner, repo, library.commitSha);
        return new Map([...files].map(([path, file]) => [path, file.data]));
    } catch (error) {
        logger.warn(
            `[Block Collection] Could not read ${owner}/${repo} at ${library.commitSha}: ` +
                `${(error as Error).message}. Nothing can be proven unedited, so nothing is removed.`,
        );
        return undefined;
    }
}

/** Whether an authoring entry is a block's: its own id, or a sub-component (`tabs-item`). */
export const belongsTo = (entryId: string, blockId: string): boolean =>
    entryId === blockId || entryId.startsWith(`${blockId}-`);

/** The recorded entries that may leave: every one not belonging to a block left in place. */
function entriesFreeToLeave(
    added: AddedComponentEntries | undefined,
    left: LeftBlock[],
): AddedComponentEntries {
    const free = (ids: string[] | undefined): string[] =>
        (ids ?? []).filter((id) => !left.some((block) => belongsTo(id, block.id)));
    return {
        definition: free(added?.definition),
        sectionFilter: free(added?.sectionFilter),
        filters: free(added?.filters),
        models: free(added?.models),
    };
}

async function readAuthoringFiles(
    { destOwner, destRepo }: BlockLibraryRemovalRequest,
    ids: AddedComponentEntries,
    fileOps: BlockLibraryRemovalFileOps,
): Promise<AuthoringFileContents> {
    const wanted: Array<[string, boolean]> = [
        [DEFINITION_FILE, ids.definition.length > 0],
        [FILTERS_FILE, ids.sectionFilter.length + ids.filters.length > 0],
        [MODELS_FILE, ids.models.length > 0],
    ];
    const contents: AuthoringFileContents = {};
    for (const [path, needed] of wanted) {
        if (!needed) continue;
        contents[path] = (await fileOps.getFileContent(destOwner, destRepo, path))?.content ?? null;
    }
    return contents;
}

function libraryAuthoringFiles(libraryFiles: Map<string, Buffer> | undefined): AuthoringFileContents {
    const contents: AuthoringFileContents = {};
    for (const path of [DEFINITION_FILE, FILTERS_FILE, MODELS_FILE]) {
        contents[path] = libraryFiles?.get(path)?.toString('utf-8');
    }
    return contents;
}

/** A tree entry with a null sha deletes its path; a folder goes when its last file does. */
const deletionOf = (path: string): GitHubTreeInput => ({
    path, mode: '100644', type: 'blob', sha: null,
});

/**
 * Remove what a library added to a storefront repository, wherever it is still
 * what the library added. One commit on `main`, or none when nothing can go.
 *
 * This WRITES to the SC's GitHub repository, so it runs only from an explicit
 * apply.
 *
 * @param request - the storefront repository, the library's record, and the blocks to keep
 * @param fileOps - the GitHub calls
 * @param logger - logger
 * @returns what was removed, what was already gone, and what was left with the reason
 */
export async function removeBlockLibraryFiles(
    request: BlockLibraryRemovalRequest,
    fileOps: BlockLibraryRemovalFileOps,
    logger: Logger,
): Promise<BlockLibraryRemovalResult> {
    const { destOwner, destRepo, library } = request;

    const storefrontFiles = await fileOps.listRepoFiles(destOwner, destRepo, 'main');
    if (storefrontFiles.length === 0) {
        // The lister answers an empty list for a repository it cannot find. Reading
        // that as "every block is already gone" would forget the whole record.
        throw new Error(`Could not read the storefront repository ${destOwner}/${destRepo}`);
    }
    const storefrontShas = new Map(storefrontFiles.map((f) => [f.path, f.sha]));
    const libraryFiles = await readLibraryAtCommit(library, fileOps, logger);

    const blocks = decideBlocks(request, storefrontShas, libraryFiles);
    const freeEntries = entriesFreeToLeave(library.addedEntries, blocks.left);
    const entries = removeAddedEntries(
        freeEntries,
        await readAuthoringFiles(request, freeEntries, fileOps),
        libraryAuthoringFiles(libraryFiles),
    );

    const tree: GitHubTreeInput[] = [
        ...blocks.deletePaths.map(deletionOf),
        ...entries.files.map(
            ({ path, content }): GitHubTreeInput => ({ path, mode: '100644', type: 'blob', content }),
        ),
    ];
    if (tree.length > 0) {
        const count = blocks.removed.length;
        await fileOps.commitTreeToBranch(
            destOwner, destRepo, 'main', tree,
            `chore: remove ${library.name} (${count} block${count === 1 ? '' : 's'})`,
        );
    }
    logger.info(
        `[Block Collection] Removed ${blocks.removed.length} block(s) of ${library.name}; ` +
            `left ${blocks.left.length} in place`,
    );

    return {
        removedBlockIds: blocks.removed,
        clearedBlockIds: [...blocks.removed, ...blocks.alreadyGone],
        leftBlocks: blocks.left,
        clearedEntries: entries.cleared,
        leftEntries: entries.left,
    };
}
