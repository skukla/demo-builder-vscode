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

export * as fs from 'fs/promises';
export { ResetAllCommand } from '@/commands/ResetAllCommand';
export { ServiceLocator } from '@/core/di/serviceLocator';
export * as vscode from 'vscode';

export {
    mockValidatePathSafety,
};
