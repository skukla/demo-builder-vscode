/**
 * GeneratedFileWriter — the ADR-013 hash-and-skip write seam.
 *
 * EVERY AI-bundle file write flows through an instance of this. A writer that
 * bypasses it reverts that file to blind-overwrite behavior (ADR-013
 * consequence), so the review rule is: no bundle write outside this seam —
 * after the tiered-refresh feature, `skillsWriter`, `aiContextWriter`, and
 * `mcpConfigWriter` contain zero direct `fsPromises.writeFile` calls for
 * bundle files.
 *
 * Write matrix (ADR-013 — docs/architecture/adr/013-generated-file-edit-survival.md):
 *
 * | On disk                    | Recorded hash | Action                                        |
 * |----------------------------|---------------|-----------------------------------------------|
 * | absent                     | any           | write, record hash                            |
 * | present, == recorded       | recorded      | ours → overwrite (or `'unchanged'` when the   |
 * |                            |               | content is byte-identical: NO disk touch —    |
 * |                            |               | keeps the activation common path write-free)  |
 * | present, != recorded       | recorded      | skip, log `info` (a skipped file is an        |
 * |                            |               | event, not silence), report                   |
 * | present                    | none (pre-ADR)| treat as unmodified ONCE → overwrite, record  |
 *
 * Removal matrix (stricter — deletion needs positive proof of ownership; the
 * treat-as-unmodified-once rule does NOT extend to deletes):
 *
 * | Condition                                           | Action                        |
 * |-----------------------------------------------------|-------------------------------|
 * | recorded hash matches disk                          | remove, drop hash entry       |
 * | no recorded hash, disk == `currentTemplate`         | remove (provably ours)        |
 * | anything else                                       | leave + report in `skipped`   |
 * | absent                                              | drop stale entry, `'absent'`  |
 *
 * Keys are posix-style project-relative paths (`AGENTS.md`, `.mcp.json`,
 * `.claude/skills/add-component.md`); hashes are sha-256 hex of the utf-8
 * content (`@/core/utils/sha256`).
 *
 * Both matrices are the shared rule `decideOwnedChange` (`@/core/utils/ownedChange`,
 * datapack-engine step 04) plus this file's two policies: a write treats
 * `leave-not-ours` as unmodified once (pre-ADR), and a removal accepts an
 * unrecorded file that equals `currentTemplate` as provably ours.
 */

import { constants as fsConstants } from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { decideOwnedChange } from '@/core/utils/ownedChange';
import { sha256 } from '@/core/utils/sha256';
import type { Logger } from '@/types/logger';

export interface GeneratedFileWriteReport {
    /** Overwritten or created (project-relative posix paths). */
    written: string[];
    /** User-edited → left alone (the ADR "event, not silence"). */
    skipped: string[];
    /** Removed on positive proof of ownership. */
    removed: string[];
}

export interface GeneratedFileWriter {
    /** Hash-and-skip write (ADR-013 write matrix above). */
    write(relPath: string, content: string): Promise<'written' | 'skipped' | 'unchanged'>;
    /**
     * Unconditional write for content that ALREADY incorporates user edits
     * (the settings.json merge). Records the hash; never skips. Byte-identical
     * content is a no-op on disk (hash still recorded) so the activation
     * common path stays write-free.
     */
    writeMerged(relPath: string, content: string): Promise<void>;
    /** Remove only on positive proof of ownership (removal matrix above). */
    remove(relPath: string, currentTemplate?: string): Promise<'removed' | 'skipped' | 'absent'>;
    report(): GeneratedFileWriteReport;
    /**
     * FULL updated relPath→sha256 map (seeded from the recorded map, entries
     * updated/deleted as touched) — assign to `project.aiFileHashes` and persist.
     */
    hashes(): Record<string, string>;
}

export function createGeneratedFileWriter(
    projectPath: string,
    recordedHashes: Record<string, string>,
    logger: Logger,
): GeneratedFileWriter {
    const hashes: Record<string, string> = { ...recordedHashes };
    const report: GeneratedFileWriteReport = { written: [], skipped: [], removed: [] };

    const toKey = (relPath: string): string => relPath.replace(/\\/g, '/');
    const toAbsolute = (key: string): string => path.join(projectPath, ...key.split('/'));

    async function readIfPresent(absolutePath: string): Promise<string | undefined> {
        try {
            return await fsPromises.readFile(absolutePath, 'utf-8');
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
            throw err;
        }
    }

    /**
     * Security guards (2026-08-14 reviews). Two escape shapes exist and both
     * must be closed BEFORE any filesystem mutation:
     *
     * 1. A symlinked parent directory (or `..` in a key) would carry the
     *    mkdir/write/unlink outside the project. `isDirContained` compares
     *    realpaths of the deepest EXISTING ancestor against the project root
     *    — walking up matters because on a fresh project the parent dir does
     *    not exist yet, and everything below the deepest existing ancestor is
     *    created by us as real directories.
     * 2. A symlinked FILE would have `writeFile` overwrite its target. The
     *    write opens with O_NOFOLLOW and writes through the fd, which closes
     *    the lstat→write race as well: a link swapped in at any point makes
     *    the open fail with ELOOP instead of following.
     *
     * Refusal is a skip + warn + report, never a write through a link.
     */
    async function isDirContained(dir: string): Promise<boolean> {
        const realRoot = await fsPromises.realpath(projectPath);
        let candidate = dir;
        for (;;) {
            try {
                const real = await fsPromises.realpath(candidate);
                return real === realRoot || real.startsWith(realRoot + path.sep);
            } catch (err) {
                if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
            }
            const parent = path.dirname(candidate);
            if (parent === candidate) return false;
            candidate = parent;
        }
    }

    function refuse(key: string, why: string): false {
        logger.warn(`[AI Bundle] Refusing ${key} — ${why}`);
        report.skipped.push(key);
        return false;
    }

    /** @returns true when the write landed; false when a guard refused it. */
    async function persist(absolutePath: string, key: string, content: string): Promise<boolean> {
        const dir = path.dirname(absolutePath);
        if (!(await isDirContained(dir))) {
            return refuse(key, 'its directory resolves outside the project (symlink?)');
        }
        await fsPromises.mkdir(dir, { recursive: true });
        let handle;
        try {
            handle = await fsPromises.open(
                absolutePath,
                 
                fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW,
            );
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ELOOP') {
                return refuse(key, 'the target is a symlink');
            }
            throw err;
        }
        try {
            await handle.writeFile(content, 'utf-8');
        } finally {
            await handle.close();
        }
        hashes[key] = sha256(content);
        report.written.push(key);
        return true;
    }

    return {
        async write(relPath, content) {
            const key = toKey(relPath);
            const absolutePath = toAbsolute(key);
            const onDisk = await readIfPresent(absolutePath);
            const change = decideOwnedChange({
                recorded: hashes[key],
                current: fingerprint(onDisk),
                wanted: sha256(content),
            });

            if (change === 'leave-edited') {
                // User-edited → they own it now. An event, not silence.
                logger.info(
                    `[AI Bundle] Skipped ${key} — edited since last generation; leaving your version in place`,
                );
                report.skipped.push(key);
                return 'skipped';
            }
            if (change === 'unchanged') {
                // Ours and already current — no disk touch at all.
                return 'unchanged';
            }
            // Absent, ours-and-stale, or pre-ADR (`leave-not-ours`: no recorded
            // hash → treat as unmodified ONCE, per ADR-013).
            return (await persist(absolutePath, key, content)) ? 'written' : 'skipped';
        },

        async writeMerged(relPath, content) {
            const key = toKey(relPath);
            const absolutePath = toAbsolute(key);
            const onDisk = await readIfPresent(absolutePath);
            if (onDisk === content) {
                // Already current — record the hash (a pre-ADR file becomes
                // tracked) but keep the activation common path write-free:
                // no disk touch, no "written" event.
                hashes[key] = sha256(content);
                return;
            }
            await persist(absolutePath, key, content);
        },

        async remove(relPath, currentTemplate?) {
            const key = toKey(relPath);
            const absolutePath = toAbsolute(key);
            // Same containment rule as writes: a symlinked parent directory
            // would carry the unlink outside the project. (`unlink` itself
            // does not follow a symlinked FILE — that case is already safe.)
            if (!(await isDirContained(path.dirname(absolutePath)))) {
                refuse(key, 'its directory resolves outside the project (symlink?)');
                return 'skipped';
            }
            const onDisk = await readIfPresent(absolutePath);
            // Proof of ownership: the recorded hash, else (unrecorded) today's
            // template — byte-equal to it is provably ours.
            const change = decideOwnedChange({
                recorded: hashes[key] ?? fingerprint(currentTemplate),
                current: fingerprint(onDisk),
                wanted: undefined,
            });

            if (change === 'gone') {
                delete hashes[key];
                return 'absent';
            }

            if (change !== 'remove') {
                logger.info(
                    `[AI Bundle] Kept ${key} — cannot prove it is ours (edited or unrecorded); not removing`,
                );
                report.skipped.push(key);
                return 'skipped';
            }

            await fsPromises.unlink(absolutePath);
            delete hashes[key];
            report.removed.push(key);
            return 'removed';
        },

        report: () => ({
            written: [...report.written],
            skipped: [...report.skipped],
            removed: [...report.removed],
        }),

        hashes: () => ({ ...hashes }),
    };
}

/** The fingerprint of content that may not exist. */
function fingerprint(content: string | undefined): string | undefined {
    return content === undefined ? undefined : sha256(content);
}
