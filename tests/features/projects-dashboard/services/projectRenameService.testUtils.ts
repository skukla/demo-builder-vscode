/**
 * Shared harness for the `projectRenameService` suite family.
 *
 * The fs/validation/AI-bundle mocks and the project + context builders were one
 * preamble in one file until the recovery half (rollback and remote-title sync)
 * split out. `jest.mock` factories may live here because this file also owns the
 * SUBJECT import — `babel-plugin-jest-hoist` lifts them above the imports of the
 * module they appear in, so a spec that imports `renameProjectCore` from here
 * gets the mocked collaborators, and one that imported it directly would not.
 * That is the rule in `.claude/skills/webview-test-authoring/` §3.
 *
 * A spec calls `resetRenameMocks()` from its OWN `beforeEach` — a `beforeEach`
 * declared here would not apply to a module that imports it.
 */

import type { HandlerContext } from '@/types/handlers';
import type { Project } from '@/types/base';

// fs/promises - control rename + access
export const mockRename = jest.fn().mockResolvedValue(undefined);
export const mockAccess = jest.fn();
jest.mock('fs/promises', () => ({
    rename: (...args: unknown[]) => mockRename(...args),
    access: (...args: unknown[]) => mockAccess(...args),
}));

// validation - validateProjectNameSecurity throws on invalid
export const mockValidateName = jest.fn();
jest.mock('@/core/validation/validators/ProjectNameValidator', () => ({
    validateProjectNameSecurity: (...args: unknown[]) => mockValidateName(...args),
}));

// project finalization - AI context regeneration (dynamic import inside the service).
// Rename must re-run this so the MCP configs (which bake the absolute project path)
// point at the new path instead of the old one.
export const mockGenerateAIContextFiles = jest.fn().mockResolvedValue({ skills: [] });
jest.mock('@/features/project-creation/services/aiBundle/aiBundleService', () => ({
    generateAIContextFiles: (...args: unknown[]) => mockGenerateAIContextFiles(...args),
}));

// Below the factories on purpose: they hoist above it, so the subject binds to
// the mocked modules. `import/first` is NOT a registered rule in
// eslint.config.mjs — do not add a disable comment for it, that itself errors.
import { renameProjectCore } from '@/features/projects-dashboard/services/projectRenameService';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

export { renameProjectCore };

export function projectToRename(overrides?: Partial<Project>): Project {
    return createMockProject({
        name: 'old-name',
        path: '/projects/old-name',
        status: 'ready',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                path: '/projects/old-name/storefront',
            },
        },
        ...overrides,
    });
}

export function renameHandlerContext(): HandlerContext {
    return createMockHandlerContext({
        stateManager: createMockStateManager({
            saveProject: jest.fn().mockResolvedValue(undefined),
            saveProjectConfigOnly: jest.fn().mockResolvedValue(undefined),
            removeFromRecentProjects: jest.fn().mockResolvedValue(undefined),
        }),
        logger: createMockLogger() as unknown as HandlerContext['logger'],
        context: { extensionPath: '/ext' } as unknown as HandlerContext['context'],
    });
}

/** Make `saveProject` reject, which is what puts the rename into rollback. */
export function failSave(context: HandlerContext): void {
    (context.stateManager.saveProject as jest.Mock).mockRejectedValue(new Error('disk full'));
}

/**
 * Call from each spec's OWN `beforeEach`. The default is a rename that can
 * proceed: the target folder does not exist and the name validates.
 */
export function resetRenameMocks(): void {
    jest.clearAllMocks();
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    mockRename.mockReset().mockResolvedValue(undefined);
    mockValidateName.mockImplementation(() => undefined);
    mockGenerateAIContextFiles.mockReset().mockResolvedValue({ skills: [] });
}
