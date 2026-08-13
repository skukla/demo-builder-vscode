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
    return result.data as { instance?: string; source?: string; verified?: boolean };
}

describe('get-datapack-import-target', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('ACCS', () => {
        it('derives the instance from the project ACCS endpoint', async () => {
            expect(await target(ACCS_PROJECT)).toMatchObject({ instance: TENANT, source: 'accs' });
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
        // The user's call, made with the risk stated: every commerce_instance the
        // spike observed was an ACCS nanoid with site_type 'accs', and NO REST base
        // URL appears in 35 installation records. So this prefill is a plausible
        // guess, not a derivation — which is why it must be reported as unverified
        // and checked with a dry run before it is imported with.
        it('offers the Commerce URL, marked as the unverified guess it is', async () => {
            expect(await target(PAAS_PROJECT)).toMatchObject({
                instance: 'https://demo-paas.adobedemo.com',
                source: 'paas',
                verified: false,
            });
        });

        it('marks the ACCS derivation as the verified-shape one', async () => {
            expect((await target(ACCS_PROJECT)).verified).toBe(true);
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
