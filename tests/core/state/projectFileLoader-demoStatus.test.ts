/**
 * ProjectFileLoader — running-demo detection and the load error path.
 *
 * A project is "running" when a terminal named `<project> - Frontend` exists;
 * that flips both the project status and the frontend instance status. A load
 * that fails on a missing path is expected (the project was deleted) and logs
 * at debug; anything else is an error carrying the cause.
 */

import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { ProjectFileLoader } from '@/core/state/projectFileLoader';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../helpers/loggerFake';

jest.mock('fs/promises');

const mockedFs = fs as jest.Mocked<typeof fs>;

const PROJECT_PATH = '/tmp/status-demo';

function makeLogger(): jest.Mocked<Logger> {
    return createMockLogger();
}

function terminal(name: string): vscode.Terminal {
    return { name } as vscode.Terminal;
}

const FRONTEND_MANIFEST = {
    name: 'demo',
    componentInstances: {
        'eds-storefront': { id: 'eds-storefront', name: 'Storefront', type: 'frontend', status: 'ready' },
    },
};

function primeFsWithManifest(manifest: Record<string, unknown>): void {
    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.readFile.mockResolvedValue(JSON.stringify(manifest));
    mockedFs.readdir.mockRejectedValue(new Error('no components dir'));
}

describe('ProjectFileLoader — demo status detection', () => {
    beforeEach(() => jest.clearAllMocks());

    it('marks the project and its frontend running when the project terminal is open', async () => {
        primeFsWithManifest(FRONTEND_MANIFEST);
        const terminals = [terminal('other - Frontend'), terminal('demo - Frontend')];

        const project = await new ProjectFileLoader(makeLogger()).loadProject(PROJECT_PATH, () => terminals);

        expect(project?.status).toBe('running');
        expect(project?.componentInstances?.['eds-storefront']?.status).toBe('running');
    });

    it('marks the project stopped and the frontend ready when only other terminals are open', async () => {
        primeFsWithManifest({
            ...FRONTEND_MANIFEST,
            componentInstances: {
                'eds-storefront': { ...FRONTEND_MANIFEST.componentInstances['eds-storefront'], status: 'running' },
            },
        });

        const project = await new ProjectFileLoader(makeLogger()).loadProject(PROJECT_PATH, () => [
            terminal('other - Frontend'),
        ]);

        expect(project?.status).toBe('stopped');
        expect(project?.componentInstances?.['eds-storefront']?.status).toBe('ready');
    });

    it('leaves a project with no frontend instance stopped without consulting terminals', async () => {
        primeFsWithManifest({
            name: 'demo',
            componentInstances: { mesh: { id: 'mesh', name: 'Mesh', type: 'dependency', status: 'ready' } },
        });
        const logger = makeLogger();
        const terminalProvider = jest.fn(() => [terminal('demo - Frontend')]);

        const project = await new ProjectFileLoader(logger).loadProject(PROJECT_PATH, terminalProvider);

        expect(terminalProvider).not.toHaveBeenCalled();
        expect(project?.status).toBe('stopped');
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('reads the window terminals by default', async () => {
        primeFsWithManifest(FRONTEND_MANIFEST);
        const logger = makeLogger();

        const project = await new ProjectFileLoader(logger).loadProject(PROJECT_PATH);

        expect(project?.status).toBe('stopped');
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('logs and still returns the project when the terminal lookup throws', async () => {
        primeFsWithManifest(FRONTEND_MANIFEST);
        const logger = makeLogger();
        const failure = new Error('terminals unavailable');

        const project = await new ProjectFileLoader(logger).loadProject(PROJECT_PATH, () => {
            throw failure;
        });

        expect(project?.status).toBe('stopped');
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(expect.any(String), failure);
    });
});

describe('ProjectFileLoader — load failures', () => {
    beforeEach(() => jest.clearAllMocks());

    it.each([
        ['an ENOENT code', Object.assign(new Error('missing'), { code: 'ENOENT' })],
        ['ENOENT in the message', new Error('ENOENT: no such file or directory')],
    ])('treats %s as a deleted project: null, debug log, no error log', async (_label, cause) => {
        mockedFs.access.mockRejectedValue(cause);
        const logger = makeLogger();

        const project = await new ProjectFileLoader(logger).loadProject(PROJECT_PATH, () => []);

        expect(project).toBeNull();
        expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining(PROJECT_PATH));
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('logs any other Error with its cause and returns null', async () => {
        const cause = Object.assign(new Error('permission denied'), { code: 'EACCES' });
        mockedFs.access.mockRejectedValue(cause);
        const logger = makeLogger();

        const project = await new ProjectFileLoader(logger).loadProject(PROJECT_PATH, () => []);

        expect(project).toBeNull();
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(PROJECT_PATH), cause);
        expect(logger.debug).not.toHaveBeenCalled();
    });

    it('logs a non-Error rejection without a cause, even when it mentions ENOENT', async () => {
        mockedFs.access.mockRejectedValue({ message: 'ENOENT', code: 'ENOENT' });
        const logger = makeLogger();

        const project = await new ProjectFileLoader(logger).loadProject(PROJECT_PATH, () => []);

        expect(project).toBeNull();
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(PROJECT_PATH), undefined);
        expect(logger.debug).not.toHaveBeenCalled();
    });

    it('fails the load with a parse error when the manifest is not JSON', async () => {
        mockedFs.access.mockResolvedValue(undefined);
        mockedFs.readFile.mockResolvedValue('{ not json');
        const logger = makeLogger();

        const project = await new ProjectFileLoader(logger).loadProject(PROJECT_PATH, () => []);

        expect(project).toBeNull();
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining(PROJECT_PATH),
            expect.objectContaining({ message: 'Failed to parse project manifest' }),
        );
    });
});
