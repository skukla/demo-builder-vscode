/**
 * Reading a state file that is OLDER or less complete than the code expects.
 *
 * `~/.demo-builder/state.json` is written by whichever version of the extension last
 * ran, and it outlives them all. So every field it holds is optional at read time, and
 * each one has a default — which is what lets a project created months ago still open.
 *
 * None of the defaults was tested. The existing load test asserts that the file was
 * READ; the process tests assert that something was WRITTEN. Neither looks at what the
 * state became, so nine deliberate breakages in the four lines that apply the defaults
 * went unnoticed.
 *
 * These read the state BACK OUT of the next save, because that is the only place the
 * loaded values surface.
 */

import * as fs from 'fs/promises';
import { setupMocks, type TestMocks } from './stateManager.testUtils';
import type { ProcessInfo } from '@/types/base';

jest.mock('fs/promises');
jest.mock('os');

const RUNNING: ProcessInfo = {
    pid: 12345,
    port: 3000,
    startTime: new Date('2026-01-01'),
    command: 'npm start',
    status: 'running',
};

/** The state object as it was last written to disk. */
function lastWrittenState(): { version?: number; processes?: Record<string, unknown> } {
    const calls = (fs.writeFile as jest.Mock).mock.calls;
    for (let i = calls.length - 1; i >= 0; i--) {
        const body = calls[i][1];
        if (typeof body !== 'string') continue;
        try {
            const parsed = JSON.parse(body);
            if (parsed && typeof parsed === 'object' && 'version' in parsed) return parsed;
        } catch {
            // Not the state write — the manager writes other files too.
        }
    }
    throw new Error(`No state write found among ${calls.length} writeFile call(s).`);
}

describe('StateManager - defaults when the state file is old or partial', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        testMocks = setupMocks();
    });

    /** Put `contents` on disk as the state file, then start up and force a save. */
    async function loadThenSave(contents: string) {
        const { stateManager } = testMocks;
        (fs.readFile as jest.Mock).mockResolvedValue(contents);
        await stateManager.initialize();
        // Any mutation triggers the write-back that exposes the loaded values.
        await stateManager.addProcess('probe', RUNNING);
        return stateManager;
    }

    it('assumes version 1 when the file does not say', async () => {
        // Written before the version field existed. It must load, not be discarded.
        await loadThenSave(JSON.stringify({ currentProjectPath: undefined, processes: {} }));

        expect(lastWrittenState().version).toBe(1);
    });

    it('keeps the version the file states rather than resetting it', async () => {
        await loadThenSave(JSON.stringify({ version: 7, processes: {} }));

        expect(lastWrittenState().version).toBe(7);
    });

    it('survives a file with no processes at all, keeping the rest of the state', async () => {
        // The default here is load-bearing in a way that is easy to miss: without it,
        // reading the processes throws, the whole assignment is abandoned, and the file's
        // OTHER values are silently lost — the version among them.
        await loadThenSave(JSON.stringify({ version: 7 }));

        expect(lastWrittenState().version).toBe(7);
    });

    it('loads the processes the file does hold', async () => {
        const { stateManager } = testMocks;
        (fs.readFile as jest.Mock).mockResolvedValue(
            JSON.stringify({ version: 1, processes: { existing: RUNNING } })
        );
        await stateManager.initialize();

        const found = await stateManager.getProcess('existing');
        expect(found).toMatchObject({ pid: 12345, port: 3000, status: 'running' });
    });

    it('falls back to defaults when the file is not readable JSON, without throwing', async () => {
        const { stateManager } = testMocks;
        (fs.readFile as jest.Mock).mockResolvedValue('{ this is not json');

        await expect(stateManager.initialize()).resolves.not.toThrow();

        // Nothing from the unreadable file leaked into the state.
        expect(await stateManager.getProcess('anything')).toBeUndefined();
    });
});
