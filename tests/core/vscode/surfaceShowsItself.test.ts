/**
 * surfaceShowsItself — for work whose progress is already on screen (PL-59 R5,
 * slice 10).
 *
 * Start, stop and restart are short, and the tile that started them says
 * "Starting…" while they run. The command behind each one opened a notification
 * too, so one press produced two things saying the same thing.
 *
 * It leans on the mechanism a progress modal and an agent already use: a command
 * reporting through `BaseCommand.withProgress` stands down when something else
 * is narrating. Here the something else is the tile.
 */

import * as vscode from 'vscode';
import { hasActivePhaseSinks, reportPhase, withPhaseSinks } from '@/core/utils/agentPhaseChannel';
import { surfaceShowsItself } from '@/core/vscode/surfaceShowsItself';

beforeEach(() => {
    jest.clearAllMocks();
});

it('makes a nested progress notification stand down', async () => {
    await surfaceShowsItself(async () => {
        expect(hasActivePhaseSinks()).toBe(true);
        reportPhase('Starting the demo');
    });

    expect(vscode.window.withProgress).not.toHaveBeenCalled();
});

it('returns what the work returned', async () => {
    await expect(surfaceShowsItself(async () => 'done')).resolves.toBe('done');
});

it('lets a failure through, so the caller still hears about it', async () => {
    await expect(
        surfaceShowsItself(async () => {
            throw new Error('the demo would not start');
        }),
    ).rejects.toThrow('the demo would not start');
});

// An agent has no tile to read. Replacing its sinks with one that discards would
// take away the lines slice 7 exists to deliver.
it("leaves an agent's own sinks alone", async () => {
    const seen: string[] = [];

    await withPhaseSinks([(message) => seen.push(message)], () =>
        surfaceShowsItself(async () => {
            reportPhase('Starting the demo');
        }),
    );

    expect(seen).toEqual(['Starting the demo']);
});
