/**
 * create_project_from_file — start a project from an exported project file.
 *
 * What is pinned is the CREATION WIRE: the `ProjectConfigSource` handed to
 * `buildProjectConfig` (the wizard's own assembler) and the payload handed to
 * storefront setup. PL-56d asked for exactly that — asserting the answer alone
 * would test the mocks, and the defect this exists to prevent is a file whose
 * integrations, mesh or settings are silently dropped on the way in.
 *
 * The files are REAL files in a temp directory, read through the real
 * `readProjectFile`. The v1 fixture is the shape `createExportSettings` writes
 * today (`SettingsFile`, typed below so the compiler checks it); the v2 fixture
 * is a `ProjectFile`.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { COMPONENT_IDS } from '@/core/constants';
import type { ProjectFile } from '@/types/projectFile';
import type { SettingsFile } from '@/types/settingsFile';
import {
    authManager,
    buildProjectConfig,
    capturedWizardState,
    ctxFactory,
    defaultStorefrontSetup,
    executeProjectCreation,
    fakeServer,
    getGitHubServices,
    registerCreateProjectFromFileTool,
    storefrontSetup,
} from './createProjectTool.testUtils';

const TOOL = 'create_project_from_file';

/** What Export writes today: version 1, no `kind`. */
const V1_HEADLESS: SettingsFile = {
    version: 1,
    exportedAt: '2026-10-03T00:00:00.000Z',
    source: { project: 'sent-demo', extension: '1.0.0' },
    selectedPackage: 'citisignal',
    selectedStack: 'headless-paas',
    selectedAddons: ['adobe-commerce-aco'],
    selections: {
        frontend: 'headless',
        backend: 'adobe-commerce-paas',
        dependencies: [COMPONENT_IDS.HEADLESS_COMMERCE_MESH],
        appBuilder: ['erp-sync', 'owner-custom-app'],
    },
    configs: {
        headless: { ADOBE_COMMERCE_URL: 'https://shop.example', ADOBE_CATALOG_API_KEY: 'leaked' },
    },
    adobe: { orgId: 'sender-org', projectId: 'sender-project', workspaceId: 'sender-ws' },
    appBuilderComponentSources: { 'owner-custom-app': { owner: 'owner', repo: 'custom-app' } },
    componentApiPicks: { 'erp-sync': ['CCAPI'] },
};

const V2_EDS: ProjectFile = {
    kind: 'project',
    version: 2,
    exportedAt: '2026-10-03T00:00:00.000Z',
    source: {
        project: 'sent-storefront',
        extension: '1.0.0',
        storefront: { githubRepo: 'sender/their-repo', daLiveOrg: 'sender', daLiveSite: 'theirs' },
    },
    title: 'Sent Storefront',
    selectedPackage: 'citisignal',
    selectedStack: 'eds-accs',
    selectedBlockLibraries: ['isle5'],
    customBlockLibraries: [{ name: 'Mine', source: { owner: 'me', repo: 'blocks', branch: 'main' } }],
    configs: {
        'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://accs.example/graphql' },
    },
    datapack: { name: 'citisignal', version: '1.2.0' },
};

let dir: string;

function write(name: string, content: unknown): string {
    const file = path.join(dir, name);
    fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
    return file;
}

function toolServer() {
    const server = fakeServer(TOOL);
    registerCreateProjectFromFileTool(server, ctxFactory);
    return server;
}

beforeEach(() => {
    jest.clearAllMocks();
    defaultStorefrontSetup();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-file-'));
});

afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('create_project_from_file — the file is checked before anything is created', () => {
    const refusals: Array<[string, () => Record<string, unknown>, RegExp]> = [
        ['a relative path', () => ({ filePath: 'demo.json' }), /absolute path/],
        ['a path with nothing at it', () => ({ filePath: path.join(dir, 'gone.json') }), /No file at/],
        ['a folder', () => ({ filePath: dir }), /not a file/],
        ['text that is not JSON', () => ({ filePath: write('bad.json', '{nope') }), /couldn't be read/],
        [
            'JSON that is not a project file',
            () => ({ filePath: write('other.json', { hello: 'world' }) }),
            /doesn't appear to be a Demo Builder project file/,
        ],
        [
            'a project file that names no stack',
            () => ({ filePath: write('nostack.json', { ...V1_HEADLESS, selectedStack: undefined }) }),
            /names no stack/,
        ],
        [
            'a project file that names no package',
            () => ({ filePath: write('nopkg.json', { ...V1_HEADLESS, selectedPackage: undefined }) }),
            /names no demo package/,
        ],
    ];

    it.each(refusals)('refuses %s', async (_label, args, message) => {
        const res = await toolServer().call({ projectName: 'new-demo', confirm: true, ...args() });

        expect(res.error).toMatch(message);
        expect(buildProjectConfig).not.toHaveBeenCalled();
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });

    it('refuses a file over the size cap without parsing it', async () => {
        const filePath = write('huge.json', 'x'.repeat(1024 * 1024 + 1));

        const res = await toolServer().call({ projectName: 'new-demo', filePath, confirm: true });

        expect(res.error).toMatch(/too large/);
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });

    it('requires a project name and a file path', async () => {
        expect((await toolServer().call({ confirm: true })).error).toMatch(/projectName and filePath/);
    });

    it('requires confirm:true, and says what the file would create before it does', async () => {
        const filePath = write('demo.json', V1_HEADLESS);

        const res = await toolServer().call({ projectName: 'new-demo', filePath });

        expect(res.error).toMatch(/confirm:true/);
        expect(res.wouldCreate).toEqual({
            package: 'citisignal',
            stack: 'headless-paas',
            integrations: ['erp-sync', 'owner-custom-app', COMPONENT_IDS.HEADLESS_COMMERCE_MESH],
            addons: ['adobe-commerce-aco'],
        });
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });
});

describe('create_project_from_file — a headless file reaches creation whole', () => {
    async function create() {
        const filePath = write('demo.project.demo-builder.json', V1_HEADLESS);
        return toolServer().call({ projectName: 'new-demo', filePath, confirm: true });
    }

    it('creates through the same assembler and executor create_project uses', async () => {
        const res = await create();

        expect(res).toMatchObject({ created: true, name: 'new-demo' });
        expect(buildProjectConfig).toHaveBeenCalledTimes(1);
        expect(executeProjectCreation).toHaveBeenCalledWith(expect.anything(), {
            projectName: 'assembled',
        });
    });

    it('hands creation the integrations, the mesh, the custom sources and the API picks', async () => {
        await create();

        const state = capturedWizardState();
        expect(state.selectedAppBuilderComponents).toEqual([
            'erp-sync',
            'owner-custom-app',
            COMPONENT_IDS.HEADLESS_COMMERCE_MESH,
        ]);
        expect(state.appBuilderComponentSources).toEqual({
            'owner-custom-app': { owner: 'owner', repo: 'custom-app' },
        });
        expect(state.selectedConsoleApis).toEqual({ 'erp-sync': ['CCAPI'] });
    });

    it('hands creation the package, stack, addons and settings — and never a credential', async () => {
        await create();

        const state = capturedWizardState();
        expect(state).toMatchObject({
            projectName: 'new-demo',
            selectedPackage: 'citisignal',
            selectedStack: 'headless-paas',
            selectedAddons: ['adobe-commerce-aco'],
        });
        expect(state.componentConfigs).toEqual({
            headless: { ADOBE_COMMERCE_URL: 'https://shop.example' },
        });
    });

    it("uses the RECEIVER's Adobe workspace, never the one the file was exported from", async () => {
        await create();

        const state = capturedWizardState();
        expect(state.adobeWorkspace).toMatchObject({ id: 'ws-1' });
        expect(state.adobeOrg).toMatchObject({ id: 'org-1' });
        expect(JSON.stringify(state)).not.toContain('sender-ws');
    });

    it('hands off to Adobe sign-in when the file names integrations and Adobe is signed out', async () => {
        authManager.isAuthenticated.mockResolvedValueOnce(false);

        expect(await create()).toMatchObject({ needsAuth: 'adobe' });
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });

    it('says what came from the file, what did not, and which credentials are still needed', async () => {
        const res = await create();

        expect(res.fromFile).toEqual({
            sourceProject: 'sent-demo',
            migratedFromVersion: 1,
            applied: ['package', 'stack', 'settings', 'addons', 'integrations'],
            notApplied: [
                {
                    field: 'adobe',
                    why: 'The project is created in the Adobe workspace you have selected, not the one it was exported from.',
                },
            ],
        });
        // The addon's key and the mesh's key, read from components.json. The stack's
        // own components are not resolvable here: the shared stub knows only the two
        // EDS stacks (see the EDS suite below for a backend's key).
        expect(res.stillNeeded.credentials).toEqual([
            { component: COMPONENT_IDS.HEADLESS_COMMERCE_MESH, key: 'ADOBE_CATALOG_API_KEY' },
            { component: 'adobe-commerce-aco', key: 'ACO_API_KEY' },
        ]);
    });
});

describe('create_project_from_file — an Edge Delivery file', () => {
    const RECEIVER = { repoName: 'my-repo', daLiveOrg: 'me', daLiveSite: 'mine' };

    async function create(extra: Record<string, unknown> = RECEIVER) {
        const filePath = write('storefront.project.demo-builder.json', V2_EDS);
        return toolServer().call({ projectName: 'new-storefront', filePath, confirm: true, ...extra });
    }

    it("asks for the receiver's own repository and site, and creates nothing without them", async () => {
        const res = await create({});

        expect(res.error).toMatch(/repoName, daLiveOrg, and daLiveSite/);
        expect(storefrontSetup).not.toHaveBeenCalled();
    });

    it("provisions the RECEIVER's repository and site, never the sender's", async () => {
        await create();

        const payload = storefrontSetup.mock.calls[0][1];
        expect(payload.edsConfig).toMatchObject({
            repoName: 'my-repo',
            githubOwner: 'steve',
            daLiveOrg: 'me',
            daLiveSite: 'mine',
        });
        expect(JSON.stringify(payload)).not.toContain('their-repo');
    });

    it('takes the Commerce endpoint from the file when the call names none', async () => {
        await create();

        expect(storefrontSetup.mock.calls[0][1].edsConfig.accsEndpoint).toBe(
            'https://accs.example/graphql',
        );
        expect(capturedWizardState().edsConfig.accsHost).toBe('https://accs.example/graphql');
    });

    it('hands storefront setup the block libraries and settings the file names', async () => {
        await create();

        expect(storefrontSetup.mock.calls[0][1]).toMatchObject({
            selectedBlockLibraries: ['isle5'],
            customBlockLibraries: V2_EDS.customBlockLibraries,
            componentConfigs: V2_EDS.configs,
        });
    });

    it('hands creation the block libraries, the datapack and the settings', async () => {
        await create();

        const state = capturedWizardState();
        expect(state.selectedBlockLibraries).toEqual(['isle5']);
        expect(state.customBlockLibraries).toEqual(V2_EDS.customBlockLibraries);
        expect(state.datapack).toEqual({ name: 'citisignal', version: '1.2.0' });
        expect(state.componentConfigs).toEqual(V2_EDS.configs);
    });

    it('hands off to GitHub sign-in rather than assuming the file proves one', async () => {
        (getGitHubServices as jest.Mock).mockReturnValueOnce({
            tokenService: { validateToken: jest.fn(async () => ({ valid: false })) },
        });

        expect(await create()).toMatchObject({ needsAuth: 'github' });
        expect(storefrontSetup).not.toHaveBeenCalled();
    });

    it('names the backend credential the new project still needs, and what it left out', async () => {
        const res = await create();

        expect(res).toMatchObject({ created: true, name: 'new-storefront' });
        expect(res.stillNeeded.credentials).toEqual([
            { component: 'adobe-commerce-accs', key: 'ACCS_OAUTH_CLIENT_SECRET' },
        ]);
        expect(res.fromFile.applied).toEqual([
            'package',
            'stack',
            'settings',
            'block libraries',
            'datapack',
        ]);
        expect(res.fromFile.notApplied.map((n: { field: string }) => n.field)).toEqual(['title']);
        expect(res.fromFile.migratedFromVersion).toBeUndefined();
    });
});

describe('create_project_from_file — the registered schema', () => {
    it('declares the sign-ins creation can need, and that it writes', () => {
        const def = toolServer().definitionOf();

        expect(def.needsAuth).toEqual(['github', 'dalive']);
        expect(def.annotations).toEqual({ readOnlyHint: false, destructiveHint: false });
    });
});
