/**
 * AdobeMcpUpdateChecker tests
 *
 * Compares the storefront's installed @adobe-commerce/commerce-extensibility-tools
 * version (read from node_modules/.../package.json) against the latest GitHub
 * release for adobe-commerce/commerce-extensibility-tools. Returns null on any
 * "skip" condition (no storefront, no install, GitHub down), and a populated
 * result for both "current" and "update available" states.
 */

import * as fsPromises from 'fs/promises';

jest.mock('vscode', () => ({}), { virtual: true });

jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
}));

jest.mock('@/features/updates/services/githubApiClient', () => ({
    getLatestRelease: jest.fn(),
}));

import { AdobeMcpUpdateChecker } from '@/features/updates/services/adobeMcpUpdateChecker';
import { getLatestRelease } from '@/features/updates/services/githubApiClient';
import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

const readFileMock = fsPromises.readFile as jest.Mock;
const getLatestReleaseMock = getLatestRelease as jest.Mock;

function makeLogger(): Logger {
    return {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    } as Logger;
}

function makeProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'demo',
        path: '/projects/demo',
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                status: 'ready',
                path: '/projects/demo/components/eds-storefront',
            },
        },
        ...overrides,
    } as Project;
}

const ADOBE_MCP_PKG = '@adobe-commerce/commerce-extensibility-tools';
const ADOBE_MCP_PKG_PATH = '/projects/demo/components/eds-storefront/node_modules/@adobe-commerce/commerce-extensibility-tools/package.json';

beforeEach(() => {
    jest.clearAllMocks();
});

describe('AdobeMcpUpdateChecker', () => {
    describe('skip conditions (return null)', () => {
        it('returns null when the project has no EDS storefront component', async () => {
            const checker = new AdobeMcpUpdateChecker({} as never, makeLogger());

            const result = await checker.checkForUpdates(makeProject({ componentInstances: {} }));

            expect(result).toBeNull();
            expect(getLatestReleaseMock).not.toHaveBeenCalled();
        });

        it('returns null when the EDS storefront component has no path', async () => {
            const checker = new AdobeMcpUpdateChecker({} as never, makeLogger());
            const project = makeProject({
                componentInstances: {
                    [COMPONENT_IDS.EDS_STOREFRONT]: {
                        id: COMPONENT_IDS.EDS_STOREFRONT,
                        name: 'EDS',
                        status: 'ready',
                    } as never,
                },
            });

            expect(await checker.checkForUpdates(project)).toBeNull();
        });

        it('returns null when the Adobe MCP package.json is missing (npm install not run)', async () => {
            readFileMock.mockImplementation(async () => {
                const err = new Error('ENOENT') as NodeJS.ErrnoException;
                err.code = 'ENOENT';
                throw err;
            });
            const checker = new AdobeMcpUpdateChecker({} as never, makeLogger());

            expect(await checker.checkForUpdates(makeProject())).toBeNull();
            expect(getLatestReleaseMock).not.toHaveBeenCalled();
        });

        it('returns null when package.json is malformed JSON', async () => {
            readFileMock.mockResolvedValue('{ not valid json');
            const checker = new AdobeMcpUpdateChecker({} as never, makeLogger());

            expect(await checker.checkForUpdates(makeProject())).toBeNull();
        });

        it('returns null when package.json has no version field', async () => {
            readFileMock.mockResolvedValue(JSON.stringify({ name: ADOBE_MCP_PKG }));
            const checker = new AdobeMcpUpdateChecker({} as never, makeLogger());

            expect(await checker.checkForUpdates(makeProject())).toBeNull();
        });

        it('returns null when getLatestRelease fails (404, rate limit, network)', async () => {
            readFileMock.mockResolvedValue(JSON.stringify({ version: '3.4.0' }));
            getLatestReleaseMock.mockResolvedValue(null);
            const checker = new AdobeMcpUpdateChecker({} as never, makeLogger());

            expect(await checker.checkForUpdates(makeProject())).toBeNull();
        });

        it('returns null when installed version cannot be coerced to semver (no digits)', async () => {
            // `semver.coerce` is intentionally lenient — anything with digits coerces.
            // Only digit-free strings truly fail validation.
            readFileMock.mockResolvedValue(JSON.stringify({ version: 'rolling-tag' }));
            getLatestReleaseMock.mockResolvedValue({ tag: 'v3.5.0', version: '3.5.0' });
            const checker = new AdobeMcpUpdateChecker({} as never, makeLogger());

            expect(await checker.checkForUpdates(makeProject())).toBeNull();
        });
    });

    describe('comparison results', () => {
        it('returns hasUpdate=true when latest is greater than installed', async () => {
            readFileMock.mockResolvedValue(JSON.stringify({ version: '3.4.0' }));
            getLatestReleaseMock.mockResolvedValue({ tag: 'v3.5.0', version: '3.5.0' });
            const checker = new AdobeMcpUpdateChecker({} as never, makeLogger());

            const result = await checker.checkForUpdates(makeProject());

            expect(result).toEqual({
                hasUpdate: true,
                currentVersion: '3.4.0',
                latestVersion: '3.5.0',
                packageName: ADOBE_MCP_PKG,
            });
        });

        it('returns hasUpdate=false when versions match', async () => {
            readFileMock.mockResolvedValue(JSON.stringify({ version: '3.5.0' }));
            getLatestReleaseMock.mockResolvedValue({ tag: 'v3.5.0', version: '3.5.0' });
            const checker = new AdobeMcpUpdateChecker({} as never, makeLogger());

            const result = await checker.checkForUpdates(makeProject());

            expect(result).toMatchObject({ hasUpdate: false, currentVersion: '3.5.0', latestVersion: '3.5.0' });
        });

        it('returns hasUpdate=false when installed is somehow newer than latest', async () => {
            readFileMock.mockResolvedValue(JSON.stringify({ version: '4.0.0' }));
            getLatestReleaseMock.mockResolvedValue({ tag: 'v3.5.0', version: '3.5.0' });
            const checker = new AdobeMcpUpdateChecker({} as never, makeLogger());

            const result = await checker.checkForUpdates(makeProject());

            expect(result).toMatchObject({ hasUpdate: false });
        });
    });

    describe('IO + interaction', () => {
        it('reads the package.json from the storefront node_modules path', async () => {
            readFileMock.mockResolvedValue(JSON.stringify({ version: '3.4.0' }));
            getLatestReleaseMock.mockResolvedValue({ tag: 'v3.4.0', version: '3.4.0' });
            const checker = new AdobeMcpUpdateChecker({} as never, makeLogger());

            await checker.checkForUpdates(makeProject());

            expect(readFileMock).toHaveBeenCalledWith(ADOBE_MCP_PKG_PATH, 'utf-8');
        });

        it('queries adobe-commerce/commerce-extensibility-tools on GitHub', async () => {
            readFileMock.mockResolvedValue(JSON.stringify({ version: '3.4.0' }));
            getLatestReleaseMock.mockResolvedValue({ tag: 'v3.4.0', version: '3.4.0' });
            const secrets = {} as never;
            const checker = new AdobeMcpUpdateChecker(secrets, makeLogger());

            await checker.checkForUpdates(makeProject());

            expect(getLatestReleaseMock).toHaveBeenCalledWith(
                secrets, 'adobe-commerce', 'commerce-extensibility-tools',
            );
        });

        it('logs and returns null when an unexpected error propagates out', async () => {
            readFileMock.mockResolvedValue(JSON.stringify({ version: '3.4.0' }));
            getLatestReleaseMock.mockImplementation(() => { throw new Error('boom'); });
            const logger = makeLogger();
            const checker = new AdobeMcpUpdateChecker({} as never, logger);

            expect(await checker.checkForUpdates(makeProject())).toBeNull();
            expect(logger.error).toHaveBeenCalled();
        });
    });
});
