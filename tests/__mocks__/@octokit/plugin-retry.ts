/**
 * Mock for @octokit/plugin-retry ESM module
 *
 * This mock prevents Jest from trying to parse the ESM-only @octokit/plugin-retry package.
 */

export const retry = jest.fn((octokit: any) => octokit);
