/**
 * ProjectFileLoader — component discovery and the manifest/disk merge.
 *
 * The loader lists `components/` on disk and merges what it finds with the
 * manifest's `componentInstances` and `componentVersions`. Every decision in
 * that merge is pinned here: which directories count, which side wins, when a
 * path is back-filled, and when a version entry is created or refreshed.
 */

import * as fs from 'fs/promises';
import type { Stats } from 'fs';
import * as path from 'path';
import { ProjectFileLoader } from '@/core/state/projectFileLoader';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../helpers/loggerFake';

jest.mock('fs/promises');

const mockedFs = fs as jest.Mocked<typeof fs>;

const PROJECT_PATH = '/tmp/discovery-demo';
const COMPONENTS_DIR = path.join(PROJECT_PATH, 'components');
const NO_TERMINALS = () => [];

function makeLogger(): Logger {
    return createMockLogger() as unknown as Logger;
}

/** Prime the fs fake: manifest readable, `components/` holds `entries`, dirs are `dirs`. */
function primeFs(manifest: Record<string, unknown>, entries: string[], dirs: string[]): void {
    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.readFile.mockResolvedValue(JSON.stringify(manifest));
    mockedFs.readdir.mockResolvedValue(entries as unknown as Awaited<ReturnType<typeof fs.readdir>>);
    mockedFs.stat.mockImplementation(async (p) => {
        const isDir = dirs.includes(path.basename(String(p)));
        return { isDirectory: () => isDir } as unknown as Stats;
    });
}

describe('ProjectFileLoader — component discovery', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-09-03T12:00:00.000Z'));
    });

    afterEach(() => jest.useRealTimers());

    it('reads the manifest and the components directory from the project path', async () => {
        primeFs({ name: 'demo' }, [], []);

        await new ProjectFileLoader(makeLogger()).loadProject(PROJECT_PATH, NO_TERMINALS);

        const manifestPath = path.join(PROJECT_PATH, '.demo-builder.json');
        expect(mockedFs.access).toHaveBeenCalledWith(PROJECT_PATH);
        expect(mockedFs.access).toHaveBeenCalledWith(manifestPath);
        expect(mockedFs.readFile).toHaveBeenCalledWith(manifestPath, 'utf-8');
        expect(mockedFs.readdir).toHaveBeenCalledWith(COMPONENTS_DIR);
    });

    it('registers each directory as a ready dependency instance and skips files and snapshots', async () => {
        primeFs({ name: 'demo' }, ['comp-a', 'comp-a.snapshot-1700', 'README.md'], ['comp-a']);

        const project = await new ProjectFileLoader(makeLogger()).loadProject(PROJECT_PATH, NO_TERMINALS);

        expect(mockedFs.stat).toHaveBeenCalledTimes(2);
        expect(mockedFs.stat).toHaveBeenCalledWith(path.join(COMPONENTS_DIR, 'comp-a'));
        expect(mockedFs.stat).toHaveBeenCalledWith(path.join(COMPONENTS_DIR, 'README.md'));
        expect(project?.componentInstances).toEqual({
            'comp-a': {
                id: 'comp-a',
                name: 'comp-a',
                type: 'dependency',
                status: 'ready',
                path: path.join(COMPONENTS_DIR, 'comp-a'),
                lastUpdated: new Date('2026-09-03T12:00:00.000Z'),
            },
        });
    });

    it('lets the manifest instance win over the disk entry and back-fills only a missing path', async () => {
        primeFs(
            {
                name: 'demo',
                componentInstances: {
                    'comp-a': { id: 'comp-a', name: 'Comp A', type: 'frontend', status: 'ready' },
                    'comp-b': {
                        id: 'comp-b', name: 'Comp B', type: 'backend', status: 'ready', path: '/elsewhere/b',
                    },
                    'manifest-only': { id: 'manifest-only', name: 'M', type: 'dependency', status: 'ready' },
                },
            },
            ['comp-a', 'comp-b'],
            ['comp-a', 'comp-b'],
        );

        const project = await new ProjectFileLoader(makeLogger()).loadProject(PROJECT_PATH, NO_TERMINALS);

        expect(project?.componentInstances?.['comp-a']).toEqual({
            id: 'comp-a',
            name: 'Comp A',
            type: 'frontend',
            status: 'ready',
            path: path.join(COMPONENTS_DIR, 'comp-a'),
        });
        expect(project?.componentInstances?.['comp-b']?.path).toBe('/elsewhere/b');
        expect(project?.componentInstances?.['manifest-only']?.path).toBeUndefined();
    });

    it('falls back to the directory name when the manifest has no name, and keeps a manifest name', async () => {
        primeFs({}, [], []);
        const loader = new ProjectFileLoader(makeLogger());

        const unnamed = await loader.loadProject(PROJECT_PATH, NO_TERMINALS);
        primeFs({ name: 'named-demo' }, [], []);
        const named = await loader.loadProject(PROJECT_PATH, NO_TERMINALS);

        expect(unnamed?.name).toBe('discovery-demo');
        expect(named?.name).toBe('named-demo');
    });

    it('loads with empty instances when the components directory cannot be read', async () => {
        mockedFs.access.mockResolvedValue(undefined);
        mockedFs.readFile.mockResolvedValue(JSON.stringify({ name: 'demo' }));
        mockedFs.readdir.mockRejectedValue(new Error('ENOENT'));
        const logger = createMockLogger();

        const project = await new ProjectFileLoader(logger).loadProject(PROJECT_PATH, NO_TERMINALS);

        expect(project?.componentInstances).toEqual({});
        expect(project?.componentVersions).toEqual({});
        // A missing directory is the normal state of a fresh project: noted at
        // debug, never surfaced as an error.
        expect(logger.debug).toHaveBeenCalledTimes(1);
        expect(logger.error).not.toHaveBeenCalled();
    });
});

describe('ProjectFileLoader — componentVersions merge', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-09-03T12:00:00.000Z'));
    });

    afterEach(() => jest.useRealTimers());

    const NOW = '2026-09-03T12:00:00.000Z';
    const OLD = { version: '1.0.0', lastUpdated: '2025-01-01T00:00:00.000Z' };

    it('creates an "unknown" entry for a disk component with no version anywhere', async () => {
        primeFs({ name: 'demo' }, ['comp-a'], ['comp-a']);

        const project = await new ProjectFileLoader(makeLogger()).loadProject(PROJECT_PATH, NO_TERMINALS);

        expect(project?.componentVersions).toEqual({ 'comp-a': { version: 'unknown', lastUpdated: NOW } });
    });

    it('creates an entry from the instance version when the manifest tracks none', async () => {
        primeFs(
            {
                name: 'demo',
                componentInstances: {
                    'comp-a': { id: 'comp-a', name: 'A', type: 'dependency', status: 'ready', version: '2.1.0' },
                },
            },
            ['comp-a'],
            ['comp-a'],
        );

        const project = await new ProjectFileLoader(makeLogger()).loadProject(PROJECT_PATH, NO_TERMINALS);

        expect(project?.componentVersions).toEqual({ 'comp-a': { version: '2.1.0', lastUpdated: NOW } });
    });

    it('keeps the manifest entry verbatim when the instance carries no version or the same one', async () => {
        primeFs(
            {
                name: 'demo',
                componentInstances: {
                    'comp-b': { id: 'comp-b', name: 'B', type: 'dependency', status: 'ready', version: '1.0.0' },
                },
                componentVersions: { 'comp-a': OLD, 'comp-b': OLD, 'not-on-disk': OLD },
            },
            ['comp-a', 'comp-b'],
            ['comp-a', 'comp-b'],
        );

        const project = await new ProjectFileLoader(makeLogger()).loadProject(PROJECT_PATH, NO_TERMINALS);

        expect(project?.componentVersions).toEqual({ 'comp-a': OLD, 'comp-b': OLD, 'not-on-disk': OLD });
    });

    it('refreshes the entry when the instance version differs from the manifest', async () => {
        primeFs(
            {
                name: 'demo',
                componentInstances: {
                    'comp-a': { id: 'comp-a', name: 'A', type: 'dependency', status: 'ready', version: '3.0.0' },
                },
                componentVersions: { 'comp-a': OLD },
            },
            ['comp-a'],
            ['comp-a'],
        );

        const project = await new ProjectFileLoader(makeLogger()).loadProject(PROJECT_PATH, NO_TERMINALS);

        expect(project?.componentVersions).toEqual({ 'comp-a': { version: '3.0.0', lastUpdated: NOW } });
    });
});
