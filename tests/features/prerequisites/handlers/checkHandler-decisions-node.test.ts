/**
 * Prerequisites Check Handler — decision coverage (PL-22): The Node.js prerequisite: the multi-version path, the not-required path, and the state each leaves behind.
 *
 * The pre-existing checkHandler suites assert with `expect.objectContaining`, so most
 * fields of the payloads the handler builds are unconstrained: flipping a ternary or
 * deleting a mapped property leaves every one of them green. These suites assert the
 * WHOLE payload the handler hands to `sendMessage`, and the ARGUMENTS it hands to its
 * collaborators, for each branch of each decision the handler makes.
 */


jest.mock('@/features/prerequisites/handlers/shared', () => {
    const actual = jest.requireActual('@/features/prerequisites/handlers/shared');
    return {
        ...actual,
        getNodeVersionMapping: jest.fn(),
        getNodeVersionIdMapping: jest.fn(),
        checkPerNodeVersionStatus: jest.fn(),
        areDependenciesInstalled: jest.fn(),
        hasNodeVersions: jest.fn(),
        getNodeVersionKeys: jest.fn(),
        getPluginNodeVersions: jest.fn(),
        handlePrerequisiteCheckError: jest.fn(),
    };
});

jest.mock('@/features/components/services/demoPackageLoader', () => ({
    getStackById: jest.fn(),
}));

jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import { handleCheckPrerequisites } from '@/features/prerequisites/handlers/checkHandler';
import * as shared from '@/features/prerequisites/handlers/shared';
import { getStackById } from '@/features/components/services/demoPackageLoader';
import { sleep } from '@/core/utils/sleep';
import { cleanupTests } from './checkHandler.testUtils';
import { payloadsOfType, contextFor, NODE_PREREQ, GIT_PREREQ, status } from './checkHandler-decisions.testUtils';
import type { PrerequisiteDefinition } from '@/features/prerequisites/services/PrerequisitesManager';

beforeEach(() => {
    jest.clearAllMocks();
    (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({});
    (shared.getNodeVersionIdMapping as jest.Mock).mockResolvedValue({});
    (shared.areDependenciesInstalled as jest.Mock).mockReturnValue(true);
    (shared.hasNodeVersions as jest.Mock).mockImplementation(
        (m: Record<string, string>) => !!m && Object.keys(m).length > 0,
    );
    (shared.handlePrerequisiteCheckError as jest.Mock).mockResolvedValue(undefined);
    (getStackById as jest.Mock).mockReturnValue(undefined);
    (sleep as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
    cleanupTests();
});

describe('checkNodePrerequisite', () => {
    const mapping = { '20': 'backend', '22': 'frontend' };

    beforeEach(() => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue(mapping);
    });

    it('asks the manager about exactly the mapping it was given', async () => {
        const context = contextFor([NODE_PREREQ]);
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 20', component: 'backend', installed: true },
            { version: 'Node 22', component: 'frontend', installed: true },
        ]);

        await handleCheckPrerequisites(context);

        expect(context.prereqManager!.checkMultipleNodeVersions).toHaveBeenCalledWith(mapping);
        expect(context.prereqManager!.checkPrerequisite).not.toHaveBeenCalled();
    });

    it('reports success with every installed version joined when all are present', async () => {
        const context = contextFor([NODE_PREREQ]);
        const versions = [
            { version: 'Node 20', component: 'backend', installed: true },
            { version: 'Node 22', component: 'frontend', installed: true },
        ];
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue(versions);

        await handleCheckPrerequisites(context);

        expect(payloadsOfType(context, 'prerequisite-status')[1]).toEqual({
            index: 0,
            name: 'Node.js',
            status: 'success',
            description: 'JavaScript runtime',
            required: true,
            installed: true,
            version: 'Node 20, Node 22',
            message: 'Node.js is installed: Node 20, Node 22',
            canInstall: false,
            plugins: undefined,
            nodeVersionStatus: versions,
        });
    });

    it('reports an error listing only the installed versions when one major is missing', async () => {
        const context = contextFor([NODE_PREREQ]);
        const versions = [
            { version: 'Node 20', component: 'backend', installed: true },
            { version: 'Node 22', component: 'frontend', installed: false },
        ];
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue(versions);

        await handleCheckPrerequisites(context);

        expect(payloadsOfType(context, 'prerequisite-status')[1]).toEqual({
            index: 0,
            name: 'Node.js',
            status: 'error',
            description: 'JavaScript runtime',
            required: true,
            installed: false,
            version: 'Node 20',
            message: 'Node.js is not installed',
            canInstall: true,
            plugins: undefined,
            nodeVersionStatus: versions,
        });
    });

    it('reports no version at all when nothing is installed', async () => {
        const context = contextFor([NODE_PREREQ]);
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 20', component: 'backend', installed: false },
        ]);

        await handleCheckPrerequisites(context);

        const result = payloadsOfType(context, 'prerequisite-status')[1] as Record<string, unknown>;
        expect(result.version).toBeUndefined();
        expect(result.installed).toBe(false);
        expect(result.canInstall).toBe(true);
    });

    it('treats an absent multi-version answer as nothing installed', async () => {
        const context = contextFor([NODE_PREREQ]);
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue(undefined);

        await handleCheckPrerequisites(context);

        expect(payloadsOfType(context, 'prerequisite-status')[1]).toEqual({
            index: 0,
            name: 'Node.js',
            status: 'error',
            description: 'JavaScript runtime',
            required: true,
            installed: false,
            version: undefined,
            message: 'Node.js is not installed',
            canInstall: true,
            plugins: undefined,
            nodeVersionStatus: undefined,
        });
    });

    it('marks Node satisfied and uninstallable when no component requires it', async () => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({});
        const context = contextFor([NODE_PREREQ]);

        await handleCheckPrerequisites(context);

        expect(context.prereqManager!.checkMultipleNodeVersions).not.toHaveBeenCalled();
        expect(payloadsOfType(context, 'prerequisite-status')[1]).toEqual({
            index: 0,
            name: 'Node.js',
            status: 'success',
            description: 'JavaScript runtime',
            required: true,
            installed: true,
            version: undefined,
            message: 'Node.js is installed',
            canInstall: false,
            plugins: undefined,
            nodeVersionStatus: undefined,
        });
    });

    it('carries the prerequisite’s optional flag onto the Node check result', async () => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({});
        const optionalNode = { ...NODE_PREREQ, optional: true } as PrerequisiteDefinition;
        const context = contextFor([optionalNode]);

        await handleCheckPrerequisites(context);

        expect(payloadsOfType(context, 'prerequisites-complete')).toEqual([
            {
                allInstalled: true,
                prerequisites: [
                    {
                        id: 0, prereqId: 'node', name: 'Node.js', required: false,
                        installed: true, version: undefined, canInstall: false,
                    },
                ],
            },
        ]);
    });
});

describe('the state each prerequisite leaves behind', () => {
    it('records the Node check result in full when component Node versions are required', async () => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({ '20': 'backend' });
        const context = contextFor([NODE_PREREQ]);
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 20', component: 'backend', installed: true },
        ]);

        await handleCheckPrerequisites(context);

        expect(context.sharedState.currentPrerequisiteStates!.get(0)).toEqual({
            prereq: NODE_PREREQ,
            result: {
                id: 'node',
                name: 'Node.js',
                description: 'JavaScript runtime',
                installed: true,
                optional: false,
                canInstall: true,
                version: 'Node 20',
            },
            nodeVersionStatus: [{ version: 'Node 20', component: 'backend', installed: true }],
        });
    });

    it('carries an optional Node prerequisite’s own optional flag into its recorded result', async () => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({ '20': 'backend' });
        const optionalNode = { ...NODE_PREREQ, optional: true } as PrerequisiteDefinition;
        const context = contextFor([optionalNode]);
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 20', component: 'backend', installed: true },
        ]);

        await handleCheckPrerequisites(context);

        expect((context.sharedState.currentPrerequisiteStates!.get(0) as { result: unknown }).result).toEqual({
            id: 'node',
            name: 'Node.js',
            description: 'JavaScript runtime',
            installed: true,
            optional: true,
            canInstall: true,
            version: 'Node 20',
        });
    });

    it('records the not-required Node result in full, with no version and no install offer', async () => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({});
        const context = contextFor([NODE_PREREQ]);

        await handleCheckPrerequisites(context);

        expect(context.sharedState.currentPrerequisiteStates!.get(0)).toEqual({
            prereq: NODE_PREREQ,
            result: {
                id: 'node',
                name: 'Node.js',
                description: 'Not required for selected components',
                installed: true,
                optional: false,
                canInstall: false,
            },
            nodeVersionStatus: undefined,
        });
    });

    it('carries an optional flag into the not-required Node result too', async () => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({});
        const optionalNode = { ...NODE_PREREQ, optional: true } as PrerequisiteDefinition;
        const context = contextFor([optionalNode]);

        await handleCheckPrerequisites(context);

        expect((context.sharedState.currentPrerequisiteStates!.get(0) as { result: { optional: boolean } }).result.optional).toBe(true);
    });

    it('records an empty per-node list, not an absent one, for a prerequisite with no Node variants', async () => {
        const context = contextFor([GIT_PREREQ]);
        const gitStatus = status({ id: 'git', name: 'Git', installed: true, version: '2.4' });
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(gitStatus);

        await handleCheckPrerequisites(context);

        expect(context.sharedState.currentPrerequisiteStates!.get(0)).toEqual({
            prereq: GIT_PREREQ,
            result: gitStatus,
            nodeVersionStatus: [],
        });
    });
});

describe('an OPTIONAL Node prerequisite with a missing major', () => {
    it('is an error rather than a warning, because a missing major blocks the build', async () => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({ '20': 'backend', '22': 'frontend' });
        const optionalNode = { ...NODE_PREREQ, optional: true } as PrerequisiteDefinition;
        const context = contextFor([optionalNode]);
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 20', component: 'backend', installed: true },
            { version: 'Node 22', component: 'frontend', installed: false },
        ]);

        await handleCheckPrerequisites(context);

        const result = payloadsOfType(context, 'prerequisite-status')[1] as Record<string, unknown>;
        expect(result.status).toBe('error');
        expect(result.required).toBe(false);
        expect(result.canInstall).toBe(true);
    });

    it('stays a plain success when every required major is present', async () => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({ '20': 'backend' });
        const optionalNode = { ...NODE_PREREQ, optional: true } as PrerequisiteDefinition;
        const context = contextFor([optionalNode]);
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue([
            { version: 'Node 20', component: 'backend', installed: true },
        ]);

        await handleCheckPrerequisites(context);

        expect((payloadsOfType(context, 'prerequisite-status')[1] as Record<string, unknown>).status).toBe('success');
    });
});

