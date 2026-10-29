/**
 * AI-11 — `create_project` sets the store scope, the same way `configure_project` does.
 *
 * Found building JustRite (AB-53): an added demo's codes were `justrite / juststore /
 * justeng`, the ACCS instance it was built on had `justrite / justrite_store /
 * justrite_us`. Without this input an agent's only path was create → configure →
 * republish: a storefront published wrong once, then fixed. With it, the codes reach
 * the creation that generates config.json.
 *
 * Pinned at the creation wire: the `ProjectConfigSource` handed to the wizard's own
 * assembler, and the payload handed to storefront setup. Mocks are owned by
 * `createProjectTool.testUtils.ts`.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ProjectFile } from '@/types/projectFile';
import {
    EDS,
    HEADLESS,
    capturedWizardState,
    ctxFactory,
    defaultStorefrontSetup,
    executeProjectCreation,
    fakeServer,
    registerCreateProjectFromFileTool,
    storefrontSetup,
    toolServer,
} from './createProjectTool.testUtils';

const ENDPOINT = 'https://accs.example/graphql';
const SCOPE = { website: 'justrite', store: 'justrite_store', storeView: 'justrite_us' };
const SCOPE_ENV = {
    ACCS_WEBSITE_CODE: 'justrite',
    ACCS_STORE_CODE: 'justrite_store',
    ACCS_STORE_VIEW_CODE: 'justrite_us',
};
const ACCS = { ...EDS, stack: 'eds-accs', accsEndpoint: ENDPOINT };

beforeEach(() => {
    jest.clearAllMocks();
    defaultStorefrontSetup();
});

describe('create_project — storeScope', () => {
    it("records all three codes on the backend's config, beside the endpoint", async () => {
        const res = await toolServer().call({ ...ACCS, storeScope: SCOPE });

        expect(res).toMatchObject({ created: true });
        expect(capturedWizardState().componentConfigs).toStrictEqual({
            'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: ENDPOINT, ...SCOPE_ENV },
        });
    });

    it('leaves the config as before when no scope is given', async () => {
        await toolServer().call(ACCS);

        expect(capturedWizardState().componentConfigs).toStrictEqual({
            'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: ENDPOINT },
        });
    });

    it.each([
        ['two of three codes', { website: 'justrite', store: 'justrite_store' }],
        ['a code that is not text', { ...SCOPE, storeView: 7 }],
    ])('refuses %s, and creates nothing', async (_label, storeScope) => {
        const res = await toolServer().call({ ...ACCS, storeScope });

        expect(res.error).toMatch(/storeScope/);
        expect(storefrontSetup).not.toHaveBeenCalled();
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });

    it('refuses a stack with no backend to hold the scope, and creates nothing', async () => {
        const res = await toolServer().call({ ...HEADLESS, storeScope: SCOPE });

        expect(res.error).toMatch(/no backend/);
        expect(executeProjectCreation).not.toHaveBeenCalled();
    });
});

describe('create_project_from_file — storeScope', () => {
    const FILE: ProjectFile = {
        kind: 'project',
        version: 2,
        exportedAt: '2026-10-03T00:00:00.000Z',
        source: { project: 'sent', extension: '1.0.0' },
        title: 'Sent',
        selectedPackage: 'citisignal',
        selectedStack: 'eds-accs',
        configs: {
            'adobe-commerce-accs': {
                ACCS_GRAPHQL_ENDPOINT: ENDPOINT,
                ACCS_WEBSITE_CODE: 'justrite',
                ACCS_STORE_CODE: 'juststore',
                ACCS_STORE_VIEW_CODE: 'justeng',
            },
        },
    };
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-file-'));
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    async function create(extra: Record<string, unknown>) {
        const filePath = path.join(dir, 'sent.project.demo-builder.json');
        fs.writeFileSync(filePath, JSON.stringify(FILE));
        const server = fakeServer('create_project_from_file');
        registerCreateProjectFromFileTool(server, ctxFactory);
        return server.call({
            projectName: 'built',
            filePath,
            repoName: 'mine',
            daLiveOrg: 'me',
            daLiveSite: 'mine',
            confirm: true,
            ...extra,
        });
    }

    it("puts the call's codes over the file's, for creation and for storefront setup", async () => {
        await create({ storeScope: SCOPE });

        expect(capturedWizardState().componentConfigs['adobe-commerce-accs']).toStrictEqual({
            ACCS_GRAPHQL_ENDPOINT: ENDPOINT,
            ...SCOPE_ENV,
        });
        expect(storefrontSetup.mock.calls[0][1].componentConfigs['adobe-commerce-accs']).toMatchObject(
            SCOPE_ENV,
        );
    });

    it("keeps the file's codes when the call names none", async () => {
        await create({});

        expect(capturedWizardState().componentConfigs['adobe-commerce-accs']).toMatchObject({
            ACCS_STORE_VIEW_CODE: 'justeng',
        });
    });
});
