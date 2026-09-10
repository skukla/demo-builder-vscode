/**
 * AdobeMcpUpdateChecker — which skip refuses BEFORE the next step, and on which channel.
 *
 * The sibling suite pins that every skip condition answers null. Null is the same
 * answer for all of them, so this one pins what separates them: whether the
 * package file is read at all, whether GitHub is asked at all, and whether the skip
 * is silent (not installed), a warning (a file that cannot be read as a version),
 * or an error (an unexpected failure). It also pins the coercion of a loose
 * version string into the semver actually compared.
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
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

let logger: ReturnType<typeof createMockLogger>;
let checker: AdobeMcpUpdateChecker;

function fsError(code: string): NodeJS.ErrnoException {
    const err = new Error(code) as NodeJS.ErrnoException;
    err.code = code;
    return err;
}

beforeEach(() => {
    jest.clearAllMocks();
    logger = createMockLogger();
    checker = new AdobeMcpUpdateChecker(createMockSecretStorage().secrets, logger);
    readFileMock.mockResolvedValue(JSON.stringify({ version: '3.4.0' }));
    getLatestReleaseMock.mockResolvedValue({ tag: 'v3.5.0', version: '3.5.0' });
});

describe('the storefront gate — a silent skip, never an error', () => {
    it.each([
        ['no component instances at all', undefined],
        ['no EDS storefront among its instances', {}],
    ])('a project with %s: nothing read, nothing asked', async (_label, componentInstances) => {
        const project = makeMcpProject({ componentInstances });

        await expect(checker.checkForUpdates(project)).resolves.toBeNull();

        expect(readFileMock).not.toHaveBeenCalled();
        expect(getLatestReleaseMock).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('a storefront with no path: nothing read, nothing asked', async () => {
        const project = makeMcpProject({
            componentInstances: {
                [COMPONENT_IDS.EDS_STOREFRONT]: {
                    id: COMPONENT_IDS.EDS_STOREFRONT,
                    name: 'EDS',
                    status: 'ready',
                },
            },
        });

        await expect(checker.checkForUpdates(project)).resolves.toBeNull();

        expect(readFileMock).not.toHaveBeenCalled();
        expect(getLatestReleaseMock).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
    });
});

describe('reading the installed version', () => {
    it('not installed (ENOENT): silent — no warning, no error, GitHub not asked', async () => {
        readFileMock.mockRejectedValue(fsError('ENOENT'));

        await expect(checker.checkForUpdates(makeMcpProject())).resolves.toBeNull();

        expect(getLatestReleaseMock).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('any other read failure is an error carrying the cause, GitHub not asked', async () => {
        const denied = fsError('EACCES');
        readFileMock.mockRejectedValue(denied);

        await expect(checker.checkForUpdates(makeMcpProject())).resolves.toBeNull();

        expect(getLatestReleaseMock).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(expect.any(String), denied);
    });

    it('malformed JSON is a warning, not an error, GitHub not asked', async () => {
        readFileMock.mockResolvedValue('{ not valid json');

        await expect(checker.checkForUpdates(makeMcpProject())).resolves.toBeNull();

        expect(getLatestReleaseMock).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.error).not.toHaveBeenCalled();
    });

    it.each([
        ['absent', {}],
        ['not a string', { version: 340 }],
    ])('a version that is %s: silent skip, GitHub not asked', async (_label, pkg) => {
        readFileMock.mockResolvedValue(JSON.stringify(pkg));

        await expect(checker.checkForUpdates(makeMcpProject())).resolves.toBeNull();

        expect(getLatestReleaseMock).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('a version with no digits is a warning, GitHub not asked', async () => {
        readFileMock.mockResolvedValue(JSON.stringify({ version: 'rolling-tag' }));

        await expect(checker.checkForUpdates(makeMcpProject())).resolves.toBeNull();

        expect(getLatestReleaseMock).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('a loose version is coerced to the semver that is compared and reported', async () => {
        readFileMock.mockResolvedValue(JSON.stringify({ version: 'v3.4' }));

        const result = await checker.checkForUpdates(makeMcpProject());

        expect(result).toEqual({
            hasUpdate: true,
            currentVersion: '3.4.0',
            latestVersion: '3.5.0',
            packageName: ADOBE_MCP_PKG,
        });
    });
});

describe('asking GitHub', () => {
    it('no release to compare against: silent skip, no error', async () => {
        getLatestReleaseMock.mockResolvedValue(null);

        await expect(checker.checkForUpdates(makeMcpProject())).resolves.toBeNull();

        expect(logger.error).not.toHaveBeenCalled();
    });

    it('a rejected lookup is an error carrying the cause', async () => {
        const boom = new Error('boom');
        getLatestReleaseMock.mockRejectedValue(boom);

        await expect(checker.checkForUpdates(makeMcpProject())).resolves.toBeNull();

        expect(logger.error).toHaveBeenCalledWith(expect.any(String), boom);
    });
});
