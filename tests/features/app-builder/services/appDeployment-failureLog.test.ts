/**
 * A failed deploy keeps its WHOLE output in a file. Debug Logs hold only the last
 * lines, and on 2026-09-19 the reason a deploy failed (an app's package half-created
 * in a new namespace) was in the part those lines cut off. An agent cannot read an
 * output channel; it can read this file.
 */

jest.mock('fs', () => ({
    promises: {
        access: jest.fn(),
        readFile: jest.fn(),
        mkdtemp: jest.fn(),
        rm: jest.fn(),
        mkdir: jest.fn(),
        writeFile: jest.fn(),
    },
}));

jest.mock('@/core/utils/timeoutConfig', () => ({ TIMEOUTS: { LONG: 180000 } }));

jest.mock('@/features/app-builder/services/runtimeCredentials', () => ({
    extractAioErrorDetail: jest.requireActual('@/features/app-builder/services/runtimeCredentials')
        .extractAioErrorDetail,
    aioOutputTail: jest.requireActual('@/features/app-builder/services/runtimeCredentials').aioOutputTail,
    fetchRuntimeCredentials: jest.fn().mockResolvedValue({
        namespace: 'test-namespace',
        auth: 'fake-test-pw-not-a-secret',
    }),
}));

jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    declaresIncludeImsCredentials: jest.fn().mockResolvedValue(false),
    listDeclaredActions: () => Promise.resolve([]),
}));

import { deployAppComponent } from '@/features/app-builder/services/appDeployment';
import { mockFs, createMockCommandManager, createMockLogger } from './appDeployment.testUtils';

const LOG = '/proj/logs/erp-integration-deploy.log';

/** 200 lines of output — far more than Debug Logs keep — ending in the failure. */
function longFailure() {
    const early = Array.from({ length: 199 }, (_, i) => `ℹ Info: step ${i + 1}`).join('\n');
    return { code: 1, stdout: `${early}\nℹ Info: FIRST LINE THAT MATTERS`, stderr: ' ›   Error: boom', duration: 0 };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockFs.access.mockResolvedValue(undefined);
    (mockFs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (mockFs.writeFile as jest.Mock).mockResolvedValue(undefined);
});

describe('deployAppComponent — a failed deploy keeps its whole output', () => {
    it('writes every line to the file it was given', async () => {
        const cm = createMockCommandManager();
        cm.execute.mockResolvedValue(longFailure());
        await deployAppComponent('/proj/components/erp-integration', cm, createMockLogger(), {
            failureLogFile: LOG,
        });

        expect(mockFs.mkdir).toHaveBeenCalledWith('/proj/logs', { recursive: true });
        const [file, body] = (mockFs.writeFile as jest.Mock).mock.calls[0];
        expect(file).toBe(LOG);
        expect(body).toContain('step 1\n');
        expect(body).toContain('FIRST LINE THAT MATTERS');
        expect(body).toContain('Error: boom');
    });

    it('writes nothing when no file was given', async () => {
        const cm = createMockCommandManager();
        cm.execute.mockResolvedValue(longFailure());

        await deployAppComponent('/app', cm, createMockLogger());

        expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it("still answers the deploy's failure when the file cannot be written", async () => {
        const cm = createMockCommandManager();
        cm.execute.mockResolvedValue(longFailure());
        (mockFs.writeFile as jest.Mock).mockRejectedValue(new Error('EACCES'));

        const result = await deployAppComponent('/app', cm, createMockLogger(), { failureLogFile: LOG });

        expect(result).toMatchObject({ success: false });
        expect(result.error).toContain('boom');
    });
});
