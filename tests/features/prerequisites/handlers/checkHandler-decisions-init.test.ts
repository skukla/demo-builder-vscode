/**
 * Prerequisites Check Handler — decision coverage (PL-22): Startup decisions: what the handler clears, builds and publishes before it checks anything.
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
import { createCheckHandlerContext, cleanupTests } from './checkHandler.testUtils';
import { payloadsOfType, contextFor, GIT_PREREQ, status } from './checkHandler-decisions.testUtils';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { ErrorCode } from '@/types/errorCodes';
import type { PrerequisiteDefinition } from '@/features/prerequisites/services/PrerequisitesManager';
import type { PrerequisiteCheckState } from '@/types/handlers';

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

describe('initializePrerequisiteCheck', () => {
    it('clears the prerequisite cache only when the payload says this is a recheck', async () => {
        const context = contextFor([]);
        const cache = context.prereqManager!.getCacheManager();

        await handleCheckPrerequisites(context, { isRecheck: true });
        expect(cache.clearAll).toHaveBeenCalledTimes(1);
    });

    it('leaves the cache alone when isRecheck is false', async () => {
        const context = contextFor([]);
        await handleCheckPrerequisites(context, { isRecheck: false });
        expect(context.prereqManager!.getCacheManager().clearAll).not.toHaveBeenCalled();
    });

    it('leaves the cache alone when no payload is supplied at all', async () => {
        const context = contextFor([]);
        await handleCheckPrerequisites(context);
        expect(context.prereqManager!.getCacheManager().clearAll).not.toHaveBeenCalled();
    });

    it('builds the component selection from the stack plus the user picks, and nothing else', async () => {
        (getStackById as jest.Mock).mockReturnValue({
            id: 's', frontend: 'eds-storefront', backend: 'adobe-commerce-accs',
            dependencies: ['base-dep'], optionalDependencies: ['never-selected'],
        });
        const context = contextFor([]);

        await handleCheckPrerequisites(context, {
            selectedStack: 's',
            selectedOptionalDependencies: ['picked-dep'],
        });

        expect(getStackById).toHaveBeenCalledWith('s');
        expect(context.sharedState.currentComponentSelection).toEqual({
            frontend: 'eds-storefront',
            backend: 'adobe-commerce-accs',
            dependencies: ['base-dep', 'picked-dep'],
            integrations: [],
        });
    });

    it('treats a stack with no dependencies array as contributing none', async () => {
        (getStackById as jest.Mock).mockReturnValue({ id: 's', frontend: 'f', backend: 'b' });
        const context = contextFor([]);

        await handleCheckPrerequisites(context, { selectedStack: 's', selectedOptionalDependencies: ['x'] });

        expect(context.sharedState.currentComponentSelection).toEqual({
            frontend: 'f', backend: 'b', dependencies: ['x'], integrations: [],
        });
    });

    it('treats an absent selectedOptionalDependencies as no opt-ins', async () => {
        (getStackById as jest.Mock).mockReturnValue({ id: 's', frontend: 'f', backend: 'b', dependencies: ['d'] });
        const context = contextFor([]);

        await handleCheckPrerequisites(context, { selectedStack: 's' });

        expect(context.sharedState.currentComponentSelection).toEqual({
            frontend: 'f', backend: 'b', dependencies: ['d'], integrations: [],
        });
    });

    it('leaves the component selection untouched when the stack id resolves to nothing', async () => {
        (getStackById as jest.Mock).mockReturnValue(undefined);
        const context = contextFor([]);

        const result = await handleCheckPrerequisites(context, { selectedStack: 'missing' });

        expect(result).toEqual({ success: true });
        expect(context.sharedState.currentComponentSelection).toBeUndefined();
    });

    it('does not consult the stack registry when the payload names no stack', async () => {
        const context = contextFor([]);
        await handleCheckPrerequisites(context, { isRecheck: true });
        expect(getStackById).not.toHaveBeenCalled();
    });

    it('runs to completion when the context carries no prerequisites manager at all', async () => {
        // `prereqManager` is optional on HandlerContext — a headless context has none.
        const context = createCheckHandlerContext({ prereqManager: undefined });

        const result = await handleCheckPrerequisites(context, { isRecheck: true });

        expect(result).toEqual({ success: true });
        expect(payloadsOfType(context, 'prerequisites-loaded')).toEqual([
            { prerequisites: [], nodeVersionMapping: {} },
        ]);
        expect(payloadsOfType(context, 'prerequisites-complete')).toEqual([
            { allInstalled: true, prerequisites: [] },
        ]);
        expect(payloadsOfType(context, 'error')).toEqual([]);
    });

    it('records an empty prerequisite list when there is no manager to resolve one', async () => {
        const context = createCheckHandlerContext({ prereqManager: undefined });

        await handleCheckPrerequisites(context);

        expect(context.sharedState.currentPrerequisites).toBeUndefined();
        expect(context.sharedState.currentPrerequisiteStates).toEqual(new Map());
    });

    it('resolves dependencies over an empty list when the config carries no prerequisites', async () => {
        const context = createCheckHandlerContext();
        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(undefined);
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue([]);

        await handleCheckPrerequisites(context);

        expect(context.prereqManager!.resolveDependencies).toHaveBeenCalledWith([]);
    });

    it('resolves dependencies over the exact list the config carries', async () => {
        const context = contextFor([GIT_PREREQ]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(status({ id: 'git', name: 'Git' }));

        await handleCheckPrerequisites(context);

        expect(context.prereqManager!.resolveDependencies).toHaveBeenCalledWith([GIT_PREREQ]);
    });

    it('starts each run from an empty prerequisite-state map', async () => {
        const context = contextFor([]);
        const stale: PrerequisiteCheckState = {
            prereq: GIT_PREREQ,
            result: { id: 'git', name: 'Git', description: 'v', installed: true, optional: false, canInstall: false },
        };
        context.sharedState.currentPrerequisiteStates = new Map([[99, stale]]);

        await handleCheckPrerequisites(context);

        expect(context.sharedState.currentPrerequisiteStates).toEqual(new Map());
    });
});

describe('prerequisites-loaded payload', () => {
    it('sends identity fields only, indexed by position, and never the install command', async () => {
        const withPlugins = {
            id: 'aio', name: 'Adobe I/O CLI', description: 'Adobe CLI', optional: true,
            check: { command: 'aio --version' },
            install: { command: 'npm i -g @adobe/aio-cli' },
            plugins: [
                { id: 'p1', name: 'Mesh', description: 'API Mesh plugin', install: { command: 'aio plugins:install mesh' } },
            ],
        } as unknown as PrerequisiteDefinition;
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({ '22': 'frontend' });
        const context = contextFor([GIT_PREREQ, withPlugins]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(status({ id: 'x', name: 'x' }));

        await handleCheckPrerequisites(context);

        expect(payloadsOfType(context, 'prerequisites-loaded')).toEqual([
            {
                prerequisites: [
                    { id: 0, name: 'Git', description: 'Version control', optional: false, plugins: undefined },
                    {
                        id: 1,
                        name: 'Adobe I/O CLI',
                        description: 'Adobe CLI',
                        optional: true,
                        plugins: [{ id: 'p1', name: 'Mesh', description: 'API Mesh plugin' }],
                    },
                ],
                nodeVersionMapping: { '22': 'frontend' },
            },
        ]);
    });

    it('sends an empty prerequisite list when dependency resolution yields nothing', async () => {
        const context = createCheckHandlerContext();
        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue({ version: '1.0', prerequisites: [] });
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(undefined);

        await handleCheckPrerequisites(context);

        expect(payloadsOfType(context, 'prerequisites-loaded')).toEqual([
            { prerequisites: [], nodeVersionMapping: {} },
        ]);
    });

    it('completes cleanly when dependency resolution yields nothing at all', async () => {
        const context = createCheckHandlerContext();
        (context.prereqManager!.loadConfig as jest.Mock).mockResolvedValue({ version: '1.0', prerequisites: [] });
        (context.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue(undefined);

        const result = await handleCheckPrerequisites(context);

        expect(result).toEqual({ success: true });
        expect(payloadsOfType(context, 'prerequisites-complete')).toEqual([
            { allInstalled: true, prerequisites: [] },
        ]);
        expect(payloadsOfType(context, 'error')).toEqual([]);
    });

    it('waits the UI update delay after publishing the list', async () => {
        const context = contextFor([]);
        await handleCheckPrerequisites(context);
        expect(sleep).toHaveBeenCalledWith(TIMEOUTS.UI.UPDATE_DELAY);
    });
});

describe('failure of the whole check', () => {
    it('reports the underlying message to the UI and returns a failure result', async () => {
        const context = createCheckHandlerContext();
        (context.prereqManager!.loadConfig as jest.Mock).mockRejectedValue(new Error('config unreadable'));

        const result = await handleCheckPrerequisites(context);

        expect(payloadsOfType(context, 'error')).toEqual([
            { message: 'Failed to check prerequisites', details: 'config unreadable' },
        ]);
        expect(result).toEqual({
            success: false,
            error: 'Failed to check prerequisites',
            code: ErrorCode.UNKNOWN,
        });
        expect(payloadsOfType(context, 'prerequisites-complete')).toEqual([]);
    });
});

