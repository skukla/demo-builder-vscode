/**
 * The live wiring behind a build's sample-data install.
 *
 * ONE property is pinned here, and it is the trap the credential-broker plan
 * called out by name: this call site passed `{ project }` and nothing else for
 * its whole life.
 *
 * `resolveCommerceCredentials`'s broker parameter is OPTIONAL — deliberately, so
 * that a caller with no way to build one keeps its old behaviour. That means
 * forgetting it here is silent: the type checks, every other suite stays green,
 * and the feature is simply inert on its main path. And this is the main path —
 * an install during project creation, for a project that selected no App Builder
 * components and therefore has no workspace to mint an OAuth pair in. That is the
 * exact population the shared credential exists to serve.
 */

jest.mock('@/features/data-installer/services/commerceCredentials', () => ({
    resolveCommerceCredentials: jest.fn(),
}));
jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => ({
    resolveDataInstallerAccess: jest.fn().mockResolvedValue({ ok: false }),
}));

import { buildSampleDataDeps } from '@/features/data-installer/services/sampleDataInstallDeps';
import { resolveCommerceCredentials } from '@/features/data-installer/services/commerceCredentials';
import type { HandlerContext } from '@/types/handlers';

const mockedResolve = resolveCommerceCredentials as jest.MockedFunction<
    typeof resolveCommerceCredentials
>;

const PROJECT = {
    name: 'demo',
    adobe: { organization: '285361' },
    componentSelections: { backend: 'adobe-commerce-accs' },
    componentConfigs: {},
};

function makeContext(): HandlerContext {
    return {
        debugLogger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        authManager: { getTokenManager: () => ({ inspectToken: jest.fn() }) },
    } as unknown as HandlerContext;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockedResolve.mockResolvedValue({ ok: false, reason: 'needs-accs-credentials' });
});

describe('buildSampleDataDeps — credentials', () => {
    it('supplies a broker, so a project with no workspace can still install', async () => {
        const deps = buildSampleDataDeps(makeContext(), PROJECT, jest.fn());

        await deps.credentials(PROJECT as never);

        expect(mockedResolve).toHaveBeenCalledWith(
            expect.objectContaining({ broker: expect.any(Function) }),
        );
    });

    it('passes the shared pair through when the broker supplies one', async () => {
        mockedResolve.mockResolvedValue({
            ok: true,
            credentials: { kind: 'accs', clientId: 'shared', clientSecret: 'fake-not-a-secret' },
        });
        const deps = buildSampleDataDeps(makeContext(), PROJECT, jest.fn());

        await expect(deps.credentials(PROJECT as never)).resolves.toEqual({
            ok: true,
            credentials: { kind: 'accs', clientId: 'shared', clientSecret: 'fake-not-a-secret' },
        });
    });

    // The refusal wording stays a plain reason — the install reports it, and it
    // must not carry anything about credentials beyond "there are none".
    it('reports a refusal without leaking what was tried', async () => {
        const deps = buildSampleDataDeps(makeContext(), PROJECT, jest.fn());

        const result = await deps.credentials(PROJECT as never);

        expect(result.ok).toBe(false);
        expect(JSON.stringify(result)).not.toContain('client');
    });
});
