/**
 * What `initialize()` decides while reading the state file.
 *
 * Four decisions, each pinned by what the manager DOES next rather than by
 * what it logs: whether a pointer is followed at all, whether the loader is
 * asked, what the window holds when the pointed-at manifest is gone, and
 * which terminals the default provider reads. The catch blocks that only log
 * are pinned by the cause they hand the logger — that is the whole of their
 * behaviour, and an emptied catch would silently swallow it.
 */

import * as fs from 'fs/promises';
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

/** A manifest with a frontend, so the loader consults the terminal provider. */
const FRONTEND_MANIFEST = {
    name: 'Test Project',
    created: '2024-01-01',
    componentInstances: {
        headless: { id: 'headless', name: 'Headless', status: 'ready', type: 'frontend' },
    },
};

/** state.json points at PROJECT_PATH; the manifest answers as given (or is missing). */
function primeDisk(manifest: object | null): void {
    (fs.readFile as jest.Mock).mockImplementation(async (target: string) => {
        if (target === mockStateFile) {
            return JSON.stringify({ version: 1, currentProjectPath: PROJECT_PATH });
        }
        if (target.endsWith('.demo-builder.json') && manifest) {
            return JSON.stringify(manifest);
        }
        throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
    });
}

function manifestReads(): number {
    return (fs.readFile as jest.Mock).mock.calls.filter(([target]) =>
        String(target).endsWith('.demo-builder.json'),
    ).length;
}

describe('StateManager.initialize — reading the state file', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        testMocks = setupMocks();
        mockWindow.terminals = [];
    });

    afterEach(() => {
        mockWindow.terminals = [];
    });

    it('logs the cause when the state directory cannot be created, and still reads state', async () => {
        const failure = new Error('EACCES: permission denied');
        (fs.mkdir as jest.Mock).mockRejectedValue(failure);

        await testMocks.stateManager.initialize();

        expect(mockLoggerInstance.error).toHaveBeenCalledWith(
            'Failed to create state directory',
            failure,
        );
        expect(fs.readFile).toHaveBeenCalledWith(mockStateFile, 'utf-8');
    });

    it('does not probe the filesystem when the state file names no project', async () => {
        (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({ version: 1 }));

        await testMocks.stateManager.initialize();

        expect(fs.access).not.toHaveBeenCalled();
        expect(manifestReads()).toBe(0);
        await expect(testMocks.stateManager.hasProject()).resolves.toBe(false);
    });

    it('does not ask the loader when the pointed-at directory is gone, and says which path', async () => {
        primeDisk(FRONTEND_MANIFEST);
        (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));

        await testMocks.stateManager.initialize();

        expect(manifestReads()).toBe(0);
        expect(mockLoggerInstance.warn).toHaveBeenCalledWith(
            expect.stringContaining(`${PROJECT_PATH} does not exist`),
        );
        await expect(testMocks.stateManager.hasProject()).resolves.toBe(false);
    });

    it('holds NO project when the pointed-at manifest cannot be loaded', async () => {
        // null from the loader must become "no project", not a held null: hasProject
        // answers `!== undefined`, and a null would read as a project everywhere.
        primeDisk(null);

        await testMocks.stateManager.initialize();

        await expect(testMocks.stateManager.hasProject()).resolves.toBe(false);
        expect(mockLoggerInstance.warn).toHaveBeenCalledWith(
            expect.stringContaining(`Failed to load project from manifest at ${PROJECT_PATH}`),
        );
    });

    it('falls back to defaults, and says so, when there is no state file', async () => {
        (fs.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

        await testMocks.stateManager.initialize();

        expect(mockLoggerInstance.info).toHaveBeenCalledWith(
            'No existing state found, using defaults',
        );
        await expect(testMocks.stateManager.hasProject()).resolves.toBe(false);
    });

    it("reads the WINDOW's terminals to decide whether the loaded project is running", async () => {
        primeDisk(FRONTEND_MANIFEST);
        mockWindow.terminals = [createMockTerminal({ name: 'Test Project - Frontend' })];

        await testMocks.stateManager.initialize();

        // Make every later read fail so getCurrentProject cannot reload from disk
        // and must answer with what initialize() loaded.
        (fs.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));
        const held = await testMocks.stateManager.getCurrentProject();

        expect(held?.path).toBe(PROJECT_PATH);
        expect(held?.status).toBe('running');
    });

    it('keeps the in-memory project when the reload itself throws', async () => {
        primeDisk(FRONTEND_MANIFEST);
        await testMocks.stateManager.initialize();
        jest.spyOn(testMocks.stateManager, 'loadProjectFromPath').mockRejectedValue(
            new Error('torn manifest'),
        );

        const current = await testMocks.stateManager.getCurrentProject();

        expect(current?.name).toBe('Test Project');
    });

    it('keeps the in-memory project when the reload finds no manifest', async () => {
        primeDisk(FRONTEND_MANIFEST);
        await testMocks.stateManager.initialize();
        const inMemory = createStateManagerProject();
        expect(inMemory.path).toBe(PROJECT_PATH);

        // Pointer still readable; the manifest behind it is gone.
        primeDisk(null);
        const current = await testMocks.stateManager.getCurrentProject();

        expect(current).toBeDefined();
        expect(current?.name).toBe('Test Project');
    });
});
