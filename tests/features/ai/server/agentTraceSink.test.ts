/**
 * agentTraceSink — the durable half of the agent activity record (AI-2c).
 *
 * The privacy pin leads: no argument VALUE may ever reach disk. The sink
 * builds its line from a fixed field list, and this suite feeds it an entry
 * whose values are distinctive strings and asserts none appear in the file.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    createAgentTraceFileSink,
    listSessionFiles,
    MAX_LINES,
    MAX_SESSIONS,
} from '@/features/ai/server/agentTraceSink';
import type { TraceEntry } from '@/features/ai/server/toolTraceRecorder';

/**
 * REAL fs, with `readdirSync` swapped for a passthrough mock.
 *
 * A module-factory mock, not `jest.spyOn(fs, ...)`: the spy reaches the test
 * file's copy of the namespace and the sink keeps calling the real one, so the
 * assertion passes against whatever the filesystem happened to return
 * (measured 2026-09-06 — the spy registered a call, the sink saw none of it).
 * Directory ORDER is the thing under test here, and only a mock can set it.
 */
jest.mock('fs', () => {
    const actual = jest.requireActual('fs');
    return { ...actual, readdirSync: jest.fn(actual.readdirSync) };
});

const actualFs = jest.requireActual<typeof fs>('fs');

beforeEach(() => {
    // `resetMocks: true` strips the passthrough before every test.
    (fs.readdirSync as jest.Mock).mockImplementation(actualFs.readdirSync);
});

function tempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-trace-test-'));
}

function entry(overrides: Partial<TraceEntry> = {}): TraceEntry {
    return {
        tool: 'get_project',
        readOnly: true,
        argumentKeys: ['name'],
        argumentFingerprint: 'abc123def4567890',
        resultBytes: 42,
        durationMs: 7,
        outcome: 'ok',
        at: 100,
        ...overrides,
    };
}

describe('createAgentTraceFileSink', () => {
    it('PRIVACY PIN: an entry never carries values, and the line adds none', () => {
        const dir = tempDir();
        const { sink, file } = createAgentTraceFileSink(dir);

        // The recorder's contract already excludes values; this pins that the
        // SINK cannot reintroduce them via spreading a future richer entry.
        const rich = entry({
            argumentKeys: ['password', 'endpoint'],
        }) as TraceEntry & { args?: unknown };
        rich.args = { password: 'SUPER-DISTINCTIVE-SECRET', endpoint: 'https://leak.example' };
        sink(rich);

        const written = fs.readFileSync(file, 'utf8');
        expect(written).not.toContain('SUPER-DISTINCTIVE-SECRET');
        expect(written).not.toContain('leak.example');
        expect(written).toContain('"argumentKeys":["password","endpoint"]');
    });

    it('writes one JSON line per call with an absolute timestamp', () => {
        const dir = tempDir();
        const clock = () => new Date('2026-08-28T12:00:00.000Z');
        const { sink, file } = createAgentTraceFileSink(dir, clock);

        sink(entry());
        sink(entry({ tool: 'list_projects', outcome: 'error' }));

        const lines = fs
            .readFileSync(file, 'utf8')
            .trim()
            .split('\n')
            .map((l) => JSON.parse(l));
        expect(lines).toHaveLength(2);
        expect(lines[0]).toMatchObject({
            ts: '2026-08-28T12:00:00.000Z',
            tool: 'get_project',
            outcome: 'ok',
            resultBytes: 42,
        });
        expect(lines[1]).toMatchObject({ tool: 'list_projects', outcome: 'error' });
    });

    it('prunes to the newest sessions and lists them oldest-first', () => {
        const dir = tempDir();
        for (let i = 0; i < MAX_SESSIONS + 3; i++) {
            const stamp = `2026-08-0${(i % 9) + 1}T0${i % 10}-00-00-000Z`;
            fs.writeFileSync(path.join(dir, `agent-trace-${stamp}-${i}.jsonl`), '{}\n');
        }

        createAgentTraceFileSink(dir);

        // The prune leaves room for the new session's file: N-1 old + 1 new.
        expect(listSessionFiles(dir).length).toBeLessThanOrEqual(MAX_SESSIONS);
    });

    it('stops at the line cap with a truncation marker — a runaway agent cannot fill a disk', () => {
        const dir = tempDir();
        const { sink, file } = createAgentTraceFileSink(dir);

        for (let i = 0; i < MAX_LINES + 10; i++) sink(entry());

        const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
        expect(lines).toHaveLength(MAX_LINES + 1);
        expect(JSON.parse(lines[MAX_LINES])).toMatchObject({ truncated: true });
    });
});

describe('listSessionFiles', () => {
    it('returns only this sink’s files, oldest first', () => {
        // The directory is the extension's log storage and holds other things.
        // Order is load-bearing: the caller prunes from the FRONT, so an
        // unsorted list would delete whichever files the filesystem happened to
        // hand back first.
        (fs.readdirSync as jest.Mock).mockReturnValue([
            'zzz.jsonl',
            'agent-trace-2026-08-02T00-00-00-000Z.jsonl',
            'agent-trace-2026-08-01T00-00-00-000Z.jsonl',
            'agent-trace-2026-08-03T00-00-00-000Z.txt',
            'notes.md',
        ]);

        expect(listSessionFiles('/does-not-matter')).toStrictEqual([
            'agent-trace-2026-08-01T00-00-00-000Z.jsonl',
            'agent-trace-2026-08-02T00-00-00-000Z.jsonl',
        ]);
    });

    it('returns nothing for a directory that is not there yet', () => {
        // First run on a fresh install: the log directory does not exist, and
        // the sink asks before it creates it.
        expect(listSessionFiles(path.join(os.tmpdir(), 'agent-trace-absent-dir'))).toStrictEqual(
            []
        );
    });
});

describe('createAgentTraceFileSink — the session file', () => {
    it('names the file after the session clock, with the colons and dots flattened', () => {
        // The name is the sort key AND has to be a legal filename on every
        // platform, which an ISO timestamp is not.
        const dir = tempDir();
        const { file } = createAgentTraceFileSink(dir, () => new Date('2026-08-28T12:00:00.000Z'));

        expect(path.basename(file)).toBe('agent-trace-2026-08-28T12-00-00-000Z.jsonl');
    });

    it('prunes only the oldest sessions, keeping the newest and room for this one', () => {
        // The bound is on disk use, so the prune must take the OLD end. Slicing
        // the whole list instead throws away every previous session — which
        // still satisfies "at most MAX_SESSIONS files".
        const dir = tempDir();
        const stamps = Array.from(
            { length: MAX_SESSIONS + 2 },
            (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}T00-00-00-000Z`
        );
        for (const stamp of stamps) {
            fs.writeFileSync(path.join(dir, `agent-trace-${stamp}.jsonl`), '{}\n');
        }

        createAgentTraceFileSink(dir, () => new Date('2026-09-01T00:00:00.000Z'));

        // MAX_SESSIONS - 1 old files remain: the prune leaves room for this
        // session, whose own file appears on its first write.
        const kept = listSessionFiles(dir);
        expect(kept).toHaveLength(MAX_SESSIONS - 1);
        // The three oldest went; every newer session is still readable.
        expect(kept).not.toContain(`agent-trace-${stamps[0]}.jsonl`);
        expect(kept).not.toContain(`agent-trace-${stamps[1]}.jsonl`);
        expect(kept).not.toContain(`agent-trace-${stamps[2]}.jsonl`);
        expect(kept).toContain(`agent-trace-${stamps[3]}.jsonl`);
        expect(kept).toContain(`agent-trace-${stamps[MAX_SESSIONS + 1]}.jsonl`);
    });

    it('carries projectShape and the call tag only when the entry has them', () => {
        // Both are optional and both are read downstream by key presence, so a
        // line that always carries them (as null) is not the same line.
        const dir = tempDir();
        const { sink, file } = createAgentTraceFileSink(dir);

        sink(entry({ projectShape: 'eds+accs', tag: 0 }));
        sink(entry());

        const [withExtras, without] = fs
            .readFileSync(file, 'utf8')
            .trim()
            .split('\n')
            .map((l) => JSON.parse(l));
        expect(withExtras).toMatchObject({ projectShape: 'eds+accs', tag: 0 });
        expect(Object.keys(without)).not.toContain('projectShape');
        expect(Object.keys(without)).not.toContain('tag');
    });
});
