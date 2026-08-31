/**
 * Install Handler Tests - Happy Path Scenarios
 *
 * Tests the successful installation flows including:
 * - Basic prerequisite installation
 * - Manual installation (opens URL)
 * - Multi-version Node.js installation
 * - Per-node-version prerequisites (Adobe CLI)
 * - Progress updates during installation
 * - Post-installation verification
 * - Early return when already installed
 * - Version templating in install steps
 * - Default steps optimization (only for last version)
 */

// Mock all dependencies (MUST be at top before imports)
jest.mock('@/features/prerequisites/handlers/shared', () => {
    const actual = jest.requireActual('@/features/prerequisites/handlers/shared');
    return {
        ...actual,
        getRequiredNodeVersions: jest.fn(),
        getNodeVersionMapping: jest.fn(),
        checkPerNodeVersionStatus: jest.fn(),
        hasNodeVersions: jest.fn(),
        getNodeVersionKeys: jest.fn(),
    };
});
jest.mock('@/core/di');
jest.mock('vscode', () => ({
    env: {
        openExternal: jest.fn(),
    },
    Uri: {
        parse: jest.fn((url: string) => ({ url })),
    },
}));

import { handleInstallPrerequisite } from '@/features/prerequisites/handlers/installHandler';
import * as shared from '@/features/prerequisites/handlers/shared';
import * as vscode from 'vscode';
import {
    mockNodePrereq,
    mockAdobeCliPrereq,
    mockManualPrereq,
    mockNodeResult,
    createInstallHandlerContext,
    setupMockCommandExecutor,
    setupSharedUtilityMocks,
    cacheInvalidateMock,
    mockNpmPrereq,
} from './installHandler.testUtils';

describe('Install Handler - Happy Path', () => {
    let mockContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        setupMockCommandExecutor();
        setupSharedUtilityMocks();
        mockContext = createInstallHandlerContext();
    });

    it('should install basic prerequisite successfully', async () => {
        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        expect(mockContext.prereqManager!.getInstallSteps).toHaveBeenCalled();
        expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalled();
        expect(mockContext.prereqManager!.checkPrerequisite).toHaveBeenCalled();
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-install-complete',
            expect.objectContaining({ index: 0, continueChecking: true })
        );
    });

    /**
     * Sets up a manual-install prerequisite and gives the context a `panel`.
     *
     * The panel is the point. `createProject.ts:407` — the wizard, and the only
     * caller of this handler — passes `panel: this.panel`, and its presence is
     * how the handler tells a person who just clicked Install from an agent
     * calling a tool. A mock without one is a headless context wearing a
     * webview's name, which is why this test was passing against the wrong branch.
     */
    function arrangeManualInstall(): void {
        const states = new Map();
        states.set(0, { prereq: mockManualPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            manual: true,
            url: 'https://www.docker.com/get-started',
        });
    }

    it('should handle manual installation by opening URL', async () => {
        arrangeManualInstall();
        mockContext.panel = {} as never;

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        expect(vscode.env.openExternal).toHaveBeenCalledWith({ url: 'https://www.docker.com/get-started' });
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                status: 'warning',
                message: 'Manual installation required. Open: https://www.docker.com/get-started',
            })
        );
    });

    it('reports the manual URL instead of opening it when there is no panel', async () => {
        arrangeManualInstall();
        mockContext.panel = undefined;

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // An agent gets the URL to relay; the user's browser is not hijacked for
        // a call they did not make.
        expect(vscode.env.openExternal).not.toHaveBeenCalled();
        expect(result.data).toMatchObject({
            manual: true,
            url: 'https://www.docker.com/get-started',
        });
    });

    it('carries the manual URL in the payload on the webview path too', async () => {
        arrangeManualInstall();
        mockContext.panel = {} as never;

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // `{success: true}` alone said "installed" for something that was not
        // installed and never would be by this call.
        expect(result.data).toMatchObject({ manual: true });
    });

    it('should install multi-version Node.js with missing majors', async () => {
        const states = new Map();
        states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Node {version}', message: 'Installing Node {version}...', command: 'fnm install {version}' },
                { name: 'Set Node {version} as default', message: 'Setting as default...', command: 'fnm default {version}' },
            ],
        });
        (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 18', component: 'v18.0.0', installed: false },
            { version: 'Node 20', component: 'v20.0.0', installed: true },
        ]);

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        // Should call getNodeVersionMapping twice (once for getInstallSteps check, once for missing majors)
        expect(shared.getNodeVersionMapping).toHaveBeenCalled();
    });

    it('should install per-node-version prerequisite (Adobe CLI)', async () => {
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
            ],
        });
        // Note: Per-node version checking happens inside executeStep/checkPrerequisite which are mocked

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '20' });

        expect(result.success).toBe(true);
        // Note: Internal fnm operations are tested in integration tests
    });

    it('should send progress updates during installation', async () => {
        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                status: 'checking',
                unifiedProgress: expect.objectContaining({
                    current: expect.any(Number),
                    total: expect.any(Number),
                }),
            })
        );
    });

    it('should complete installation and verify successfully', async () => {
        const verifiedResult = {
            ...mockNodeResult,
            installed: true,
            version: '9.0.0',
        };
        (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(verifiedResult);

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        expect(mockContext.prereqManager!.checkPrerequisite).toHaveBeenCalled();
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                status: 'success',
                installed: true,
                version: '9.0.0',
            })
        );
    });

    it('should return early if already installed for all Node versions', async () => {
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
            ],
        });
        // Note: Per-node version checking happens inside checkPerNodeVersionStatus which uses CommandExecutor

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true);
        expect(mockContext.progressUnifier!.executeStep).not.toHaveBeenCalled();
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-install-complete',
            expect.objectContaining({ index: 0, continueChecking: true })
        );
    });

    it('should handle version templating in install steps', async () => {
        const states = new Map();
        states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Node {version}', message: 'Installing Node {version}...', command: 'fnm install {version}' },
            ],
        });
        (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 18', component: 'v18.0.0', installed: false },
        ]);

        await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '18' });

        expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Install Node {version}' }),
            expect.any(Number),
            expect.any(Number),
            expect.any(Function),
            { nodeVersion: '18' }
        );
    });

    it('should run default steps only for last version (optimization)', async () => {
        const states = new Map();
        states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Node {version}', message: 'Installing Node {version}...', command: 'fnm install {version}' },
                { name: 'Set Node {version} as default', message: 'Setting as default...', command: 'fnm default {version}' },
            ],
        });
        (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 18', component: 'v18.0.0', installed: false },
            { version: 'Node 20', component: 'v20.0.0', installed: false },
        ]);

        await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // Install step should be called for both versions (18 and 20)
        // Default step should only be called once for version 20
        expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledTimes(3); // 2 installs + 1 default
    });

    /**
     * Cache invalidation after an install.
     *
     * These exist because mutation testing could delete `invalidateCaches` whole —
     * body, dependent loop and all — with every suite still green. The cache manager
     * has thorough tests of its own, but they call `invalidate` directly, which
     * proves the cache works and says nothing about whether the install path calls
     * it. The consequence of the gap is user-visible: a prerequisite installed and
     * then reported at its old version, because the check reads a stale cache.
     */
    describe('cache invalidation after install', () => {
        it('invalidates the cache for the prerequisite it just installed', async () => {
            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(true);
            expect(cacheInvalidateMock(mockContext)).toHaveBeenCalledWith(mockNpmPrereq.id);
        });

        it('also invalidates every prerequisite that DEPENDS on the installed one', async () => {
            // The dependent loop is a separate deletable block: `invalidate` for the
            // installed prereq can be asserted while the loop below it is dead.
            // prereqId 0 is mockNpmPrereq — read from the testUtils state map, not
            // assumed; the first version of this test guessed `node` and failed.
            mockContext.sharedState.currentPrerequisites = [
                mockNpmPrereq,
                { ...mockAdobeCliPrereq, id: 'aio-cli', depends: [mockNpmPrereq.id] },
                { ...mockNodePrereq, id: 'some-tool', depends: [mockNpmPrereq.id] },
                { ...mockManualPrereq, id: 'unrelated', depends: ['something-else'] },
            ];

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            const invalidate = cacheInvalidateMock(mockContext);
            expect(invalidate).toHaveBeenCalledWith('aio-cli');
            expect(invalidate).toHaveBeenCalledWith('some-tool');
            // Asserting the NEGATIVE too: a loop that invalidated everything would
            // satisfy the two lines above and still be wrong.
            expect(invalidate).not.toHaveBeenCalledWith('unrelated');
        });

        it('installs fine when nothing depends on the prerequisite', async () => {
            mockContext.sharedState.currentPrerequisites = [mockNpmPrereq];

            const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(result.success).toBe(true);
            expect(cacheInvalidateMock(mockContext)).toHaveBeenCalledTimes(1);
        });
    });


    /**
     * The final status message the user reads when an install finishes.
     *
     * `buildFinalStatusMessage` is a pure function with four outcomes and had NO
     * test of any kind — mutation testing could rewrite every string it returns and
     * flip both its conditions with the suite still green. It is not exported, so
     * these drive it through the handler and read the `prerequisite-status` payload,
     * which is what the webview actually renders.
     *
     * Each case asserts the WHOLE message rather than a fragment: a partial match
     * would survive a mutation that dropped the version list, which is the part
     * carrying the information.
     */
    describe('the final status message', () => {
        /** The `message` field of the last `prerequisite-status` the handler sent. */
        function finalStatusMessage(): string | undefined {
            const calls = (mockContext.sendMessage as jest.Mock).mock.calls.filter(
                ([type]) => type === 'prerequisite-status'
            );
            return calls.at(-1)?.[1]?.message;
        }

        type NodeStatus = { version: string; component: string; installed: boolean }[];

        /**
         * `checkMultipleNodeVersions` is called TWICE — once before installing to
         * decide what is missing, once after to verify. Returning the same value for
         * both makes the all-installed case unreachable: the handler returns early
         * and never builds a final message. So `before` must show a gap.
         */
        function useNodePrereq(before: NodeStatus, after: NodeStatus) {
            const states = new Map();
            states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock)
                .mockResolvedValueOnce(before)
                .mockResolvedValue(after);
        }

        it('lists every version when all required Node versions are present', async () => {
            useNodePrereq(
                [
                    { version: 'Node 18', component: '', installed: false },
                    { version: 'Node 20', component: 'v20.0.0', installed: true },
                ],
                [
                    { version: 'Node 18', component: 'v18.0.0', installed: true },
                    { version: 'Node 20', component: 'v20.0.0', installed: true },
                ]
            );

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(finalStatusMessage()).toBe('Node.js is installed: Node 18, Node 20');
        });

        it('names ONLY the missing versions when some Node versions are absent', async () => {
            const stillMissing = [
                { version: 'Node 18', component: '', installed: false },
                { version: 'Node 20', component: 'v20.0.0', installed: true },
                { version: 'Node 22', component: '', installed: false },
            ];
            useNodePrereq(stillMissing, stillMissing);

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // Node 20 must NOT appear: a filter that reported everything would pass
            // an assertion that only checked the missing ones were mentioned.
            expect(finalStatusMessage()).toBe('Node.js is missing in Node 18, Node 22');
        });

        it('reports the version for an installed non-Node prerequisite', async () => {
            (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue({
                ...mockNodeResult,
                installed: true,
                version: '10.2.3',
            });

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(finalStatusMessage()).toBe('npm is installed: 10.2.3');
        });

        it('omits the colon when an installed prerequisite reports no version', async () => {
            (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue({
                ...mockNodeResult,
                installed: true,
                version: undefined,
            });

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(finalStatusMessage()).toBe('npm is installed');
        });

        it('says not installed when verification finds it absent', async () => {
            (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue({
                ...mockNodeResult,
                installed: false,
                version: undefined,
            });

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            expect(finalStatusMessage()).toBe('npm is not installed');
        });
    });

});
