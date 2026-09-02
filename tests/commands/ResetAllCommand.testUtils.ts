/**
 * Shared setup for the ResetAllCommand suites.
 *
 * THIS FILE OWNS THE MOCKS AND EVERY IMPORT THEY AFFECT. Specs import what they
 * need from HERE and declare no jest.mock of their own.
 *
 * jest.mock hoists above the imports of the module it appears in, NOT across
 * modules. So a spec that keeps its own `import ... from` a mocked module loads
 * the REAL module before this file's mocks register — which is why the imports
 * below were moved here too, not just the jest.mock calls.
 *
 * Extracted 2026-08-30 (lane C1) from byte-identical copies in:
 *   ResetAllCommand.security.test.ts
 *   ResetAllCommand.test.ts
 */

// Mock dependencies
jest.mock('@/core/di/serviceLocator');
jest.mock('fs/promises');
jest.mock('@/features/eds/handlers/edsHelpers');

// Mock validatePathSafety since it uses dynamic import
const mockValidatePathSafety = jest.fn();
jest.mock('@/core/validation/PathSafetyValidator', () => ({
    ...jest.requireActual('@/core/validation/PathSafetyValidator'),
    validatePathSafety: (...args: any[]) => mockValidatePathSafety(...args),
}));

import { ResetAllCommand as ResetAllCommandClass } from '@/commands/ResetAllCommand';
import { ServiceLocator as ServiceLocatorClass } from '@/core/di/serviceLocator';
import * as vscodeModule from 'vscode';
import { createMockLogger } from '../helpers/loggerFake';
import { createMockExtensionContext } from '../helpers/extensionContextFake';
import { createMockStateManager } from '../helpers/stateManagerFake';
import type { StateManager } from '@/types/state';

export * as fs from 'fs/promises';
export { ResetAllCommand } from '@/commands/ResetAllCommand';
export { ServiceLocator } from '@/core/di/serviceLocator';
export * as vscode from 'vscode';

export { mockValidatePathSafety };

/** Everything a ResetAllCommand suite drives, built and wired. */
export interface ResetAllHarness {
    command: ResetAllCommandClass;
    context: vscodeModule.ExtensionContext;
    stateManager: jest.Mocked<StateManager>;
    logger: ReturnType<typeof createMockLogger>;
    authService: { logout: jest.Mock };
}

/**
 * The `beforeEach` both ResetAllCommand suites shared.
 *
 * They were identical apart from the name of a local `require('fs/promises')`
 * handle — `fs` in one, `fsModule` in the other (diffed 2026-09-02 with
 * comments stripped; nothing else differed across 34 lines).
 *
 * The `vscode` members are ASSIGNED rather than spied because this suite's
 * `vscode` is the repo's manual mock: the properties exist as plain functions,
 * so `jest.spyOn` has nothing to restore and assignment is what the family
 * already did.
 *
 * `fs/promises` is automocked in this file, but `lstat` and `rm` are set here
 * with real return shapes: the command stats each path before removing it, and
 * an automock's `undefined` makes `isSymbolicLink` throw rather than answer.
 */
export function setupResetAllSuite(): ResetAllHarness {
    const authService = { logout: jest.fn().mockResolvedValue(undefined) };
    (ServiceLocatorClass.getAuthenticationService as jest.Mock) = jest
        .fn()
        .mockReturnValue(authService);

    // The canonical fakes (ADR-016). Built to the types BaseCommand's constructor
    // declares, so the three `as never` casts an earlier draft of this helper used
    // are gone — a cast on an argument is a silenced type error, and the shrink-only
    // cast ledger caught all three the moment they landed.
    const context = createMockExtensionContext({
        extensionMode: vscodeModule.ExtensionMode.Development,
    });
    const stateManager = createMockStateManager();
    const logger = createMockLogger();

    (vscodeModule.window.showWarningMessage as jest.Mock) = jest
        .fn()
        .mockResolvedValue('Yes, Reset Everything');
    (vscodeModule.window.setStatusBarMessage as jest.Mock) = jest.fn();
    (vscodeModule.commands.executeCommand as jest.Mock) = jest.fn().mockResolvedValue(undefined);
    // `workspaceFolders` is readonly on the real type; the manual mock makes it a
    // plain property, so it is written through the module object.
    (vscodeModule.workspace as unknown as { workspaceFolders: unknown[] }).workspaceFolders = [];
    (vscodeModule.workspace.updateWorkspaceFolders as jest.Mock) = jest.fn();

    const fsModule = require('fs/promises');
    fsModule.lstat = jest.fn().mockResolvedValue({
        isSymbolicLink: () => false,
        isDirectory: () => true,
        isFile: () => false,
    });
    fsModule.rm = jest.fn().mockResolvedValue(undefined);

    mockValidatePathSafety.mockResolvedValue({ safe: true });

    const command = new ResetAllCommandClass(context, stateManager, logger);
    return { command, context, stateManager, logger, authService };
}
