/**
 * The Runtime namespace key, faked for the runner suites that remove things.
 *
 * `aio app undeploy` and `aio runtime package …` need the workspace's namespace
 * and key (runtimeNamespace.ts), which production fetches with a Console
 * download. The runner suites drive `commandManager.execute` by command string
 * and have no download to answer, so the fetch itself is replaced here — with a
 * namespace the assertions can name. Everything else in the module stays real.
 *
 * IMPORT THIS BEFORE the runner under test (same rule as the orgContextMock wall).
 */

export const TEST_RUNTIME_ENV = {
    AIO_RUNTIME_NAMESPACE: 'ns-test-stage',
    AIO_RUNTIME_AUTH: 'fake-test-auth-not-a-secret',
};

/** The fetch, answering the test namespace unless a test says otherwise. */
export const mockFetchRuntimeCredentials = jest.fn(async () => ({
    namespace: TEST_RUNTIME_ENV.AIO_RUNTIME_NAMESPACE,
    auth: TEST_RUNTIME_ENV.AIO_RUNTIME_AUTH,
}));

jest.mock('@/features/app-builder/services/runtimeCredentials', () => ({
    ...jest.requireActual('@/features/app-builder/services/runtimeCredentials'),
    fetchRuntimeCredentials: () => mockFetchRuntimeCredentials(),
}));
