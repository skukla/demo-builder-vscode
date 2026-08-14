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
 * content via `node:crypto`.
 */

import { createHash } from 'crypto';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
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

    async function persist(absolutePath: string, key: string, content: string): Promise<void> {
        await fsPromises.mkdir(path.dirname(absolutePath), { recursive: true });
        await fsPromises.writeFile(absolutePath, content, 'utf-8');
        hashes[key] = sha256(content);
        report.written.push(key);
    }

    return {
        async write(relPath, content) {
            const key = toKey(relPath);
            const absolutePath = toAbsolute(key);
            const onDisk = await readIfPresent(absolutePath);
            const recorded = hashes[key];

            if (onDisk !== undefined && recorded !== undefined) {
                if (sha256(onDisk) !== recorded) {
                    // User-edited → they own it now. An event, not silence.
                    logger.info(
                        `[AI Bundle] Skipped ${key} — edited since last generation; leaving your version in place`,
                    );
                    report.skipped.push(key);
                    return 'skipped';
                }
                if (onDisk === content) {
                    // Ours and already current — no disk touch at all.
                    return 'unchanged';
                }
            }
            // Absent, ours-and-stale, or pre-ADR (no recorded hash → treat as
            // unmodified ONCE, per ADR-013).
            await persist(absolutePath, key, content);
            return 'written';
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
            const onDisk = await readIfPresent(absolutePath);

            if (onDisk === undefined) {
                delete hashes[key];
                return 'absent';
            }

            const recorded = hashes[key];
            const provablyOursByHash = recorded !== undefined && sha256(onDisk) === recorded;
            const provablyOursByTemplate =
                recorded === undefined &&
                currentTemplate !== undefined &&
                onDisk === currentTemplate;

            if (!provablyOursByHash && !provablyOursByTemplate) {
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

function sha256(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
}
