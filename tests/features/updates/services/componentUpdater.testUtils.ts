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
jest.mock('@/core/validation/URLValidator');
jest.mock('@/core/validation/Validator');
jest.mock('@/core/validation/fieldValidation');
jest.mock('@/core/validation/normalizers');
jest.mock('@/core/validation/validators/NodeVersionValidator');
jest.mock('fs/promises');
jest.mock(
    'vscode',
    () => ({
        commands: {
            executeCommand: jest.fn(),
        },
    }),
    { virtual: true }
);
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

export { ComponentUpdater } from '@/features/updates/services/componentUpdater';

export {
    CommandExecutor,
    fs,
    vscode,
};
