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
import type { HandlerContext } from '@/types/handlers';

jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: jest.fn().mockResolvedValue({ authenticated: true }),
}));
jest.mock('@/features/data-installer/services/dataInstallerWriteClient');
jest.mock('@/features/data-installer/services/importJobRunner', () => ({
    watchImportJob: jest.fn(),
    IMPORT_POLL: { maxAttempts: 120, timeout: 600_000 },
}));
jest.mock('@/core/logging/debugLogger', () => ({
    ...jest.requireActual('@/core/logging/debugLogger'),
    getLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

/** The 22-character base62 tenant id the endpoint carries. */
const TENANT = 'UoGYsHrcxMyeoVd2zUktZi';

const ACCS_PROJECT = {
    name: 'demo-accs',
    stack: { backend: 'adobe-commerce-accs' },
    componentConfigs: {
        'adobe-commerce-accs': {
            ACCS_GRAPHQL_ENDPOINT: `https://na1-sandbox.api.commerce.adobe.com/${TENANT}/graphql`,
        },
    },
};

const PAAS_PROJECT = {
    name: 'demo-paas',
    stack: { backend: 'adobe-commerce-paas' },
    componentConfigs: {
        'adobe-commerce-paas': { ADOBE_COMMERCE_URL: 'https://demo-paas.adobedemo.com' },
    },
};

function makeContext(project: unknown) {
    return {
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        debugLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        panel: {} as vscode.WebviewPanel,
        context: { globalState: { get: jest.fn(), update: jest.fn() }, secrets: {} },
        stateManager: { getCurrentProject: jest.fn().mockResolvedValue(project) },
        sendMessage: jest.fn(),
    } as unknown as HandlerContext;
}

async function target(project: unknown) {
    const result = await importHandlers['get-datapack-import-target'](makeContext(project));
    return result.data as { instance?: string; projectName?: string };
}

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
            const result = await importHandlers['get-datapack-import-target'](makeContext(null));

            // Not a failure: the catalog is browsable with no project, and the
            // modal simply asks the user to type the target.
            expect(result.success).toBe(true);
            expect((result.data as { instance?: string }).instance).toBeUndefined();
        });
    });
});
