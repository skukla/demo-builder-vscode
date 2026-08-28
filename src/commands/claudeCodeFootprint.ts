/**
 * Claude Code disk-footprint check for Demo Builder: Diagnostics.
 *
 * `~/.claude` is Claude Code's own storage — not ours — but it accumulates
 * from work done THROUGH this extension (measured 2026-08-25: 2.2 GB after
 * five months, 1.7 GB of it session transcripts growing ~11 MB/day, and
 * nothing ever deletes any of it), it sits beside our storage where a
 * producer cannot tell whose is whose, and Diagnostics is already the surface
 * that reports on the environment.
 *
 * A REPORT, not a manager — deliberately. Transcripts are how `claude
 * --continue` works (`claudeSessionStore.hasConversation` probes for a
 * `.jsonl` to decide whether the Chat tile can resume), so a cleanup button
 * that deletes the wrong file breaks resuming silently and the producer
 * experiences it as "my chat forgot everything". Report the numbers, name the
 * directory, and let the user run `rm` themselves.
 *
 * Computed ON DEMAND only (Diagnostics is a command): a multi-GB tree is not
 * free to stat, and the build-stamp precedent (`buildStampUi.ts`) is explicit
 * that the expensive walk is the on-demand half. Never call this on
 * activation.
 *
 * @module commands/claudeCodeFootprint
 */

import { promises as fsPromises } from 'fs';
import * as os from 'os';
import * as path from 'path';

/** One subdirectory of `~/.claude`, sized recursively. */
export interface ClaudeCodeSubdir {
    name: string;
    bytes: number;
}

/** The footprint report — every field absent when the walk could not run. */
export interface ClaudeCodeFootprint {
    /** Absolute path of Claude Code's storage root (`~/.claude`). */
    root: string;
    /** False when the directory does not exist (Claude Code never ran). */
    exists: boolean;
    /** Recursive size of everything under the root. */
    totalBytes?: number;
    /** Immediate subdirectories, largest first (top-level files fold into totalBytes). */
    subdirs?: ClaudeCodeSubdir[];
    /** Session transcripts under `projects/` — the growth driver. */
    transcripts?: {
        count: number;
        bytes: number;
        /** ISO date of the oldest transcript's last write, when any exist. */
        oldest?: string;
    };
    /** Set when the walk failed partway; sizes may be partial. */
    error?: string;
}

/** Recursive byte size of a directory; unreadable entries count as zero. */
async function directorySize(dir: string): Promise<number> {
    let total = 0;
    let entries;
    try {
        entries = await fsPromises.readdir(dir, { withFileTypes: true });
    } catch {
        return 0;
    }
    for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        try {
            if (entry.isDirectory()) {
                total += await directorySize(entryPath);
            } else if (entry.isFile()) {
                total += (await fsPromises.stat(entryPath)).size;
            }
        } catch {
            // Unreadable entry — skip; a partial size beats no report.
        }
    }
    return total;
}

/** Count, size and oldest-write date of the `.jsonl` transcripts under `projects/`. */
async function transcriptStats(
    projectsDir: string,
): Promise<NonNullable<ClaudeCodeFootprint['transcripts']>> {
    let count = 0;
    let bytes = 0;
    let oldestMs: number | undefined;

    async function walk(dir: string): Promise<void> {
        let entries;
        try {
            entries = await fsPromises.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const entryPath = path.join(dir, entry.name);
            try {
                if (entry.isDirectory()) {
                    await walk(entryPath);
                } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
                    const stat = await fsPromises.stat(entryPath);
                    count++;
                    bytes += stat.size;
                    const ms = stat.mtimeMs;
                    if (oldestMs === undefined || ms < oldestMs) oldestMs = ms;
                }
            } catch {
                // Skip unreadable entries.
            }
        }
    }

    await walk(projectsDir);
    return {
        count,
        bytes,
        ...(oldestMs !== undefined
            ? { oldest: new Date(oldestMs).toISOString().slice(0, 10) }
            : {}),
    };
}

/**
 * Walk `~/.claude` and report its footprint. Never throws — a missing
 * directory reports `exists: false`, and per-entry failures degrade to
 * partial sizes.
 *
 * @param root - overridable for tests; defaults to the real `~/.claude`
 */
export async function collectClaudeCodeFootprint(
    root: string = path.join(os.homedir(), '.claude'),
): Promise<ClaudeCodeFootprint> {
    try {
        let entries;
        try {
            entries = await fsPromises.readdir(root, { withFileTypes: true });
        } catch {
            return { root, exists: false };
        }

        let totalBytes = 0;
        const subdirs: ClaudeCodeSubdir[] = [];
        for (const entry of entries) {
            const entryPath = path.join(root, entry.name);
            if (entry.isDirectory()) {
                const bytes = await directorySize(entryPath);
                totalBytes += bytes;
                subdirs.push({ name: entry.name, bytes });
            } else if (entry.isFile()) {
                try {
                    totalBytes += (await fsPromises.stat(entryPath)).size;
                } catch {
                    // Skip unreadable top-level files.
                }
            }
        }
        subdirs.sort((a, b) => b.bytes - a.bytes);

        const transcripts = await transcriptStats(path.join(root, 'projects'));
        return { root, exists: true, totalBytes, subdirs, transcripts };
    } catch (error) {
        return { root, exists: true, error: (error as Error).message };
    }
}

/** `1234567` → `"1.2 MB"`; sizes below 1 MB render as KB. */
export function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Render the footprint for the diagnostics summary. Report-only wording: the
 * one warning it carries is the resume caveat, because that is the failure a
 * well-meaning `rm` causes and cannot see.
 */
export function claudeFootprintLines(footprint: ClaudeCodeFootprint): string[] {
    const lines = ['', `Claude Code storage (${footprint.root}):`];
    if (!footprint.exists) {
        lines.push('  Not present (Claude Code has not run on this machine)');
        return lines;
    }
    if (footprint.error) {
        lines.push(`  Could not measure: ${footprint.error}`);
        return lines;
    }
    lines.push(`  Total: ${formatBytes(footprint.totalBytes ?? 0)}`);
    const top = (footprint.subdirs ?? []).slice(0, 3);
    if (top.length) {
        lines.push(`  Largest: ${top.map((d) => `${d.name} ${formatBytes(d.bytes)}`).join(' · ')}`);
    }
    const t = footprint.transcripts;
    if (t && t.count > 0) {
        lines.push(
            `  Session transcripts: ${t.count} file${t.count === 1 ? '' : 's'}, ` +
                `${formatBytes(t.bytes)}${t.oldest ? `, oldest ${t.oldest}` : ''}`,
        );
    }
    lines.push(
        "  This is Claude Code's own data, not Demo Builder's — nothing here is",
        '  deleted automatically. If you clear it yourself, know that transcripts',
        '  are how chat resume works: deleting them resets your conversations.',
    );
    return lines;
}
