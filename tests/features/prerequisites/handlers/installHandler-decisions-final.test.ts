/**
 * installHandler — decision coverage (PL-22): what happens AFTER the steps run —
 * cache invalidation, verification failure, and the final status the webview renders.
 *
 * The final `prerequisite-status` payload is the handler's answer: every decision
 * `sendFinalInstallStatus` makes is readable there and nowhere else, so these assert
 * the whole payload rather than one field of it.
 */

import './installHandler.mocks';

import * as shared from '@/features/prerequisites/handlers/shared';
import { handleInstallPrerequisite } from '@/features/prerequisites/handlers/installHandler';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { PrerequisiteDefinition, PrerequisiteStatus } from '@/features/prerequisites/services/types';
import type { HandlerContext } from '@/types/handlers';
import {
    cacheInvalidateMock,
    createInstallHandlerContext,
    lastFinalStatus,
    mockNodePrereq,
    mockNodeResult,
    setupMockCommandExecutor,
    setupSharedUtilityMocks,
} from './installHandler.testUtils';

const GIT: PrerequisiteDefinition = {
    id: 'git', name: 'Git', description: 'Version control', check: { command: 'git --version' },
};

const AIO: PrerequisiteDefinition = {
    id: 'adobe-cli', name: 'Adobe I/O CLI', description: 'Adobe CLI',
    perNodeVersion: true, check: { command: 'aio --version' },
};

function status(over: Partial<PrerequisiteStatus>): PrerequisiteStatus {
    return {
        id: 'git', name: 'Git', description: 'Version control',
        installed: true, optional: false, canInstall: false, ...over,
    };
}

let context: jest.Mocked<HandlerContext>;

beforeEach(() => {
    jest.clearAllMocks();
    setupMockCommandExecutor();
    setupSharedUtilityMocks();
    context = createInstallHandlerContext();
    (context.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
        steps: [{ name: 'Install', message: 'Installing', commands: [] }],
    });
});

function aim(prereq: PrerequisiteDefinition): void {
    context.sharedState.currentPrerequisiteStates = new Map([
        [0, { prereq, result: mockNodeResult }],
    ]);
}

describe('cache invalidation after an install', () => {
    it('invalidates the prerequisite that was just installed', async () => {
        aim(GIT);
        const invalidate = cacheInvalidateMock(context);

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(invalidate).toHaveBeenCalledWith('git');
    });

    it('also invalidates every prerequisite that depends on it', async () => {
        aim(GIT);
        context.sharedState.currentPrerequisites = [
            { id: 'npm', name: 'npm', description: 'p', depends: ['git'], check: { command: 'npm -v' } },
            { id: 'node', name: 'Node', description: 'r', check: { command: 'node -v' } },
            { id: 'aio', name: 'aio', description: 'a', depends: ['npm'], check: { command: 'aio -v' } },
        ];
        const invalidate = cacheInvalidateMock(context);

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(invalidate.mock.calls.map(([id]) => id)).toEqual(['git', 'npm']);
    });

    it('invalidates only the installed prerequisite when nothing depends on it', async () => {
        aim(GIT);
        context.sharedState.currentPrerequisites = [
            { id: 'node', name: 'Node', description: 'r', check: { command: 'node -v' } },
        ];
        const invalidate = cacheInvalidateMock(context);

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(invalidate.mock.calls.map(([id]) => id)).toEqual(['git']);
    });
});

describe('when verification after the install fails', () => {
    it('reports a timeout as a warning naming the timeout in seconds, and does not log it as an error', async () => {
        aim(GIT);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockRejectedValue(
            Object.assign(new Error('operation timed out'), { code: 'TIMEOUT' }),
        );

        const result = await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(lastFinalStatus(context)).toEqual({
            index: 0,
            name: 'Git',
            status: 'warning',
            description: 'Version control',
            required: true,
            installed: false,
            message: `Installation completed but verification timed out after ${TIMEOUTS.POLL.INTERVAL / 1000} seconds. Click Recheck to verify.`,
            canInstall: false,
        });
        expect(context.errorLogger!.logError).not.toHaveBeenCalled();
        expect(result).toEqual({ success: true });
    });

    it('reports any other failure with its own message, and DOES log it as an error', async () => {
        aim(GIT);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockRejectedValue(new Error('command not found'));

        const result = await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(lastFinalStatus(context)).toEqual({
            index: 0,
            name: 'Git',
            status: 'warning',
            description: 'Version control',
            required: true,
            installed: false,
            message: 'Installation completed but verification failed: command not found. Click Recheck to verify.',
            canInstall: false,
        });
        expect(context.errorLogger!.logError).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ success: true });
    });

    it('marks an OPTIONAL prerequisite’s verification warning as not required', async () => {
        aim({ ...GIT, optional: true });
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockRejectedValue(new Error('boom'));

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(lastFinalStatus(context)).toEqual(expect.objectContaining({ required: false }));
    });

    it('survives an error logger that itself throws', async () => {
        aim(GIT);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockRejectedValue(new Error('boom'));
        (context.errorLogger!.logError as jest.Mock).mockImplementation(() => { throw new Error('logger down'); });

        expect(await handleInstallPrerequisite(context, { prereqId: 0 })).toEqual({ success: true });
    });

    it('fails outright when the re-check answers with nothing at all', async () => {
        aim(GIT);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(undefined);

        expect(await handleInstallPrerequisite(context, { prereqId: 0 })).toEqual({
            success: false,
            error: 'Installation verification failed',
            code: 'UNKNOWN',
        });
    });
});

describe('the final status for a plain prerequisite', () => {
    beforeEach(() => aim(GIT));

    it('reports success with the version the re-check found', async () => {
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ installed: true, version: '2.44.0' }),
        );

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(lastFinalStatus(context)).toEqual({
            index: 0,
            name: 'Git',
            status: 'success',
            description: 'Version control',
            required: true,
            installed: true,
            version: '2.44.0',
            message: 'Git is installed: 2.44.0',
            canInstall: false,
            plugins: undefined,
            nodeVersionStatus: undefined,
        });
    });

    it('omits the version from the message when the re-check found none', async () => {
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ installed: true, version: undefined }),
        );

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(lastFinalStatus(context)).toEqual(expect.objectContaining({
            message: 'Git is installed',
            installed: true,
            canInstall: false,
        }));
    });

    it('still offers Install when the re-check says the tool is not there', async () => {
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ installed: false }),
        );

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(lastFinalStatus(context)).toEqual(expect.objectContaining({
            status: 'error',
            installed: false,
            message: 'Git is not installed',
            canInstall: true,
        }));
    });

    it('warns rather than errors for an optional prerequisite that is still missing', async () => {
        aim({ ...GIT, optional: true });
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ installed: false }),
        );

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(lastFinalStatus(context)).toEqual(expect.objectContaining({
            status: 'warning', required: false,
        }));
    });

    it('records the verified result in shared state for the next screen to read', async () => {
        const verified = status({ installed: true, version: '2.44.0' });
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(verified);

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(context.sharedState.currentPrerequisiteStates!.get(0)).toEqual({
            prereq: GIT, result: verified, nodeVersionStatus: undefined,
        });
    });

    it('does not ask for a per-node status for a prerequisite that is not per-node-version', async () => {
        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(shared.checkPerNodeVersionStatus).not.toHaveBeenCalled();
    });

    it('returns the installed prerequisite by name, version and verification verdict', async () => {
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ installed: true, version: '2.44.0' }),
        );

        expect(await handleInstallPrerequisite(context, { prereqId: 0 })).toEqual({
            success: true,
            data: {
                installed: { id: 'git', name: 'Git', version: '2.44.0', verified: true },
            },
        });
    });

    it('says so in the returned data when the re-check did NOT find it installed', async () => {
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ installed: false, version: undefined }),
        );

        expect(await handleInstallPrerequisite(context, { prereqId: 0 })).toEqual({
            success: true,
            data: {
                installed: { id: 'git', name: 'Git', version: undefined, verified: false },
            },
        });
    });

    it('tells the webview the install run is over', async () => {
        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect((context.sendMessage as jest.Mock).mock.calls
            .filter(([t]) => t === 'prerequisite-install-complete')
            .map(([, p]) => p),
        ).toEqual([{ index: 0, continueChecking: true }]);
    });
});

describe('the final status for the Node prerequisite', () => {
    beforeEach(() => {
        aim(mockNodePrereq);
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock)
            .mockResolvedValueOnce([{ version: 'Node 18', component: '', installed: false }])
            .mockResolvedValue([
                { version: 'Node 18', component: 'v18.20.8', installed: true },
                { version: 'Node 20', component: 'v20.19.5', installed: true },
            ]);
    });

    it('lists every installed major in the message and attaches the version list', async () => {
        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(lastFinalStatus(context)).toEqual(expect.objectContaining({
            message: 'Node.js is installed: Node 18, Node 20',
            installed: true,
            nodeVersionStatus: [
                { version: 'Node 18', component: 'v18.20.8', installed: true },
                { version: 'Node 20', component: 'v20.19.5', installed: true },
            ],
        }));
    });

    it('names the majors that are still missing instead', async () => {
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock)
            .mockReset()
            .mockResolvedValueOnce([{ version: 'Node 18', component: '', installed: false }])
            .mockResolvedValue([
                { version: 'Node 18', component: 'v18.20.8', installed: true },
                { version: 'Node 20', component: '', installed: false },
            ]);

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(lastFinalStatus(context)).toEqual(expect.objectContaining({
            message: 'Node.js is missing in Node 20',
        }));
    });

    it('falls back to the plain installed message when the post-check list comes back empty', async () => {
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock)
            .mockReset()
            .mockResolvedValueOnce([{ version: 'Node 18', component: '', installed: false }])
            .mockResolvedValue([]);

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(lastFinalStatus(context)).toEqual(expect.objectContaining({
            message: 'Node.js is installed: v18.0.0',
            nodeVersionStatus: [],
        }));
    });

    it('does not re-read the majors after installing when no component requires Node', async () => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({});

        await handleInstallPrerequisite(context, { prereqId: 0, version: '20' });

        expect(context.prereqManager!.checkMultipleNodeVersions).not.toHaveBeenCalled();
    });
});

describe('the final status for a per-node-version prerequisite', () => {
    beforeEach(() => {
        aim(AIO);
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValue({
            perNodeVersionStatus: [
                { version: 'Node 18', component: '', installed: false },
                { version: 'Node 20', component: '', installed: false },
            ],
            perNodeVariantMissing: true,
            missingVariantMajors: ['18', '20'],
        });
    });

    it('is installed only when EVERY required major now has the tool', async () => {
        (shared.checkPerNodeVersionStatus as jest.Mock)
            .mockResolvedValueOnce({
                perNodeVersionStatus: [],
                perNodeVariantMissing: true,
                missingVariantMajors: ['18', '20'],
            })
            .mockResolvedValue({
                perNodeVersionStatus: [
                    { version: 'Node 18', component: '10.0.0', installed: true },
                    { version: 'Node 20', component: '10.0.0', installed: true },
                ],
                perNodeVariantMissing: false,
                missingVariantMajors: [],
            });
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ id: 'adobe-cli', name: 'Adobe I/O CLI', installed: false }),
        );

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(lastFinalStatus(context)).toEqual(expect.objectContaining({
            status: 'success',
            installed: true,
            canInstall: false,
            nodeVersionStatus: [
                { version: 'Node 18', component: '10.0.0', installed: true },
                { version: 'Node 20', component: '10.0.0', installed: true },
            ],
        }));
    });

    it('is NOT installed while any required major still lacks it, whatever the re-check says', async () => {
        (shared.checkPerNodeVersionStatus as jest.Mock)
            .mockResolvedValueOnce({
                perNodeVersionStatus: [],
                perNodeVariantMissing: true,
                missingVariantMajors: ['18', '20'],
            })
            .mockResolvedValue({
                perNodeVersionStatus: [
                    { version: 'Node 18', component: '10.0.0', installed: true },
                    { version: 'Node 20', component: '', installed: false },
                ],
                perNodeVariantMissing: true,
                missingVariantMajors: ['20'],
            });
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ id: 'adobe-cli', name: 'Adobe I/O CLI', installed: true, version: '10.0.0' }),
        );

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(lastFinalStatus(context)).toEqual(expect.objectContaining({
            status: 'error', installed: false, canInstall: true,
        }));
    });

    it('falls back to the re-check verdict when the post-check list comes back empty', async () => {
        (shared.checkPerNodeVersionStatus as jest.Mock)
            .mockResolvedValueOnce({
                perNodeVersionStatus: [],
                perNodeVariantMissing: true,
                missingVariantMajors: ['18'],
            })
            .mockResolvedValue({
                perNodeVersionStatus: [],
                perNodeVariantMissing: false,
                missingVariantMajors: [],
            });
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ id: 'adobe-cli', name: 'Adobe I/O CLI', installed: false }),
        );

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(lastFinalStatus(context)).toEqual(expect.objectContaining({
            status: 'error', installed: false,
        }));
    });

    it('falls back to the re-check verdict when no component requires a Node version', async () => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({});
        (shared.getRequiredNodeVersions as jest.Mock).mockResolvedValue([]);
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValue({
            perNodeVersionStatus: [{ version: 'Node 20', component: '', installed: false }],
            perNodeVariantMissing: true,
            missingVariantMajors: ['20'],
        });
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ id: 'adobe-cli', name: 'Adobe I/O CLI', installed: true, version: '10.0.0' }),
        );

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(lastFinalStatus(context)).toEqual(expect.objectContaining({
            status: 'success', installed: true, nodeVersionStatus: undefined,
        }));
    });
});
