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

/**
 * The dispatch, exercised for real.
 *
 * Every suite that touches this question mocks `resolveCommerceCredentials`, and
 * that is precisely how the same defect survived at three call sites: the mock
 * answers `ok` regardless of what it was handed, so a project object missing the
 * field the resolver dispatches on looks identical to a correct one.
 *
 * These use the REAL resolver against the REAL project shape. `stackBackend` is
 * not persisted — it is mapped from `componentSelections.backend` — and passing a
 * raw project through a cast leaves it undefined, which matches neither backend
 * and returns `unsupported-backend`.
 *
 * Measured live 2026-08-17: a reset was answered "Remove Sample Data" at a prompt
 * whose own credential check had just succeeded, ran the full pipeline, and then
 * reported "This project has no usable Commerce credentials" from this module.
 */
describe('buildSampleDataDeps — the credential dispatch, unmocked', () => {
    const actual = jest.requireActual<
        typeof import('@/features/data-installer/services/commerceCredentials')
    >('@/features/data-installer/services/commerceCredentials');

    /** A declared ACCS pair, so resolution needs no broker and no network. */
    const ACCS_WITH_PAIR = {
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: {
            'adobe-commerce-accs': {
                ACCS_OAUTH_CLIENT_ID: 'declared-id',
                ACCS_OAUTH_CLIENT_SECRET: 'fake-test-pw-not-a-secret',
            },
        },
    };

    it('resolves an ACCS project that declares its own pair', async () => {
        mockedResolve.mockImplementation(actual.resolveCommerceCredentials);
        const deps = buildSampleDataDeps(makeContext(), ACCS_WITH_PAIR, jest.fn());

        const result = await deps.credentials(ACCS_WITH_PAIR as never);

        expect(result.ok).toBe(true);
    });

    /**
     * CONTROL. The assertion above must be sensitive to the BACKEND mapping, not
     * merely to the pair being present — otherwise it would pass against code
     * that never sets `stackBackend`, which is the bug. Same configs, no backend
     * declared: resolution must fail.
     */
    it('CONTROL — the same configs with no backend cannot resolve', async () => {
        mockedResolve.mockImplementation(actual.resolveCommerceCredentials);
        const noBackend = { ...ACCS_WITH_PAIR, componentSelections: undefined };
        const deps = buildSampleDataDeps(makeContext(), noBackend, jest.fn());

        const result = await deps.credentials(noBackend as never);

        expect(result.ok).toBe(false);
    });
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
