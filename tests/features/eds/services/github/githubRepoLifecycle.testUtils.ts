/**
 * The stubs the `githubRepoLifecycle-*` suites install.
 *
 * The Octokit stub (and the token-service and repo-payload builders) come from
 * `githubRepoOperations.testUtils`, imported FIRST so its `jest.mock` of
 * `@octokit/core` is registered before the lifecycle class is loaded below. What
 * this file adds is the poll `waitForContent` drives: `PollingService` is
 * dynamically imported by the subject and cannot be handed in, so it is a module
 * mock here.
 */

import {
    apiRepo,
    createTokenService,
    mockOctokitConstructor,
    mockRequest,
} from './githubRepoOperations.testUtils';

export { apiRepo, createTokenService, mockOctokitConstructor, mockRequest };

/** The poll `waitForContent` drives, dynamically imported by the subject. */
export const mockPollUntilCondition = jest.fn();

jest.mock('@/core/shell/pollingService', () => ({
    PollingService: jest.fn().mockImplementation(() => ({
        pollUntilCondition: (...args: unknown[]) => mockPollUntilCondition(...args),
    })),
}));

// Below the mocks on purpose, for the reason githubRepoOperations.testUtils gives.
import { GitHubRepoLifecycle } from '@/features/eds/services/github/githubRepoLifecycle';

export { GitHubRepoLifecycle };
