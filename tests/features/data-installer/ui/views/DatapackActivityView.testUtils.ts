/**
 * The webview-client stub both DatapackActivityView suites install.
 *
 * They differed by one key: the first-frame suite also stubbed `postMessage`.
 * The superset is safe — a suite that never calls it is unaffected — and one
 * definition beats two that drift.
 */

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { request: jest.fn(), postMessage: jest.fn() },
}));

export {};
