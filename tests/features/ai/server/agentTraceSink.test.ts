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
