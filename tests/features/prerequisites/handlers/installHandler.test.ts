/**
 * Install Handler Tests - Main Test Suite
 *
 * This file contains the core shared utility usage test.
 * All other test categories have been split into separate files:
 * - installHandler-happyPath.test.ts
 * - installHandler-errorHandling.test.ts
 * - installHandler-fnmShell.test.ts
 * - installHandler-nodeVersions.test.ts
 * - installHandler-versionSatisfaction.test.ts
 * - installHandler-edgeCases.test.ts
 * - installHandler-adobeCliProgress.test.ts
 */

// Mock all dependencies (MUST be at top before imports)
jest.mock('@/features/prerequisites/handlers/shared');
jest.mock('@/core/di');
jest.mock('vscode', () => ({
    env: {
        openExternal: jest.fn(),
    },
    Uri: {
        parse: jest.fn((url: string) => ({ url })),
    },
}));
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

import { handleInstallPrerequisite } from '@/features/prerequisites/handlers/installHandler';
import * as shared from '@/features/prerequisites/handlers/shared';
import { ServiceLocator } from '@/core/di';
import {
    mockAdobeCliPrereq,
    mockNodeResult,
    createMockContext,
    setupMockCommandExecutor,
    setupSharedUtilityMocks,
} from './installHandler.testUtils';

describe('Prerequisites Install Handler', () => {
    let mockContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        setupMockCommandExecutor();
        setupSharedUtilityMocks();
        mockContext = createMockContext();
    });

    describe('shared utility usage (Steps 3 & 4 - Eliminate Duplication)', () => {
        it('should call checkPerNodeVersionStatus twice for per-node prerequisite (pre-check and post-check)', async () => {
            const states = new Map();
            states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
                steps: [
                    { name: 'Install Adobe I/O CLI (Node {version})', message: 'Installing Adobe I/O CLI for Node {version}', command: 'npm install -g @adobe/aio-cli' },
                ],
            });

            // Mock CommandExecutor to return fnm list with two Node versions
            const mockExecute = jest.fn()
                .mockResolvedValueOnce({ stdout: 'v18.20.8\nv20.19.5\n', stderr: '', code: 0, duration: 100 }) // fnm list
                .mockResolvedValueOnce({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', code: 0, duration: 100 }) // Node 18 check - installed
                .mockResolvedValueOnce({ stdout: '@adobe/aio-cli/10.0.0', stderr: '', code: 0, duration: 100 }); // Node 20 check - installed

            (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue({
                execute: mockExecute,
            });

            // Spy on checkPerNodeVersionStatus
            const checkPerNodeVersionStatusSpy = jest.spyOn(shared, 'checkPerNodeVersionStatus');

            // Mock checkPerNodeVersionStatus - first call (pre-check) returns NOT installed
            // Second call (post-check) returns installed
            checkPerNodeVersionStatusSpy
                .mockResolvedValueOnce({
                    perNodeVersionStatus: [
                        { version: 'Node 18', major: '18', component: '', installed: false },
                        { version: 'Node 20', major: '20', component: '', installed: false },
                    ],
                    perNodeVariantMissing: true,
                    missingVariantMajors: ['18', '20'],
                })
                .mockResolvedValueOnce({
                    perNodeVersionStatus: [
                        { version: 'Node 18', major: '18', component: '10.0.0', installed: true },
                        { version: 'Node 20', major: '20', component: '10.0.0', installed: true },
                    ],
                    perNodeVariantMissing: false,
                    missingVariantMajors: [],
                });

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // Verify checkPerNodeVersionStatus was called TWICE
            expect(checkPerNodeVersionStatusSpy).toHaveBeenCalledTimes(2);

            // Verify first call (pre-check)
            expect(checkPerNodeVersionStatusSpy).toHaveBeenNthCalledWith(
                1,
                mockAdobeCliPrereq,
                ['18', '20'], // Node versions from getRequiredNodeVersions
                mockContext
            );

            // Verify second call (post-check)
            expect(checkPerNodeVersionStatusSpy).toHaveBeenNthCalledWith(
                2,
                mockAdobeCliPrereq,
                ['18', '20'], // Same Node versions for post-check
                mockContext
            );

            checkPerNodeVersionStatusSpy.mockRestore();
        });
    });
});
