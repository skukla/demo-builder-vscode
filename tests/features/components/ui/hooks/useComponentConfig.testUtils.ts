/**
 * The webview-API stub all three useComponentConfig suites install.
 *
 * The hook's only collaborator outside pure helpers is `vscode.request`, and
 * every suite drives it. Two of the three wrote the stub with `any[]` and one
 * with `unknown[]`; unifying on `unknown[]` removes two type-erasing casts as
 * well as the duplication, which is why the shared version is the stricter one.
 *
 * The suites' OTHER mocks differ — two stub the env-var helpers, one stubs the
 * stack collector — and stay where they are.
 */

/** The request the hook makes. Reset it in each suite's `beforeEach`. */
export const mockRequest = jest.fn();

jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: {
        postMessage: jest.fn(),
        request: (...args: unknown[]) => mockRequest(...args),
        onMessage: jest.fn(() => jest.fn()),
    },
}));
