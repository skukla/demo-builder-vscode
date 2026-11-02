/**
 * Shared setup for the componentUpdater suites.
 *
 * THIS FILE OWNS THE MOCKS AND THE SUT IMPORT. Specs import what they need from
 * HERE and declare no jest.mock of their own: jest.mock hoists above the imports
 * of the module it appears in, NOT across modules, so a spec importing the subject
 * directly could load it before these mocks registered.
 *
 * Extracted 2026-08-30 (lane C1) from byte-identical copies in:
 *   componentUpdater-core.test.ts
 *   componentUpdater-extended.test.ts
 */

// Mock dependencies
jest.mock('@/core/validation/PathSafetyValidator');
jest.mock('@/core/validation/SensitiveDataRedactor');
jest.mock('@/core/validation/Validator');
jest.mock('@/core/validation/fieldValidation');
jest.mock('@/core/validation/normalizers');
jest.mock('@/core/validation/validators/NodeVersionValidator');
jest.mock('fs/promises');
jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({
        getComponentById: jest.fn().mockResolvedValue({
            id: 'test-component',
            name: 'Test Component',
            configuration: {
                // No buildScript means build step will be skipped
            },
        }),
    })),
}));

import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types/base';
import { ComponentUpdater } from '@/features/updates/services/componentUpdater';
import { resetComponentRegistryManager } from '@/features/components/services/componentRegistryInstance';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';

export { ComponentUpdater } from '@/features/updates/services/componentUpdater';

export {
    CommandExecutor,
    fs,
    vscode,
};

export interface UpdaterHarness {
    updater: ComponentUpdater;
    logger: jest.Mocked<Logger>;
    executor: Record<string, jest.Mock>;
    project: Project;
    /** The move to a release. Its real-git behaviour is pinned in integrationReleaseSource.test.ts. */
    moveToRelease: jest.Mock;
}

/**
 * The arrangement every componentUpdater suite needs: a real updater over mocked
 * filesystem, shell and git move, plus a project holding one installed component.
 *
 * The mocks themselves live at the top of this file; this is the per-test SETUP that
 * was copied byte for byte into each suite. Extracted when a third suite needed it —
 * two copies is a coincidence, three is a pattern this repo says to collapse.
 *
 * Call it from a `beforeEach`. It resets everything it touches, so suites do not need
 * their own `jest.clearAllMocks()`.
 */
export function setupUpdater(): UpdaterHarness {
    jest.clearAllMocks();
    // The registry manager is a session singleton memoised in module scope, and
    // jest.clearAllMocks() cannot see module state. Without this, the first test's
    // instance — built with that test's extension path — answers every later test.
    resetComponentRegistryManager();

    const logger = createMockLogger() as unknown as jest.Mocked<Logger>;
    const executor: Record<string, jest.Mock> = {
        execute: jest.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0, duration: 100 }),
    };

    jest.spyOn(fs, 'cp').mockResolvedValue(undefined);
    jest.spyOn(fs, 'rm').mockResolvedValue(undefined);
    jest.spyOn(fs, 'readFile').mockResolvedValue('{"name": "test"}');
    jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
    jest.spyOn(fs, 'access').mockResolvedValue(undefined);
    jest.spyOn(fs, 'rename').mockResolvedValue(undefined);

    (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

    const moveToRelease = jest.fn().mockResolvedValue({ status: 'updated', detail: 'Moved.' });

    const updater = new ComponentUpdater(
        logger,
        '/mock/extension/path',
        executor as unknown as CommandExecutor,
        moveToRelease,
    );

    const project = createMockProject({
        path: '/path/to/project',
        name: 'test-project',
        componentInstances: {
            'test-component': {
                name: 'test-component',
                status: 'ready',
                id: 'test-component',
                path: '/path/to/project/components/test-component',
                port: 3000,
            },
        },
        componentVersions: {},
    });

    return { updater, logger, executor, project, moveToRelease };
}
