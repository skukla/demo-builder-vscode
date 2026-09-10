/**
 * installHandler — decision coverage (PL-22): choosing which Node versions to install,
 * and running the steps for them.
 *
 * These assert the payloads the handler pushes and the ARGUMENTS it hands the progress
 * unifier, rather than the answers its mocks give back — the step index, the resolved
 * step name and the Node version each step runs under are the parts a wrong decision
 * shows up in, and a mock returns the same thing however it is called.
 */

import './installHandler.mocks';

import * as shared from '@/features/prerequisites/handlers/shared';
import { handleInstallPrerequisite } from '@/features/prerequisites/handlers/installHandler';
import type { PrerequisiteDefinition } from '@/features/prerequisites/services/types';
import type { HandlerContext } from '@/types/handlers';
import {
    createInstallHandlerContext,
    mockNodePrereq,
    mockNodeResult,
    setupMockCommandExecutor,
    setupSharedUtilityMocks,
} from './installHandler.testUtils';

/** Every `sendMessage(type, …)` payload, in call order. */
function payloadsOfType(context: HandlerContext, type: string): unknown[] {
    return (context.sendMessage as jest.Mock).mock.calls
        .filter(([t]) => t === type)
        .map(([, p]) => p);
}

/** Point the handler's index 0 at `prereq`. */
function aim(context: jest.Mocked<HandlerContext>, prereq: PrerequisiteDefinition): void {
    context.sharedState.currentPrerequisiteStates = new Map([
        [0, { prereq, result: mockNodeResult }],
    ]);
}

let context: jest.Mocked<HandlerContext>;

beforeEach(() => {
    jest.clearAllMocks();
    setupMockCommandExecutor();
    setupSharedUtilityMocks();
    context = createInstallHandlerContext();
});

describe('deciding whether Node needs installing at all', () => {
    beforeEach(() => aim(context, mockNodePrereq));

    it('stops, and says so exactly, when the requested version is already satisfied', async () => {
        (context.prereqManager!.checkVersionSatisfaction as jest.Mock).mockResolvedValue(true);

        const result = await handleInstallPrerequisite(context, { prereqId: 0, version: '20' });

        expect(context.prereqManager!.checkVersionSatisfaction).toHaveBeenCalledWith('20');
        expect(payloadsOfType(context, 'prerequisite-install-complete')).toEqual([
            { index: 0, continueChecking: true },
        ]);
        expect(result).toEqual({ success: true });
        expect(context.progressUnifier!.executeStep).not.toHaveBeenCalled();
    });

    it('stops, and says so exactly, when every required major is already installed', async () => {
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 18', component: 'v18.0.0', installed: true },
            { version: 'Node 20', component: 'v20.0.0', installed: true },
        ]);

        const result = await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(payloadsOfType(context, 'prerequisite-install-complete')).toEqual([
            { index: 0, continueChecking: true },
        ]);
        expect(result).toEqual({ success: true });
        expect(context.progressUnifier!.executeStep).not.toHaveBeenCalled();
    });

    it('matches an installed major by the START of its label, not its end', async () => {
        // fnm reports 'Node 18 (v18.20.8)'; a check anchored at the end of that string
        // would call Node 18 missing and reinstall it.
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 18 (v18.20.8)', component: 'v18.0.0', installed: true },
            { version: 'Node 20 (v20.19.5)', component: 'v20.0.0', installed: true },
        ]);

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(payloadsOfType(context, 'prerequisite-install-complete')).toEqual([
            { index: 0, continueChecking: true },
        ]);
        expect(context.progressUnifier!.executeStep).not.toHaveBeenCalled();
    });

    it('installs only the majors that are missing, lowest first', async () => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({ '22': 'A', '18': 'B', '20': 'C' });
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 18', component: 'v18.0.0', installed: true },
            { version: 'Node 20', component: '', installed: false },
            { version: 'Node 22', component: '', installed: false },
        ]);
        (context.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [{ name: 'Install Node {version}', message: 'Installing Node {version}', commands: [] }],
        });

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(context.prereqManager!.getInstallSteps).toHaveBeenCalledWith(mockNodePrereq, {
            nodeVersions: ['20', '22'],
        });
        expect(payloadsOfType(context, 'prerequisite-status').slice(0, 2).map(
            (p) => (p as { message: string }).message,
        )).toEqual(['Installing Node 20 for Node 20', 'Installing Node 22 for Node 22']);
    });

    it('installs the explicitly requested version when nothing in the mapping is missing', async () => {
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 18', component: 'v18.0.0', installed: true },
            { version: 'Node 20', component: 'v20.0.0', installed: true },
        ]);
        (context.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [{ name: 'Install Node {version}', message: 'Installing Node {version}', commands: [] }],
        });

        await handleInstallPrerequisite(context, { prereqId: 0, version: '24' });

        expect(context.prereqManager!.getInstallSteps).toHaveBeenCalledWith(mockNodePrereq, {
            nodeVersions: ['24'],
        });
    });

    it('does not ask which majors are installed when no component requires Node', async () => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({});

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(context.prereqManager!.checkMultipleNodeVersions).not.toHaveBeenCalled();
        expect(payloadsOfType(context, 'prerequisite-install-complete')).toEqual([
            { index: 0, continueChecking: true },
        ]);
    });
});

describe('a context with no prerequisites manager behind it', () => {
    it('treats an unanswerable satisfaction check as "not satisfied" rather than crashing', async () => {
        const bare = createInstallHandlerContext({ prereqManager: undefined });
        aim(bare, mockNodePrereq);

        const result = await handleInstallPrerequisite(bare, { prereqId: 0, version: '20' });

        // Not satisfied, so it goes on to plan the install — and THAT is where the
        // absent manager stops it, with a named error rather than a TypeError.
        expect(result).toEqual({
            success: false,
            error: 'No installation steps defined for Node.js',
            code: 'UNKNOWN',
        });
    });

    it('completes the Node path when the multi-version check has nowhere to go either', async () => {
        const bare = createInstallHandlerContext({ prereqManager: undefined });
        aim(bare, mockNodePrereq);

        const result = await handleInstallPrerequisite(bare, { prereqId: 0 });

        expect(result).toEqual({ success: true });
        expect(payloadsOfType(bare, 'prerequisite-install-complete')).toEqual([
            { index: 0, continueChecking: true },
        ]);
    });

    it('reports that a non-Node prerequisite has no installation steps, rather than crashing', async () => {
        const bare = createInstallHandlerContext({ prereqManager: undefined });
        const git = { id: 'git', name: 'Git', description: 'v', check: { command: 'git --version' } };
        aim(bare, git);

        const result = await handleInstallPrerequisite(bare, { prereqId: 0 });

        expect(result).toEqual({
            success: false,
            error: 'No installation steps defined for Git',
            code: 'UNKNOWN',
        });
    });
});

describe('running the install steps', () => {
    const twoStep = {
        steps: [
            { name: 'Install {version}', message: 'Installing {version}', commands: [] },
            { name: 'Verify {version}', message: 'Verifying {version}', commands: [] },
        ],
    };

    beforeEach(() => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({ '20': 'C', '22': 'A' });
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 20', component: '', installed: false },
            { version: 'Node 22', component: '', installed: false },
        ]);
        aim(context, mockNodePrereq);
    });

    it('counts steps upward across every target version, and reports the right total', async () => {
        (context.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue(twoStep);

        await handleInstallPrerequisite(context, { prereqId: 0 });

        const calls = (context.progressUnifier!.executeStep as jest.Mock).mock.calls;
        expect(calls.map((c) => [c[0].name, c[1], c[2], c[4]])).toEqual([
            ['Install {version}', 0, 4, { nodeVersion: '20' }],
            ['Verify {version}', 1, 4, { nodeVersion: '20' }],
            ['Install {version}', 2, 4, { nodeVersion: '22' }],
            ['Verify {version}', 3, 4, { nodeVersion: '22' }],
        ]);
    });

    it('names the Node version in the message it pushes for each step', async () => {
        (context.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue(twoStep);

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(payloadsOfType(context, 'prerequisite-status').slice(0, 4).map(
            (p) => (p as { message: string }).message,
        )).toEqual([
            'Installing 20 for Node 20',
            'Verifying 20 for Node 20',
            'Installing 22 for Node 22',
            'Verifying 22 for Node 22',
        ]);
    });

    it('runs a "default" step once, for the LAST version only', async () => {
        (context.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install {version}', message: 'Installing {version}', commands: [] },
                { name: 'Set {version} as default', message: 'Defaulting to {version}', commands: [] },
            ],
        });

        await handleInstallPrerequisite(context, { prereqId: 0 });

        const calls = (context.progressUnifier!.executeStep as jest.Mock).mock.calls;
        expect(calls.map((c) => [c[0].name, c[4]])).toEqual([
            ['Install {version}', { nodeVersion: '20' }],
            ['Install {version}', { nodeVersion: '22' }],
            ['Set {version} as default', { nodeVersion: '22' }],
        ]);
        expect(payloadsOfType(context, 'prerequisite-status').slice(0, 3).map(
            (p) => (p as { message: string }).message,
        )).toEqual([
            'Installing 20 for Node 20',
            'Installing 22 for Node 22',
            'Defaulting to 22 for Node 22',
        ]);
    });

    it('runs a dynamic Node install once, with no version threaded through it', async () => {
        aim(context, { ...mockNodePrereq, install: { dynamic: true, steps: [] } });
        (context.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue(twoStep);

        await handleInstallPrerequisite(context, { prereqId: 0 });

        const calls = (context.progressUnifier!.executeStep as jest.Mock).mock.calls;
        expect(calls.map((c) => [c[0].name, c[1], c[2], c[4]])).toEqual([
            ['Install {version}', 0, 2, undefined],
            ['Verify {version}', 1, 2, undefined],
        ]);
        expect(payloadsOfType(context, 'prerequisite-status')[0]).toEqual(
            expect.objectContaining({ message: 'Installing {version}' }),
        );
    });

    it('treats a Node prerequisite with no install block as NOT dynamic', async () => {
        const noInstall = { id: 'node', name: 'Node.js', description: 'r', check: { command: 'node --version' } };
        aim(context, noInstall);
        (context.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue(twoStep);

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect((context.progressUnifier!.executeStep as jest.Mock).mock.calls).toHaveLength(4);
    });

    it('marks each step payload required or not from the prerequisite’s own optional flag', async () => {
        aim(context, { ...mockNodePrereq, optional: true });
        (context.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [{ name: 'Install {version}', message: 'Installing {version}', commands: [] }],
        });

        await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(payloadsOfType(context, 'prerequisite-status')[0]).toEqual(
            expect.objectContaining({ index: 0, name: 'Node.js', status: 'checking', required: false }),
        );
    });

    it('runs the steps unversioned when there are no target versions to run them for', async () => {
        const git: PrerequisiteDefinition = {
            id: 'git', name: 'Git', description: 'v', check: { command: 'git --version' },
        };
        aim(context, git);
        (context.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue(twoStep);

        await handleInstallPrerequisite(context, { prereqId: 0 });

        const calls = (context.progressUnifier!.executeStep as jest.Mock).mock.calls;
        expect(calls.map((c) => [c[0].name, c[1], c[2], c[4]])).toEqual([
            ['Install {version}', 0, 2, undefined],
            ['Verify {version}', 1, 2, undefined],
        ]);
    });

    it('completes without running anything when the install plan carries no steps', async () => {
        const git: PrerequisiteDefinition = {
            id: 'git', name: 'Git', description: 'v', check: { command: 'git --version' },
        };
        aim(context, git);
        (context.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({});

        const result = await handleInstallPrerequisite(context, { prereqId: 0 });

        expect(result).toEqual(expect.objectContaining({ success: true }));
        expect(context.progressUnifier!.executeStep).not.toHaveBeenCalled();
    });

    it('runs the steps even when no progress unifier is attached to the context', async () => {
        const bare = createInstallHandlerContext({ progressUnifier: undefined });
        aim(bare, mockNodePrereq);
        (bare.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 20', component: '', installed: false },
        ]);
        (bare.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue(twoStep);

        const result = await handleInstallPrerequisite(bare, { prereqId: 0 });

        expect(result).toEqual(expect.objectContaining({ success: true }));
    });
});
