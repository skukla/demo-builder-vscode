/**
 * Shared harness for the `componentInstallation` suite family.
 *
 * THIS FILE OWNS THE MOCKS AND EVERY IMPORT THEY REPLACE. Specs import the
 * subject from HERE and declare no jest.mock of their own — jest.mock hoists
 * above the imports of the module it appears in, NOT across modules.
 *
 * `fs/promises` is replaced with doubles a spec can re-program per test: the
 * module's three filesystem decisions (is there a stale clone directory, is
 * there a package.json, is there already a .node-version) are all read from
 * whether `access` resolves or rejects, so a fixed factory can only ever
 * exercise one side of each.
 */

const mockFs = {
    mkdir: jest.fn(),
    access: jest.fn(),
    rm: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
};

// Each entry DELEGATES rather than handing the object over: the factory is
// hoisted above `mockFs`'s initialization, so returning it directly throws
// "Cannot access 'mockFs' before initialization" at require time.
jest.mock('fs/promises', () => ({
    mkdir: (...a: unknown[]) => mockFs.mkdir(...a),
    access: (...a: unknown[]) => mockFs.access(...a),
    rm: (...a: unknown[]) => mockFs.rm(...a),
    writeFile: (...a: unknown[]) => mockFs.writeFile(...a),
    readFile: (...a: unknown[]) => mockFs.readFile(...a),
}));

import * as vscode from 'vscode';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
// Below the factory on purpose: it hoists above these imports, so the subject
// binds to the mocked fs/promises.
import { ComponentInstallation } from '@/features/components/services/componentInstallation';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { ComponentInstance } from '@/types/base';
import type { TransformedComponentDefinition } from '@/types/components';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../helpers/loggerFake';

export { ComponentInstallation, DEFAULT_SHELL, TIMEOUTS, mockFs };

export const PROJECT = '/projects/demo';
export const COMPONENT_PATH = '/projects/demo/components/eds-storefront';

export const mockExecute = jest.fn();
export const executor = createMockCommandExecutor({ execute: mockExecute });

export function makeDef(overrides: Record<string, unknown> = {}): TransformedComponentDefinition {
    return {
        id: 'eds-storefront',
        name: 'EDS Storefront',
        source: {
            url: 'https://github.com/skukla/kukla-bodea',
            branch: 'main',
            ...((overrides.source as Record<string, unknown>) ?? {}),
        },
        ...overrides,
    } as unknown as TransformedComponentDefinition;
}

export const instance = (overrides: Partial<ComponentInstance> = {}): ComponentInstance =>
    ({ id: 'eds-storefront', ...overrides }) as ComponentInstance;

/**
 * Run an install. The instance is returned in the result, so a spec that cares
 * what was written onto it reads `result.component`.
 */
export function install(
    def: TransformedComponentDefinition = makeDef(),
    options: Record<string, unknown> = {},
    componentInstance: ComponentInstance = instance()
) {
    return new ComponentInstallation(createMockLogger(), executor).installGitComponent(
        PROJECT,
        def,
        componentInstance,
        options
    );
}

/** The clone call is the FIRST execute; later ones are version detection. */
export function cloneCall(): [string, Record<string, unknown>] {
    return mockExecute.mock.calls[0] as [string, Record<string, unknown>];
}

/** The Nth execute call, 0-based — 1 is `git describe`, 2 is `git rev-parse`. */
export function executeCall(n: number): [string, Record<string, unknown>] {
    return mockExecute.mock.calls[n] as [string, Record<string, unknown>];
}

/** What `demoBuilder.updateChannel` answers for the next install. */
export function setUpdateChannel(channel: string): void {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn(() => channel),
    });
}

/**
 * The neutral world: nothing on disk, a clone that succeeds, version detection
 * that finds nothing, and a GitHub API that answers 404. Every spec starts here
 * and re-programs the one double it is about.
 */
export function resetDoubles(): void {
    jest.clearAllMocks();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('ENOENT'));
    mockFs.rm.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
    mockExecute.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    setUpdateChannel('beta');
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
}
