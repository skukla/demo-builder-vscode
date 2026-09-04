/**
 * StartDemoCommand — finding, naming and stopping whatever holds the port
 * (PL-22, MUT-08).
 *
 * The port-conflict suite proves the flow runs; this one pins its decisions:
 * the exact `lsof` calls and their options, how the occupant is NAMED in the
 * prompt from lsof's table (header skipped, whitespace-split, the fallbacks),
 * how PIDs are parsed (blank and non-numeric lines dropped, PID 0 refused,
 * every PID killed through ONE ProcessCleanup), and the two waits: the
 * port-free verification after a kill and the startup poll, each running
 * exactly to its timeout.
 */

import * as vscode from 'vscode';
import {
    MockProcessCleanup,
    StartDemoCommand,
    mockCommandExecutor,
    mockWindow,
    setupStartDemo,
} from './startDemo.testUtils';
import type { StartDemoHarness } from './startDemo.testUtils';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

const LSOF_TABLE =
    'COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME\n' +
    'node    12345 user   24u  IPv4  0x1234      0t0  TCP *:3000 (LISTEN)';
const EXEC_OPTIONS = {
    timeout: TIMEOUTS.QUICK,
    configureTelemetry: false,
    useNodeVersion: null,
    enhancePath: false,
    shell: DEFAULT_SHELL,
};

let harness: StartDemoHarness;
let command: StartDemoCommand;

/** Answer `lsof -ti:` (PIDs) and `lsof -i:` (the table) separately. */
function lsofAnswers(answers: {
    pids?: { code?: number; stdout: string } | Error;
    table?: { code?: number; stdout: string } | Error;
}): void {
    mockCommandExecutor.execute.mockImplementation(async (cmd: string) => {
        const pick = cmd.includes('lsof -ti:') ? answers.pids : answers.table;
        if (pick instanceof Error) throw pick;
        return { code: pick?.code ?? 0, stdout: pick?.stdout ?? '', stderr: '' };
    });
}

/** Port probes: in use (pre-flight), free (verified after the kill), in use (demo up). */
function portFreedThenDemoUp(): void {
    mockCommandExecutor.isPortAvailable
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
        .mockResolvedValue(false);
}

/** Run the command to completion under fake timers, advancing `ms` in one-second steps. */
async function runFor(ms: number): Promise<void> {
    const done = command.execute();
    for (let t = 0; t < ms; t += 1000) {
        await jest.advanceTimersByTimeAsync(1000);
    }
    await done;
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    harness = setupStartDemo();
    command = harness.command;
    // Port in use: the conflict prompt opens; the SC declines by default.
    mockCommandExecutor.isPortAvailable.mockResolvedValue(false);
    mockWindow.showWarningMessage = jest.fn().mockResolvedValue('Cancel');
    lsofAnswers({ pids: { stdout: '12345\n' }, table: { stdout: LSOF_TABLE } });
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('naming the occupant in the prompt', () => {
    const prompt = () => (mockWindow.showWarningMessage as jest.Mock).mock.calls[0];

    it('asks lsof for the port with a quick, bare shell call', async () => {
        await command.execute();

        expect(mockCommandExecutor.execute).toHaveBeenCalledWith('lsof -i:3000', EXEC_OPTIONS);
    });

    it('names the process and PID from the first row after the header', async () => {
        await command.execute();

        expect(prompt()).toEqual([
            'Port 3000 in use by node (PID: 12345). Stop it and start demo?',
            'Stop & Start',
            'Cancel',
        ]);
    });

    it('ignores blank lines before the header', async () => {
        lsofAnswers({ table: { stdout: '\n\nCOMMAND PID\nnode 777 user\n' } });

        await command.execute();

        expect(prompt()[0]).toBe('Port 3000 in use by node (PID: 777). Stop it and start demo?');
    });

    it('trims a row that lsof indents', async () => {
        lsofAnswers({ table: { stdout: 'COMMAND PID\n   node   777 user' } });

        await command.execute();

        expect(prompt()[0]).toBe('Port 3000 in use by node (PID: 777). Stop it and start demo?');
    });

    it('falls back to Unknown for a blank row', async () => {
        lsofAnswers({ table: { stdout: 'COMMAND PID\n\nnode 1' } });

        await command.execute();

        expect(prompt()[0]).toBe('Port 3000 in use by Unknown (PID: Unknown). Stop it and start demo?');
    });

    it.each([
        ['lsof failed', { code: 1, stdout: LSOF_TABLE }],
        ['lsof printed nothing', { code: 0, stdout: '' }],
    ])('says "Unknown process" when %s', async (_name, table) => {
        lsofAnswers({ table });

        await command.execute();

        expect(prompt()[0]).toBe('Port 3000 in use by Unknown process. Stop it and start demo?');
        // Only the "port in use" warning is logged — nothing unexpected happened.
        expect(harness.mockLogger.warn).toHaveBeenCalledTimes(1);
    });

    it('says "Unknown process" for a header with no rows, and does not trip on the missing row', async () => {
        lsofAnswers({ table: { stdout: 'COMMAND   PID USER' } });

        await command.execute();

        expect(prompt()[0]).toBe('Port 3000 in use by Unknown process. Stop it and start demo?');
        expect(harness.mockLogger.warn).toHaveBeenCalledTimes(1);
    });

    it('still asks when lsof itself throws, noting the failure', async () => {
        lsofAnswers({ table: new Error('lsof: command not found') });

        await command.execute();

        expect(prompt()[0]).toBe('Port 3000 in use by Unknown process. Stop it and start demo?');
        expect(harness.mockLogger.warn).toHaveBeenCalledTimes(2);
    });
});

describe('stopping the occupant', () => {
    beforeEach(() => {
        mockWindow.showWarningMessage = jest.fn().mockResolvedValue('Stop & Start');
    });

    it('lists PIDs with a quick, bare shell call', async () => {
        portFreedThenDemoUp();

        await runFor(3000);

        expect(mockCommandExecutor.execute).toHaveBeenCalledWith('lsof -ti:3000', EXEC_OPTIONS);
    });

    it('kills every listed PID, in order, through ONE ProcessCleanup built with the graceful timeout', async () => {
        lsofAnswers({ pids: { stdout: '111\n222\n' } });
        portFreedThenDemoUp();

        await runFor(3000);

        expect(harness.mockProcessCleanup.killProcessTree.mock.calls).toEqual([
            [111, 'SIGTERM'],
            [222, 'SIGTERM'],
        ]);
        expect(MockProcessCleanup).toHaveBeenCalledTimes(1);
        expect(MockProcessCleanup).toHaveBeenCalledWith({
            gracefulTimeout: TIMEOUTS.PROCESS_GRACEFUL_SHUTDOWN,
        });
    });

    it('drops blank, non-numeric and zero lines from the PID list', async () => {
        lsofAnswers({ pids: { stdout: '\nabc\n0\n 12345 \n' } });
        portFreedThenDemoUp();

        await runFor(3000);

        expect(harness.mockProcessCleanup.killProcessTree.mock.calls).toEqual([[12345, 'SIGTERM']]);
    });

    it('keeps killing the rest when one PID refuses, noting it once', async () => {
        lsofAnswers({ pids: { stdout: '111\n222\n' } });
        harness.mockProcessCleanup.killProcessTree
            .mockRejectedValueOnce(new Error('EPERM'))
            .mockResolvedValue(undefined);
        portFreedThenDemoUp();

        await runFor(3000);

        expect(harness.mockProcessCleanup.killProcessTree).toHaveBeenCalledTimes(2);
        // One warn for the refusal, one for the port-in-use notice — nothing else.
        expect(harness.mockLogger.warn).toHaveBeenCalledTimes(2);
    });

    it.each([
        ['lsof exits non-zero', { code: 1, stdout: '12345\n' }],
        ['lsof prints only whitespace', { code: 0, stdout: '  \n' }],
        ['lsof prints no usable PID', { code: 0, stdout: 'abc\n' }],
    ])('gives up at once when %s — no kill, no wait', async (_name, pids) => {
        lsofAnswers({ pids });

        await command.execute();

        expect(harness.mockProcessCleanup.killProcessTree).not.toHaveBeenCalled();
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'Could not stop process on port 3000. Try stopping it manually.',
            'OK'
        );
        // The pre-flight check was the only port probe: no verification loop ran.
        expect(mockCommandExecutor.isPortAvailable).toHaveBeenCalledTimes(1);
        expect(vscode.window.createTerminal).not.toHaveBeenCalled();
    });

    it('reports a thrown stop as its own failure', async () => {
        lsofAnswers({ pids: new Error('spawn lsof EACCES') });

        await command.execute();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'Failed to stop process on port 3000. Try stopping it manually.',
            'OK'
        );
        expect(vscode.window.createTerminal).not.toHaveBeenCalled();
    });

    it('verifies the port is free for exactly the poll window before giving up', async () => {
        // Port never frees: the pre-flight probe plus one probe per check interval.
        await runFor(TIMEOUTS.POLL.MAX + 2000);

        expect(mockCommandExecutor.isPortAvailable).toHaveBeenCalledTimes(
            1 + TIMEOUTS.POLL.MAX / TIMEOUTS.POLL.PROCESS_CHECK
        );
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'Could not stop process on port 3000. Try stopping it manually.',
            'OK'
        );
    });
});

describe('waiting for the demo to come up', () => {
    it('polls the port once per interval until the startup timeout, then warns', async () => {
        // Port free throughout: no conflict, and the demo never binds it.
        mockCommandExecutor.isPortAvailable.mockResolvedValue(true);

        await runFor(TIMEOUTS.NORMAL + 5000);

        // The pre-flight probe plus one probe per interval inside the window.
        expect(mockCommandExecutor.isPortAvailable).toHaveBeenCalledTimes(
            1 + TIMEOUTS.NORMAL / TIMEOUTS.POLL.INTERVAL
        );
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            'Demo startup timed out. Check the terminal for errors.',
            'OK'
        );
        expect(harness.mockStateManager.saveProject).toHaveBeenCalledTimes(1);
    });
});
