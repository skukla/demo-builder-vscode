/**
 * A GitHub release archive unpacks into one wrapper folder (`owner-repo-sha/`);
 * a component's files belong one level up. This moves them there.
 *
 * It replaces a shell step, `mv "$T"/*\/* "$T"/ && rm -rf "$T"/*\/`, that lost
 * almost everything: the second glob matched every folder the first had just
 * moved up, not only the wrapper, and `*` skips dotfiles. An update kept
 * `package.json` and deleted `app/`, `src/` and `.gitignore`, and passed the
 * verification that checks only `package.json` (found 2026-09-15). Done in
 * Node, there is no glob to get wrong.
 *
 * @module features/updates/services/archiveRoot
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Move the contents of `targetPath`'s single wrapper folder up into `targetPath`.
 *
 * The wrapper is renamed to a sibling of `targetPath` first, so an entry inside
 * it that shares the wrapper's name cannot collide with it.
 *
 * @param targetPath - A folder holding exactly one folder: the unpacked archive
 * @throws when `targetPath` holds anything other than one folder; nothing is moved
 */
export async function flattenArchiveRoot(targetPath: string): Promise<void> {
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    if (entries.length !== 1 || !entries[0].isDirectory()) {
        throw new Error(
            `Expected the archive to hold one top-level folder, found ${entries.length} entries in ${targetPath}`,
        );
    }
    const staged = `${targetPath}.archive-root-${Date.now()}`;
    await fs.rename(path.join(targetPath, entries[0].name), staged);
    for (const name of await fs.readdir(staged)) {
        await fs.rename(path.join(staged, name), path.join(targetPath, name));
    }
    await fs.rm(staged, { recursive: true, force: true });
}
