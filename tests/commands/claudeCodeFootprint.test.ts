/**
 * Claude Code disk-footprint check (PL-4).
 *
 * Runs against a REAL temp directory tree, not an fs mock — the walker's whole
 * job is filesystem shape, and a mocked shape would be the suite agreeing with
 * its own invention. Also pins the report-only contract: the rendered lines
 * carry the resume caveat and never any delete/cleanup offer.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    claudeFootprintLines,
    collectClaudeCodeFootprint,
    formatBytes,
} from '@/commands/claudeCodeFootprint';

let root: string;

/** Write a file of an exact byte size, creating parents. */
function writeSized(relPath: string, bytes: number, mtime?: Date): void {
    const abs = path.join(root, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, Buffer.alloc(bytes, 'x'));
    if (mtime) fs.utimesSync(abs, mtime, mtime);
}

/** A symlink beside `target`; the walker must not size what it points at. */
function linkTo(relTarget: string, relLink: string): void {
    fs.symlinkSync(path.join(root, relTarget), path.join(root, relLink));
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-footprint-'));
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

describe('collectClaudeCodeFootprint', () => {
    it('reports exists:false for a missing directory (Claude Code never ran)', async () => {
        const missing = path.join(root, 'nope', '.claude');
        const footprint = await collectClaudeCodeFootprint(missing);

        expect(footprint).toEqual({ root: missing, exists: false });
    });

    it('sizes subdirectories recursively and sorts them largest first', async () => {
        writeSized('projects/-enc-cwd/a.jsonl', 3000);
        writeSized('plugins/cache/big.bin', 5000);
        writeSized('file-history/one.txt', 100);
        writeSized('history.jsonl', 40); // top-level file: counted in total only

        const footprint = await collectClaudeCodeFootprint(root);

        expect(footprint.exists).toBe(true);
        expect(footprint.totalBytes).toBe(3000 + 5000 + 100 + 40);
        expect(footprint.subdirs?.map((d) => d.name)).toEqual([
            'plugins',
            'projects',
            'file-history',
        ]);
        expect(footprint.subdirs?.[0].bytes).toBe(5000);
    });

    it('counts .jsonl transcripts under projects/ and dates the oldest by last write', async () => {
        writeSized('projects/-cwd-a/new.jsonl', 10, new Date('2026-08-01T00:00:00Z'));
        writeSized('projects/-cwd-a/old.jsonl', 20, new Date('2026-03-24T00:00:00Z'));
        writeSized('projects/-cwd-b/nested/also.jsonl', 30, new Date('2026-06-01T00:00:00Z'));
        writeSized('projects/-cwd-a/not-a-transcript.txt', 999);

        const footprint = await collectClaudeCodeFootprint(root);

        expect(footprint.transcripts).toEqual({
            count: 3,
            bytes: 60,
            oldest: '2026-03-24',
        });
    });

    it('reports zero transcripts when projects/ is absent', async () => {
        writeSized('plugins/x.bin', 10);

        const footprint = await collectClaudeCodeFootprint(root);

        expect(footprint.transcripts).toEqual({ count: 0, bytes: 0 });
    });

    it('sizes only real files — a symlink is neither walked nor stat-followed', async () => {
        writeSized('plugins/real.bin', 1000);
        writeSized('sub/inner.bin', 500);
        linkTo('plugins/real.bin', 'top-link.bin');
        linkTo('sub/inner.bin', 'sub/inner-link.bin');

        const footprint = await collectClaudeCodeFootprint(root);

        // 1500, not 3000: following either link would double-count its target.
        expect(footprint.totalBytes).toBe(1500);
        expect(footprint.subdirs).toEqual([
            { name: 'plugins', bytes: 1000 },
            { name: 'sub', bytes: 500 },
        ]);
    });

    it('skips a subdirectory it cannot read and still totals the rest', async () => {
        writeSized('plugins/readable.bin', 700);
        writeSized('locked/secret.bin', 900);
        fs.chmodSync(path.join(root, 'locked'), 0o000);

        try {
            const footprint = await collectClaudeCodeFootprint(root);

            // The unreadable tree counts as zero — a partial size, never an error.
            expect(footprint.error).toBeUndefined();
            expect(footprint.totalBytes).toBe(700);
            expect(footprint.subdirs).toEqual([
                { name: 'plugins', bytes: 700 },
                { name: 'locked', bytes: 0 },
            ]);
        } finally {
            fs.chmodSync(path.join(root, 'locked'), 0o755);
        }
    });
});

describe('formatBytes', () => {
    it('renders GB, MB and KB at the right magnitudes', () => {
        expect(formatBytes(2.2 * 1024 * 1024 * 1024)).toBe('2.2 GB');
        expect(formatBytes(331 * 1024 * 1024)).toBe('331.0 MB');
        expect(formatBytes(500 * 1024)).toBe('500 KB');
        // Exactly at each boundary the LARGER unit wins (>=, not >).
        expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
        expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
        // Never renders "0 KB" for a non-empty file.
        expect(formatBytes(12)).toBe('1 KB');
    });
});

describe('claudeFootprintLines (report-only contract)', () => {
    it('renders total, largest subdirs, transcripts and the resume caveat', () => {
        const lines = claudeFootprintLines({
            root: '/home/user/.claude',
            exists: true,
            totalBytes: 2.2 * 1024 * 1024 * 1024,
            subdirs: [
                { name: 'projects', bytes: 1.7 * 1024 * 1024 * 1024 },
                { name: 'plugins', bytes: 371 * 1024 * 1024 },
                { name: 'file-history', bytes: 160 * 1024 * 1024 },
                { name: 'shell-snapshots', bytes: 1024 },
            ],
            transcripts: { count: 323, bytes: 1.7 * 1024 * 1024 * 1024, oldest: '2026-03-24' },
        });
        const text = lines.join('\n');

        expect(text).toContain('Claude Code storage (/home/user/.claude):');
        expect(text).toContain('Total: 2.2 GB');
        // Top three only — the long tail is noise in a pasted report.
        expect(text).toContain('projects 1.7 GB');
        expect(text).not.toContain('shell-snapshots');
        expect(text).toContain('323 files');
        expect(text).toContain('oldest 2026-03-24');
        // The one warning that matters: transcripts are how resume works.
        expect(text).toContain('transcripts');
        expect(text).toContain('resets your conversations');
    });

    it('never offers to delete anything (the item states this as a rule)', () => {
        const lines = claudeFootprintLines({
            root: '/home/user/.claude',
            exists: true,
            totalBytes: 1024,
            subdirs: [],
            transcripts: { count: 0, bytes: 0 },
        });

        expect(lines.join('\n')).not.toMatch(/clean ?up|delete .*\?|press|click|\[.*\]/i);
    });

    it('omits the Largest line when the walk reported no subdirectories', () => {
        const lines = claudeFootprintLines({
            root: '/home/user/.claude',
            exists: true,
            totalBytes: 4096,
            transcripts: { count: 0, bytes: 0 },
        });

        expect(lines.join('\n')).not.toContain('Largest');
    });

    it('omits the transcripts line when there are none', () => {
        const lines = claudeFootprintLines({
            root: '/home/user/.claude',
            exists: true,
            totalBytes: 4096,
            subdirs: [{ name: 'plugins', bytes: 4096 }],
            transcripts: { count: 0, bytes: 0 },
        });

        expect(lines.join('\n')).not.toContain('Session transcripts');
    });

    it('says "1 file" and not "1 files" for a single transcript', () => {
        const lines = claudeFootprintLines({
            root: '/home/user/.claude',
            exists: true,
            totalBytes: 4096,
            subdirs: [],
            transcripts: { count: 1, bytes: 4096, oldest: '2026-09-01' },
        });

        expect(lines.join('\n')).toContain('Session transcripts: 1 file,');
    });

    it('says so plainly when Claude Code has never run', () => {
        const lines = claudeFootprintLines({ root: '/home/user/.claude', exists: false });

        expect(lines.join('\n')).toContain('Not present');
    });

    it('reports a failed walk instead of pretending it measured', () => {
        const lines = claudeFootprintLines({
            root: '/home/user/.claude',
            exists: true,
            error: 'EACCES: permission denied',
        });

        expect(lines.join('\n')).toContain('Could not measure: EACCES');
    });
});
