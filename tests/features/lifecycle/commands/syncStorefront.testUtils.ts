/**
 * SyncStorefrontCommand — shared test harness.
 *
 * Holds the mock preamble and fixtures for the syncStorefront suite. Extracted
 * when the spec crossed the 500-line `max-lines` cap.
 *
 * IMPORTANT: this file imports the SUT and re-exports it. `jest.mock` hoists
 * within the module it appears in, not across modules — so a spec that imported
 * `SyncStorefrontCommand` directly would bind it to the REAL services while
 * these mocks sat unused. Specs must import everything from here.
 *
 * NOTE: `*.testUtils.ts`, not `*.test.ts`, so Jest does not treat it as a suite.
 */

// Delays in this path are real wall-clock waits on the node project's real timers.
// Mocking the shared sleep keeps the orchestration under test and drops the waiting.
// Assertions pin the SEQUENCE of attempts, never elapsed duration.
// `createSetupServices` now takes its GitHub clients from `getGitHubServices`
// (ADR-015 / D-2 — the cache holds the token-validation result). That builder
// calls `getLogger()`, which throws unless the logger is initialised. Same mock
// the other suites of getGitHubServices consumers use.

jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import * as childProcess from 'child_process';
import * as fsPromises from 'fs/promises';
import * as vscode from 'vscode';

// The global vscode mock doesn't include showInputBox / withProgress overrides
// we need for these tests. Patch them on first import.
(vscode.window as unknown as { showInputBox?: jest.Mock }).showInputBox =
    (vscode.window as unknown as { showInputBox?: jest.Mock }).showInputBox ?? jest.fn();
(vscode.commands as unknown as { executeCommand?: jest.Mock }).executeCommand =
    (vscode.commands as unknown as { executeCommand?: jest.Mock }).executeCommand ?? jest.fn();
(vscode.env as unknown as { openExternal?: jest.Mock }).openExternal =
    (vscode.env as unknown as { openExternal?: jest.Mock }).openExternal ?? jest.fn();
(vscode.window as unknown as { showTextDocument?: jest.Mock }).showTextDocument =
    (vscode.window as unknown as { showTextDocument?: jest.Mock }).showTextDocument ?? jest.fn();
(vscode.workspace as unknown as { openTextDocument?: jest.Mock }).openTextDocument =
    (vscode.workspace as unknown as { openTextDocument?: jest.Mock }).openTextDocument ?? jest.fn();

// Make the conflict-resolution poll resolve immediately — the condition is
// driven by git state we mock per-test, not by real timers.
jest.mock('@/core/shell/pollingService', () => ({
    PollingService: jest.fn().mockImplementation(() => ({
        pollUntilCondition: jest.fn(async (checkFn: () => Promise<boolean>) => {
            await checkFn();
        }),
    })),
}));

jest.mock('child_process', () => ({
    execFile: jest.fn(),
    exec: jest.fn(),
    spawn: jest.fn(),
}));

jest.mock('fs/promises', () => ({
    stat: jest.fn(),
    readFile: jest.fn(),
}));

jest.mock('@/features/eds/services/storefront/storefrontSyncService', () => ({
    // Signature mirrors the real class, `reason` included. A mock that dropped
    // it would let a spec construct a rejection the real code could not.
    PushRejectedError: class PushRejectedError extends Error {
        constructor(
            message: string,
            public reason: 'non-fast-forward' | 'ruleset',
            public stderr?: string
        ) {
            super(message);
            this.name = 'PushRejectedError';
        }
    },
    rebaseOntoRemote: jest.fn(),
    syncAndPublish: jest.fn(),
}));

jest.mock('@/features/eds/services/github/githubTokenService', () => ({
    GitHubTokenService: jest.fn(),
}));

jest.mock('@/features/eds/services/helix/helixApiClient', () => ({
    previewAndPublishPage: jest.fn(),
}));

// The DA.live IMS token comes from DaLiveAuthService (globalState-backed, with
// the ~/.aem/da-token.json fallback) — NOT from VS Code SecretStorage. This
// suite used to fake a `demoBuilder.daLive.imsToken` secret that nothing in the
// codebase ever wrote, which made a silently-skipped Helix publish look green.
export const mockGetAccessToken = jest.fn<Promise<string | null>, []>();
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getDaLiveAuthService: jest.fn(() => ({ getAccessToken: mockGetAccessToken })),
}));

// Safe: the mocks above hoist over these imports (same module).
import { createMockProject } from '../../../helpers/projectFake';
import { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';
import type { Project } from '@/types/base';
import { PushRejectedError, syncAndPublish } from '@/features/eds/services/storefront/storefrontSyncService';
import { SyncStorefrontCommand } from '@/features/lifecycle/commands/syncStorefront';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

// Re-exported so specs never import the SUT directly (see the header note).
export { PushRejectedError, SyncStorefrontCommand };

export const syncAndPublishMock = syncAndPublish as jest.Mock;
export const execFileMock = childProcess.execFile as unknown as jest.Mock;
export const statMock = fsPromises.stat as jest.Mock;
// Exported as a handle rather than letting specs `import * as fsPromises`:
// a spec's own import of 'fs/promises' resolves BEFORE this module registers
// its mock, so it would receive the real module.
export const readFileMock = fsPromises.readFile as jest.Mock;

/**
 * `secrets.get` resolves undefined for EVERY key on purpose: the DA.live token
 * does not live in SecretStorage, and a harness that pretends otherwise is what
 * hid the silent Helix skip. Only the GitHub token service reads secrets here,
 * and it is mocked separately.
 */
export function makeSyncStorefrontContext(): vscode.ExtensionContext {
    const secrets: vscode.SecretStorage = {
        get: jest.fn(async () => undefined),
        store: jest.fn(),
        delete: jest.fn(),
        onDidChange: jest.fn(),
    } as never;
    return { secrets, globalState: { get: jest.fn(), update: jest.fn() } } as never;
}

/** Canonical state-manager fake (ADR-016). */
export { makeStateManager } from '../../../helpers/stateManagerFake';

/** Canonical logger fake (ADR-016); local name kept so consumers are unchanged. */
export { createMockLogger as makeLogger } from '../../../helpers/loggerFake';

/**
 * A project with one ready EDS storefront, built on the canonical fixture.
 *
 * This used to be a hand-written `Record<string, unknown>` — a second thing named
 * `makeEdsProject`, the other being a fully-typed `Project` in the aiContextWriter
 * family. Two different shapes wearing one name is exactly what
 * `builder-uniqueness` exists to stop, and it only became visible once the other
 * one was exported rather than living inside a spec.
 *
 * Resolved by DELETING this one rather than renaming it: the canonical fixture
 * already supplies the shape, and `Record<string, unknown>` had switched the
 * compiler off for a Project fixture (ADR-016 rule 2).
 */
export function makeSyncTargetProject(): Project {
    return createMockProject({
        name: 'demo',
        path: '/projects/demo',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                path: '/projects/demo/components/eds-storefront',
                metadata: { githubRepo: 'demo-org/demo-repo', liveUrl: 'https://live.example' },
            },
        },
    } as Partial<Project>);
}

export function setGitHubTokenServiceReturns(token: string | undefined): void {
    const instance = { getToken: jest.fn().mockResolvedValue(token ? { token } : undefined) };
    (GitHubTokenService as unknown as jest.Mock).mockImplementation(() => instance);
}

/**
 * Per-test reset. Specs must call this from their OWN `beforeEach` — a
 * `beforeEach` declared here would not apply to importing specs.
 */
export function resetSyncStorefrontMocks(): void {
    jest.clearAllMocks();
    // The command takes its token service from `getGitHubServices` now, and that
    // builder assembles the repo operations too — which need a CommandExecutor.
    // Seeded here rather than mocked away: the builder genuinely needs one, and
    // `clearAllMocks` above wipes the locator's registry between tests.
    ServiceLocator.setCommandExecutor(createMockCommandExecutor());
    statMock.mockResolvedValue({} as never);
    // Default: input box returns the supplied default value; user picks "Continue".
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue('Demo Builder: sync local changes');
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
    (vscode.window.withProgress as jest.Mock).mockImplementation(
        async (_opts, task: (p: { report: jest.Mock }) => Promise<unknown>) => {
            return task({ report: jest.fn() });
        }
    );
    setGitHubTokenServiceReturns('gh-token-from-service');
}
