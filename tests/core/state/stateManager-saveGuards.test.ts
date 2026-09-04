/**
 * The guards around a save, and the two save paths that are not `saveProject`.
 *
 * A save can arrive from a background poller after the project it describes
 * has been deleted, or after the window cleared it; neither may recreate the
 * directory. A state write can fail before the manifest is touched. And
 * `saveProjectConfigOnly` must reach the manifest WITHOUT moving the current
 * project. Every assertion is on which files were written, to which paths,
 * or on what the manager holds afterwards.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type { ProcessInfo } from '@/types/base';
import { createMockTerminal, mockWindow } from '../../helpers/vscodeMockViews';
import {
    createStateManagerProject,
    mockLoggerInstance,
    mockStateFile,
    setupMocks,
    type TestMocks,
} from './stateManager.testUtils';

// The mock wall lives in the testUtils, but a jest.mock only hoists within the
// module it appears in — each suite must register the same two itself.
jest.mock('fs/promises');
jest.mock('os');

const PROJECT_PATH = '/test/project';
const OTHER_PATH = '/test/other-project';
const STATE_TMP = `${mockStateFile}.tmp`;

const FRONTEND_MANIFEST = {
    name: 'Test Project',
    created: '2024-01-01',
    componentInstances: {
        headless: { id: 'headless', name: 'Headless', status: 'ready', type: 'frontend' },
    },
};

function writesTo(suffix: string): string[] {
    return (fs.writeFile as jest.Mock).mock.calls
        .map(([target]) => String(target))
        .filter((target) => target.endsWith(suffix));
}

function lastStateWrite(): Record<string, unknown> {
    const call = (fs.writeFile as jest.Mock).mock.calls.filter(
        ([target]) => String(target) === STATE_TMP,
    ).at(-1);
    return JSON.parse(String(call?.[1]));
}

/** The manifest at PROJECT_PATH answers; everything else is missing. */
function primeManifest(): void {
    (fs.readFile as jest.Mock).mockImplementation(async (target: string) => {
        if (target === path.join(PROJECT_PATH, '.demo-builder.json')) {
            return JSON.stringify(FRONTEND_MANIFEST);
        }
        throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
    });
}

describe('StateManager.saveProject — guards', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        testMocks = setupMocks();
    });

    it('writes nothing for a project whose directory is gone when no project is current', async () => {
        await testMocks.stateManager.initialize();
        (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));
        const listener = jest.fn();
        testMocks.stateManager.onProjectChanged(listener);

        await testMocks.stateManager.saveProject(createStateManagerProject());

        expect(fs.writeFile).not.toHaveBeenCalled();
        expect(fs.mkdir).not.toHaveBeenCalledWith(PROJECT_PATH, expect.anything());
        expect(listener).not.toHaveBeenCalled();
        await expect(testMocks.stateManager.hasProject()).resolves.toBe(false);
    });

    it('recreates the directory when it is gone but the project IS current', async () => {
        await testMocks.stateManager.initialize();
        await testMocks.stateManager.saveProject(createStateManagerProject());
        (fs.mkdir as jest.Mock).mockClear();
        (fs.writeFile as jest.Mock).mockClear();
        (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));

        await testMocks.stateManager.saveProject(createStateManagerProject());

        expect(fs.mkdir).toHaveBeenCalledWith(PROJECT_PATH, { recursive: true });
        expect(writesTo('.demo-builder.json.tmp')).toEqual([
            path.join(PROJECT_PATH, '.demo-builder.json.tmp'),
        ]);
    });

    it('rethrows a state-file failure before the manifest is touched', async () => {
        await testMocks.stateManager.initialize();
        const failure = new Error('EIO: state disk failed');
        (fs.writeFile as jest.Mock).mockImplementation(async (target: string) => {
            if (target === STATE_TMP) throw failure;
        });

        await expect(
            testMocks.stateManager.saveProject(createStateManagerProject()),
        ).rejects.toBe(failure);

        expect(mockLoggerInstance.error).toHaveBeenCalledWith('Failed to save state', failure);
        expect(writesTo('.demo-builder.json.tmp')).toEqual([]);
    });

    it('does not recreate a project that was cleared while its save was in flight', async () => {
        // The pointer is re-read AFTER the state write, so a clearProject that lands
        // in between must make the writer see "no current project" and skip — not
        // crash on a missing pointer, and not resurrect the directory.
        await testMocks.stateManager.initialize();
        let cleared = false;
        (fs.writeFile as jest.Mock).mockImplementation(async (target: string) => {
            if (target === STATE_TMP && !cleared) {
                cleared = true;
                void testMocks.stateManager.clearProject();
            }
        });
        (fs.access as jest.Mock)
            .mockResolvedValueOnce(undefined) // the guard's own existence check
            .mockRejectedValue(new Error('ENOENT')); // the writer's, after the clear

        await expect(
            testMocks.stateManager.saveProject(createStateManagerProject()),
        ).resolves.toBeUndefined();

        expect(writesTo('.demo-builder.json.tmp')).toEqual([]);
        expect(fs.mkdir).not.toHaveBeenCalledWith(PROJECT_PATH, expect.anything());
    });
});

describe('StateManager.saveProjectConfigOnly', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        testMocks = setupMocks();
    });

    it('writes the manifest for a project that is not current, and nothing else', async () => {
        await testMocks.stateManager.initialize();
        const listener = jest.fn();
        testMocks.stateManager.onProjectChanged(listener);
        const other = { ...createStateManagerProject(), path: OTHER_PATH, name: 'Other' };

        await testMocks.stateManager.saveProjectConfigOnly(other);

        expect(writesTo('.demo-builder.json.tmp')).toEqual([
            path.join(OTHER_PATH, '.demo-builder.json.tmp'),
        ]);
        expect(writesTo('state.json.tmp')).toEqual([]);
        expect(listener).not.toHaveBeenCalled();
        await expect(testMocks.stateManager.hasProject()).resolves.toBe(false);
    });

    it('leaves the current project in place when writing another one', async () => {
        await testMocks.stateManager.initialize();
        await testMocks.stateManager.saveProject(createStateManagerProject());
        (fs.writeFile as jest.Mock).mockClear();
        const other = { ...createStateManagerProject(), path: OTHER_PATH, name: 'Other' };

        await testMocks.stateManager.saveProjectConfigOnly(other);

        expect(writesTo('.demo-builder.json.tmp')).toEqual([
            path.join(OTHER_PATH, '.demo-builder.json.tmp'),
        ]);
        expect(writesTo('state.json.tmp')).toEqual([]);
        (fs.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));
        const current = await testMocks.stateManager.getCurrentProject();
        expect(current?.path).toBe(PROJECT_PATH);
    });

    it('skips a non-current project whose directory is gone', async () => {
        await testMocks.stateManager.initialize();
        await testMocks.stateManager.saveProject(createStateManagerProject());
        (fs.writeFile as jest.Mock).mockClear();
        (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));
        const other = { ...createStateManagerProject(), path: OTHER_PATH, name: 'Other' };

        await testMocks.stateManager.saveProjectConfigOnly(other);

        expect(fs.writeFile).not.toHaveBeenCalled();
        expect(fs.mkdir).not.toHaveBeenCalledWith(OTHER_PATH, expect.anything());
    });
});

describe('StateManager.clearAll — the state it leaves behind', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        testMocks = setupMocks();
    });

    it('leaves a usable version-1 state with an empty process map', async () => {
        await testMocks.stateManager.initialize();
        const info: ProcessInfo = {
            pid: 4242,
            port: 3000,
            startTime: new Date('2026-01-01T00:00:00.000Z'),
            command: 'npm start',
            status: 'running',
        };
        await testMocks.stateManager.addProcess('stale', info);

        await testMocks.stateManager.clearAll();
        await expect(testMocks.stateManager.getProcess('stale')).resolves.toBeUndefined();
        await testMocks.stateManager.addProcess('fresh', info);

        const written = lastStateWrite();
        expect(written.version).toBe(1);
        expect(written.currentProjectPath).toBeUndefined();
        expect(Object.keys(written.processes as object)).toEqual(['fresh']);
    });
});

describe('StateManager.loadProjectFromPath — what it holds and which terminals it reads', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        testMocks = setupMocks();
        mockWindow.terminals = [];
    });

    afterEach(() => {
        mockWindow.terminals = [];
    });

    it('adopts the project in memory even when asked not to persist it', async () => {
        primeManifest();
        await testMocks.stateManager.initialize();

        await testMocks.stateManager.loadProjectFromPath(PROJECT_PATH, () => [], {
            persistAfterLoad: false,
        });

        expect(fs.writeFile).not.toHaveBeenCalled();
        await expect(testMocks.stateManager.hasProject()).resolves.toBe(true);
    });

    it("reads the WINDOW's terminals when no provider is given", async () => {
        primeManifest();
        await testMocks.stateManager.initialize();
        mockWindow.terminals = [createMockTerminal({ name: 'Test Project - Frontend' })];

        const project = await testMocks.stateManager.loadProjectFromPath(PROJECT_PATH);

        expect(project?.status).toBe('running');
    });

    it("getCurrentProject reads the WINDOW's terminals for its reload", async () => {
        (fs.readFile as jest.Mock).mockImplementation(async (target: string) => {
            if (target === mockStateFile) {
                return JSON.stringify({ version: 1, currentProjectPath: PROJECT_PATH });
            }
            if (target === path.join(PROJECT_PATH, '.demo-builder.json')) {
                return JSON.stringify(FRONTEND_MANIFEST);
            }
            throw new Error('ENOENT');
        });
        await testMocks.stateManager.initialize();
        mockWindow.terminals = [createMockTerminal({ name: 'Test Project - Frontend' })];

        const current = await testMocks.stateManager.getCurrentProject();

        expect(current?.status).toBe('running');
        expect(vscode.window.terminals).toHaveLength(1);
    });
});
