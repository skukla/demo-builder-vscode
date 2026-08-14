/**
 * GeneratedFileWriter Tests — the ADR-013 hash-and-skip write seam.
 *
 * Pins the two matrices from ADR-013 (docs/architecture/adr/013-generated-file-
 * edit-survival.md):
 *
 * Write matrix:
 *   - absent on disk            → write, record hash
 *   - present, hash matches     → ours → overwrite (or 'unchanged' when content
 *                                 is byte-identical: NO disk touch at all)
 *   - present, hash mismatches  → 'skipped' (user-edited), info log, reported
 *   - present, no recorded hash → pre-ADR file: treat as unmodified ONCE →
 *                                 overwrite + record
 *
 * Removal matrix (stricter — deletion needs positive proof of ownership;
 * treat-as-unmodified-once does NOT extend to deletes):
 *   - recorded hash matches disk                       → remove, drop entry
 *   - no hash, disk byte-equal to the current template → remove (provably ours)
 *   - anything else                                    → leave + report skipped
 *   - absent                                           → drop stale entry, 'absent'
 */

import { createHash } from 'crypto';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { createGeneratedFileWriter } from '@/features/project-creation/services/generatedFileWriter';
import { enoentError, makeMockLogger, makeTestWriter } from './generatedFileWriter.testUtils';
import type { Logger } from '@/types/logger';

jest.mock('fs/promises', () => ({
    lstat: jest.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    realpath: jest.fn(async (p: string) => p),
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn(),
    unlink: jest.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PROJECT = '/projects/demo';

function sha256(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function makeLogger(): Logger {
    return {
        trace: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };
}

function enoent(): NodeJS.ErrnoException {
    return Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
}

/** Prime the mocked fs: listed absolute paths exist with the given content; everything else ENOENTs. */
function primeDisk(files: Record<string, string>): void {
    (fsPromises.readFile as jest.Mock).mockImplementation(async (absPath: string) => {
        if (absPath in files) return files[absPath];
        throw enoent();
    });
}

function writeFileCalls(): Array<[string, string]> {
    return (fsPromises.writeFile as jest.Mock).mock.calls as Array<[string, string]>;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createGeneratedFileWriter', () => {
    let logger: Logger;

    beforeEach(() => {
        jest.clearAllMocks();
        primeDisk({});
        logger = makeLogger();
    });

    describe('write — matrix row: absent on disk', () => {
        it('writes the file and returns written', async () => {
            const writer = createGeneratedFileWriter(PROJECT, {}, logger);

            const result = await writer.write('AGENTS.md', 'hello');

            expect(result).toBe('written');
            expect(writeFileCalls()).toEqual([
                [path.join(PROJECT, 'AGENTS.md'), 'hello', 'utf-8'],
            ]);
        });

        it('creates the parent directory recursively before writing', async () => {
            const writer = createGeneratedFileWriter(PROJECT, {}, logger);

            await writer.write('.claude/skills/add-component.md', 'content');

            const mkdirMock = fsPromises.mkdir as jest.Mock;
            expect(mkdirMock).toHaveBeenCalledWith(path.join(PROJECT, '.claude', 'skills'), {
                recursive: true,
            });
        });

        it('records the sha-256 of the written content in hashes()', async () => {
            const writer = createGeneratedFileWriter(PROJECT, {}, logger);

            await writer.write('AGENTS.md', 'hello');

            expect(writer.hashes()).toEqual({ 'AGENTS.md': sha256('hello') });
        });

        it('reports the file as written', async () => {
            const writer = createGeneratedFileWriter(PROJECT, {}, logger);

            await writer.write('AGENTS.md', 'hello');

            expect(writer.report()).toEqual({ written: ['AGENTS.md'], skipped: [], removed: [] });
        });
    });

    describe('write — matrix row: present, recorded hash matches disk (ours)', () => {
        it('overwrites with new content and records the new hash', async () => {
            primeDisk({ [path.join(PROJECT, 'AGENTS.md')]: 'old generated' });
            const writer = createGeneratedFileWriter(
                PROJECT,
                { 'AGENTS.md': sha256('old generated') },
                logger
            );

            const result = await writer.write('AGENTS.md', 'new generated');

            expect(result).toBe('written');
            expect(writeFileCalls()).toEqual([
                [path.join(PROJECT, 'AGENTS.md'), 'new generated', 'utf-8'],
            ]);
            expect(writer.hashes()['AGENTS.md']).toBe(sha256('new generated'));
        });

        it('returns unchanged with zero disk writes when content is byte-identical', async () => {
            primeDisk({ [path.join(PROJECT, 'AGENTS.md')]: 'same content' });
            const writer = createGeneratedFileWriter(
                PROJECT,
                { 'AGENTS.md': sha256('same content') },
                logger
            );

            const result = await writer.write('AGENTS.md', 'same content');

            expect(result).toBe('unchanged');
            expect(fsPromises.writeFile).not.toHaveBeenCalled();
            expect(fsPromises.mkdir).not.toHaveBeenCalled();
        });

        it('keeps the hash entry after an unchanged write', async () => {
            primeDisk({ [path.join(PROJECT, 'AGENTS.md')]: 'same content' });
            const writer = createGeneratedFileWriter(
                PROJECT,
                { 'AGENTS.md': sha256('same content') },
                logger
            );

            await writer.write('AGENTS.md', 'same content');

            expect(writer.hashes()).toEqual({ 'AGENTS.md': sha256('same content') });
        });
    });

    describe('write — matrix row: present, disk differs from recorded hash (user-edited)', () => {
        it('skips the write and returns skipped', async () => {
            primeDisk({ [path.join(PROJECT, 'AGENTS.md')]: 'user edited this' });
            const writer = createGeneratedFileWriter(
                PROJECT,
                { 'AGENTS.md': sha256('what we generated') },
                logger
            );

            const result = await writer.write('AGENTS.md', 'fresh generated');

            expect(result).toBe('skipped');
            expect(fsPromises.writeFile).not.toHaveBeenCalled();
        });

        it('reports the skip and logs it at info naming the file (an event, not silence)', async () => {
            primeDisk({ [path.join(PROJECT, 'AGENTS.md')]: 'user edited this' });
            const writer = createGeneratedFileWriter(
                PROJECT,
                { 'AGENTS.md': sha256('what we generated') },
                logger
            );

            await writer.write('AGENTS.md', 'fresh generated');

            expect(writer.report().skipped).toEqual(['AGENTS.md']);
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('AGENTS.md'));
        });

        it('leaves the recorded hash in place for a skipped file', async () => {
            primeDisk({ [path.join(PROJECT, 'AGENTS.md')]: 'user edited this' });
            const recorded = { 'AGENTS.md': sha256('what we generated') };
            const writer = createGeneratedFileWriter(PROJECT, recorded, logger);

            await writer.write('AGENTS.md', 'fresh generated');

            expect(writer.hashes()['AGENTS.md']).toBe(sha256('what we generated'));
        });
    });

    describe('write — matrix row: present, no recorded hash (pre-ADR file)', () => {
        it('treats the file as unmodified ONCE: overwrites and records the new hash', async () => {
            primeDisk({ [path.join(PROJECT, 'AGENTS.md')]: 'pre-ADR content' });
            const writer = createGeneratedFileWriter(PROJECT, {}, logger);

            const result = await writer.write('AGENTS.md', 'fresh generated');

            expect(result).toBe('written');
            expect(writeFileCalls()).toEqual([
                [path.join(PROJECT, 'AGENTS.md'), 'fresh generated', 'utf-8'],
            ]);
            expect(writer.hashes()['AGENTS.md']).toBe(sha256('fresh generated'));
        });

        it('overwrites even when the pre-ADR disk content equals the new content (records the hash)', async () => {
            primeDisk({ [path.join(PROJECT, 'AGENTS.md')]: 'identical' });
            const writer = createGeneratedFileWriter(PROJECT, {}, logger);

            const result = await writer.write('AGENTS.md', 'identical');

            expect(result).toBe('written');
            expect(writer.hashes()['AGENTS.md']).toBe(sha256('identical'));
        });
    });

    describe('write — error propagation', () => {
        it('rethrows non-ENOENT read errors instead of misreading them as absent', async () => {
            (fsPromises.readFile as jest.Mock).mockRejectedValue(
                Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
            );
            const writer = createGeneratedFileWriter(PROJECT, {}, logger);

            await expect(writer.write('AGENTS.md', 'content')).rejects.toThrow('EACCES');
            expect(fsPromises.writeFile).not.toHaveBeenCalled();
        });
    });

    describe('write — key normalization', () => {
        it('normalizes win32-style separators to posix project-relative keys', async () => {
            const writer = createGeneratedFileWriter(PROJECT, {}, logger);

            await writer.write('.claude\\skills\\add-component.md', 'content');

            expect(Object.keys(writer.hashes())).toEqual(['.claude/skills/add-component.md']);
            expect(writer.report().written).toEqual(['.claude/skills/add-component.md']);
            expect(writeFileCalls()[0][0]).toBe(
                path.join(PROJECT, '.claude', 'skills', 'add-component.md')
            );
        });
    });

    describe('writeMerged — unconditional write for pre-merged content', () => {
        it('writes even when the disk content differs from the recorded hash (never skips)', async () => {
            primeDisk({
                [path.join(PROJECT, '.claude/settings.json')]: '{"user":"edited"}',
            });
            const writer = createGeneratedFileWriter(
                PROJECT,
                { '.claude/settings.json': sha256('{"ours":true}') },
                logger
            );

            await writer.writeMerged('.claude/settings.json', '{"merged":true}');

            expect(writeFileCalls()).toEqual([
                [path.join(PROJECT, '.claude', 'settings.json'), '{"merged":true}', 'utf-8'],
            ]);
        });

        it('records the hash of the merged content and reports it as written', async () => {
            const writer = createGeneratedFileWriter(PROJECT, {}, logger);

            await writer.writeMerged('.claude/settings.json', '{"merged":true}');

            expect(writer.hashes()['.claude/settings.json']).toBe(sha256('{"merged":true}'));
            expect(writer.report().written).toEqual(['.claude/settings.json']);
        });

        it('does not touch the disk when the merged content is byte-identical', async () => {
            // The activation-sweep common path: settings on disk already equal
            // the merge output. Still records the hash (a pre-ADR file becomes
            // tracked), but no write and no "written" event — a healthy
            // project must stay at zero disk writes.
            primeDisk({
                [path.join(PROJECT, '.claude/settings.json')]: '{"merged":true}',
            });
            const writer = createGeneratedFileWriter(PROJECT, {}, logger);

            await writer.writeMerged('.claude/settings.json', '{"merged":true}');

            expect(writeFileCalls()).toEqual([]);
            expect(writer.hashes()['.claude/settings.json']).toBe(sha256('{"merged":true}'));
            expect(writer.report().written).toEqual([]);
        });
    });

    describe('remove — matrix row: recorded hash matches disk', () => {
        it('removes the file and returns removed', async () => {
            primeDisk({ [path.join(PROJECT, '.claude/skills/old.md')]: 'ours' });
            const writer = createGeneratedFileWriter(
                PROJECT,
                { '.claude/skills/old.md': sha256('ours') },
                logger
            );

            const result = await writer.remove('.claude/skills/old.md');

            expect(result).toBe('removed');
            expect(fsPromises.unlink).toHaveBeenCalledWith(
                path.join(PROJECT, '.claude', 'skills', 'old.md')
            );
        });

        it('drops the hash entry and reports the removal', async () => {
            primeDisk({ [path.join(PROJECT, '.claude/skills/old.md')]: 'ours' });
            const writer = createGeneratedFileWriter(
                PROJECT,
                { '.claude/skills/old.md': sha256('ours') },
                logger
            );

            await writer.remove('.claude/skills/old.md');

            expect(writer.hashes()).toEqual({});
            expect(writer.report().removed).toEqual(['.claude/skills/old.md']);
        });
    });

    describe('remove — matrix row: no recorded hash, disk byte-equal to current template', () => {
        it('removes when the disk content equals what we would write today (provably ours)', async () => {
            primeDisk({ [path.join(PROJECT, '.claude/skills/old.md')]: 'template content' });
            const writer = createGeneratedFileWriter(PROJECT, {}, logger);

            const result = await writer.remove('.claude/skills/old.md', 'template content');

            expect(result).toBe('removed');
            expect(fsPromises.unlink).toHaveBeenCalledTimes(1);
        });

        it('skips when the disk content differs from the current template (data-loss guard)', async () => {
            primeDisk({ [path.join(PROJECT, '.claude/skills/old.md')]: 'user rewrote this' });
            const writer = createGeneratedFileWriter(PROJECT, {}, logger);

            const result = await writer.remove('.claude/skills/old.md', 'template content');

            expect(result).toBe('skipped');
            expect(fsPromises.unlink).not.toHaveBeenCalled();
            expect(writer.report().skipped).toEqual(['.claude/skills/old.md']);
        });

        it('skips when no template is supplied (treat-as-unmodified-once does NOT apply to deletes)', async () => {
            primeDisk({ [path.join(PROJECT, '.claude/skills/old.md')]: 'anything' });
            const writer = createGeneratedFileWriter(PROJECT, {}, logger);

            const result = await writer.remove('.claude/skills/old.md');

            expect(result).toBe('skipped');
            expect(fsPromises.unlink).not.toHaveBeenCalled();
        });
    });

    describe('remove — matrix row: recorded hash mismatches disk (user-edited)', () => {
        it('leaves the file, reports it skipped, and logs at info', async () => {
            primeDisk({ [path.join(PROJECT, '.claude/skills/old.md')]: 'user edited' });
            const writer = createGeneratedFileWriter(
                PROJECT,
                { '.claude/skills/old.md': sha256('what we wrote') },
                logger
            );

            const result = await writer.remove('.claude/skills/old.md');

            expect(result).toBe('skipped');
            expect(fsPromises.unlink).not.toHaveBeenCalled();
            expect(writer.report().skipped).toEqual(['.claude/skills/old.md']);
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('.claude/skills/old.md')
            );
        });
    });

    describe('remove — matrix row: absent on disk', () => {
        it('returns absent and drops the stale hash entry without unlinking', async () => {
            primeDisk({});
            const writer = createGeneratedFileWriter(
                PROJECT,
                { '.claude/skills/gone.md': sha256('stale') },
                logger
            );

            const result = await writer.remove('.claude/skills/gone.md');

            expect(result).toBe('absent');
            expect(fsPromises.unlink).not.toHaveBeenCalled();
            expect(writer.hashes()).toEqual({});
        });

        it('does not report an absent file as removed or skipped', async () => {
            primeDisk({});
            const writer = createGeneratedFileWriter(
                PROJECT,
                { '.claude/skills/gone.md': sha256('stale') },
                logger
            );

            await writer.remove('.claude/skills/gone.md');

            expect(writer.report()).toEqual({ written: [], skipped: [], removed: [] });
        });
    });

    describe('hashes — the FULL merged map', () => {
        it('preserves untouched recorded entries across a partial run', async () => {
            const writer = createGeneratedFileWriter(
                PROJECT,
                { '.mcp.json': sha256('tier1'), 'AGENTS.md': sha256('tier2') },
                logger
            );

            // A tier-1-only run touches only .mcp.json.
            await writer.write('.mcp.json', 'tier1 v2');

            expect(writer.hashes()).toEqual({
                '.mcp.json': sha256('tier1 v2'),
                'AGENTS.md': sha256('tier2'),
            });
        });

        it('does not mutate the recordedHashes object passed to the factory', async () => {
            const recorded = { 'AGENTS.md': sha256('original') };
            const writer = createGeneratedFileWriter(PROJECT, recorded, logger);

            await writer.write('AGENTS.md', 'new content');

            expect(recorded).toEqual({ 'AGENTS.md': sha256('original') });
        });
    });

    describe('report — accumulation', () => {
        it('starts empty', () => {
            const writer = createGeneratedFileWriter(PROJECT, {}, logger);

            expect(writer.report()).toEqual({ written: [], skipped: [], removed: [] });
        });

        it('accumulates written, skipped, and removed across operations', async () => {
            primeDisk({
                [path.join(PROJECT, 'edited.md')]: 'user edited',
                [path.join(PROJECT, 'ours.md')]: 'ours',
            });
            const writer = createGeneratedFileWriter(
                PROJECT,
                { 'edited.md': sha256('generated'), 'ours.md': sha256('ours') },
                logger
            );

            await writer.write('new.md', 'fresh');
            await writer.write('edited.md', 'fresh');
            await writer.remove('ours.md');

            expect(writer.report()).toEqual({
                written: ['new.md'],
                skipped: ['edited.md'],
                removed: ['ours.md'],
            });
        });
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// Symlink + containment guards (security review F1): writeFile follows
// symlinks, so a planted link inside a shared project folder would get its
// TARGET overwritten by the sweep. The seam refuses instead: skip + warn +
// report, never a write through a link or a redirected parent directory.
// ═════════════════════════════════════════════════════════════════════════════

describe('symlink and containment guards', () => {
    beforeEach(() => {
        // clearAllMocks clears CALLS but not implementations (webview-test-
        // authoring §6) — reset the sticky ones back to the factory defaults.
        jest.clearAllMocks();
        (fsPromises.mkdir as jest.Mock).mockResolvedValue(undefined);
        (fsPromises.writeFile as jest.Mock).mockResolvedValue(undefined);
        (fsPromises.unlink as jest.Mock).mockResolvedValue(undefined);
        (fsPromises.lstat as jest.Mock).mockReset();
        (fsPromises.lstat as jest.Mock).mockRejectedValue(enoentError());
        (fsPromises.realpath as jest.Mock).mockReset();
        (fsPromises.realpath as jest.Mock).mockImplementation(async (p: string) => p);
        (fsPromises.readFile as jest.Mock).mockReset();
        (fsPromises.readFile as jest.Mock).mockRejectedValue(enoentError());
    });

    it("refuses to write through a symlinked file → 'skipped', no write, no hash", async () => {
        (fsPromises.readFile as jest.Mock).mockResolvedValue('old');
        (fsPromises.lstat as jest.Mock).mockResolvedValue({ isSymbolicLink: () => true });
        const logger = makeMockLogger();
        const writer = createGeneratedFileWriter(PROJECT, {}, logger);

        const outcome = await writer.write('AGENTS.md', 'new content');

        expect(outcome).toBe('skipped');
        expect(fsPromises.writeFile).not.toHaveBeenCalled();
        expect(writer.hashes()['AGENTS.md']).toBeUndefined();
        expect(writer.report().skipped).toContain('AGENTS.md');
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('symlink'));
    });

    it('refuses when the parent directory resolves outside the project root', async () => {
        (fsPromises.readFile as jest.Mock).mockResolvedValue('old');
        (fsPromises.realpath as jest.Mock).mockImplementation(async (p: string) =>
            p === PROJECT ? PROJECT : '/somewhere/else'
        );
        const writer = makeTestWriter(PROJECT);

        const outcome = await writer.write('.claude/mcp.json', '{}');

        expect(outcome).toBe('skipped');
        expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    it('writeMerged refuses a symlinked target the same way', async () => {
        (fsPromises.lstat as jest.Mock).mockResolvedValue({ isSymbolicLink: () => true });
        const writer = makeTestWriter(PROJECT);

        await writer.writeMerged('.claude/settings.json', '{"a":1}');

        expect(fsPromises.writeFile).not.toHaveBeenCalled();
        expect(writer.hashes()['.claude/settings.json']).toBeUndefined();
    });

    it('remove refuses when the parent directory resolves outside the project root', async () => {
        const content = 'ours';
        (fsPromises.readFile as jest.Mock).mockResolvedValue(content);
        (fsPromises.realpath as jest.Mock).mockImplementation(async (p: string) =>
            p === PROJECT ? PROJECT : '/somewhere/else'
        );
        const writer = makeTestWriter(PROJECT, { '.claude/skills/x.md': sha256('ours') });

        const outcome = await writer.remove('.claude/skills/x.md');

        expect(outcome).toBe('skipped');
        expect(fsPromises.unlink).not.toHaveBeenCalled();
    });

    it('an absent target (lstat ENOENT) still writes normally — the guard tolerates absence', async () => {
        (fsPromises.readFile as jest.Mock).mockRejectedValue(enoentError());
        const writer = makeTestWriter(PROJECT);

        const outcome = await writer.write('AGENTS.md', 'fresh');

        expect(outcome).toBe('written');
        expect(fsPromises.writeFile).toHaveBeenCalled();
    });
});
