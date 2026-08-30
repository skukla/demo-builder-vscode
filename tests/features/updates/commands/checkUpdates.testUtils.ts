/**
 * Shared setup for the checkUpdates suites — THE AGREED PART ONLY.
 *
 * This family does NOT agree about how to fake all of its dependencies, and
 * picking a winner would change what some suites exercise while every one of
 * them stayed green. So only the mocks that EVERY spec already declared
 * IDENTICALLY were moved here. Each spec keeps its own disputed mocks inline,
 * and therefore ends up with exactly the set it started with.
 *
 * Moved here (all specs agreed): @/features/eds/services/blockCollectionHelpers, @/features/eds/services/inspectorHelpers, @/features/updates/services/addonUpdateChecker, @/features/updates/services/componentUpdater, @/features/updates/services/extensionUpdater, @/features/updates/services/forkSyncService, @/features/updates/services/templateSyncService, @/features/updates/services/templateUpdateChecker, @/features/updates/services/updateManager
 * Left inline (specs disagree):  vscode
 *
 * Extracted 2026-08-30 (lane C2). Resolving the disputed ones is a separate
 * decision, deliberately not taken here.
 */

import { CheckUpdatesCommand } from '@/features/updates/commands/checkUpdates';
import { UpdateManager } from '@/features/updates/services/updateManager';
import { ForkSyncService } from '@/features/updates/services/forkSyncService';
import { AddonUpdateChecker } from '@/features/updates/services/addonUpdateChecker';
import { TemplateSyncService } from '@/features/updates/services/templateSyncService';
import { TemplateUpdateChecker } from '@/features/updates/services/templateUpdateChecker';

// Mock services
jest.mock('@/features/updates/services/updateManager');
jest.mock('@/features/updates/services/componentUpdater');
jest.mock('@/features/updates/services/extensionUpdater');
jest.mock('@/features/updates/services/forkSyncService');
jest.mock('@/features/updates/services/addonUpdateChecker');
jest.mock('@/features/updates/services/templateSyncService');
jest.mock('@/features/updates/services/templateUpdateChecker');
// Mock block collection and inspector helpers (for addon application)
jest.mock('@/features/eds/services/blockCollectionHelpers');
jest.mock('@/features/eds/services/inspectorHelpers');

export { CheckUpdatesCommand };
export { UpdateManager };
export { ForkSyncService };
export { AddonUpdateChecker };
export { TemplateSyncService };
export { TemplateUpdateChecker };
