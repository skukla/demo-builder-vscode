/**
 * change-demo-source: the project's row and the instance metadata move
 * together; the remembered demo only when asked; the same kind only. Nothing
 * else is touched.
 */

import { COMPONENT_IDS } from '@/core/constants';
import {
    handleChangeDemoSource,
    NOT_AN_ADDED_DEMO,
} from '@/features/eds/handlers/changeDemoSourceHandler';
import {
    rememberAddedDemo,
    renameAddedDemoSource,
} from '@/features/project-creation/services/addedDemoSettings';
import type { Project } from '@/types/base';
import { makeAddedDemo } from '../../../helpers/demoPackageFixtures';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject, edsStorefrontInstance } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

jest.mock('@/features/project-creation/services/addedDemoSettings', () => ({
    ...jest.requireActual('@/features/project-creation/services/addedDemoSettings'),
    rememberAddedDemo: jest.fn(async (demo: unknown) => [demo]),
    renameAddedDemoSource: jest.fn(async () => true),
}));

const OLD = makeAddedDemo({ source: { owner: 'jen', repo: 'isle5-demo', branch: 'main' } });
const NEW = makeAddedDemo({ name: 'Isle5 (my copy)', source: { owner: 'steve', repo: 'isle5-copy', branch: 'demo' } });

function project(overrides: Partial<Project> = {}): Project {
    const eds = edsStorefrontInstance();
    return createMockProject({
        name: 'p',
        demo: OLD,
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                ...eds,
                metadata: { ...eds.metadata, templateOwner: 'jen', templateRepo: 'isle5-demo', templateBranch: 'main', lastSyncedCommit: 'abc' },
            },
        },
        ...overrides,
    });
}

function ctx(current: Project | null) {
    return createMockHandlerContext({
        logger: createMockLogger(),
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(current),
            saveProject: jest.fn().mockResolvedValue(undefined),
        }),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('handleChangeDemoSource', () => {
    it('rewrites the row and the instance metadata together, saves, and answers where it read from before', async () => {
        const p = project();
        const context = ctx(p);

        const result = await handleChangeDemoSource(context, { demo: NEW, updateDemoPackage: false });

        expect(result).toEqual({
            success: true,
            result: { demo: NEW, previous: { owner: 'jen', repo: 'isle5-demo' } },
        });
        expect(p.demo).toEqual(NEW);
        expect(p.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata).toMatchObject({
            templateOwner: 'steve',
            templateRepo: 'isle5-copy',
            templateBranch: 'demo',
            lastSyncedCommit: 'abc',
        });
        expect(context.stateManager.saveProject).toHaveBeenCalledWith(p);
        expect(rememberAddedDemo).not.toHaveBeenCalled();
        expect(renameAddedDemoSource).not.toHaveBeenCalled();
    });

    it("points a headless project's frontend at the new repository, which is what its reset re-clones and its update check reads", async () => {
        const bob = makeAddedDemo({ storefrontKind: 'headless', source: { owner: 'bob', repo: 'next-shop', branch: 'main' } });
        const moved = makeAddedDemo({ storefrontKind: 'headless', source: { owner: 'bob', repo: 'next-shop-2026', branch: 'demo' } });
        const p = createMockProject({
            name: 'h',
            demo: bob,
            componentInstances: {
                headless: { id: 'headless', name: 'Headless Storefront', type: 'frontend', status: 'ready', repoUrl: 'https://github.com/bob/next-shop', branch: 'main' },
            },
        });

        await handleChangeDemoSource(ctx(p), { demo: moved, updateDemoPackage: false });

        expect(p.componentInstances?.headless).toMatchObject({ repoUrl: 'https://github.com/bob/next-shop-2026', branch: 'demo' });
    });

    it('drops a recorded branch when the new source names none', async () => {
        const p = project();
        const unbranched = makeAddedDemo({ source: { owner: 'steve', repo: 'isle5-copy' } });

        await handleChangeDemoSource(ctx(p), { demo: unbranched, updateDemoPackage: false });

        const metadata = p.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata ?? {};
        expect('templateBranch' in metadata).toBe(false);
    });

    it('updates the demo package on the Welcome step too, only when asked', async () => {
        await handleChangeDemoSource(ctx(project()), { demo: NEW, updateDemoPackage: true });

        expect(renameAddedDemoSource).toHaveBeenCalledWith({ owner: 'jen', repo: 'isle5-demo' }, NEW.source);
        expect(rememberAddedDemo).toHaveBeenCalledWith(NEW);
    });

    it('adds no demo package when there is none on the Welcome step to update', async () => {
        (renameAddedDemoSource as jest.Mock).mockResolvedValueOnce(false);

        await handleChangeDemoSource(ctx(project()), { demo: NEW, updateDemoPackage: true });

        expect(rememberAddedDemo).not.toHaveBeenCalled();
    });

    it("never gives the project a card's zip record", async () => {
        const p = project();

        const result = await handleChangeDemoSource(ctx(p), { demo: { ...NEW, createdFromZip: true }, updateDemoPackage: true });

        expect(p.demo).toStrictEqual(NEW);
        expect(result.result?.demo).toStrictEqual(NEW);
        expect(rememberAddedDemo).toHaveBeenCalledWith(NEW);
    });

    it('refuses a demo of the other kind, naming what this project is built on', async () => {
        const p = project();
        const headless = makeAddedDemo({ storefrontKind: 'headless', source: { owner: 'bob', repo: 'next-shop' } });

        const result = await handleChangeDemoSource(ctx(p), { demo: headless, updateDemoPackage: false });

        expect(result).toEqual({
            success: false,
            error: 'This project is built on an Edge Delivery demo; pick a demo of the same kind.',
        });
        expect(p.demo).toEqual(OLD);
    });

    it('refuses when there is no open project or it was not built on an added demo', async () => {
        expect(await handleChangeDemoSource(ctx(null), { demo: NEW, updateDemoPackage: false })).toEqual({
            success: false,
            error: NOT_AN_ADDED_DEMO,
        });
        expect(
            await handleChangeDemoSource(ctx(project({ demo: undefined })), { demo: NEW, updateDemoPackage: false }),
        ).toEqual({ success: false, error: NOT_AN_ADDED_DEMO });
    });

    it('refuses a malformed request before touching anything', async () => {
        const context = ctx(project());
        const result = await handleChangeDemoSource(context, { demo: { name: 'x' } });
        expect(result).toEqual({ success: false, error: 'A demo row with a source is required' });
        expect(context.stateManager.getCurrentProject).not.toHaveBeenCalled();
    });
});
