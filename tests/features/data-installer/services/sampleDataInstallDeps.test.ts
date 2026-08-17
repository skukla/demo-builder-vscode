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
jest.mock('@/features/data-installer/services/importJobRunner', () => ({
    watchImportJob: jest.fn(),
    IMPORT_POLL: { maxAttempts: 120, timeout: 600_000 },
}));
// Its constructor calls getLogger(), which throws unless the extension has
// activated. The poller itself is mocked above, so the instance is never used.
jest.mock('@/core/shell/pollingService', () => ({
    PollingService: jest.fn().mockImplementation(() => ({})),
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

/**
 * `watch` must be handed a client that can answer.
 *
 * `watchImportJob` needs a `JobStatusSource` — `getJobStatus` and
 * `getJobFailureReason` — which live on the READ client. This passed the WRITE
 * client through `client as never`, so every poll threw
 * `TypeError: e.getJobStatus is not a function`.
 *
 * Observed live 2026-08-17: a reset's delete was accepted (202) and then polled
 * to nothing, once per backoff step, leaving the job unwatched. The third cast
 * of the night to hide a shape mismatch, which is why this asserts on the object
 * handed over rather than on any outcome.
 */
describe('buildSampleDataDeps — watch', () => {
    const { watchImportJob } = jest.requireMock('@/features/data-installer/services/importJobRunner') as {
        watchImportJob: jest.Mock;
    };
    const { resolveDataInstallerAccess } = jest.requireMock(
        '@/features/data-installer/handlers/dataInstallerHandlers',
    ) as { resolveDataInstallerAccess: jest.Mock };

    /** A read client: the two methods the poller calls, and nothing else. */
    const readClient = {
        getJobStatus: jest.fn(),
        getJobFailureReason: jest.fn(),
        getDatapackDetail: jest.fn(),
        batchGetDataItems: jest.fn(),
    };

    beforeEach(() => {
        resolveDataInstallerAccess.mockResolvedValue({
            ok: true,
            client: readClient,
            baseUrl: 'https://example.test/api',
            getToken: async () => 'tok',
        });
        watchImportJob.mockResolvedValue({ outcome: 'success', perType: {} });
    });

    // `clearAllMocks` clears CALLS, not implementations, so the ok:true override
    // above would otherwise leak into every later describe in this file.
    afterEach(() => {
        resolveDataInstallerAccess.mockResolvedValue({ ok: false });
    });

    it('passes a client that can report job status', async () => {
        const deps = buildSampleDataDeps(makeContext(), PROJECT, jest.fn());

        await deps.watch({ activationId: 'act-1', requestedTypes: ['categories'] });

        const passed = watchImportJob.mock.calls[0][0].client;
        expect(typeof passed.getJobStatus).toBe('function');
        expect(typeof passed.getJobFailureReason).toBe('function');
    });

    /**
     * CONTROL. The assertion above must be sensitive to WHICH client is passed —
     * a write client has neither method, which is exactly the bug. Asserting the
     * identity pins it to the one `resolveDataInstallerAccess` supplies.
     */
    it('CONTROL — it is the access client, not some other one', async () => {
        const deps = buildSampleDataDeps(makeContext(), PROJECT, jest.fn());

        await deps.watch({ activationId: 'act-1', requestedTypes: ['categories'] });

        expect(watchImportJob.mock.calls[0][0].client).toBe(readClient);
    });

    // The poller names the job from this; a removal labelled `import` is what the
    // 2026-08-17 log said while deleting.
    it('labels the job with the operation it was given', async () => {
        const deps = buildSampleDataDeps(makeContext(), PROJECT, jest.fn());

        await deps.watch({ activationId: 'act-1', requestedTypes: [], operation: 'reset' });

        expect(watchImportJob.mock.calls[0][0].operation).toBe('reset');
    });

    it('defaults the label to import when none is given', async () => {
        const deps = buildSampleDataDeps(makeContext(), PROJECT, jest.fn());

        await deps.watch({ activationId: 'act-1', requestedTypes: [] });

        expect(watchImportJob.mock.calls[0][0].operation).toBe('import');
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
