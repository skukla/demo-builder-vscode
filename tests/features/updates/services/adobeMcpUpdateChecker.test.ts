/**
 * AdobeMcpUpdateChecker tests
 *
 * Compares the storefront's installed @adobe-commerce/commerce-extensibility-tools
 * version (read from node_modules/.../package.json) against the latest GitHub
 * release for adobe-commerce/commerce-extensibility-tools. Returns null on any
 * "skip" condition (no storefront, no install, GitHub down), and a populated
 * result for both "current" and "update available" states.
 */

// The shared mock wall FIRST, so its jest.mock calls register before the subject binds.
import { AdobeMcpUpdateChecker } from './adobeMcpUpdateChecker.testUtils';
import {
    ADOBE_MCP_PKG,
    getLatestReleaseMock,
    makeMcpProject,
    readFileMock,
} from './adobeMcpUpdateChecker.testUtils';
import { COMPONENT_IDS } from '@/core/constants';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

function makeLogger(): Logger {
    return createMockLogger() as Logger;
}

const ADOBE_MCP_PKG_PATH = '/projects/demo/.demo-builder-mcp/node_modules/@adobe-commerce/commerce-extensibility-tools/package.json';

beforeEach(() => {
    jest.clearAllMocks();
});

describe('AdobeMcpUpdateChecker', () => {
    describe('skip conditions (return null)', () => {
        it('returns null when the project has no EDS storefront component', async () => {
            const checker = new AdobeMcpUpdateChecker(createMockSecretStorage().secrets, makeLogger());

            const result = await checker.checkForUpdates(makeMcpProject({ componentInstances: {} }));

            expect(result).toBeNull();
            expect(getLatestReleaseMock).not.toHaveBeenCalled();
        });

        it('returns null when the EDS storefront component has no path', async () => {
            const checker = new AdobeMcpUpdateChecker(createMockSecretStorage().secrets, makeLogger());
            const project = makeMcpProject({
                componentInstances: {
                    [COMPONENT_IDS.EDS_STOREFRONT]: {
                        id: COMPONENT_IDS.EDS_STOREFRONT,
                        name: 'EDS',
                        status: 'ready',
                    },
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
            const checker = new AdobeMcpUpdateChecker(createMockSecretStorage().secrets, makeLogger());

            expect(await checker.checkForUpdates(makeMcpProject())).toBeNull();
            expect(getLatestReleaseMock).not.toHaveBeenCalled();
        });

        it('returns null when package.json is malformed JSON', async () => {
            readFileMock.mockResolvedValue('{ not valid json');
            const checker = new AdobeMcpUpdateChecker(createMockSecretStorage().secrets, makeLogger());

            expect(await checker.checkForUpdates(makeMcpProject())).toBeNull();
        });

        it('returns null when package.json has no version field', async () => {
            readFileMock.mockResolvedValue(JSON.stringify({ name: ADOBE_MCP_PKG }));
            const checker = new AdobeMcpUpdateChecker(createMockSecretStorage().secrets, makeLogger());

            expect(await checker.checkForUpdates(makeMcpProject())).toBeNull();
        });

        it('returns null when getLatestRelease fails (404, rate limit, network)', async () => {
            readFileMock.mockResolvedValue(JSON.stringify({ version: '3.4.0' }));
            getLatestReleaseMock.mockResolvedValue(null);
            const checker = new AdobeMcpUpdateChecker(createMockSecretStorage().secrets, makeLogger());

            expect(await checker.checkForUpdates(makeMcpProject())).toBeNull();
        });

        it('returns null when installed version cannot be coerced to semver (no digits)', async () => {
            // `semver.coerce` is intentionally lenient — anything with digits coerces.
            // Only digit-free strings truly fail validation.
            readFileMock.mockResolvedValue(JSON.stringify({ version: 'rolling-tag' }));
            getLatestReleaseMock.mockResolvedValue({ tag: 'v3.5.0', version: '3.5.0' });
            const checker = new AdobeMcpUpdateChecker(createMockSecretStorage().secrets, makeLogger());

            expect(await checker.checkForUpdates(makeMcpProject())).toBeNull();
        });
    });

    describe('comparison results', () => {
        it('returns hasUpdate=true when latest is greater than installed', async () => {
            readFileMock.mockResolvedValue(JSON.stringify({ version: '3.4.0' }));
            getLatestReleaseMock.mockResolvedValue({ tag: 'v3.5.0', version: '3.5.0' });
            const checker = new AdobeMcpUpdateChecker(createMockSecretStorage().secrets, makeLogger());

            const result = await checker.checkForUpdates(makeMcpProject());

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
            const checker = new AdobeMcpUpdateChecker(createMockSecretStorage().secrets, makeLogger());

            const result = await checker.checkForUpdates(makeMcpProject());

            expect(result).toMatchObject({ hasUpdate: false, currentVersion: '3.5.0', latestVersion: '3.5.0' });
        });

        it('returns hasUpdate=false when installed is somehow newer than latest', async () => {
            readFileMock.mockResolvedValue(JSON.stringify({ version: '4.0.0' }));
            getLatestReleaseMock.mockResolvedValue({ tag: 'v3.5.0', version: '3.5.0' });
            const checker = new AdobeMcpUpdateChecker(createMockSecretStorage().secrets, makeLogger());

            const result = await checker.checkForUpdates(makeMcpProject());

            expect(result).toMatchObject({ hasUpdate: false });
        });
    });

    describe('IO + interaction', () => {
        it('reads the package.json from the storefront node_modules path', async () => {
            readFileMock.mockResolvedValue(JSON.stringify({ version: '3.4.0' }));
            getLatestReleaseMock.mockResolvedValue({ tag: 'v3.4.0', version: '3.4.0' });
            const checker = new AdobeMcpUpdateChecker(createMockSecretStorage().secrets, makeLogger());

            await checker.checkForUpdates(makeMcpProject());

            expect(readFileMock).toHaveBeenCalledWith(ADOBE_MCP_PKG_PATH, 'utf-8');
        });

        it('queries adobe-commerce/commerce-extensibility-tools on GitHub', async () => {
            readFileMock.mockResolvedValue(JSON.stringify({ version: '3.4.0' }));
            getLatestReleaseMock.mockResolvedValue({ tag: 'v3.4.0', version: '3.4.0' });
            const secrets = createMockSecretStorage().secrets;
            const checker = new AdobeMcpUpdateChecker(secrets, makeLogger());

            await checker.checkForUpdates(makeMcpProject());

            expect(getLatestReleaseMock).toHaveBeenCalledWith(
                secrets, 'adobe-commerce', 'commerce-extensibility-tools',
            );
        });

        it('logs and returns null when an unexpected error propagates out', async () => {
            readFileMock.mockResolvedValue(JSON.stringify({ version: '3.4.0' }));
            getLatestReleaseMock.mockImplementation(() => { throw new Error('boom'); });
            const logger = makeLogger();
            const checker = new AdobeMcpUpdateChecker(createMockSecretStorage().secrets, logger);

            expect(await checker.checkForUpdates(makeMcpProject())).toBeNull();
            expect(logger.error).toHaveBeenCalled();
        });
    });
});
