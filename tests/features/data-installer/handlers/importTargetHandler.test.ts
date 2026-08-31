/**
 * `get-datapack-import-target` — what the import modal should prefill.
 *
 * The instance field started empty because a spike could not PROVE the target was
 * derivable: none of the 16 instances with Data Installer history matched a local
 * project, so there was nothing to check a derived value against, and prefilling a
 * guess into a write target with no undo was the wrong trade.
 *
 * Two things changed. `checkCredentials` now tests an instance read-only, so a
 * derived value can be verified before anything is written. And the derivation
 * turned out to already exist: `ACCS_ENDPOINT_PATTERN` has been pulling the tenant
 * id out of `ACCS_GRAPHQL_ENDPOINT` all along to build the admin URL, and its own
 * example tenant is a 22-character base62 nanoid — the exact shape the spike
 * measured for `commerce_instance`.
 *
 * **This handler answers, it does not decide.** It reports what the project implies
 * and where that came from; the modal shows the source and keeps the field
 * editable, because a derived write target still has to be checkable by a human.
 *
 * Deliberately in `importHandlers` rather than the read map: the read map is
 * mirrored by the MCP read descriptors, and this is the import modal's own prefill
 * rather than something an agent needs.
 *
 * Strict TDD: written BEFORE the handler exists.
 */

import * as vscode from 'vscode';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: jest.fn().mockResolvedValue({ authenticated: true }),
}));
jest.mock('@/features/data-installer/services/dataInstallerWriteClient');
jest.mock('@/features/data-installer/services/importJobRunner', () => ({
    watchImportJob: jest.fn(),
    IMPORT_POLL: { maxAttempts: 120, timeout: 600_000 },
}));

/** The 22-character base62 tenant id the endpoint carries. */
const TENANT = 'UoGYsHrcxMyeoVd2zUktZi';

// Typed as `Project` so tsc rejects an invented field — an earlier fixture used
// `stack: { backend }`, a shape persisted projects never have.
const ACCS_PROJECT: Partial<Project> = {
    name: 'demo-accs',
    componentSelections: { backend: 'adobe-commerce-accs' },
    componentConfigs: {
        'adobe-commerce-accs': {
            ACCS_GRAPHQL_ENDPOINT: `https://na1-sandbox.api.commerce.adobe.com/${TENANT}/graphql`,
        },
    },
};

const PAAS_PROJECT: Partial<Project> = {
    name: 'demo-paas',
    componentSelections: { backend: 'adobe-commerce-paas' },
    componentConfigs: {
        'adobe-commerce-paas': { ADOBE_COMMERCE_URL: 'https://demo-paas.adobedemo.com' },
    },
};

function makeImportHarness(project: unknown) {
    return {
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        debugLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        panel: {} as vscode.WebviewPanel,
        context: { globalState: { get: jest.fn(), update: jest.fn() }, secrets: {} },
        stateManager: createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(project) }),
        sendMessage: jest.fn(),
    } as unknown as HandlerContext;
}

async function target(project: unknown) {
    const result = await importHandlers['get-datapack-import-target'](makeImportHarness(project));
    return result.data as {
        instance?: string;
        projectName?: string;
        datapack?: { name: string; version: string };
        scope?: { websiteCode: string; storeCode: string };
    };
}

/**
 * The scope the project recorded, and why it belongs on THIS handler.
 *
 * The import modal seeds its website/store-view pickers from live discovery,
 * preferring a website literally named `base`. On a project configured for
 * `bodea` that is simply wrong — the project already holds the answer, in the
 * same `componentConfigs` pair the build path reads through
 * `resolveInstallTarget`. The modal was inventing a scope instead of asking.
 *
 * This handler is where the asking belongs: its whole job is "what should the
 * modal prefill", and it already answers that for the instance and the datapack.
 * Adding the scope here fixes the modal and `get_datapack_import_target` (the
 * MCP tool) from one source rather than teaching each caller separately.
 *
 * Store VIEW, not store group: the service's `store_code` is a store view code
 * (`import.md`), so `ACCS_STORE_VIEW_CODE` is the one that travels and
 * `ACCS_STORE_CODE` — the group — does not.
 */
const SCOPED_PROJECT: Partial<Project> = {
    name: 'bodea-template-test',
    componentSelections: { backend: 'adobe-commerce-accs' },
    componentConfigs: {
        'adobe-commerce-accs': {
            ACCS_GRAPHQL_ENDPOINT: `https://na1-sandbox.api.commerce.adobe.com/${TENANT}/graphql`,
            ACCS_WEBSITE_CODE: 'bodea',
            ACCS_STORE_CODE: 'bodea_store',
            ACCS_STORE_VIEW_CODE: 'bodea_us',
        },
    },
};

describe('the scope the project recorded', () => {
    beforeEach(() => jest.clearAllMocks());

    it('reports the website and store VIEW codes', async () => {
        expect((await target(SCOPED_PROJECT)).scope).toEqual({
            websiteCode: 'bodea',
            storeCode: 'bodea_us',
        });
    });

    it('never reports the store GROUP code', async () => {
        // `bodea_store` is a store group. The service's `store_code` is a store
        // view, so sending the group would target nothing.
        expect(JSON.stringify(await target(SCOPED_PROJECT))).not.toContain('bodea_store');
    });

    it('omits the scope when the project records none', async () => {
        // ACCS_PROJECT has an endpoint but no codes. Half a pair is worse than
        // none, so nothing is reported and the modal keeps its own default.
        expect((await target(ACCS_PROJECT)).scope).toBeUndefined();
    });

    it('omits the scope when only one code is recorded', async () => {
        const halfScoped = {
            ...ACCS_PROJECT,
            componentConfigs: {
                'adobe-commerce-accs': {
                    ...ACCS_PROJECT.componentConfigs!['adobe-commerce-accs'],
                    ACCS_WEBSITE_CODE: 'bodea',
                },
            },
        };

        expect((await target(halfScoped)).scope).toBeUndefined();
    });

    it('still reports the instance alongside the scope', async () => {
        // The scope is additive; it must not displace what this handler already
        // answered.
        expect(await target(SCOPED_PROJECT)).toMatchObject({
            instance: TENANT,
            projectName: 'bodea-template-test',
        });
    });
});

describe('get-datapack-import-target', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('ACCS', () => {
        it('derives the instance from the project ACCS endpoint', async () => {
            expect(await target(ACCS_PROJECT)).toMatchObject({ instance: TENANT });
        });

        // The id is what the service takes — no scheme, no host, no /graphql. A
        // URL here would be sent as a write target and silently match nothing.
        it('returns the bare tenant id, never the endpoint URL', async () => {
            const { instance } = await target(ACCS_PROJECT);

            expect(instance).not.toMatch(/https?:|\/graphql|commerce\.adobe\.com/);
        });

        it('offers nothing when the endpoint is not an ACCS tenant URL', async () => {
            const odd = {
                ...ACCS_PROJECT,
                componentConfigs: {
                    'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://elsewhere.test/graphql' },
                },
            };

            expect((await target(odd)).instance).toBeUndefined();
        });
    });

    describe('PaaS', () => {
        // The user's call, and better supported than it first looked. The service
        // derives the site type rather than being told it, and a URL-shaped instance
        // IS accepted — the `local` rows in the logs carry full URLs. A URL is
        // therefore the right shape for an instance the service cannot look up.
        //
        // Still a guess, though: across all 1063 log records the vocabulary is
        // accs / aco / local with no `paas` at all, so no PaaS project has ever run
        // through this service. Hence unverified, and check it with a dry run.
        it('offers the Commerce URL', async () => {
            expect(await target(PAAS_PROJECT)).toMatchObject({
                instance: 'https://demo-paas.adobedemo.com',
            });
        });
    });

    // The id is what the service needs and what a person cannot read. The project
    // name is the only human-recognisable handle on the same target, so it rides
    // along and the modal leads with it.
    describe('the human-readable handle', () => {
        it('returns the project name beside the instance', async () => {
            expect(await target(ACCS_PROJECT)).toMatchObject({
                instance: TENANT,
                projectName: 'demo-accs',
            });
        });

        it('returns it for a PaaS project too', async () => {
            expect((await target(PAAS_PROJECT)).projectName).toBe('demo-paas');
        });
    });

    describe('nothing to offer', () => {
        it('returns no instance when the project has no commerce config', async () => {
            const bare = { name: 'empty', stack: { backend: 'none' }, componentConfigs: {} };

            expect((await target(bare)).instance).toBeUndefined();
        });

        it('succeeds with no instance when no project is open', async () => {
            const result = await importHandlers['get-datapack-import-target'](makeImportHarness(null));

            // Not a failure: the catalog is browsable with no project, and the
            // modal simply asks the user to type the target.
            expect(result.success).toBe(true);
            expect((result.data as { instance?: string }).instance).toBeUndefined();
        });
    });
});

/**
 * The Stage 4 loop's other half.
 *
 * The wizard RECORDS which datapack a project should be seeded with; it never
 * imports, because an import needs a reachable instance and runs for minutes.
 * This handler is how the installer panel learns that choice, so the user does
 * not have to remember it and re-find it in a 25-name catalog.
 */
describe('the recorded sample-data choice', () => {
    it('reports the datapack the project was created with', async () => {
        const data = await target({
            name: 'demo',
            datapack: { name: 'bodea', version: 'main' },
        });

        expect(data.datapack).toEqual({ name: 'bodea', version: 'main' });
    });

    it('reports nothing when the project recorded no choice', async () => {
        const data = await target({ name: 'demo' });

        expect(data.datapack).toBeUndefined();
    });
});
