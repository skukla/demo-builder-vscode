/**
 * Install Handler Tests - Adobe I/O CLI Unified Progress Messages
 *
 * Tests Step 1 implementation for Adobe I/O CLI unified progress message format.
 * Verifies that progress messages use {version} placeholder correctly.
 *
 * Tests include:
 * - Correct version placeholders in prerequisites.json config
 * - Unified format with version placeholder for single Node version
 * - Unified format for multi-version Adobe I/O CLI installation
 * - Default format without version placeholder when perNodeVersion is false
 */

// Mock all dependencies (MUST be at top before imports)
jest.mock('@/features/prerequisites/handlers/shared');
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
    mockAdobeCliPrereqNoVersion,
    mockNodePrereq,
    mockNodeResult,
    createInstallHandlerContext,
    setupMockCommandExecutor,
    setupSharedUtilityMocks,    arrangePerNodeAdobeCliInstall,
} from './installHandler.testUtils';

describe('Install Handler - Adobe I/O CLI Unified Progress Messages', () => {
    let mockContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        setupMockCommandExecutor();
        setupSharedUtilityMocks();
        mockContext = createInstallHandlerContext();
    });

    it('should have correct version placeholders in prerequisites.json config', () => {
        // Given: Read actual prerequisites.json configuration
        const fs = require('fs');
        const path = require('path');
        const configPath = path.join(__dirname, '../../../../src/features/prerequisites/config/prerequisites.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        // When: Find Adobe I/O CLI prerequisite
        const aioPrereq = config.prerequisites.find((p: any) => p.id === 'aio-cli');

        // Then: Should have correct version placeholders in install steps
        expect(aioPrereq).toBeDefined();
        expect(aioPrereq.perNodeVersion).toBe(true);
        expect(aioPrereq.install.steps).toHaveLength(1);
        expect(aioPrereq.install.steps[0].name).toBe('Install Adobe I/O CLI (Node {version})');
        expect(aioPrereq.install.steps[0].message).toBe('Installing Adobe I/O CLI for Node {version}');
    });

    it('should use unified format with version placeholder for single Node version', async () => {
        // Given: Adobe I/O CLI prerequisite with perNodeVersion: true
        arrangePerNodeAdobeCliInstall(mockContext);

        // Mock checkPerNodeVersionStatus to return Node 20 not installed
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValueOnce({
            perNodeVersionStatus: [
                { version: 'Node 20', component: '', installed: false },
            ],
            perNodeVariantMissing: true,
            missingVariantMajors: ['20'],
        });

        // When: Install handler generates steps for Node version "20"
        await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '20' });

        // Then: progressUnifier.executeStep called with correct template and nodeVersion
        expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Install Adobe I/O CLI (Node {version})',
                message: 'Installing Adobe I/O CLI for Node {version}'
            }),
            expect.any(Number),
            expect.any(Number),
            expect.any(Function),
            { nodeVersion: '20' }
        );
    });

    it('should use unified format for multi-version Adobe I/O CLI installation', async () => {
        // Given: Node versions 18 and 20 require Adobe I/O CLI installation
        arrangePerNodeAdobeCliInstall(mockContext);

        // Mock checkPerNodeVersionStatus to return both Node 18 and 20 not installed
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValueOnce({
            perNodeVersionStatus: [
                { version: 'Node 18', component: '', installed: false },
                { version: 'Node 20', component: '', installed: false },
            ],
            perNodeVariantMissing: true,
            missingVariantMajors: ['18', '20'],
        });

        // When: Install handler generates steps for both versions
        await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // Then: progressUnifier.executeStep called twice with correct templates
        expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledTimes(2);
        expect(mockContext.progressUnifier!.executeStep).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                name: 'Install Adobe I/O CLI (Node {version})',
                message: 'Installing Adobe I/O CLI for Node {version}'
            }),
            expect.any(Number),
            expect.any(Number),
            expect.any(Function),
            { nodeVersion: '18' }
        );
        expect(mockContext.progressUnifier!.executeStep).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                name: 'Install Adobe I/O CLI (Node {version})',
                message: 'Installing Adobe I/O CLI for Node {version}'
            }),
            expect.any(Number),
            expect.any(Number),
            expect.any(Function),
            { nodeVersion: '20' }
        );
    });

    it('should use default format without version placeholder when perNodeVersion is false', async () => {
        // Given: Adobe I/O CLI prerequisite without perNodeVersion
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereqNoVersion, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue({
            steps: [
                { name: 'Install Adobe I/O CLI', message: 'Installing Adobe I/O CLI globally', command: 'npm install -g @adobe/aio-cli' },
            ],
        });

        // When: Install handler generates steps without version parameter
        await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        // Then: progressUnifier.executeStep called with non-versioned template
        expect(mockContext.progressUnifier!.executeStep).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Install Adobe I/O CLI',
                message: 'Installing Adobe I/O CLI globally'
            }),
            expect.any(Number),
            expect.any(Number),
            expect.any(Function),
            undefined
        );
    });

    /**
     * HOW MANY STEPS the progress bar counts before the install starts.
     *
     * The total is computed once (installHandler.ts:183-186) and handed to every
     * `executeStep` call, so a wrong total shows up as a progress bar that stops
     * short or never reaches the end — visible to the user, invisible to a test
     * that only checks the install succeeded.
     *
     * Two rules: steps run once per target Node version, EXCEPT for a dynamic Node
     * install, which runs them once in total; and steps whose name says "default"
     * are never multiplied.
     */
    describe('the number of steps the progress bar counts', () => {
        const twoStepsAndADefault = {
            steps: [
                { name: 'Install thing', message: 'Installing...', commands: ['install'] },
                { name: 'Link thing', message: 'Linking...', commands: ['link'] },
                { name: 'Set as default', message: 'Setting default...', commands: ['default'] },
            ],
        };

        function totalsSeenByProgress(): number[] {
            return (mockContext.progressUnifier.executeStep as jest.Mock).mock.calls.map(
                (c: unknown[]) => c[2] as number
            );
        }

        function planSteps(prereq: unknown) {
            const states = new Map();
            states.set(0, { prereq, result: mockNodeResult });
            mockContext.sharedState.currentPrerequisiteStates = states;
            (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue(
                twoStepsAndADefault
            );
        }

        it('counts each step once when there is no version to repeat over', async () => {
            planSteps(mockAdobeCliPrereqNoVersion);

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // 2 install steps x 1 + 1 default = 3
            const totals = totalsSeenByProgress();
            expect(totals.length).toBeGreaterThan(0);
            expect(new Set(totals)).toEqual(new Set([3]));
        });

        it('counts install steps once per Node version, and the default step once', async () => {
            planSteps(mockNodePrereq);
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
                { version: 'Node 18', component: 'not installed', installed: false },
                { version: 'Node 20', component: 'not installed', installed: false },
            ]);

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // 2 install steps x 2 versions + 1 default = 5
            const totals = totalsSeenByProgress();
            expect(totals.length).toBeGreaterThan(0);
            expect(new Set(totals)).toEqual(new Set([5]));
        });

        it('does not treat a NON-Node prerequisite as dynamic, so its default step still runs', async () => {
            // Only Node declares `dynamic` in prerequisites.json today. The `id === 'node'`
            // guard is what stops a future config that adds `dynamic` elsewhere from taking
            // the dynamic path — which runs the install steps and SKIPS the default step
            // entirely. Without this test, deleting the guard breaks nothing visible.
            planSteps({
                ...mockAdobeCliPrereqNoVersion,
                install: { ...mockAdobeCliPrereqNoVersion.install, dynamic: true },
            });

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            const stepNames = (mockContext.progressUnifier.executeStep as jest.Mock).mock.calls.map(
                (c: unknown[]) => (c[0] as { name: string }).name
            );
            expect(stepNames).toContain('Set as default');
            expect(stepNames).toHaveLength(3);
        });

        it('counts a dynamic Node install once, not once per version', async () => {
            planSteps({ ...mockNodePrereq, install: { ...mockNodePrereq.install, dynamic: true } });
            (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
                { version: 'Node 18', component: 'not installed', installed: false },
                { version: 'Node 20', component: 'not installed', installed: false },
            ]);

            await handleInstallPrerequisite(mockContext, { prereqId: 0 });

            // The dynamic installer handles every version itself: 2 + 1 = 3, not 5.
            const totals = totalsSeenByProgress();
            expect(totals.length).toBeGreaterThan(0);
            expect(new Set(totals)).toEqual(new Set([3]));
        });
    });

});
