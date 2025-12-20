/**
 * Mock for @octokit/core ESM module
 *
 * This mock prevents Jest from trying to parse the ESM-only @octokit/core package.
 * The actual GitHub functionality is tested via service-level mocks.
 */

export class Octokit {
    constructor(_options?: any) {
        // Mock constructor
    }

    request = jest.fn().mockResolvedValue({ data: {} });

    static plugin = jest.fn(() => Octokit);
}
