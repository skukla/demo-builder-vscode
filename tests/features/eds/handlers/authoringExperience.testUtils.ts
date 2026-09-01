/**
 * Shared setup for the authoringExperience suites — THE AGREED PART ONLY.
 *
 * This family does NOT agree about how to fake all of its dependencies, and
 * picking a winner would change what some suites exercise while every one of
 * them stayed green. So only the mocks that EVERY spec already declared
 * IDENTICALLY were moved here. Each spec keeps its own disputed mocks inline,
 * and therefore ends up with exactly the set it started with.
 *
 * Moved here (all specs agreed): @/core/logging, @/features/eds/services/daLive/daLiveAuthService, @/features/eds/services/daLive/daLiveOrgOperations, @/features/eds/services/github/githubFileOperations, @/features/eds/services/github/githubOAuthService, @/features/eds/services/github/githubRepoOperations, @/features/eds/services/github/githubTokenService
 * Left inline (specs disagree):  vscode
 *
 * Extracted 2026-08-30 (lane C2). Resolving the disputed ones is a separate
 * decision, deliberately not taken here.
 */

import { getEwCanvasBranch, resolveAuthoringExperience } from '@/features/eds/handlers/authoringExperience';
// Service imports required by the authoringExperience module to load.
jest.mock('@/features/eds/services/github/githubTokenService');
jest.mock('@/features/eds/services/github/githubRepoOperations');
jest.mock('@/features/eds/services/github/githubFileOperations');
jest.mock('@/features/eds/services/github/githubOAuthService');
jest.mock('@/features/eds/services/daLive/daLiveAuthService');
jest.mock('@/features/eds/services/daLive/daLiveOrgOperations', () => ({
    hasWriteAccess: jest.fn(),
}));

export { getEwCanvasBranch, resolveAuthoringExperience };
