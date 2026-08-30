/**
 * Shared setup for the createProject suites — THE AGREED PART ONLY.
 *
 * This family does NOT agree about how to fake all of its dependencies, and
 * picking a winner would change what some suites exercise while every one of
 * them stayed green. So only the mocks that EVERY spec already declared
 * IDENTICALLY were moved here. Each spec keeps its own disputed mocks inline,
 * and therefore ends up with exactly the set it started with.
 *
 * Moved here (all specs agreed): @/core/logging/debugLogger, @/features/prerequisites/services/PrerequisitesManager
 * Left inline (specs disagree):  @/core/base/webviewPanelManager, @/core/communication, @/core/di, @/core/utils/loadingHTML, vscode
 *
 * Extracted 2026-08-30 (lane C2). Resolving the disputed ones is a separate
 * decision, deliberately not taken here.
 */

import { CreateProjectWebviewCommand } from '@/features/project-creation/commands/createProject';

// Mock dependencies
jest.mock('@/core/logging/debugLogger');
jest.mock('@/features/prerequisites/services/PrerequisitesManager');

export { CreateProjectWebviewCommand };
