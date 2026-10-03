/**
 * build_catalog_menu and remove_catalog_menu — the agent's doors to the catalog menu
 * (EDS-24), on the dashboard's own handlers. The handlers are mocked at the module
 * boundary; what is asserted is the sign-in handoff, the gate on the undo, the refusal's
 * words, and the ARGUMENTS each handler receives.
 */

jest.mock('@/features/dashboard/handlers/catalogMenuHandlers', () => ({
    handleBuildCatalogMenu: jest.fn(),
    handleRemoveCatalogMenu: jest.fn(),
    previewCatalogMenu: jest.fn(),
}));
jest.mock('@/features/ai/server/edsToolGuards', () => ({
    requireGitHub: jest.fn(),
    requireDaLive: jest.fn(),
}));

import { registerCatalogMenuTools } from '@/features/ai/server/catalogMenuTools';
import { requireDaLive, requireGitHub } from '@/features/ai/server/edsToolGuards';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import { COMPONENT_IDS } from '@/core/constants';
import {
    handleBuildCatalogMenu,
    handleRemoveCatalogMenu,
    previewCatalogMenu,
} from '@/features/dashboard/handlers/catalogMenuHandlers';
import type { BuildCatalogMenuResult, RemoveCatalogMenuResult } from '@/types/webviewRequests';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const mockGitHub = requireGitHub as jest.Mock;
const mockDaLive = requireDaLive as jest.Mock;
const mockBuild = handleBuildCatalogMenu as jest.Mock;
const mockRemove = handleRemoveCatalogMenu as jest.Mock;
const mockPreview = previewCatalogMenu as jest.Mock;

const BUILT: BuildCatalogMenuResult = {
    summary: 'Wrote and published 2 category pages. Added the catalog menu to your nav.',
    written: ['/safety-signs', '/safety-signs/exit-signs'],
    skipped: [],
    failed: [],
    unsafe: [],
    nav: 'added',
};
const REMOVED: RemoveCatalogMenuResult = {
    summary: 'Removed 2 category pages. Took the catalog menu out of your nav.',
    removed: ['/safety-signs', '/safety-signs/exit-signs'],
    alreadyGone: [],
    skipped: [],
    failed: [],
    nav: 'removed',
};

function fakeServer() {
    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    const declarations = new Map<string, McpToolSchema>();
    return {
        registerTool(name: string, def: McpToolSchema, handler: (args: any) => Promise<{ content: Array<{ text: string }> }>) {
            tools.set(name, handler);
            declarations.set(name, def);
        },
        declaration: (name: string): McpToolSchema => declarations.get(name)!,
        async call(name: string, args: unknown): Promise<any> {
            return JSON.parse((await tools.get(name)!(args)).content[0].text);
        },
    };
}

const project = createMockProject({
    selectedStack: 'eds-accs',
    componentInstances: {
        [COMPONENT_IDS.EDS_STOREFRONT]: {
            id: COMPONENT_IDS.EDS_STOREFRONT,
            name: 'EDS Storefront',
            type: 'frontend',
            status: 'ready',
            metadata: {
                githubRepo: 'skukla/kukla-justrite',
                catalogMenu: { pages: [{ path: '/safety-signs', hash: 'a' }, { path: '/tools', hash: 'b' }], navSwitch: true },
            },
        },
    },
});
const ctx = createMockHandlerContext({
    stateManager: createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(project) }),
});

function server() {
    const s = fakeServer();
    registerCatalogMenuTools(s, () => ctx);
    return s;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGitHub.mockResolvedValue(undefined);
    mockDaLive.mockResolvedValue(undefined);
    mockBuild.mockResolvedValue({ success: true, data: BUILT });
    mockRemove.mockResolvedValue({ success: true, data: REMOVED });
    mockPreview.mockResolvedValue({ success: true, data: { site: 'skukla/kukla-justrite', pages: 12 } });
});

describe('build_catalog_menu', () => {
    it('refuses without confirm, saying how many pages it would publish, the nav change and the site, and writes nothing', async () => {
        const refusal = await server().call('build_catalog_menu', {});
        expect(refusal).toEqual({
            error:
                'build_catalog_menu writes and publishes 12 category pages to the live storefront skukla/kukla-justrite ' +
                "and adds a 'Shop the catalog' line and the catalog-menu block to its nav. Pages edited by hand are left " +
                'alone. Call again with confirm:true.',
            site: 'skukla/kukla-justrite',
            pages: 12,
        });
        expect(mockPreview).toHaveBeenCalledWith(ctx);
        expect(mockBuild).not.toHaveBeenCalled();
    });

    it('still refuses without confirm when the categories cannot be counted, and says why', async () => {
        mockPreview.mockResolvedValue({ success: false, error: 'Catalog Service returned HTTP 401' });
        const refusal = await server().call('build_catalog_menu', {});
        expect(refusal.error).toContain('Catalog Service returned HTTP 401');
        expect(refusal.error).toContain('confirm:true');
        expect(mockBuild).not.toHaveBeenCalled();
    });

    it("runs the dashboard's handler with confirm and answers what it did", async () => {
        expect(await server().call('build_catalog_menu', { confirm: true })).toEqual(BUILT);
        expect(mockBuild).toHaveBeenCalledWith(ctx, undefined);
    });

    it('hands off to sign-in before anything else, DA.live first', async () => {
        mockDaLive.mockResolvedValue({ needsAuth: 'dalive', message: 'DA.live sign-in required.' });
        expect(await server().call('build_catalog_menu', { confirm: true })).toMatchObject({ needsAuth: 'dalive' });

        mockDaLive.mockResolvedValue(undefined);
        mockGitHub.mockResolvedValue({ needsAuth: 'github', message: 'GitHub sign-in required.' });
        expect(await server().call('build_catalog_menu', { confirm: true })).toMatchObject({ needsAuth: 'github' });
        expect(mockBuild).not.toHaveBeenCalled();
        expect(mockPreview).not.toHaveBeenCalled();
    });

    it("passes the handler's refusal through with its code (the library is missing, say)", async () => {
        mockBuild.mockResolvedValue({ success: false, error: 'Add the Demo Builder Blocks library.', code: 'COMPONENT_DEPENDENCY_MISSING' });
        expect(await server().call('build_catalog_menu', { confirm: true })).toEqual({
            error: 'Add the Demo Builder Blocks library.',
            code: 'COMPONENT_DEPENDENCY_MISSING',
        });
    });

    it('is declared a consequential write: confirm-gated, DA.live and GitHub', () => {
        const def = server().declaration('build_catalog_menu');
        expect(def.annotations).toEqual({ readOnlyHint: false, destructiveHint: true });
        expect(def.needsAuth).toEqual(['dalive', 'github']);
        expect(Object.keys(def.inputSchema as object)).toEqual(['confirm']);
    });
});

describe('remove_catalog_menu', () => {
    it('refuses without confirm, saying how many pages it would take down, and removes nothing', async () => {
        const refusal = await server().call('remove_catalog_menu', {});
        expect(refusal).toEqual({
            error:
                'remove_catalog_menu unpublishes and deletes the 2 category pages Demo Builder wrote and takes the ' +
                'catalog menu out of the nav. Pages edited by hand are left alone. Call again with confirm:true.',
            destructive: true,
        });
        expect(mockRemove).not.toHaveBeenCalled();
    });

    it('runs the handler with confirm and answers what it undid', async () => {
        expect(await server().call('remove_catalog_menu', { confirm: true })).toEqual(REMOVED);
        expect(mockRemove).toHaveBeenCalledWith(ctx, undefined);
    });

    it('is declared destructive', () => {
        expect(server().declaration('remove_catalog_menu').annotations).toEqual({
            readOnlyHint: false,
            destructiveHint: true,
        });
    });
});
