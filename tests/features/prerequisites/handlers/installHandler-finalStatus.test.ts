/**
 * Install Handler Tests - The Final Status Payload
 *
 * When an install finishes, the handler pushes one `prerequisite-status` message and
 * the webview renders the row entirely from it. Everything the row shows — whether the
 * thing is installed, whether Install is still offered, and which per-version list is
 * attached — is decided in `sendFinalInstallStatus` and observable nowhere else.
 *
 * These cover the routing decisions in that payload. The overall installed/not decision
 * for a per-Node-version prerequisite lives with its own helper in the happy-path suite.
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
jest.mock('@/core/di/serviceLocator');
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
import {
    mockNodePrereq,
    mockAdobeCliPrereq,
    mockNodeResult,
    createInstallHandlerContext,
    setupMockCommandExecutor,
    setupSharedUtilityMocks,
    lastFinalStatus,
} from './installHandler.testUtils';

describe('Install Handler - the final status payload', () => {
    let mockContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        setupMockCommandExecutor();
        setupSharedUtilityMocks();
        mockContext = createInstallHandlerContext();
    });

    /** Put one prerequisite in the map the webview-addressed install reads. */
    function installing(prereq: unknown) {
        const states = new Map();
        states.set(0, { prereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
    }

    /**
     * WHICH per-version list the payload carries.
     *
     * Two different lists exist and they are not interchangeable: Node's own list says
     * which Node versions are installed, while a per-Node-version tool's list says which
     * Node versions have that TOOL. Attaching the wrong one puts another prerequisite's
     * facts on this row.
     */
    describe('which per-version list it attaches', () => {
        it('attaches the Node version list for the Node prerequisite', async () => {
            installing(mockNodePrereq);
            // The FIRST call decides whether to install at all — something must be
            // missing or the handler returns early and never builds a payload. The
            // SECOND is the post-install check this field is built from.
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock)
                .mockResolvedValueOnce([
                    { version: 'Node 18', component: 'not installed', installed: false },
                    { version: 'Node 20', component: 'v20.0.0', installed: true },
                ])
                .mockResolvedValue([
                    { version: 'Node 18', component: 'v18.0.0', installed: true },
                    { version: 'Node 20', component: 'v20.0.0', installed: true },
                ]);

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            const status = lastFinalStatus(mockContext);
            expect(status?.nodeVersionStatus).toEqual([
                { version: 'Node 18', component: 'v18.0.0', installed: true },
                { version: 'Node 20', component: 'v20.0.0', installed: true },
            ]);
        });

        it('attaches the per-tool list for a per-Node-version prerequisite', async () => {
            installing(mockAdobeCliPrereq);
            (shared.checkPerNodeVersionStatus as jest.Mock)
                .mockResolvedValueOnce({
                    perNodeVersionStatus: [],
                    perNodeVariantMissing: true,
                    missingVariantMajors: ['18'],
                })
                .mockResolvedValue({
                    perNodeVersionStatus: [
                        { version: 'Node 18', component: '10.0.0', installed: true },
                    ],
                    perNodeVariantMissing: false,
                    missingVariantMajors: [],
                });

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // The tool's own list, NOT the Node version list the shared setup supplies.
            expect(lastFinalStatus(mockContext)?.nodeVersionStatus).toEqual([
                { version: 'Node 18', component: '10.0.0', installed: true },
            ]);
        });
    });

    /**
     * The status map is how a LATER action (uninstall, recheck) knows what this install
     * found. An agent-addressed install has no map at all, because `sharedState` is
     * rebuilt per call on the headless context — so the handler must finish and report
     * either way, and must not skip recording when the map IS there.
     */
    /**
     * The status map is how a LATER action — uninstall, recheck, the dashboard row —
     * knows what this install found. The webview populates it before addressing an
     * install by index; an agent addressing one by id has no map at all, because
     * `sharedState` is rebuilt per call on the headless context. So the handler must
     * record into the map when it exists and must still finish when it does not.
     */
    describe('recording the result for later actions', () => {
        it('writes the post-install version status into the map, not just the seed', async () => {
            installing(mockNodePrereq);
            const states = mockContext.sharedState.currentPrerequisiteStates;
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock)
                .mockResolvedValueOnce([
                    { version: 'Node 18', component: 'not installed', installed: false },
                ])
                .mockResolvedValue([{ version: 'Node 18', component: 'v18.0.0', installed: true }]);

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // Asserting the entry EXISTS proves nothing — the caller seeded it. What the
            // handler adds is the freshly checked version status.
            expect(states.get(0).nodeVersionStatus).toEqual([
                { version: 'Node 18', component: 'v18.0.0', installed: true },
            ]);
        });

        it('still reports the finished install when an agent installs with no map at all', async () => {
            // The headless path: addressed by id, `sharedState` empty. Recording is
            // skipped; reporting is not. Guarding the write is what makes that safe.
            mockContext.sharedState.currentPrerequisiteStates = undefined;
            (mockContext.prereqManager!.loadConfig as jest.Mock).mockResolvedValue({
                prerequisites: [mockAdobeCliPrereq],
            });
            (mockContext.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue([
                mockAdobeCliPrereq,
            ]);
            // Something must be missing, or the handler returns early having installed
            // nothing and never builds a final payload.
            (shared.checkPerNodeVersionStatus as jest.Mock)
                .mockResolvedValueOnce({
                    perNodeVersionStatus: [],
                    perNodeVariantMissing: true,
                    missingVariantMajors: ['18'],
                })
                .mockResolvedValue({
                    perNodeVersionStatus: [
                        { version: 'Node 18', component: '10.0.0', installed: true },
                    ],
                    perNodeVariantMissing: false,
                    missingVariantMajors: [],
                });

            const result = await handleInstallPrerequisite(mockContext, {
                prerequisiteId: 'adobe-cli',
            });

            expect(result.success).toBe(true);
            expect(lastFinalStatus(mockContext)).toMatchObject({ name: 'Adobe I/O CLI' });
        });
    });
});
