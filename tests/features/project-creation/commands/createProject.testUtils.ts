/**
 * Shared setup for the createProject suites — THE AGREED PART ONLY.
 *
 * This family does NOT agree about how to fake all of its dependencies, and
 * picking a winner would change what some suites exercise while every one of
 * them stayed green. So each spec keeps its own disputed mocks inline:
 * @/core/base/webviewPanelManager, @/core/communication, @/core/di,
 * @/core/utils/loadingHTML, vscode.
 *
 * Extracted 2026-08-30 (lane C2) with the two mocks every spec agreed on —
 * `@/core/logging/debugLogger` and `@/features/prerequisites/services/PrerequisitesManager`.
 * Both were DEAD: deleted 2026-10-03 (PL-51) after `dead-mock-scan --verify` removed
 * each, and then both together, with all 95 tests in the family still passing. What
 * is left is the one import every spec takes from here.
 */

import { CreateProjectWebviewCommand } from '@/features/project-creation/commands/createProject';

export { CreateProjectWebviewCommand };
