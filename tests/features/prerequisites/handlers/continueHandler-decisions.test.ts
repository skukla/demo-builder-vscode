/**
 * continueHandler — the DECISIONS it makes, read through the payloads it sends
 * and the state it records.
 *
 * The other four suites drive the handler and assert that it survived. This one
 * constrains the choices inside it: how fnm's output is parsed, when a per-node
 * probe happens at all, what a per-major status entry contains, how `canInstall`
 * is composed from four independent facts, and what the completion tally counts.
 * Every assertion here is on a value the handler PRODUCED — a payload field or a
 * recorded state entry — or on the ARGUMENTS a collaborator was handed, never on
 * a mock's answer.
 */

import {
    shared,
    setupContinueHandler,
    createContinueHandlerContext,
    mockNodePrereq,
    mockNodeResult,
    mockNpmResult,
    mockAdobeCliPrereq,
} from './continueHandler.testUtils';
import { handleContinuePrerequisites } from '@/features/prerequisites/handlers/continueHandler';
import type {
    PrerequisiteDefinition,
    PrerequisiteStatus,
} from '@/features/prerequisites/services/types';
import type { PrerequisiteStatusPayload } from '@/types/webviewPayloads';

const ADOBE_INSTALLED: PrerequisiteStatus = {
    id: 'adobe-cli',
    name: 'Adobe I/O CLI',
    description: 'Adobe I/O CLI',
    installed: true,
    version: '10.0.0',
    optional: false,
    canInstall: true,
};

const ADOBE_MISSING: PrerequisiteStatus = {
    ...ADOBE_INSTALLED,
    installed: false,
    version: undefined,
};

/** The settled (non-'checking') prerequisite-status payload sent for `index`. */
function statusFor(mockContext: any, index: number): PrerequisiteStatusPayload {
    const calls = (mockContext.sendMessage as jest.Mock).mock.calls.filter(
        (call: [string, PrerequisiteStatusPayload]) =>
            call[0] === 'prerequisite-status' &&
            call[1].index === index &&
            call[1].status !== 'checking'
    );
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1][1];
}

/** Drive the handler over ONE prerequisite whose main check answers `result`. */
function useSinglePrereq(
    mockContext: any,
    prereq: PrerequisiteDefinition,
    result: PrerequisiteStatus
): void {
    const states = new Map();
    states.set(0, { prereq, result });
    mockContext.sharedState = {
        isAuthenticating: false,
        currentPrerequisites: [prereq],
        currentPrerequisiteStates: states,
    };
    (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(result);
}

describe('Prerequisites Continue Handler - Decisions', () => {
    let mockContext: any;
    let mockCommandExecutor: any;

    beforeEach(() => {
        jest.clearAllMocks();
        ({ mockContext, mockCommandExecutor } = setupContinueHandler());
    });

    describe('reading fnm list', () => {
        it('accepts an fnm entry whose version carries no leading v', async () => {
            useSinglePrereq(mockContext, mockAdobeCliPrereq, ADOBE_INSTALLED);
            mockCommandExecutor.execute = jest
                .fn()
                .mockResolvedValueOnce({ stdout: '18.20.8\n20.19.5\n', stderr: '', code: 0 })
                .mockResolvedValue({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', code: 0 });

            await handleContinuePrerequisites(mockContext);

            expect(statusFor(mockContext, 0)).toEqual(
                expect.objectContaining({
                    status: 'success',
                    installed: true,
                    canInstall: false,
                    nodeVersionStatus: [
                        { version: 'Node 18', major: '18', component: '10.0.0', installed: true },
                        { version: 'Node 20', major: '20', component: '10.0.0', installed: true },
                    ],
                })
            );
        });

        it('ignores an fnm entry that carries no version number at all', async () => {
            useSinglePrereq(mockContext, mockAdobeCliPrereq, ADOBE_INSTALLED);
            mockCommandExecutor.execute = jest
                .fn()
                .mockResolvedValueOnce({
                    stdout: 'v18.20.8\n* system\nv20.19.5\n',
                    stderr: '',
                    code: 0,
                })
                .mockResolvedValue({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', code: 0 });

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(true);
            expect(statusFor(mockContext, 0).nodeVersionStatus).toEqual([
                { version: 'Node 18', major: '18', component: '10.0.0', installed: true },
                { version: 'Node 20', major: '20', component: '10.0.0', installed: true },
            ]);
        });
    });

    describe('per-major tool probe', () => {
        it('runs the tool check under each installed major and records the parsed version', async () => {
            useSinglePrereq(mockContext, mockAdobeCliPrereq, ADOBE_INSTALLED);
            mockCommandExecutor.execute = jest
                .fn()
                .mockResolvedValueOnce({ stdout: 'v18.20.8\n', stderr: '', code: 0 })
                .mockResolvedValue({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', code: 0 });

            await handleContinuePrerequisites(mockContext);

            // Node 20 is required but fnm does not have it, so the tool check is
            // never run for it — two calls, not three.
            expect(mockCommandExecutor.execute).toHaveBeenCalledTimes(2);
            expect(mockCommandExecutor.execute).toHaveBeenNthCalledWith(2, 'aio --version', {
                useNodeVersion: '18',
                timeout: expect.any(Number),
            });
            expect(statusFor(mockContext, 0).nodeVersionStatus).toEqual([
                { version: 'Node 18', major: '18', component: '10.0.0', installed: true },
                { version: 'Node 20', major: '20', component: '', installed: false },
            ]);
        });

        it('records a major whose tool check throws as not installed', async () => {
            useSinglePrereq(mockContext, mockAdobeCliPrereq, ADOBE_INSTALLED);
            mockCommandExecutor.execute = jest
                .fn()
                .mockResolvedValueOnce({ stdout: 'v18.20.8\nv20.19.5\n', stderr: '', code: 0 })
                .mockResolvedValueOnce({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', code: 0 })
                .mockRejectedValueOnce(new Error('command not found'));

            await handleContinuePrerequisites(mockContext);

            expect(statusFor(mockContext, 0)).toEqual(
                expect.objectContaining({
                    status: 'error',
                    installed: false,
                    canInstall: true,
                    message: 'Adobe I/O CLI is missing in Node 20',
                    nodeVersionStatus: [
                        { version: 'Node 18', major: '18', component: '10.0.0', installed: true },
                        { version: 'Node 20', major: '20', component: '', installed: false },
                    ],
                })
            );
        });

        it('reports every required major as missing without probing fnm when the main check failed', async () => {
            useSinglePrereq(mockContext, mockAdobeCliPrereq, ADOBE_MISSING);

            await handleContinuePrerequisites(mockContext);

            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
            expect(statusFor(mockContext, 0)).toEqual(
                expect.objectContaining({
                    status: 'error',
                    installed: false,
                    message: 'Adobe I/O CLI is missing in Node 18, 20',
                    nodeVersionStatus: [
                        { version: 'Node 18', major: '18', component: '', installed: false },
                        { version: 'Node 20', major: '20', component: '', installed: false },
                    ],
                })
            );
        });
    });

    describe('when the per-node probe is skipped entirely', () => {
        it('leaves a prerequisite that is not per-node-version with an empty version list', async () => {
            await handleContinuePrerequisites(mockContext, { fromIndex: 1 });

            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
            expect(statusFor(mockContext, 1)).toEqual(
                expect.objectContaining({
                    index: 1,
                    name: 'npm',
                    required: true,
                    nodeVersionStatus: [],
                })
            );
        });

        it('leaves a per-node prerequisite green when no Node versions are required', async () => {
            (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({});
            useSinglePrereq(mockContext, mockAdobeCliPrereq, ADOBE_INSTALLED);

            await handleContinuePrerequisites(mockContext);

            expect(statusFor(mockContext, 0)).toEqual(
                expect.objectContaining({
                    status: 'success',
                    installed: true,
                    canInstall: false,
                    message: 'Adobe I/O CLI is installed: 10.0.0',
                    nodeVersionStatus: [],
                })
            );
        });

        it('leaves node itself green when no Node versions are required', async () => {
            (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({});
            useSinglePrereq(mockContext, mockNodePrereq, mockNodeResult);

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.prereqManager!.checkMultipleNodeVersions).not.toHaveBeenCalled();
            expect(statusFor(mockContext, 0)).toEqual(
                expect.objectContaining({ status: 'success', canInstall: false })
            );
        });

        it('asks for multi-version status only for the node prerequisite', async () => {
            await handleContinuePrerequisites(mockContext);

            expect(mockContext.prereqManager!.checkMultipleNodeVersions).toHaveBeenCalledTimes(1);
            expect(mockContext.prereqManager!.checkMultipleNodeVersions).toHaveBeenCalledWith({
                '18': 'React App',
                '20': 'Node Backend',
            });
        });
    });

    describe('what the handler records and announces', () => {
        it('announces the prerequisite as checking before running its check', async () => {
            await handleContinuePrerequisites(mockContext);

            expect(mockContext.sendMessage).toHaveBeenNthCalledWith(1, 'prerequisite-status', {
                index: 0,
                name: 'Node.js',
                status: 'checking',
                description: 'JavaScript runtime',
                required: true,
            });
        });

        it('records the version status against each prerequisite it checked', async () => {
            const states = mockContext.sharedState.currentPrerequisiteStates;

            await handleContinuePrerequisites(mockContext);

            expect(states.get(0).nodeVersionStatus).toEqual([
                { version: 'Node 18', component: 'v18.0.0', installed: true },
                { version: 'Node 20', component: 'v20.0.0', installed: true },
            ]);
            expect(states.get(1).nodeVersionStatus).toEqual([]);
        });

        it('keeps the recorded check result when the version probe then fails', async () => {
            const states = mockContext.sharedState.currentPrerequisiteStates;
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockRejectedValue(
                new Error('fnm exploded')
            );

            const result = await handleContinuePrerequisites(mockContext);

            expect(result.success).toBe(false);
            expect(states.get(0)).toEqual({ prereq: mockNodePrereq, result: mockNodeResult });
        });

        it('skips a prerequisite and still completes when no prerequisites manager is wired', async () => {
            const context = createContinueHandlerContext({ prereqManager: undefined });

            const result = await handleContinuePrerequisites(context);

            expect(result.success).toBe(true);
            // Two 'checking' announcements and the completion — no settled status,
            // because nothing checked anything.
            expect(context.sendMessage).toHaveBeenCalledTimes(3);
            expect(context.sendMessage).toHaveBeenLastCalledWith('prerequisites-complete', {
                allInstalled: true,
            });
        });
    });

    describe('canInstall composition', () => {
        it('offers no install when everything the prerequisite needs is present', async () => {
            await handleContinuePrerequisites(mockContext);

            expect(statusFor(mockContext, 0).canInstall).toBe(false);
        });

        it('offers no install for an installed prerequisite that merely COULD be installed', async () => {
            (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue({
                ...mockNpmResult,
                canInstall: true,
            });

            await handleContinuePrerequisites(mockContext, { fromIndex: 1 });

            expect(statusFor(mockContext, 1).canInstall).toBe(false);
        });

        it('offers the install for a missing prerequisite and blocks completion', async () => {
            (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue({
                ...mockNpmResult,
                installed: false,
                version: undefined,
                canInstall: true,
            });

            await handleContinuePrerequisites(mockContext, { fromIndex: 1 });

            expect(statusFor(mockContext, 1)).toEqual(
                expect.objectContaining({ status: 'error', installed: false, canInstall: true })
            );
            expect(mockContext.sendMessage).toHaveBeenCalledWith('prerequisites-complete', {
                allInstalled: false,
            });
        });
    });
});
