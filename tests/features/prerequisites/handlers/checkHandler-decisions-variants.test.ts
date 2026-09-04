/**
 * Prerequisites Check Handler — decision coverage (PL-22): Per-node-version variant detection and the status/canInstall it produces.
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
import { payloadsOfType, contextFor, GIT_PREREQ, AIO_PREREQ, status } from './checkHandler-decisions.testUtils';
import type { PrerequisiteDefinition, PrerequisiteStatus } from '@/features/prerequisites/services/PrerequisitesManager';

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

describe('detectPerNodeVariantStatus', () => {
    beforeEach(() => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({ '20': 'Mesh', '22': 'Storefront' });
        (shared.getNodeVersionIdMapping as jest.Mock).mockResolvedValue({ '20': 'mesh', '22': 'eds' });
    });

    it('reports no variant status for a prerequisite that is not per-node-version', async () => {
        const context = contextFor([GIT_PREREQ]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ id: 'git', name: 'Git', version: '2.4' }),
        );

        await handleCheckPrerequisites(context);

        expect(payloadsOfType(context, 'prerequisite-status')[1]).toEqual({
            index: 0,
            name: 'Git',
            status: 'success',
            description: 'Version control',
            required: true,
            installed: true,
            version: '2.4',
            message: 'Git is installed: 2.4',
            canInstall: false,
            plugins: undefined,
            nodeVersionStatus: [],
        });
        expect(context.prereqManager!.getCacheManager().getPerVersionResults).not.toHaveBeenCalled();
    });

    it('reports no variant status when nothing requires a Node version', async () => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({});
        const context = contextFor([AIO_PREREQ]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ id: 'aio', name: 'Adobe I/O CLI', installed: false, canInstall: true }),
        );

        await handleCheckPrerequisites(context);

        const result = payloadsOfType(context, 'prerequisite-status')[1] as Record<string, unknown>;
        expect(result.nodeVersionStatus).toEqual([]);
        expect(result.installed).toBe(false);
        expect(result.message).toBe('Adobe I/O CLI is not installed');
    });

    it('marks every required major missing when the tool itself is absent', async () => {
        const context = contextFor([AIO_PREREQ]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ id: 'aio', name: 'Adobe I/O CLI', installed: false, canInstall: true }),
        );

        await handleCheckPrerequisites(context);

        expect(payloadsOfType(context, 'prerequisite-status')[1]).toEqual({
            index: 0,
            name: 'Adobe I/O CLI',
            status: 'error',
            description: 'Adobe CLI',
            required: true,
            installed: false,
            version: undefined,
            message: 'Installed for versions:',
            canInstall: true,
            plugins: undefined,
            nodeVersionStatus: [
                { version: 'Node 20', major: '20', component: '', installed: false },
                { version: 'Node 22', major: '22', component: '', installed: false },
            ],
        });
        expect(shared.checkPerNodeVersionStatus).not.toHaveBeenCalled();
    });

    it('reuses cached per-version results for the majors that are required', async () => {
        const context = contextFor([AIO_PREREQ]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ id: 'aio', name: 'Adobe I/O CLI', installed: true, version: '10.0.0' }),
        );
        (context.prereqManager!.getCacheManager().getPerVersionResults as jest.Mock).mockReturnValue([
            { version: 'Node 20', major: '20', component: 'Mesh', installed: true },
            { version: 'Node 22', major: '22', component: 'Storefront', installed: true },
            { version: 'Node 18', major: '18', component: 'Legacy', installed: false },
        ]);

        await handleCheckPrerequisites(context);

        expect(context.prereqManager!.getCacheManager().getPerVersionResults).toHaveBeenCalledWith('aio');
        expect(payloadsOfType(context, 'prerequisite-status')[1]).toEqual({
            index: 0,
            name: 'Adobe I/O CLI',
            status: 'success',
            description: 'Adobe CLI',
            required: true,
            installed: true,
            version: '10.0.0',
            message: 'Installed for versions:',
            canInstall: false,
            plugins: undefined,
            nodeVersionStatus: [
                { version: 'Node 20', major: '20', component: 'Mesh', installed: true },
                { version: 'Node 22', major: '22', component: 'Storefront', installed: true },
            ],
        });
    });

    it('synthesises a missing entry, named from the display mapping, for a major the cache never saw', async () => {
        const context = contextFor([AIO_PREREQ]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ id: 'aio', name: 'Adobe I/O CLI', installed: true, version: '10.0.0' }),
        );
        (context.prereqManager!.getCacheManager().getPerVersionResults as jest.Mock).mockReturnValue([
            { version: 'Node 20', major: '20', component: 'Mesh', installed: true },
        ]);

        await handleCheckPrerequisites(context);

        expect(payloadsOfType(context, 'prerequisite-status')[1]).toEqual({
            index: 0,
            name: 'Adobe I/O CLI',
            status: 'error',
            description: 'Adobe CLI',
            required: true,
            installed: false,
            version: '10.0.0',
            message: 'Installed for versions:',
            canInstall: true,
            plugins: undefined,
            nodeVersionStatus: [
                { version: 'Node 20', major: '20', component: 'Mesh', installed: true },
                { version: 'Node 22', major: '22', component: 'Storefront', installed: false },
            ],
        });
    });

    it('names a synthesised entry with an empty component when the mapping has no display name', async () => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({ '20': 'Mesh', '22': '' });
        const context = contextFor([AIO_PREREQ]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ id: 'aio', name: 'Adobe I/O CLI', installed: true }),
        );
        (context.prereqManager!.getCacheManager().getPerVersionResults as jest.Mock).mockReturnValue([
            { version: 'Node 20', major: '20', component: 'Mesh', installed: true },
        ]);

        await handleCheckPrerequisites(context);

        const result = payloadsOfType(context, 'prerequisite-status')[1] as Record<string, unknown>;
        expect(result.nodeVersionStatus).toEqual([
            { version: 'Node 20', major: '20', component: 'Mesh', installed: true },
            { version: 'Node 22', major: '22', component: '', installed: false },
        ]);
    });

    it('treats a cached entry that reports "not installed" as a missing variant', async () => {
        const context = contextFor([AIO_PREREQ]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ id: 'aio', name: 'Adobe I/O CLI', installed: true }),
        );
        (context.prereqManager!.getCacheManager().getPerVersionResults as jest.Mock).mockReturnValue([
            { version: 'Node 20', major: '20', component: 'Mesh', installed: true },
            { version: 'Node 22', major: '22', component: 'Storefront', installed: false },
        ]);

        await handleCheckPrerequisites(context);

        const result = payloadsOfType(context, 'prerequisite-status')[1] as Record<string, unknown>;
        expect(result.status).toBe('error');
        expect(result.installed).toBe(false);
        expect(result.canInstall).toBe(true);
    });

    it('re-checks every required major when the cache holds no results', async () => {
        const context = contextFor([AIO_PREREQ]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ id: 'aio', name: 'Adobe I/O CLI', installed: true }),
        );
        (context.prereqManager!.getCacheManager().getPerVersionResults as jest.Mock).mockReturnValue(undefined);
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValue({
            perNodeVariantMissing: true,
            missingVariantMajors: ['22'],
            perNodeVersionStatus: [{ version: 'Node 22', major: '22', component: 'Storefront', installed: false }],
        });

        await handleCheckPrerequisites(context);

        expect(shared.checkPerNodeVersionStatus).toHaveBeenCalledWith(AIO_PREREQ, ['20', '22'], context);
        const result = payloadsOfType(context, 'prerequisite-status')[1] as Record<string, unknown>;
        expect(result.nodeVersionStatus).toEqual([
            { version: 'Node 22', major: '22', component: 'Storefront', installed: false },
        ]);
        expect(result.status).toBe('error');
    });

    it('re-checks when the cache answers with an empty list rather than treating it as complete', async () => {
        const context = contextFor([AIO_PREREQ]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ id: 'aio', name: 'Adobe I/O CLI', installed: true }),
        );
        (context.prereqManager!.getCacheManager().getPerVersionResults as jest.Mock).mockReturnValue([]);
        (shared.checkPerNodeVersionStatus as jest.Mock).mockResolvedValue({
            perNodeVariantMissing: false,
            missingVariantMajors: [],
            perNodeVersionStatus: [{ version: 'Node 20', major: '20', component: 'Mesh', installed: true }],
        });

        await handleCheckPrerequisites(context);

        expect(shared.checkPerNodeVersionStatus).toHaveBeenCalledTimes(1);
        const result = payloadsOfType(context, 'prerequisite-status')[1] as Record<string, unknown>;
        expect(result.status).toBe('success');
        expect(result.installed).toBe(true);
    });

    it('restricts the required majors to the components the prerequisite declares', async () => {
        const scoped = { ...AIO_PREREQ, requiredFor: ['mesh'] } as PrerequisiteDefinition;
        const context = contextFor([scoped]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ id: 'aio', name: 'Adobe I/O CLI', installed: false, canInstall: true }),
        );

        await handleCheckPrerequisites(context);

        const result = payloadsOfType(context, 'prerequisite-status')[1] as Record<string, unknown>;
        expect(result.nodeVersionStatus).toEqual([
            { version: 'Node 20', major: '20', component: '', installed: false },
        ]);
    });
});

describe('computeOverallStatus', () => {
    it('offers no install action when the prerequisite’s own dependencies are missing', async () => {
        (shared.areDependenciesInstalled as jest.Mock).mockReturnValue(false);
        const context = contextFor([GIT_PREREQ]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ id: 'git', name: 'Git', installed: false, canInstall: true }),
        );

        await handleCheckPrerequisites(context);

        expect(shared.areDependenciesInstalled).toHaveBeenCalledWith(GIT_PREREQ, context);
        const result = payloadsOfType(context, 'prerequisite-status')[1] as Record<string, unknown>;
        expect(result.canInstall).toBe(false);
        expect(result.status).toBe('error');
    });

    it('offers no install action for a missing prerequisite that cannot be installed', async () => {
        const context = contextFor([GIT_PREREQ]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ id: 'git', name: 'Git', installed: false, canInstall: false }),
        );

        await handleCheckPrerequisites(context);

        expect((payloadsOfType(context, 'prerequisite-status')[1] as Record<string, unknown>).canInstall).toBe(false);
    });

    it('warns rather than errors when an optional prerequisite is missing', async () => {
        const optionalGit = { ...GIT_PREREQ, optional: true } as PrerequisiteDefinition;
        const context = contextFor([optionalGit]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ id: 'git', name: 'Git', installed: false, canInstall: true, optional: true }),
        );

        await handleCheckPrerequisites(context);

        expect(payloadsOfType(context, 'prerequisite-status')[1]).toEqual({
            index: 0,
            name: 'Git',
            status: 'warning',
            description: 'Version control',
            required: false,
            installed: false,
            version: undefined,
            message: 'Git is not installed',
            canInstall: true,
            plugins: undefined,
            nodeVersionStatus: [],
        });
    });

    it('keeps a non-node prerequisite green even when Node versions are missing', async () => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({ '20': 'backend' });
        const context = contextFor([GIT_PREREQ]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ id: 'git', name: 'Git', installed: true }),
        );

        await handleCheckPrerequisites(context);

        expect((payloadsOfType(context, 'prerequisite-status')[1] as Record<string, unknown>).status).toBe('success');
    });

    it('passes the checked plugins through when no per-node variant is missing', async () => {
        const context = contextFor([GIT_PREREQ]);
        const plugins: PrerequisiteStatus['plugins'] = [{ id: 'p', name: 'P', installed: true }];
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ id: 'git', name: 'Git', installed: true, plugins }),
        );

        await handleCheckPrerequisites(context);

        expect((payloadsOfType(context, 'prerequisite-status')[1] as Record<string, unknown>).plugins).toEqual(plugins);
    });

    it('withholds plugin results while a per-node variant is still missing', async () => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({ '20': 'Mesh' });
        (shared.getNodeVersionIdMapping as jest.Mock).mockResolvedValue({ '20': 'mesh' });
        const context = contextFor([AIO_PREREQ]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({
                id: 'aio', name: 'Adobe I/O CLI', installed: false, canInstall: true,
                plugins: [{ id: 'p', name: 'P', installed: false }],
            }),
        );

        await handleCheckPrerequisites(context);

        expect((payloadsOfType(context, 'prerequisite-status')[1] as Record<string, unknown>).plugins).toBeUndefined();
    });
});

describe('plugin results for a per-node-version prerequisite', () => {
    it('are passed through once every required major has the tool', async () => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({ '20': 'Mesh' });
        (shared.getNodeVersionIdMapping as jest.Mock).mockResolvedValue({ '20': 'mesh' });
        const plugins: PrerequisiteStatus['plugins'] = [{ id: 'api-mesh', name: 'API Mesh', installed: true }];
        const context = contextFor([AIO_PREREQ]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ id: 'aio', name: 'Adobe I/O CLI', installed: true, plugins }),
        );
        (context.prereqManager!.getCacheManager().getPerVersionResults as jest.Mock).mockReturnValue([
            { version: 'Node 20', major: '20', component: 'Mesh', installed: true },
        ]);

        await handleCheckPrerequisites(context);

        const result = payloadsOfType(context, 'prerequisite-status')[1] as Record<string, unknown>;
        expect(result.plugins).toEqual(plugins);
        expect(result.status).toBe('success');
    });
});
