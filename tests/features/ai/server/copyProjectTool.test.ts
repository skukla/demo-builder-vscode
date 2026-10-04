/**
 * copy_project — the agent's Copy from Existing (PL-56f).
 *
 * The copy is made from the file Export writes for the source project, read back
 * through `readProjectFile` (`copySeedFromProject`, the human Copy's own seed), and
 * created through `runProjectCreation`, the one creation path. So what is pinned is
 * the CREATION WIRE: the state handed to `buildProjectConfig` and the payload handed
 * to storefront setup. Two owner rules are the point (2026-10-04): the copy never
 * carries a credential, and it gets its own repository and DA.live site.
 *
 * The real serializer and reader run; the source project is a `Project`, typed.
 */

import { CATALOG_API_KEY } from '@/core/config/envVarKeys';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { createMockProject, edsStorefrontInstance } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import {
    buildProjectConfig,
    capturedWizardState,
    ctxFactory,
    defaultStorefrontSetup,
    executeProjectCreation,
    fakeServer,
    registerCopyProjectTool,
    storefrontSetup,
} from './createProjectTool.testUtils';

const TOOL = 'copy_project';

const SOURCE: Project = createMockProject({
    name: 'bodea-demo',
    path: '/projects/bodea-demo',
    title: 'Bodea Demo',
    selectedPackage: 'citisignal',
    selectedStack: 'eds-accs',
    selectedBlockLibraries: ['isle5'],
    componentConfigs: {
        'adobe-commerce-accs': {
            ACCS_GRAPHQL_ENDPOINT: 'https://accs.example/graphql',
            [CATALOG_API_KEY]: 'fake-test-pw-not-a-secret',
        },
    },
    datapack: { name: 'citisignal', version: '1.2.0' },
    componentInstances: {
        'eds-storefront': {
            ...edsStorefrontInstance(),
            metadata: { githubRepo: 'steve/bodea-demo', daLiveOrg: 'steve' },
        },
    },
});

const loadProjectFromPath = jest.fn();
const getAllProjects = jest.fn();

const copyCtx = (): HandlerContext =>
    ({
        ...ctxFactory(),
        stateManager: createMockStateManager({ getAllProjects, loadProjectFromPath }),
    }) as unknown as HandlerContext;

function toolServer() {
    const server = fakeServer(TOOL);
    registerCopyProjectTool(server, copyCtx);
    return server;
}

const RECEIVER = { repoName: 'bodea-copy', daLiveOrg: 'steve', daLiveSite: 'bodea-copy' };

beforeEach(() => {
    jest.clearAllMocks();
    defaultStorefrontSetup();
    getAllProjects.mockResolvedValue([{ name: 'bodea-demo', path: '/projects/bodea-demo' }]);
    loadProjectFromPath.mockResolvedValue(SOURCE);
});

describe('copy_project — checked before anything is created', () => {
    it('requires the source project and the new name', async () => {
        const res = await toolServer().call({ confirm: true });

        expect(res.error).toMatch(/sourceProject and projectName/);
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });

    it('names the projects there are when the source is not one of them', async () => {
        const res = await toolServer().call({ sourceProject: 'nope', projectName: 'x', confirm: true });

        expect(res.error).toMatch(/No project named "nope"/);
        expect(res.projects).toEqual(['bodea-demo']);
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });

    it('loads the source without saving it back', async () => {
        await toolServer().call({ sourceProject: 'bodea-demo', projectName: 'bodea-copy', ...RECEIVER });

        expect(loadProjectFromPath).toHaveBeenCalledWith('/projects/bodea-demo', undefined, {
            persistAfterLoad: false,
        });
    });

    it('requires confirm:true, and says what the copy would create before it does', async () => {
        const res = await toolServer().call({ sourceProject: 'bodea-demo', projectName: 'bodea-copy' });

        expect(res.error).toMatch(/copy_project requires confirm:true/);
        expect(res.wouldCreate).toEqual({
            from: 'bodea-demo',
            package: 'citisignal',
            stack: 'eds-accs',
            integrations: [],
            addons: [],
        });
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });

    it.each([
        ['the source’s repository name', { ...RECEIVER, repoName: 'bodea-demo' }],
        ['the source’s DA.live site', { ...RECEIVER, daLiveOrg: 'steve', daLiveSite: 'bodea-demo' }],
    ])('refuses %s: a copy gets its own', async (_label, receiver) => {
        const res = await toolServer().call({
            sourceProject: 'bodea-demo',
            projectName: 'bodea-copy',
            confirm: true,
            ...receiver,
        });

        expect(res.error).toMatch(/its own repository and DA.live site/);
        expect(storefrontSetup).not.toHaveBeenCalled();
    });

    it("asks for the copy's own repository and site, and creates nothing without them", async () => {
        const res = await toolServer().call({ sourceProject: 'bodea-demo', projectName: 'bodea-copy', confirm: true });

        expect(res.error).toMatch(/repoName, daLiveOrg, and daLiveSite/);
        expect(storefrontSetup).not.toHaveBeenCalled();
    });
});

describe('copy_project — the copy reaches creation whole, minus what never travels', () => {
    async function copy() {
        return toolServer().call({
            sourceProject: 'bodea-demo',
            projectName: 'bodea-copy',
            confirm: true,
            ...RECEIVER,
        });
    }

    it('creates through the same assembler and executor create_project uses', async () => {
        const res = await copy();

        expect(res).toMatchObject({ created: true, name: 'bodea-copy' });
        expect(buildProjectConfig).toHaveBeenCalledTimes(1);
        expect(executeProjectCreation).toHaveBeenCalledWith(expect.anything(), { projectName: 'assembled' });
    });

    it('hands creation the package, stack, libraries, datapack and settings — never a credential', async () => {
        await copy();

        const state = capturedWizardState();
        expect(state).toMatchObject({
            projectName: 'bodea-copy',
            selectedPackage: 'citisignal',
            selectedStack: 'eds-accs',
            selectedBlockLibraries: ['isle5'],
            datapack: { name: 'citisignal', version: '1.2.0' },
        });
        expect(state.componentConfigs).toEqual({
            'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://accs.example/graphql' },
        });
    });

    it("provisions the copy's own repository and site, never the source's", async () => {
        await copy();

        const payload = storefrontSetup.mock.calls[0][1];
        expect(payload.edsConfig).toMatchObject({
            repoName: 'bodea-copy',
            daLiveOrg: 'steve',
            daLiveSite: 'bodea-copy',
            accsEndpoint: 'https://accs.example/graphql',
        });
        expect(JSON.stringify(payload)).not.toContain('fake-test-pw-not-a-secret');
    });

    it('says which project it came from, what it took, and which credentials are still needed', async () => {
        const res = await copy();

        expect(res.fromProject).toEqual({
            sourceProject: 'bodea-demo',
            applied: ['package', 'stack', 'settings', 'block libraries', 'datapack'],
            notApplied: [
                { field: 'title', why: 'The new project is named by this call, not by the file.' },
                {
                    field: 'adobe',
                    why: 'The project is created in the Adobe workspace you have selected, not the one it was exported from.',
                },
            ],
        });
        expect(res.stillNeeded.credentials).toEqual([
            { component: 'adobe-commerce-accs', key: 'ACCS_OAUTH_CLIENT_SECRET' },
        ]);
        expect(res).not.toHaveProperty('fromFile');
    });
});

describe('copy_project — the registered schema', () => {
    it('declares the sign-ins creation can need, and that it writes', () => {
        const def = toolServer().definitionOf();

        expect(def.needsAuth).toEqual(['github', 'dalive']);
        expect(def.annotations).toEqual({ readOnlyHint: false, destructiveHint: false });
        expect(Object.keys(def.inputSchema ?? {})).toEqual([
            'sourceProject',
            'projectName',
            'repoName',
            'githubOwner',
            'daLiveOrg',
            'daLiveSite',
            'accsEndpoint',
            'storeScope',
            'confirm',
        ]);
    });
});
